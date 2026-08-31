/**
 * Regressionsschutz fuer die Supabase-Key-Migration
 * (Legacy `anon`/`service_role` → `sb_publishable_…`/`sb_secret_…`).
 *
 * Warum diese Tests existieren:
 *
 * 1. Die Umstellung ist als Fallback-Kette gebaut (neuer Name gewinnt, alter
 *    Name bleibt gueltig). Beide Zweige muessen gruen sein — sonst faellt erst
 *    im Wartungsfenster auf, dass genau der Zweig kaputt ist, auf den gerade
 *    umgeschaltet wurde.
 *
 * 2. Die neuen Keys sind KEINE JWTs. Wer sie als `Authorization: Bearer …`
 *    schickt, bekommt „Invalid JWT". Fuer ein Sicherheitsskript sieht das aus
 *    wie „kein Zugriff" — es meldet gruen, ohne geprueft zu haben. Der
 *    Header-Helfer muss den Bearer-Header deshalb bei neuen Keys weglassen.
 *
 * 3. Ein neuer direkter `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`-Zugriff
 *    faellt beim Umschalten still auf den alten Key zurueck. Der Scan unten
 *    verhindert, dass so einer wieder einzieht.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  supabasePublishableKey,
  supabaseUrl,
  supabaseApiHeaders,
  istLegacyJwtKey,
} from '@/lib/supabase/keys'

const BEISPIEL_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signatur'
const BEISPIEL_PUBLISHABLE = 'sb_publishable_TESTWERT'

const GESICHERT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const
const sicherung: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of GESICHERT) {
    sicherung[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of GESICHERT) {
    if (sicherung[k] === undefined) delete process.env[k]
    else process.env[k] = sicherung[k]
  }
})

describe('supabasePublishableKey(): Fallback-Kette', () => {
  it('nimmt den Publishable-Key, wenn beide gesetzt sind', () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = BEISPIEL_PUBLISHABLE
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = BEISPIEL_JWT
    expect(supabasePublishableKey()).toBe(BEISPIEL_PUBLISHABLE)
  })

  it('faellt auf den Legacy-Anon-Key zurueck, solange kein Publishable-Key gesetzt ist', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = BEISPIEL_JWT
    expect(supabasePublishableKey()).toBe(BEISPIEL_JWT)
  })

  it('liefert einen leeren String, wenn keiner gesetzt ist (Aufrufer sind fail-closed)', () => {
    expect(supabasePublishableKey()).toBe('')
    expect(supabaseUrl()).toBe('')
  })

  it('ignoriert einen leeren Publishable-Key und nimmt den Legacy-Key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = BEISPIEL_JWT
    expect(supabasePublishableKey()).toBe(BEISPIEL_JWT)
  })
})

describe('istLegacyJwtKey()', () => {
  it('erkennt Legacy-JWTs an `eyJ`', () => {
    expect(istLegacyJwtKey(BEISPIEL_JWT)).toBe(true)
  })

  it('erkennt die neuen Keys als Nicht-JWT', () => {
    expect(istLegacyJwtKey(BEISPIEL_PUBLISHABLE)).toBe(false)
    expect(istLegacyJwtKey('sb_secret_TESTWERT')).toBe(false)
    expect(istLegacyJwtKey(undefined)).toBe(false)
    expect(istLegacyJwtKey('')).toBe(false)
  })
})

describe('supabaseApiHeaders(): Bearer nur bei Legacy-JWTs', () => {
  it('setzt bei Legacy-JWT apikey UND Authorization', () => {
    const h = supabaseApiHeaders(BEISPIEL_JWT)
    expect(h.apikey).toBe(BEISPIEL_JWT)
    expect(h.Authorization).toBe(`Bearer ${BEISPIEL_JWT}`)
  })

  it('setzt bei Publishable-Key NUR apikey — sonst antwortet die API mit „Invalid JWT"', () => {
    const h = supabaseApiHeaders(BEISPIEL_PUBLISHABLE)
    expect(h.apikey).toBe(BEISPIEL_PUBLISHABLE)
    expect(h.Authorization).toBeUndefined()
  })

  it('uebernimmt Zusatz-Header unveraendert', () => {
    const h = supabaseApiHeaders(BEISPIEL_PUBLISHABLE, { Prefer: 'count=exact' })
    expect(h.Prefer).toBe('count=exact')
  })

  it('ueberschreibt einen mitgegebenen Authorization-Header nie (User-JWT hat Vorrang)', () => {
    const h = supabaseApiHeaders(BEISPIEL_JWT, { Authorization: 'Bearer USER_TOKEN' })
    expect(h.Authorization).toBe('Bearer USER_TOKEN')
  })
})

describe('Regressionsscan: keine direkten Legacy-Key-Lesezugriffe mehr', () => {
  it('app/, lib/ und proxy.ts lesen den oeffentlichen Key nur ueber lib/supabase/keys.ts', async () => {
    const { execSync } = await import('node:child_process')
    // `git grep` statt `grep -r`: liest nur getrackte Dateien und ist damit
    // um Groessenordnungen schneller — der Scan lief sonst unter Last in den
    // 15-Sekunden-Timeout der Suite.
    const treffer = execSync(
      String.raw`git grep -nF --untracked "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY" -- app lib components proxy.ts | grep -v "lib/supabase/keys.ts" | grep -v "__tests__" || true`,
      { cwd: process.cwd(), encoding: 'utf8' }
    ).trim()
    expect(
      treffer,
      `Direkter Anon-Key-Zugriff gefunden — bitte supabasePublishableKey() aus lib/supabase/keys.ts nutzen:\n${treffer}`
    ).toBe('')
  })

  // Zwei Dateien duerfen den rohen Bearer-Header enthalten — beide mit Grund,
  // beide ohne Produktivwirkung:
  //
  // • scripts/lib/supabase-keys.mjs ist der Helfer selbst. Er entscheidet, ob
  //   der Header gesetzt wird (Legacy-JWT: ja, `sb_publishable_…`: nein) —
  //   irgendwo muss das Literal stehen.
  // • scripts/verify-publishable-key.mjs ist ein reines Diagnoseskript. Sein
  //   Test 2 schickt `apikey` + `Authorization: Bearer <publishable>` mit
  //   Absicht, weil genau das der Aufrufweg von supabase-js ohne Session ist.
  //   Der Lauf misst, ob Supabase diese Kombination annimmt oder mit „Invalid
  //   JWT" ablehnt. Nimmt man ihm den Header, misst er nichts mehr.
  // • scripts/verify-resend.mjs spricht api.resend.com an, nicht Supabase.
  //   Dort IST `Authorization: Bearer <RESEND_API_KEY>` der vorgeschriebene
  //   Aufrufweg; apiHeaders() waere dort schlicht falsch, es baut
  //   Supabase-Header. Der Scan sucht nach dem Literal, nicht nach dem Ziel —
  //   deshalb braucht dieser Fall einen Eintrag statt einer Codeaenderung.
  // • scripts/verify-alarmkette-live.mjs aus demselben Grund: Schritt 7 der
  //   Kette fragt api.resend.com nach dem Zustellstatus einer Nachricht. Das
  //   ist der EINZIGE externe Zustellnachweis — ohne diesen Aufruf misst das
  //   Skript nur noch die eigenen Behauptungen. Supabase spricht es
  //   ausschliesslich ueber apiHeaders() an.
  //
  // Alles andere bleibt gesperrt: ein Skript, das den Header baut, um damit
  // Daten zu holen, meldet mit den neuen Keys still „kein Zugriff".
  const BEARER_AUSNAHMEN = [
    'scripts/lib/supabase-keys.mjs',
    'scripts/verify-publishable-key.mjs',
    'scripts/verify-resend.mjs',
    'scripts/verify-alarmkette-live.mjs',
    // Ebenfalls reine Resend-Aufrufe. security-testalarm.mjs verfolgt den
    // ausgeloesten Alarm bis zum last_event des Providers; belege-resend.mjs
    // holt denselben Stand fuer bereits versendete Nachrichten. Beide
    // sprechen Supabase ausschliesslich ueber apiHeaders() an.
    'scripts/security-testalarm.mjs',
    'scripts/belege-resend.mjs',
    // Prueft, ob bei Resend ueberhaupt ein Webhook eingetragen ist —
    // ohne diesen Aufruf misst der Lauf nichts.
    'scripts/verify-bounce-kette.mjs',
  ]

  it('scripts/*.mjs bauen PostgREST-Header nur ueber apiHeaders()', async () => {
    const { execSync } = await import('node:child_process')
    const ausfilter = BEARER_AUSNAHMEN.map((d) => ` | grep -v "${d}"`).join('')
    const treffer = execSync(
      String.raw`git grep -n --untracked "Authorization: .Bearer" -- 'scripts/*.mjs'` +
        ausfilter +
        ' || true',
      { cwd: process.cwd(), encoding: 'utf8' }
    ).trim()
    expect(
      treffer,
      `Roher Bearer-Header in einem Skript — mit den neuen Keys antwortet die API „Invalid JWT":\n${treffer}`
    ).toBe('')
  })

  it('die Bearer-Ausnahmeliste enthaelt keine toten Eintraege', async () => {
    // Eine Ausnahme fuer eine geloeschte oder umbenannte Datei filtert
    // stillschweigend nichts mehr — oder schlimmer: sie filtert spaeter einen
    // echten Treffer weg, wenn der Pfad neu vergeben wird.
    const { existsSync } = await import('node:fs')
    const tot = BEARER_AUSNAHMEN.filter((d) => !existsSync(d))
    expect(tot, `Ausnahme zeigt auf nicht existierende Datei:\n${tot.join('\n')}`).toEqual([])
  })

  it('der geheime Server-Key wird ueberall mit Secret-Vorrang gelesen', async () => {
    const { readFileSync } = await import('node:fs')
    const admin = readFileSync('lib/supabase/admin.ts', 'utf8')
    expect(admin).toContain(
      "process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY"
    )
  })
})
