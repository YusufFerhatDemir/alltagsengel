/**
 * Einsatzkonflikte — Zeitgrenzen und Filterbau
 *
 * Zwei Befunde:
 *
 *  1. `zeitZuMinuten()` verwarf '24:00' als unlesbar. Postgres kennt diesen
 *     Grenzwert für `time` als Tagesende, und Formulare schicken ihn für den
 *     Spätdienst bis Mitternacht. Weil `zeitenUeberschneiden()` bei
 *     unlesbarer Zeit fail-open arbeitet, meldete ein Einsatz "20:00–24:00"
 *     gegen einen bestehenden "21:00–22:00" KEINEN Konflikt.
 *
 *  2. `ladeKonflikte()` interpolierte `caregiver_id`/`client_id` — beide aus
 *     dem Request-Body von /api/einsatzplanung — unmaskiert in einen
 *     PostgREST-`or()`-Ausdruck. Komma und Punkt sind dort Trennzeichen.
 */

import { describe, it, expect } from 'vitest'
import {
  findeKonflikte,
  konfliktIds,
  zeitZuMinuten,
  zeitenUeberschneiden,
  type KonfliktEinsatz,
} from '@/lib/einsatzplanung/konflikte'
import { ladeKonflikte } from '@/lib/einsatzplanung/konflikte-server'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-00000000a001'
const CG = '00000000-0000-4000-8000-0000000000c1'
const KL = '00000000-0000-4000-8000-0000000000d1'
const TAG = '2026-09-10'

describe('zeitZuMinuten — Tagesgrenze', () => {
  it('liest 24:00 als Tagesende', () => expect(zeitZuMinuten('24:00')).toBe(1440))
  it('liest 24:00:00 als Tagesende', () => expect(zeitZuMinuten('24:00:00')).toBe(1440))
  it('verwirft 24:01', () => expect(zeitZuMinuten('24:01')).toBeNull())
  it('verwirft 25:00', () => expect(zeitZuMinuten('25:00')).toBeNull())
  it('liest 00:00', () => expect(zeitZuMinuten('00:00')).toBe(0))
  it('liest 23:59', () => expect(zeitZuMinuten('23:59')).toBe(1439))
  it('liest einstellige Stunden', () => expect(zeitZuMinuten('9:05')).toBe(545))
})

describe('zeitenUeberschneiden — bis Mitternacht', () => {
  it('erkennt die Überschneidung mit einem Einsatz bis 24:00', () => {
    expect(zeitenUeberschneiden('20:00', '24:00', '21:00', '22:00')).toBe(true)
  })
  it('erkennt Berührung an 24:00 nicht als Konflikt', () => {
    expect(zeitenUeberschneiden('20:00', '24:00', '00:00', '01:00')).toBe(false)
  })
  it('bleibt fail-open bei wirklich unlesbaren Zeiten', () => {
    expect(zeitenUeberschneiden('20:00', 'abends', '21:00', '22:00')).toBe(false)
  })
})

describe('findeKonflikte mit 24:00', () => {
  const bestand: KonfliktEinsatz[] = [{
    id: 'b1', client_id: KL, caregiver_id: CG, assignment_date: TAG,
    start_time: '21:00:00', end_time: '22:00:00', status: 'GEPLANT',
    caregiver_name: 'Anna A', client_name: 'Klient K',
  }]

  it('meldet die Doppelbelegung eines Spätdienstes bis Mitternacht', () => {
    const treffer = findeKonflikte({
      id: 'neu', client_id: KL, caregiver_id: CG, assignment_date: TAG,
      start_time: '20:00', end_time: '24:00', status: 'GEPLANT',
    }, bestand)
    expect(treffer).toHaveLength(1)
    expect(treffer[0].art).toBe('mitarbeiter')
  })

  it('markiert beide Seiten im Kalender', () => {
    const alle = [...bestand, {
      id: 'neu', client_id: KL, caregiver_id: CG, assignment_date: TAG,
      start_time: '20:00', end_time: '24:00', status: 'GEPLANT',
    }]
    expect(konfliktIds(alle)).toEqual(new Set(['b1', 'neu']))
  })
})

