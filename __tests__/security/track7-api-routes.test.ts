/**
 * Track 7 — API-Routes Security Audit (28.08.2026)
 * ════════════════════════════════════════════════════════════════════
 *
 * Fuenf Befunde, jeder mit einer GEGENPROBE: der Test fuehrt die ALTE
 * Form noch einmal aus und verlangt, dass sie auffaellt. Ein gruener Lauf
 * gegen den neuen Stand allein beweist nur, dass nichts gefunden wurde —
 * nicht, dass etwas gefunden werden KANN.
 *
 *  B1  49 API-Routen entschieden ueber die Rolle allein aus `profiles`.
 *      Eine Herabstufung, die nur in `app_metadata` steht, blieb dort
 *      wirkungslos — auf praktisch dem gesamten Geldweg.
 *  B2  /api/referral/complete hat den Bonus NIE gutgeschrieben (RPC
 *      existiert nicht, `.rpc()` wirft nicht, der catch-Fallback lief
 *      also nie) und den Vorgang trotzdem verbrannt.
 *  B3  /api/tours/templates nahm `caregiver_id` und `stops[].client_id`
 *      ungeprueft aus dem Rumpf — GET bettet den Klarnamen der
 *      Betreuungskraft mit dem Dienstschluessel ein.
 *  B4  Die KIM-Adressbuchsuche stand roh in einer PostgREST-or()-Zeichen-
 *      kette.
 *  B5  Die Prevention-Control selbst: findet sie die alten Formen?
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'
import {
  wirksamDarf,
  wirksameBerechtigungen,
  rolleDarf,
  ROLLEN,
  type Rolle,
} from '@/lib/auth/rollen'
import { quellenDuerfen, quellenSindRolle } from '@/lib/auth/rollen-quelle'
import { schreibeGutschrift } from '@/lib/referral/gutschrift'
import { postgrestSuchwert, postgrestWert } from '@/lib/supabase/postgrest-filter'
import { pruefeRollenquelle, pruefeOderFilter } from '../../scripts/lint-route-auth'

const WURZEL = process.cwd()
const lies = (p: string) => readFileSync(join(WURZEL, p), 'utf-8')

// ════════════════════════════════════════════════════════════════════
// B1 — Rollenquelle in den API-Routen
// ════════════════════════════════════════════════════════════════════

describe('B1 — Rollenentscheidung liest beide Quellen', () => {
  it('GEGENPROBE: die ALTE Regel (nur profiles) haette den im Token herabgestuften Admin durchgelassen', () => {
    // Ausgangslage: die Herabstufung wurde im Token vollzogen
    // (app_metadata.role = 'kunde'), in profiles steht noch 'admin' —
    // genau der Zustand, den jede Aenderung ausserhalb von
    // /api/admin/manage-role hinterlaesst.
    const profilRolle = 'admin'
    const appRolle = 'kunde'

    // ALT: die Route entschied allein aus profiles.
    expect(rolleDarf(profilRolle, 'abrechnung.schreiben')).toBe(true)

    // NEU: die Schnittmenge beider Quellen entscheidet.
    expect(wirksamDarf(appRolle, profilRolle, 'abrechnung.schreiben')).toBe(false)
    expect(quellenDuerfen({ appRolle, profilRolle }, 'abrechnung.schreiben')).toBe(false)
  })

  it('die Regel kann nur Rechte NEHMEN, nie geben — ueber alle Rollenpaare', () => {
    for (const app of ROLLEN as readonly Rolle[]) {
      for (const profil of ROLLEN as readonly Rolle[]) {
        const wirksam = wirksameBerechtigungen(app, profil)
        for (const b of wirksam) {
          // Was wirksam ist, muss auch profiles allein hergeben.
          expect(rolleDarf(profil, b)).toBe(true)
        }
      }
    }
  })

  it('ein leeres app_metadata schraenkt nicht ein (Bestandsfall)', () => {
    expect(quellenDuerfen({ appRolle: '', profilRolle: 'admin' }, 'abrechnung.schreiben')).toBe(true)
  })

  it('ohne profiles-Zeile gibt es keine Berechtigung, egal was im Token steht', () => {
    expect(quellenDuerfen({ appRolle: 'superadmin', profilRolle: '' }, 'abrechnung.schreiben')).toBe(false)
  })

  it('quellenSindRolle verlangt beide Quellen — und laesst ein leeres Token zu', () => {
    expect(quellenSindRolle({ appRolle: 'superadmin', profilRolle: 'superadmin' }, 'superadmin')).toBe(true)
    expect(quellenSindRolle({ appRolle: '', profilRolle: 'superadmin' }, 'superadmin')).toBe(true)
    // Herabstufung im Token: die Rollenverwaltung ist zu.
    expect(quellenSindRolle({ appRolle: 'admin', profilRolle: 'superadmin' }, 'superadmin')).toBe(false)
    // Erhoehung im Token gewaehrt nichts.
    expect(quellenSindRolle({ appRolle: 'superadmin', profilRolle: 'admin' }, 'superadmin')).toBe(false)
  })

  it('QUELLTEXT-ZAUN: keine API-Route entscheidet mehr allein aus profiles', () => {
    // Der Fehler ist per Konstruktion eine WEGLASSUNG (die zweite Quelle
    // fehlt). Ein funktionaler Test faengt nur die Route, die er anfaehrt —
    // deshalb hier der Zaun ueber alle 411 Routen.
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const dateien = execSync('find app/api -name "route.ts"', { cwd: WURZEL, encoding: 'utf-8' })
      .trim().split('\n')
    const treffer = dateien.flatMap(d => pruefeRollenquelle(lies(d), d))
    expect(treffer).toEqual([])
  })

  it('GEGENPROBE der Regel: die ALTE Form wird gefunden', () => {
    const alteForm = `
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) return fehler(403)
    `
    expect(pruefeRollenquelle(alteForm, 'x/route.ts')).toHaveLength(1)
  })

  it('die Regel meldet die Rolle einer ZIELPERSON nicht (dort ist profiles allein richtig)', () => {
    const zielperson = `
      const { data: targetProfile } = await admin.from('profiles').select('role, email').eq('id', targetUserId).single()
    `
    expect(pruefeRollenquelle(zielperson, 'x/route.ts')).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════
// B2 — Empfehlungsbonus
// ════════════════════════════════════════════════════════════════════

describe('B2 — Empfehlungsbonus wird tatsaechlich gebucht', () => {
  it('GEGENPROBE: `.rpc()` WIRFT NICHT — der alte catch-Fallback konnte nie laufen', async () => {
    // Die alte Route stand so da:
    //     try { await admin.rpc('increment_referral_credit', …) }
    //     catch { …Lese-Schreib-Fallback… }
    // Der Client liefert den Fehler im Rueckgabewert, nicht als Ausnahme.
    const fake = erstelleFakeSupabase(
      () => ({ data: null }),
      undefined,
      () => ({ error: { message: 'Could not find the function', code: 'PGRST202' } }),
    )
    let catchLief = false
    try {
      await (fake.client as unknown as {
        rpc: (n: string, a: unknown) => Promise<unknown>
      }).rpc('increment_referral_credit', { user_id: 'u1', amount: 20 })
    } catch {
      catchLief = true
    }
    expect(catchLief).toBe(false)
    // Damit lief weder die RPC noch der Fallback — und die Route meldete
    // trotzdem „Bonus gutgeschrieben".
  })

  it('schreibeGutschrift addiert auf den bestehenden Stand', async () => {
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.operation === 'select' ? { data: { referral_credit: 12.5 } } : { data: null },
    )
    const e = await schreibeGutschrift(fake.client, 'u1', 20)
    expect(e.ok).toBe(true)
    expect(e.neuerStand).toBe(32.5)
    const update = fake.auf('profiles').find(a => a.operation === 'update')
    expect(update?.payload).toEqual({ referral_credit: 32.5 })
    expect(hatFilter(update, 'eq', 'id', 'u1')).toBe(true)
  })

  it('FAIL-CLOSED: ein nicht lesbarer Stand ist ein Fehler, keine Buchung von 0', async () => {
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.operation === 'select'
        ? { data: null, error: { message: 'timeout', code: '57014' } }
        : { data: null },
    )
    const e = await schreibeGutschrift(fake.client, 'u1', 20)
    expect(e.ok).toBe(false)
    // Entscheidend: es wurde NICHTS geschrieben.
    expect(fake.auf('profiles').some(a => a.operation === 'update')).toBe(false)
  })

  it('FAIL-CLOSED: ohne Profil gibt es kein Konto und keine Buchung', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    const e = await schreibeGutschrift(fake.client, 'u1', 20)
    expect(e.ok).toBe(false)
    expect(fake.auf('profiles').some(a => a.operation === 'update')).toBe(false)
  })

  it('ein nicht schreibbarer Stand meldet den Fehler statt Erfolg', async () => {
    const fake = erstelleFakeSupabase((a: FakeAufruf) =>
      a.operation === 'select'
        ? { data: { referral_credit: 0 } }
        : { data: null, error: { message: 'denied', code: '42501' } },
    )
    const e = await schreibeGutschrift(fake.client, 'u1', 20)
    expect(e.ok).toBe(false)
  })

  it('ein unbrauchbarer Betrag wird abgewiesen, nicht als NaN gebucht', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: { referral_credit: 0 } }))
    for (const betrag of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      const e = await schreibeGutschrift(fake.client, 'u1', betrag)
      expect(e.ok).toBe(false)
    }
    expect(fake.auf('profiles').some(a => a.operation === 'update')).toBe(false)
  })

  it('QUELLTEXT: die Route beansprucht per Compare-and-Swap und wickelt zurueck', () => {
    const src = lies('app/api/referral/complete/route.ts')
    // Der Statuswechsel traegt die Statusbedingung (CAS).
    expect(src).toMatch(/\.eq\('id', referral\.id\)\s*\n\s*\.eq\('status', 'pending'\)/)
    // Und es gibt einen Rueckweg auf 'pending', falls die Buchung scheitert.
    expect(src).toMatch(/status: 'pending'/)
    // Die nicht existierende RPC wird nicht mehr AUFGERUFEN. Der Name
    // steht weiter im Erklaertext des Befundes — das ist Absicht: wer die
    // Stelle das naechste Mal liest, soll wissen, warum sie so aussieht.
    expect(src).not.toMatch(/\.rpc\(\s*'increment_referral_credit'/)
  })
})

// ════════════════════════════════════════════════════════════════════
// B3 — Mandanten-Fence auf den Tourenvorlagen
// ════════════════════════════════════════════════════════════════════

describe('B3 — Tourenvorlagen fencen ihre Fremdschluessel', () => {
  const src = lies('app/api/tours/templates/route.ts')

  it('GEGENPROBE: GET bettet caregivers mit dem Dienstschluessel ein — der Fence ist die einzige Grenze', () => {
    // Das ist der Grund, warum ein ungeprueftes caregiver_id ein LESEWEG
    // nach draussen ist und nicht nur ein toter Verweis: PostgREST folgt
    // dem Fremdschluessel ohne Mandantenbedingung, und der
    // Dienstschluessel hebt den RESTRICTIVE org_fence auf.
    expect(src).toContain('caregivers:caregiver_id(first_name, last_name)')
    expect(src).toContain('createAdminClient()')
  })

  it('POST und PATCH pruefen caregiver_id und stops[].client_id vor dem Schreiben', () => {
    const fenceAufrufe = src.match(/await fenceFremdschluessel\(/g) ?? []
    expect(fenceAufrufe).toHaveLength(2)
    // Der Fence steht VOR dem Schreiben, nicht danach.
    const posFencePost = src.indexOf('fenceFremdschluessel(admin, auth.ctx.organizationId, caregiver_id')
    const posInsert = src.indexOf(".insert({")
    expect(posFencePost).toBeGreaterThan(-1)
    expect(posFencePost).toBeLessThan(posInsert)
  })

  it('der Fence prueft gegen die Organisation des Aufrufers', () => {
    expect(src).toContain('caregiverGehoertZuOrg')
    expect(src).toContain('clientGehoertZuOrg')
    expect(src).toContain('auth.ctx.organizationId')
  })
})

// ════════════════════════════════════════════════════════════════════
// B4 — PostgREST-or()-Filter
// ════════════════════════════════════════════════════════════════════

describe('B4 — Suchbegriffe in or()-Filtern sind gequotet', () => {
  it('GEGENPROBE: der ROHE Begriff haengt eine zweite Bedingung an', () => {
    const boese = 'x,ik_nummer.eq.260326822'
    const alt = `display_name.ilike.%${boese}%,kim_address.ilike.%${boese}%`
    // In der Filtergrammatik von PostgREST sind das jetzt VIER Bedingungen
    // statt zwei — eine davon ueber eine Spalte, nach der niemand gesucht hat.
    expect(alt.split(',')).toHaveLength(4)
    expect(alt).toContain('ik_nummer.eq.')
  })

  it('mit postgrestSuchwert bleibt es bei zwei Bedingungen', () => {
    const boese = 'x,ik_nummer.eq.260326822'
    const s = postgrestSuchwert(boese)
    const neu = `display_name.ilike.${s},kim_address.ilike.${s}`
    // Die Kommas des Begriffs stehen jetzt INNERHALB der
    // Anfuehrungszeichen und trennen nichts mehr.
    const ausserhalb = neu.replace(/"[^"]*"/g, 'X')
    expect(ausserhalb.split(',')).toHaveLength(2)
  })

  it('Anfuehrungszeichen und Backslash werden maskiert — in dieser Reihenfolge', () => {
    expect(postgrestSuchwert('a"b')).toBe('"%a\\"b%"')
    expect(postgrestSuchwert('a\\b')).toBe('"%a\\\\b%"')
    // Falsche Reihenfolge wuerde hier '"%a\\\\"b%"' liefern und die
    // Klammerung wieder aufbrechen.
    expect(postgrestSuchwert('a\\"b')).toBe('"%a\\\\\\"b%"')
  })

  it('postgrestWert setzt keine Platzhalter', () => {
    expect(postgrestWert('abc')).toBe('"abc"')
  })

  it('das KIM-Adressbuch nutzt die Maskierung', () => {
    const kim = lies('lib/kim/address-book-service.ts')
    expect(kim).toContain('postgrestSuchwert(filter.search)')
    expect(kim).not.toMatch(/\.or\(`display_name\.ilike\.%\$\{filter\.search\}/)
  })

  it('GEGENPROBE der Regel: die ALTE Form wird gefunden', () => {
    const alt = 'query = query.or(`display_name.ilike.%${filter.search}%,kim_address.ilike.%${filter.search}%`)'
    expect(pruefeOderFilter(alt, 'x.ts').length).toBeGreaterThan(0)
  })

  it('die Regel meldet einen gequoteten Begriff NICHT', () => {
    const neu = [
      'const s = postgrestSuchwert(filter.search)',
      'query = query.or(`display_name.ilike.${s},kim_address.ilike.${s}`)',
    ].join('\n')
    expect(pruefeOderFilter(neu, 'x.ts')).toEqual([])
  })

  it('die Regel meldet die org-Fence-Form NICHT (Wert kommt aus dem Auth-Kontext)', () => {
    const orgFence = '.or(`organization_id.eq.${organizationId},organization_id.is.null`)'
    expect(pruefeOderFilter(orgFence, 'x.ts')).toEqual([])
  })

  it('die Regel meldet ihre eigenen Erklaertexte NICHT', () => {
    expect(pruefeOderFilter(lies('lib/supabase/postgrest-filter.ts'), 'x.ts')).toEqual([])
    expect(pruefeOderFilter(lies('scripts/lint-route-auth.ts'), 'x.ts')).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════════════
// B5 — Rate-Limit der KI-Route
// ════════════════════════════════════════════════════════════════════

describe('B5 — /api/ai-chat begrenzt instanzuebergreifend', () => {
  const src = lies('app/api/ai-chat/route.ts')

  it('kein instanz-lokaler Map-Zaehler mehr', () => {
    expect(src).not.toMatch(/new Map<string, \{ count: number; resetAt: number \}>/)
  })

  it('nutzt rateLimitPersistent mit einem Schluessel pro Nutzer', () => {
    expect(src).toContain('rateLimitPersistent(`ai-chat:${user.id}`')
  })
})
