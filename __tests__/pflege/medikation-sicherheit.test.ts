/**
 * Medikation — Patientensicherheit an den Rändern
 *
 * Vier Befunde dieser Runde:
 *
 *  1. `aktualisiereMedikament()` prüfte NUR die Kategorie. `dosierung: ''`
 *     und `medikament_name: '  '` kamen durch — beide Spalten sind NOT NULL,
 *     die leere Zeichenkette ist aber nicht NULL. In der Akte stand danach
 *     ein Medikament ohne Dosierungsangabe. Alles Übrige (Einnahmezeiten,
 *     PZN, Datumsreihenfolge) fängt die Datenbank über CHECK-Constraints ab,
 *     aber als roher Postgres-Fehler → HTTP 500 statt lesbarer Meldung.
 *
 *  2. `istAbgelaufen()` verglich `new Date(end_datum)` (UTC-Mitternacht)
 *     gegen den aktuellen Zeitstempel: schon um 00:01 des Endtages galt die
 *     Medikation als abgelaufen. `end_datum` ist aber der LETZTE Gabetag.
 *
 *  3. `erfasseEingabe()` prüfte nur den Status. Ein Medikament mit längst
 *     vergangenem `end_datum` steht weiter auf 'aktiv' (den Status setzt
 *     niemand automatisch um) — jede weitere Gabe liess sich dokumentieren.
 *
 *  4. `medikament_eingaben` ist append-only und trägt keinen eindeutigen
 *     Index. Ein zweiter Klick oder ein Wiederholungslauf legte eine ZWEITE
 *     Zeile für dieselbe geplante Gabe an: in der Akte steht dann, das
 *     Medikament sei zweimal gegeben worden.
 */

import { describe, it, expect } from 'vitest'
import {
  aktualisiereMedikament,
  erfasseEingabe,
  istAbgelaufen,
  istBegonnen,
  validiereMedikament,
  DOKUMENTIERTE_EINGABE_STATUS,
} from '@/lib/medikamente/medikamente'
import type { Medikament } from '@/lib/medikamente/types'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-00000000a001'
const USER = '00000000-0000-4000-8000-0000000000u1'
const MED = '00000000-0000-4000-8000-0000000000m1'
const KLIENT = '00000000-0000-4000-8000-0000000000d1'

function bestand(ueber: Record<string, unknown> = {}) {
  return {
    id: MED,
    organization_id: ORG,
    client_id: KLIENT,
    medikament_name: 'Ramipril',
    dosierung: '5mg',
    kategorie: 'herz_kreislauf',
    einheit: 'mg',
    einnahme_morgens: true,
    einnahme_mittags: false,
    einnahme_abends: false,
    einnahme_nachts: false,
    dauermedikation: true,
    beginn_datum: null,
    end_datum: null,
    status: 'aktiv',
    ...ueber,
  }
}

