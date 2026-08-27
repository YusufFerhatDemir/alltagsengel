/**
 * § 302 SGB V — HKP-Verordnungen (§ 37 SGB V, Muster 12)
 *
 * Die Verordnung ist das Tor zur Abrechenbarkeit: ohne genehmigte, gültige
 * Verordnung ist keine Leistung der häuslichen Krankenpflege abrechenbar
 * (pruefePosition in ./positionen.ts prüft das hart). Entsprechend zielen
 * die Fälle hier auf die Wege, auf denen eine Verordnung fälschlich
 * abrechenbar wird oder still keine Leistung mehr deckt:
 *
 *   - eine ABGELEHNTE Verordnung wird per Genehmigung überschrieben,
 *   - ein umgedrehter Gültigkeitszeitraum lässt jede Leistung durchs Raster,
 *   - die Genehmigung endet vor Beginn der Verordnung,
 *   - `verordnungen` hat keine organization_id — fällt der clients-Join weg,
 *     sind fremde Mandanten sichtbar.
 */

import { describe, it, expect } from 'vitest'
import {
  listeHkpVerordnungen,
  ladeHkpVerordnung,
  legeHkpVerordnungAn,
  genehmigeHkpVerordnung,
} from '@/lib/abrechnung/sgb-v/verordnung-service'
import { HKP_VERORDNUNG_TYPE } from '@/lib/abrechnung/sgb-v/positionen'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { heuteBerlin } from '@/lib/utils/timezone'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000001'
const KLIENT = '55555555-5555-4555-8555-555555555555'
const VERORDNUNG = '66666666-6666-4666-8666-666666666666'
const ACTOR = '44444444-4444-4444-8444-444444444444'

