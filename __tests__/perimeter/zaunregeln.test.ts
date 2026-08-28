/**
 * Track 13 — Zaunregeln fuer den unauthentifizierten Perimeter.
 *
 * WAS DIESE SUITE IST UND WAS NICHT. Sie liest Quelltext. Damit ist sie
 * ein Tuersteher, kein Beweis — dieselbe Einordnung, die
 * scripts/lint-route-auth.ts fuer sich selbst trifft. Ein Quelltext-Grep
 * ersetzt keinen Verhaltenstest, und wo Verhalten pruefbar ist, wird es
 * daneben auch geprueft (aufbewahrung.test.ts, unsubscribe-route.test.ts).
 *
 * Fuer GENAU EINE Frage ist die Quelltextlesung aber das richtige
 * Werkzeug: „benutzt diese Route den instanzlokalen Zaehler?" Der
 * Unterschied zwischen `rateLimit` und `rateLimitPersistent` ist zur
 * Laufzeit in einem Test nicht sichtbar — beide geben ein boolean zurueck.
 * Sichtbar wird er erst auf Vercel, wo jede neue Instanz mit leerem
 * Zaehler startet. Genau das ist Befund B2, und genau dagegen steht diese
 * Regel.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOESCHKATALOG } from '@/lib/dsgvo/loeschkatalog'

const WURZEL = process.cwd()
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf8')

/** Kommentare ausblenden — sie zeigen die falsche Form ja gerade. */
function kommentarfrei(quelltext: string): string {
  return quelltext.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, t => t.replace(/[^\n]/g, ' '))
}

/**
 * Die Routen, die OHNE Anmeldung erreichbar sind UND mit dem
 * Dienstschluessel in die Datenbank schreiben oder eine Mail ausloesen.
 * Fuer sie ist ein instanzlokaler Zaehler keine Grenze.
 */
const PERIMETER_SCHREIBWEGE = [
  'app/api/track/route.ts',
  'app/api/track/page-view/route.ts',
  'app/api/track-conversion/route.ts',
  'app/api/analytics/vitals/route.ts',
  'app/api/analytics/capi/route.ts',
  'app/api/visitor-alert/route.ts',
  'app/api/kontakt/route.ts',
  'app/api/lead-inquiry/route.ts',
  'app/api/newsletter/route.ts',
  'app/api/newsletter/unsubscribe/route.ts',
  'app/api/beratung-chat/route.ts',
  'app/api/auth/send-reset/route.ts',
]