// ═════════════════════════════════════════════════════════════════════
describe('validiereMedikament — Datumsangaben', () => {
  const gueltig = { medikament_name: 'Ramipril', dosierung: '5mg', client_id: KLIENT, einnahme_morgens: true }

  it('lässt einen gültigen Zeitraum durch', () => {
    expect(() => validiereMedikament({ ...gueltig, beginn_datum: '2026-01-01', end_datum: '2026-12-31' })).not.toThrow()
  })

  it('lehnt ein Ende vor dem Beginn ab', () => {
    expect(() => validiereMedikament({ ...gueltig, beginn_datum: '2026-12-31', end_datum: '2026-01-01' }))
      .toThrow(/Enddatum/)
  })

  it('lehnt ein unlesbares Beginndatum ab, statt es still durchzulassen', () => {
    // Vorher: new Date('irgendwann') → NaN, und `NaN > NaN` ist false.
    expect(() => validiereMedikament({ ...gueltig, beginn_datum: 'irgendwann', end_datum: '2026-01-01' }))
      .toThrow(/Beginndatum/)
  })

  it('lehnt ein unlesbares Enddatum ab', () => {
    expect(() => validiereMedikament({ ...gueltig, end_datum: '31.12.2026' })).toThrow(/Enddatum/)
  })

  it('lehnt einen Zeitstempel statt eines Datums ab', () => {
    expect(() => validiereMedikament({ ...gueltig, end_datum: '2026-12-31T00:00:00Z' })).toThrow(/Enddatum/)
  })

  it('erlaubt einen leeren Zeitraum (beide null)', () => {
    expect(() => validiereMedikament({ ...gueltig, beginn_datum: null, end_datum: null })).not.toThrow()
  })

  it('erlaubt Beginn gleich Ende (eintägige Gabe)', () => {
    expect(() => validiereMedikament({ ...gueltig, beginn_datum: '2026-05-05', end_datum: '2026-05-05' })).not.toThrow()
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('istAbgelaufen — end_datum ist der letzte Gabetag', () => {
  const m = (ueber: Record<string, unknown>) => bestand(ueber) as unknown as Medikament

  it('ist AM Endtag noch nicht abgelaufen', () => {
    expect(istAbgelaufen(m({ dauermedikation: false, end_datum: '2026-05-10' }), '2026-05-10')).toBe(false)
  })

  it('ist am Tag NACH dem Endtag abgelaufen', () => {
    expect(istAbgelaufen(m({ dauermedikation: false, end_datum: '2026-05-10' }), '2026-05-11')).toBe(true)
  })

  it('ist vor dem Endtag nicht abgelaufen', () => {
    expect(istAbgelaufen(m({ dauermedikation: false, end_datum: '2026-05-10' }), '2026-05-01')).toBe(false)
  })

  it('läuft bei Dauermedikation nie ab', () => {
    expect(istAbgelaufen(m({ dauermedikation: true, end_datum: '2020-01-01' }), '2026-05-11')).toBe(false)
  })

  it('läuft ohne Enddatum nie ab', () => {
    expect(istAbgelaufen(m({ dauermedikation: false, end_datum: null }), '2026-05-11')).toBe(false)
  })

  it('verträgt einen Zeitstempel in der Spalte', () => {
    expect(istAbgelaufen(m({ dauermedikation: false, end_datum: '2026-05-10T00:00:00Z' }), '2026-05-10')).toBe(false)
  })
})

describe('istBegonnen', () => {
  it('gilt ab dem Beginntag', () => {
    expect(istBegonnen({ beginn_datum: '2026-05-10' } as Medikament, '2026-05-10')).toBe(true)
  })
  it('gilt am Vortag noch nicht', () => {
    expect(istBegonnen({ beginn_datum: '2026-05-10' } as Medikament, '2026-05-09')).toBe(false)
  })
  it('gilt ohne Beginndatum immer', () => {
    expect(istBegonnen({ beginn_datum: null } as Medikament, '2020-01-01')).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('aktualisiereMedikament — Validierung des zusammengeführten Standes', () => {
  function fake(ueber: Record<string, unknown> = {}) {
    return erstelleFakeSupabase(a =>
      a.operation === 'update' ? { data: bestand(ueber) } : { data: bestand(ueber) },
    )
  }

  it('lehnt eine geleerte Dosierung ab', async () => {
    const f = fake()
    await expect(aktualisiereMedikament(f.client, ORG, MED, { dosierung: '' })).rejects.toThrow(/Dosierung/)
    expect(f.aufrufe.filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('lehnt eine Dosierung aus Leerzeichen ab', async () => {
    const f = fake()
    await expect(aktualisiereMedikament(f.client, ORG, MED, { dosierung: '   ' })).rejects.toThrow(/Dosierung/)
  })

  it('lehnt einen geleerten Namen ab', async () => {
    const f = fake()
    await expect(aktualisiereMedikament(f.client, ORG, MED, { medikament_name: '  ' })).rejects.toThrow(/Medikamentenname/)
  })

  it('lehnt das Abwählen ALLER Einnahmezeiten ab', async () => {
    const f = fake()
    await expect(aktualisiereMedikament(f.client, ORG, MED, { einnahme_morgens: false }))
      .rejects.toThrow(/Einnahmezeit/)
  })

  it('erlaubt das Umstellen der Einnahmezeit, solange eine bleibt', async () => {
    const f = fake()
    await aktualisiereMedikament(f.client, ORG, MED, { einnahme_morgens: false, einnahme_abends: true })
    expect(f.aufrufe.filter(a => a.operation === 'update')).toHaveLength(1)
  })

  it('lehnt eine unbrauchbare PZN auch beim Update ab', async () => {
    const f = fake()
    await expect(aktualisiereMedikament(f.client, ORG, MED, { pzn: 'ABC1234' })).rejects.toThrow(/PZN/)
  })

  it('lehnt ein Enddatum vor dem BESTEHENDEN Beginndatum ab', async () => {
    const f = fake({ beginn_datum: '2026-06-01' })
    await expect(aktualisiereMedikament(f.client, ORG, MED, { end_datum: '2026-01-01' }))
      .rejects.toThrow(/Enddatum/)
  })

  it('erlaubt ein Enddatum nach dem bestehenden Beginndatum', async () => {
    const f = fake({ beginn_datum: '2026-06-01' })
    await aktualisiereMedikament(f.client, ORG, MED, { end_datum: '2026-12-01' })
    expect(f.aufrufe.filter(a => a.operation === 'update')).toHaveLength(1)
  })

  it('lässt eine Änderung ohne validierungsrelevantes Feld unberührt durch', async () => {
    const f = fake()
    await aktualisiereMedikament(f.client, ORG, MED, { notizen: 'nüchtern einnehmen' })
    expect(f.aufrufe.filter(a => a.operation === 'update')).toHaveLength(1)
  })

  it('blockiert ein abgesetztes Medikament weiterhin', async () => {
    const f = fake({ status: 'abgesetzt' })
    await expect(aktualisiereMedikament(f.client, ORG, MED, { dosierung: '10mg' }))
      .rejects.toThrow(/nicht mehr bearbeitet/)
  })

  it('schreibt mit Mandanten-Fence', async () => {
    const f = fake()
    await aktualisiereMedikament(f.client, ORG, MED, { dosierung: '10mg' })
    const update = f.aufrufe.find(a => a.operation === 'update')
    expect(hatOrgFence(update, ORG)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('erfasseEingabe — Zeitraum und Doppeldokumentation', () => {
  const gabe = {
    medikament_id: MED,
    client_id: KLIENT,
    einnahme_zeit: 'morgens',
    geplant_um: '2026-05-10T08:00:00.000Z',
    status: 'gegeben',
  }

  function fake(med: Record<string, unknown>, eingaben: unknown[] = [], eingabenFehler?: { message: string }) {
    return erstelleFakeSupabase(a => {
      if (a.tabelle === 'medikamente') return { data: bestand(med) }
      if (a.tabelle === 'medikament_eingaben' && a.operation === 'select') {
        return eingabenFehler ? { error: eingabenFehler } : { data: eingaben }
      }
      return { data: { id: 'neu', ...(a.payload as object) } }
    })
  }

  it('dokumentiert eine Gabe innerhalb des Zeitraums', async () => {
    const f = fake({ beginn_datum: '2026-05-01', end_datum: '2026-05-31', dauermedikation: false })
    await erfasseEingabe(f.client, ORG, USER, gabe)
    expect(f.aufrufe.some(a => a.tabelle === 'medikament_eingaben' && a.operation === 'insert')).toBe(true)
  })

  it('lehnt eine Gabe VOR dem Beginn der Medikation ab', async () => {
    const f = fake({ beginn_datum: '2026-06-01' })
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/beginnt erst am 2026-06-01/)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(false)
  })

  it('lehnt eine Gabe NACH dem Ende einer befristeten Medikation ab', async () => {
    const f = fake({ end_datum: '2026-04-30', dauermedikation: false })
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/endete am 2026-04-30/)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(false)
  })

  it('lässt die Gabe AM letzten Tag der Medikation zu', async () => {
    const f = fake({ end_datum: '2026-05-10', dauermedikation: false })
    await erfasseEingabe(f.client, ORG, USER, gabe)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(true)
  })

  it('lässt die Gabe AM ersten Tag der Medikation zu', async () => {
    const f = fake({ beginn_datum: '2026-05-10' })
    await erfasseEingabe(f.client, ORG, USER, gabe)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(true)
  })

  it('bindet das Enddatum bei Dauermedikation NICHT', async () => {
    const f = fake({ end_datum: '2020-01-01', dauermedikation: true })
    await erfasseEingabe(f.client, ORG, USER, gabe)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(true)
  })

  it('lehnt einen unbrauchbaren Zeitpunkt ab, bevor irgendetwas gelesen wird', async () => {
    const f = fake({})
    await expect(erfasseEingabe(f.client, ORG, USER, { ...gabe, geplant_um: 'heute früh' }))
      .rejects.toThrow(/geplant_um/)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('legt KEINE zweite Zeile für eine bereits gegebene Gabe an', async () => {
    const f = fake({}, [{ id: 'alt', status: 'gegeben' }])
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/bereits/)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(false)
  })

  it('blockiert auch, wenn die Gabe als verweigert dokumentiert ist', async () => {
    const f = fake({}, [{ id: 'alt', status: 'verweigert' }])
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/verweigert/)
  })

  it('blockiert auch, wenn die Gabe als ausgelassen dokumentiert ist', async () => {
    const f = fake({}, [{ id: 'alt', status: 'ausgelassen' }])
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/ausgelassen/)
  })

  it('lässt eine bloss VORGEMERKTE Gabe überschreiben', async () => {
    const f = fake({}, [{ id: 'alt', status: 'geplant' }])
    await erfasseEingabe(f.client, ORG, USER, gabe)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(true)
  })

  it('kennt genau die entschiedenen Status', () => {
    expect([...DOKUMENTIERTE_EINGABE_STATUS]).toEqual(['gegeben', 'verweigert', 'ausgelassen'])
  })

  it('schreibt NICHTS, wenn der Bestand nicht lesbar ist (fail-closed)', async () => {
    const f = fake({}, [], { message: 'connection reset' })
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/nicht geprüft/)
    expect(f.aufrufe.some(a => a.operation === 'insert')).toBe(false)
  })

  it('sucht die Dublette mandantengefenced und auf die exakte Gabe', async () => {
    const f = fake({})
    await erfasseEingabe(f.client, ORG, USER, gabe)
    const suche = f.aufrufe.find(a => a.tabelle === 'medikament_eingaben' && a.operation === 'select')
    expect(hatOrgFence(suche, ORG)).toBe(true)
    expect(hatFilter(suche, 'eq', 'medikament_id', MED)).toBe(true)
    expect(hatFilter(suche, 'eq', 'geplant_um', gabe.geplant_um)).toBe(true)
    expect(hatFilter(suche, 'eq', 'einnahme_zeit', 'morgens')).toBe(true)
  })

  it('prüft weiterhin, dass das Medikament zum Klienten gehört', async () => {
    const f = fake({ client_id: '00000000-0000-4000-8000-0000000000d2' })
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/gehört nicht/)
  })

  it('prüft weiterhin den Medikamentenstatus', async () => {
    const f = fake({ status: 'pausiert' })
    await expect(erfasseEingabe(f.client, ORG, USER, gabe)).rejects.toThrow(/nicht aktiv/)
  })
})