describe('ladeKonflikte — Filterbau', () => {
  const kandidat: KonfliktEinsatz = {
    id: '', client_id: KL, caregiver_id: CG, assignment_date: TAG,
    start_time: '09:00', end_time: '10:00', status: 'GEPLANT',
  }

  it('baut den or()-Ausdruck aus beiden IDs', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await ladeKonflikte(fake.client, ORG, kandidat)
    const aufruf = fake.ersterAuf('assignments')
    expect(hatFilter(aufruf, 'or', `caregiver_id.eq.${CG},client_id.eq.${KL}`)).toBe(true)
    expect(hatOrgFence(aufruf, ORG)).toBe(true)
  })

  it('lädt Vortag und Folgetag mit — sonst bliebe der Nachteinsatz unsichtbar', async () => {
    // Seit 20261012000000 rechnet der DB-Trigger Nachteinsaetze ueber den
    // Tageswechsel. Ein `eq(assignment_date)` haette den Nachteinsatz des
    // Vortages und den Fruehdienst des Folgetages gar nicht erst geladen —
    // die Vorabpruefung haette gruenes Licht gegeben, wo die Datenbank
    // blockiert.
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await ladeKonflikte(fake.client, ORG, kandidat)
    const aufruf = fake.ersterAuf('assignments')
    expect(hatFilter(aufruf, 'eq', 'assignment_date', TAG)).toBe(false)
    expect(hatFilter(aufruf, 'gte', 'assignment_date', '2026-09-09')).toBe(true)
    expect(hatFilter(aufruf, 'lte', 'assignment_date', '2026-09-11')).toBe(true)
  })

  it('weist eine caregiver_id zurück, die den Filterausdruck aufbricht', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeKonflikte(fake.client, ORG, {
      ...kandidat, caregiver_id: `${CG},status.eq.STORNIERT`,
    })).rejects.toThrow(/caregiver_id/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist eine client_id zurück, die keine UUID ist', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeKonflikte(fake.client, ORG, { ...kandidat, client_id: '*' }))
      .rejects.toThrow(/client_id/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist ein unbrauchbares assignment_date zurück', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeKonflikte(fake.client, ORG, { ...kandidat, assignment_date: '10.09.2026' }))
      .rejects.toThrow(/Datum/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('weist einen weekday zurück, der keine ganze Zahl ist', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(ladeKonflikte(fake.client, ORG, {
      ...kandidat, assignment_date: null, weekday: 1.5,
    })).rejects.toThrow(/weekday/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('fragt bei einer Serie nach Wochentag und leerem Datum', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    await ladeKonflikte(fake.client, ORG, { ...kandidat, assignment_date: null, weekday: 1 })
    const aufruf = fake.ersterAuf('assignments')
    expect(hatFilter(aufruf, 'is', 'assignment_date', null)).toBe(true)
    // Wochentag PLUS Nachbartage: die Sonntagsnacht (0/7) muss gegen die
    // Montagsfrueh gehalten werden koennen.
    const weekdayFilter = aufruf?.filter.find(f => f.methode === 'in' && f.spalte === 'weekday')
    expect(weekdayFilter).toBeDefined()
    expect(weekdayFilter?.wert).toEqual(expect.arrayContaining([0, 1, 2, 7]))
  })

  it('fragt gar nicht, wenn weder Datum noch Wochentag vorliegen', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: [] }))
    expect(await ladeKonflikte(fake.client, ORG, { ...kandidat, assignment_date: null })).toEqual([])
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('findet den Konflikt im geladenen Bestand', async () => {
    const fake = erstelleFakeSupabase(() => ({
      data: [{
        id: 'b1', client_id: KL, caregiver_id: CG, assignment_date: TAG,
        weekday: null, valid_from: null, valid_until: null,
        start_time: '09:30:00', end_time: '11:00:00', status: 'GEPLANT',
        client: { first_name: 'Klient', last_name: 'K' },
        caregiver: { first_name: 'Anna', last_name: 'A' },
      }],
    }))
    const treffer = await ladeKonflikte(fake.client, ORG, kandidat)
    expect(treffer).toHaveLength(1)
    expect(treffer[0].meldung).toContain('Anna A')
  })
})