function tagVersatz(tage: number): string {
  const d = new Date(`${heuteBerlin()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

function verordnungZeile(overrides: Record<string, unknown> = {}) {
  return {
    id: VERORDNUNG,
    client_id: KLIENT,
    verordnung_type: HKP_VERORDNUNG_TYPE,
    genehmigung_status: 'ausstehend',
    gueltig_von: '2026-01-01',
    gueltig_bis: '2026-12-31',
    genehmigung_bis: null,
    verordnung_nummer: 'HKP-2026-001',
    genehmigung_aktenzeichen: null,
    kostentraeger_ik_nummer: '104593971',
    kostentraeger_name: 'AOK Hessen',
    arzt_name: 'Dr. Meier',
    arzt_praxis: 'Praxis Mitte',
    diagnose: 'I50.9',
    ausstellungsdatum: '2026-01-02',
    clients: { id: KLIENT, organization_id: ORG, first_name: 'Anna', last_name: 'Beispiel' },
    ...overrides,
  }
}

/** Vollständige, gültige Eingabe — jeder Testfall variiert genau ein Feld. */
function eingabe(overrides: Record<string, unknown> = {}) {
  return {
    clientId: KLIENT,
    ausstellungsdatum: '2026-01-02',
    arztName: 'Dr. Meier',
    diagnose: 'I50.9',
    gueltigVon: '2026-01-01',
    gueltigBis: '2026-12-31',
    ...overrides,
  }
}

const anlageGeber = (a: FakeAufruf) => {
  if (a.tabelle === 'clients') return { data: { id: KLIENT } }
  if (a.tabelle === 'verordnungen' && a.operation === 'insert') return { data: { id: VERORDNUNG } }
  return { data: null }
}

// ═══════════════════════════════════════════════════════════════════
// Lesen — der clients-Join IST die Mandantengrenze
// ═══════════════════════════════════════════════════════════════════

describe('listeHkpVerordnungen / ladeHkpVerordnung — Mandantengrenze', () => {
  it('fenced die Liste über clients.organization_id und filtert auf den HKP-Typ', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [verordnungZeile()] }))
    await listeHkpVerordnungen(fake.client, ORG)

    const a = fake.ersterAuf('verordnungen')
    expect(hatFilter(a, 'eq', 'clients.organization_id', ORG),
      'ohne diesen Filter sind Verordnungen fremder Mandanten sichtbar').toBe(true)
    expect(hatFilter(a, 'eq', 'verordnung_type', HKP_VERORDNUNG_TYPE)).toBe(true)
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
  })

  it('verwendet den erzwingenden Join, nicht den optionalen', async () => {
    // clients(...) statt clients!inner(...) waere ein LEFT JOIN: Zeilen ohne
    // passenden Klienten kaemen mit durch und der org-Filter liefe ins Leere.
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await listeHkpVerordnungen(fake.client, ORG)
    expect(fake.ersterAuf('verordnungen')?.spalten).toContain('clients!inner')
  })

  it('fenced auch die Einzelabfrage', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: verordnungZeile() }))
    await ladeHkpVerordnung(fake.client, ORG, VERORDNUNG)
    const a = fake.ersterAuf('verordnungen')
    expect(hatFilter(a, 'eq', 'clients.organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'id', VERORDNUNG)).toBe(true)
  })

  it('gibt null zurück, wenn der Fence nichts liefert', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(ladeHkpVerordnung(fake.client, ORG, VERORDNUNG)).resolves.toBeNull()
  })
})

describe('aktuell_gueltig', () => {
  async function gueltigkeit(overrides: Record<string, unknown>) {
    const fake = erstelleFakeSupabase(() => ({ data: verordnungZeile(overrides) }))
    const v = await ladeHkpVerordnung(fake.client, ORG, VERORDNUNG)
    return v!.aktuell_gueltig
  }

  it('ist wahr für eine genehmigte, laufende Verordnung', async () => {
    expect(await gueltigkeit({
      genehmigung_status: 'genehmigt', gueltig_von: tagVersatz(-10), gueltig_bis: tagVersatz(10),
    })).toBe(true)
  })

  it('ist falsch, solange die Verordnung nicht genehmigt ist', async () => {
    expect(await gueltigkeit({
      genehmigung_status: 'ausstehend', gueltig_von: tagVersatz(-10), gueltig_bis: tagVersatz(10),
    })).toBe(false)
  })

  it('ist falsch für eine abgelehnte Verordnung', async () => {
    expect(await gueltigkeit({
      genehmigung_status: 'abgelehnt', gueltig_von: tagVersatz(-10), gueltig_bis: tagVersatz(10),
    })).toBe(false)
  })

  it('ist falsch vor Beginn und nach Ende', async () => {
    expect(await gueltigkeit({ genehmigung_status: 'genehmigt', gueltig_von: tagVersatz(5), gueltig_bis: tagVersatz(50) })).toBe(false)
    expect(await gueltigkeit({ genehmigung_status: 'genehmigt', gueltig_von: tagVersatz(-50), gueltig_bis: tagVersatz(-1) })).toBe(false)
  })

  it('folgt der FRÜHEREN Grenze, wenn die Kassengenehmigung vor der Verordnung endet', async () => {
    // Sonst gaelten Leistungen nach Ablauf der Genehmigung als abrechenbar.
    expect(await gueltigkeit({
      genehmigung_status: 'genehmigt',
      gueltig_von: tagVersatz(-10),
      gueltig_bis: tagVersatz(90),
      genehmigung_bis: tagVersatz(-1),
    })).toBe(false)
  })

  it('gilt unbefristet, wenn beide Grenzen fehlen', async () => {
    expect(await gueltigkeit({
      genehmigung_status: 'genehmigt', gueltig_von: null, gueltig_bis: null, genehmigung_bis: null,
    })).toBe(true)
  })

  it('ist am letzten Gültigkeitstag noch wahr', async () => {
    expect(await gueltigkeit({
      genehmigung_status: 'genehmigt', gueltig_von: tagVersatz(-10), gueltig_bis: heuteBerlin(),
    })).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Anlegen
// ═══════════════════════════════════════════════════════════════════

describe('legeHkpVerordnungAn', () => {
  it('legt an und markiert den Datensatz als echte Verordnung im Status ausstehend', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe(), ACTOR)).resolves.toBe(VERORDNUNG)

    const p = fake.ersterAuf('verordnungen', 'insert')?.payload as Record<string, unknown>
    expect(p.verordnung_type).toBe(HKP_VERORDNUNG_TYPE)
    expect(p.ist_verordnung).toBe(true)
    // Nie direkt genehmigt anlegen — das ist der zweite, getrennte Schritt.
    expect(p.genehmigung_status).toBe('ausstehend')
    expect(p.kostentraeger_typ).toBe('krankenkasse')
  })

  it('prüft den Klienten gegen die Organisation, bevor geschrieben wird', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await legeHkpVerordnungAn(fake.client, ORG, eingabe(), ACTOR)
    const klientAbfrage = fake.ersterAuf('clients')
    expect(hatFilter(klientAbfrage, 'eq', 'organization_id', ORG)).toBe(true)
    expect(klientAbfrage!.gesamtNr).toBeLessThan(fake.ersterAuf('verordnungen', 'insert')!.gesamtNr)
  })

  it('legt für einen fremden Klienten nichts an', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe(), ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 404 })
    expect(fake.ersterAuf('verordnungen', 'insert')).toBeUndefined()
  })

  it('verlangt den Arzt — § 37 SGB V kennt keine Verordnung ohne Verordner', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({ arztName: '  ' }), ACTOR))
      .rejects.toThrow(UserFacingError)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('verlangt ein Ausstellungsdatum', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({ ausstellungsdatum: '' }), ACTOR))
      .rejects.toThrow(/Ausstellungsdatum/)
    expect(fake.ersterAuf('verordnungen', 'insert')).toBeUndefined()
  })

  it('weist ein Datum im deutschen Format ab, statt es abzuspeichern', async () => {
    // '1.3.2026' vergleicht sich als Zeichenkette falsch gegen '2026-06-15'
    // — die Verordnung wuerde jede Leistung als "vor Beginn" abweisen.
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({ gueltigVon: '1.3.2026' }), ACTOR))
      .rejects.toThrow(/JJJJ-MM-TT/)
  })

  it('weist ein syntaktisch gültiges, real nicht existierendes Datum ab', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({ gueltigBis: '2026-13-45' }), ACTOR))
      .rejects.toThrow(UserFacingError)
  })

  it('weist einen umgedrehten Gültigkeitszeitraum ab', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({
      gueltigVon: '2026-12-31', gueltigBis: '2026-01-01',
    }), ACTOR)).rejects.toThrow(/vor dem Gültig-ab-Datum/)
    expect(fake.ersterAuf('verordnungen', 'insert')).toBeUndefined()
  })

  it('erlaubt einen Eintagszeitraum', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({
      gueltigVon: '2026-05-05', gueltigBis: '2026-05-05',
    }), ACTOR)).resolves.toBe(VERORDNUNG)
  })

  it('erlaubt eine unbefristete Verordnung', async () => {
    const fake = erstelleFakeSupabase(anlageGeber)
    await expect(legeHkpVerordnungAn(fake.client, ORG, eingabe({
      gueltigVon: null, gueltigBis: null,
    }), ACTOR)).resolves.toBe(VERORDNUNG)
    const p = fake.ersterAuf('verordnungen', 'insert')?.payload as Record<string, unknown>
    expect(p.gueltig_von).toBeNull()
    expect(p.gueltig_bis).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Genehmigen — der Schritt, der Geld freischaltet
// ═══════════════════════════════════════════════════════════════════

describe('genehmigeHkpVerordnung', () => {
  const genehmigenGeber = (zeile = verordnungZeile()) => (a: FakeAufruf) => {
    if (a.tabelle === 'verordnungen' && a.operation === 'select') return { data: zeile }
    if (a.tabelle === 'verordnungen' && a.operation === 'update') return { data: [{ id: VERORDNUNG }] }
    return { data: null }
  }

  it('trägt die Genehmigung mit heutigem Datum ein', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber())
    await genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {
      genehmigungBis: tagVersatz(90), aktenzeichen: 'AZ-4711',
    }, ACTOR)

    const p = fake.auf('verordnungen').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.genehmigung_status).toBe('genehmigt')
    expect(p.genehmigung_datum).toBe(heuteBerlin())
    expect(p.genehmigung_aktenzeichen).toBe('AZ-4711')
  })

  it('genehmigt KEINE abgelehnte Verordnung', async () => {
    // Der teuerste Fall des Moduls: die Ablehnung waere still verschwunden
    // und jede angehaengte Leistung schlagartig abrechenbar geworden.
    const fake = erstelleFakeSupabase(genehmigenGeber(verordnungZeile({ genehmigung_status: 'abgelehnt' })))
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {}, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 409 })
    expect(fake.auf('verordnungen').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('genehmigt KEINE abgelaufene Verordnung', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber(verordnungZeile({ genehmigung_status: 'abgelaufen' })))
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {}, ACTOR)).rejects.toThrow(/abgelaufen/)
    expect(fake.auf('verordnungen').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('erlaubt die Genehmigung nach beantragt und nach Widerspruch', async () => {
    for (const status of ['beantragt', 'widerspruch']) {
      const fake = erstelleFakeSupabase(genehmigenGeber(verordnungZeile({ genehmigung_status: status })))
      await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {
        genehmigungBis: tagVersatz(30),
      }, ACTOR)).resolves.toBeUndefined()
    }
  })

  it('genehmigt keine fremde Verordnung', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {}, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 404 })
    expect(fake.auf('verordnungen').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('hält das UPDATE auf demselben Ausschnitt wie die Prüfung und sichert es per CAS', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber())
    await genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, { genehmigungBis: tagVersatz(30) }, ACTOR)

    const u = fake.auf('verordnungen').find(a => a.operation === 'update')
    expect(hatFilter(u, 'eq', 'id', VERORDNUNG)).toBe(true)
    expect(hatFilter(u, 'eq', 'verordnung_type', HKP_VERORDNUNG_TYPE),
      'ohne Typfilter trifft das UPDATE auch §36-/§45b-Bewilligungen').toBe(true)
    expect(hatFilter(u, 'is', 'deleted_at', null)).toBe(true)
    expect(hatFilter(u, 'eq', 'genehmigung_status', 'ausstehend'),
      'CAS gegen den gelesenen Status').toBe(true)
  })

  it('meldet einen Konflikt, wenn das CAS-UPDATE keine Zeile trifft', async () => {
    const fake = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.operation === 'select') return { data: verordnungZeile() }
      return { data: [] }
    })
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {}, ACTOR))
      .rejects.toMatchObject({ name: 'UserFacingError', status: 409 })
  })

  it('weist ein Genehmigt-bis-Datum in der Vergangenheit ab', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber())
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {
      genehmigungBis: tagVersatz(-1),
    }, ACTOR)).rejects.toThrow(/Vergangenheit/)
    expect(fake.auf('verordnungen').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('weist eine Genehmigung ab, die vor dem Beginn der Verordnung endet', async () => {
    // Sie deckte keinen einzigen Leistungstag — waere aber "genehmigt".
    const fake = erstelleFakeSupabase(genehmigenGeber(verordnungZeile({ gueltig_von: tagVersatz(30) })))
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {
      genehmigungBis: tagVersatz(10),
    }, ACTOR)).rejects.toThrow(/vor dem Beginn der Verordnung/)
  })

  it('erlaubt eine Genehmigung ohne Enddatum', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber())
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, { genehmigungBis: null }, ACTOR))
      .resolves.toBeUndefined()
    const p = fake.auf('verordnungen').find(a => a.operation === 'update')?.payload as Record<string, unknown>
    expect(p.genehmigung_bis).toBeNull()
  })

  it('weist ein unlesbares Genehmigt-bis-Datum ab', async () => {
    const fake = erstelleFakeSupabase(genehmigenGeber())
    await expect(genehmigeHkpVerordnung(fake.client, ORG, VERORDNUNG, {
      genehmigungBis: '31.12.2026',
    }, ACTOR)).rejects.toThrow(/JJJJ-MM-TT/)
  })
})