describe('B2 — kein instanzlokaler Zaehler am Perimeter', () => {
  it.each(PERIMETER_SCHREIBWEGE)('%s begrenzt instanzuebergreifend', datei => {
    const quelle = kommentarfrei(lies(datei))
    expect(quelle, `${datei}: ruft rateLimitPersistent nicht auf`).toContain('rateLimitPersistent')
  })

  it.each(PERIMETER_SCHREIBWEGE)('%s benutzt NICHT den instanzlokalen rateLimit()', datei => {
    const quelle = kommentarfrei(lies(datei))
    // `getClientIp` kommt aus demselben Modul und ist unbedenklich —
    // gesucht ist der Aufruf der zaehlenden Funktion.
    expect(
      /(?<![A-Za-z])rateLimit\s*\(/.test(quelle),
      `${datei}: zaehlt mit rateLimit() im Modul-Scope. Auf Vercel startet jede neue `
      + `Serverless-Instanz mit leerem Zaehler — das ist keine Grenze.`,
    ).toBe(false)
  })

  it.each(PERIMETER_SCHREIBWEGE)('%s haelt keinen eigenen Zaehler im Modul-Scope', datei => {
    const quelle = kommentarfrei(lies(datei))
    // Drei der vier umgestellten Routen hatten ihre eigene Map gebaut,
    // statt lib/rate-limit.ts zu benutzen — die Regel muss beide Formen
    // fangen, sonst wandert der Fehler nur um.
    expect(
      /new Map<[^>]*(count|resetAt|\bc\b|\br\b)/.test(quelle) && /resetAt|\.r\b/.test(quelle),
      `${datei}: baut einen eigenen Zaehler im Modul-Scope.`,
    ).toBe(false)
  })
})

describe('B4 — der Loeschkatalog kennt die Bewegungsspur', () => {
  it('fuehrt visitor_locations.user_id und loescht sie', () => {
    const eintrag = LOESCHKATALOG.find(e => e.tabelle === 'visitor_locations' && e.spalte === 'user_id')
    expect(eintrag, 'visitor_locations.user_id fehlt im Loeschkatalog').toBeDefined()
    expect(eintrag!.entscheidung).toBe('loeschen')
  })

  it('begruendet, warum „aufbewahren" hier falsch waere', () => {
    // Der Fremdschluessel steht auf ON DELETE SET NULL. „aufbewahren"
    // hiesse im Katalog: der Personenbezug faellt dadurch weg. Genau das
    // stimmt hier nicht — die volle IP bleibt in derselben Zeile stehen.
    const eintrag = LOESCHKATALOG.find(e => e.tabelle === 'visitor_locations')!
    expect(eintrag.begruendung).toMatch(/SET NULL/)
    expect(eintrag.begruendung).toMatch(/IP/)
  })

  it('nennt keine Tabelle zweimal mit derselben Spalte', () => {
    const schluessel = LOESCHKATALOG.map(e => `${e.tabelle}.${e.spalte}`)
    expect(new Set(schluessel).size).toBe(schluessel.length)
  })
})

describe('B5 — der Aufbewahrungslauf haengt am Cron und am Tuersteher', () => {
  const route = 'app/api/cron/perimeter-aufbewahrung/route.ts'

  it('prueft das Cron-Geheimnis, bevor irgendetwas geschieht', () => {
    const quelle = kommentarfrei(lies(route))
    const tuersteher = quelle.indexOf('pruefeCronGeheimnis')
    const lauf = quelle.indexOf('fuehreAufbewahrungAus')
    expect(tuersteher).toBeGreaterThan(-1)
    expect(tuersteher, 'Tuersteher steht nicht vor dem Lauf').toBeLessThan(lauf)
  })

  it('laeuft ohne ausdrueckliche Freigabe als Trockenlauf', () => {
    const quelle = kommentarfrei(lies(route))
    expect(quelle).toContain('PERIMETER_AUFBEWAHRUNG_AKTIV')
    // Der Trockenlauf ist die NEGATION der Freigabe — nicht andersherum.
    expect(quelle).toMatch(/trockenlauf:\s*!scharf/)
  })

  it('steht als taeglicher Cron in vercel.json', () => {
    const vercel = JSON.parse(lies('vercel.json')) as { crons?: { path: string; schedule: string }[] }
    const eintrag = vercel.crons?.find(c => c.path === '/api/cron/perimeter-aufbewahrung')
    expect(eintrag, 'Cron-Eintrag fehlt — der Lauf haette keinen Takt').toBeDefined()
    expect(eintrag!.schedule).toMatch(/^\S+ \S+ \* \* \*$/)
  })
})

describe('B1 — die Migration schliesst die offene Tuer und hat einen Rollback', () => {
  const migration = 'supabase/migrations/20260828180000_perimeter_lead_inquiries_offene_tuer.sql'
  const rollback = 'supabase/migrations/20260828180001_rollback_perimeter_lead_inquiries_offene_tuer.sql'

  it('entfernt die Policy „Anyone can submit lead inquiry"', () => {
    expect(lies(migration)).toMatch(/DROP POLICY IF EXISTS "Anyone can submit lead inquiry"/)
  })

  it('setzt den Statuswortschatz als CHECK', () => {
    const sql = lies(migration)
    for (const wert of ['new', 'contacted', 'qualified', 'converted', 'lost']) {
      expect(sql).toContain(`'${wert}'`)
    }
  })

  it('stellt der Rollback den Ausgangszustand wieder her — samt Befund', () => {
    const sql = lies(rollback)
    expect(sql).toMatch(/CREATE POLICY "Anyone can submit lead inquiry"/)
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS lead_inquiries_status_check/)
  })
})

describe('B6 — die Anmeldung ist kein Bestands-Orakel mehr', () => {
  it('kennt den Code already_subscribed nicht mehr', () => {
    // Er unterschied nach aussen zwischen „steht im Verteiler" und „steht
    // nicht drin" — eine Auskunft ueber Dritte an einen Unbekannten.
    const quelle = kommentarfrei(lies('app/api/newsletter/route.ts'))
    expect(quelle).not.toContain('already_subscribed')
    expect(quelle).not.toContain('409')
  })

  it('und die Oberflaeche wertet ihn nicht mehr aus', () => {
    const quelle = kommentarfrei(lies('components/NewsletterSignup.tsx'))
    expect(quelle).not.toContain('already_subscribed')
    expect(quelle).not.toContain("'exists'")
  })

  it('der Abmeldelink der Willkommensmail traegt ein Token', () => {
    const quelle = kommentarfrei(lies('app/api/newsletter/route.ts'))
    expect(quelle).toContain('abmeldeLink(')
    // Der frueher hier stehende tokenlose Link darf nicht zurueckkommen.
    expect(quelle).not.toMatch(/unsubscribe\?email=\$\{/)
  })
})
