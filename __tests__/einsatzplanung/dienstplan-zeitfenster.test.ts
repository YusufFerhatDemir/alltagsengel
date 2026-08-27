/**
 * Dienstplan — Zeitfenster von Schichten und Diensten
 *
 * Weder `dienstplan_schichten` noch `dienstplan_eintraege` tragen einen
 * CHECK auf die Zeiten (20260811010000_personalmanagement.sql). Bis zu
 * diesen Tests gab es damit an keiner Stelle eine Pruefung: eine Schicht
 * "10:00–10:00" (Dauer null), eine Pause von 480 Minuten in einem
 * 4-Stunden-Dienst und ein Tippfehler im Zeitformat liefen alle durch —
 * der Tippfehler als roher Postgres-Fehler (HTTP 500).
 *
 * Nachtdienste ueber Mitternacht bleiben ausdruecklich erlaubt.
 */

import { describe, it, expect } from 'vitest'
import {
  assertDatum,
  assertZeitfenster,
  dienstDauerMinuten,
  schichtZeitZuMinuten,
  createSchicht,
  updateSchicht,
  createEintrag,
  updateEintrag,
} from '@/lib/personal/dienstplan'
import { erstelleFakeSupabase } from '../helpers/supabase-fake'
import { UserFacingError } from '@/lib/api/user-facing-error'

const ORG = '00000000-0000-4000-8000-00000000a001'
const ID = '00000000-0000-4000-8000-0000000000e1'

describe('schichtZeitZuMinuten', () => {
  it('liest HH:MM', () => expect(schichtZeitZuMinuten('09:30')).toBe(570))
  it('liest HH:MM:SS (Postgres-Form)', () => expect(schichtZeitZuMinuten('09:30:00')).toBe(570))
  it('liest Mitternacht', () => expect(schichtZeitZuMinuten('00:00')).toBe(0))
  it('liest 23:59', () => expect(schichtZeitZuMinuten('23:59')).toBe(1439))
  it('verwirft einstellige Stunden', () => expect(schichtZeitZuMinuten('9:30')).toBeNull())
  it('verwirft Stunde 24', () => expect(schichtZeitZuMinuten('24:00')).toBeNull())
  it('verwirft Minute 60', () => expect(schichtZeitZuMinuten('09:60')).toBeNull())
  it('verwirft Text', () => expect(schichtZeitZuMinuten('morgens')).toBeNull())
  it('verwirft null', () => expect(schichtZeitZuMinuten(null)).toBeNull())
  it('verwirft Zahlen', () => expect(schichtZeitZuMinuten(930 as unknown as string)).toBeNull())
})

describe('dienstDauerMinuten', () => {
  it('rechnet den Tagdienst', () => expect(dienstDauerMinuten('08:00', '16:00')).toBe(480))
  it('rechnet den Nachtdienst über Mitternacht', () => expect(dienstDauerMinuten('22:00', '06:00')).toBe(480))
  it('rechnet einen Dienst bis kurz vor Mitternacht', () => expect(dienstDauerMinuten('20:00', '23:59')).toBe(239))
  it('gibt 0 bei Beginn = Ende', () => expect(dienstDauerMinuten('10:00', '10:00')).toBe(0))
  it('gibt null bei unlesbarer Zeit', () => expect(dienstDauerMinuten('10:00', 'abends')).toBeNull())
})

describe('assertZeitfenster', () => {
  it('lässt einen gewöhnlichen Tagdienst durch', () => {
    expect(() => assertZeitfenster('08:00', '16:00', 30, 'Dienst')).not.toThrow()
  })

  it('lässt einen Nachtdienst über Mitternacht durch', () => {
    expect(() => assertZeitfenster('22:00', '06:00', 45, 'Dienst')).not.toThrow()
  })

  it('lehnt einen Null-Dienst ab (Beginn = Ende)', () => {
    expect(() => assertZeitfenster('10:00', '10:00', 0, 'Schicht'))
      .toThrow(/identisch/)
  })

  it('lehnt ein unlesbares Beginn-Format ab', () => {
    expect(() => assertZeitfenster('8 Uhr', '16:00', 0, 'Schicht')).toThrow(/Beginn/)
  })

  it('lehnt ein unlesbares Ende-Format ab', () => {
    expect(() => assertZeitfenster('08:00', '16.00', 0, 'Schicht')).toThrow(/Ende/)
  })

  it('lehnt eine negative Pause ab', () => {
    expect(() => assertZeitfenster('08:00', '16:00', -15, 'Dienst')).toThrow(/Pause/)
  })

  it('lehnt eine gebrochene Pausenangabe ab', () => {
    expect(() => assertZeitfenster('08:00', '16:00', 12.5, 'Dienst')).toThrow(/ganze Zahl/)
  })

  it('lehnt eine Pause ab, die den Dienst vollständig auffrisst', () => {
    expect(() => assertZeitfenster('08:00', '12:00', 240, 'Dienst')).toThrow(/Dienstdauer/)
  })

  it('lehnt eine Pause länger als der Dienst ab', () => {
    expect(() => assertZeitfenster('08:00', '12:00', 480, 'Dienst')).toThrow(/Dienstdauer/)
  })

  it('lässt eine Pause knapp unter der Dienstdauer zu', () => {
    expect(() => assertZeitfenster('08:00', '12:00', 239, 'Dienst')).not.toThrow()
  })

  it('prüft die Pause auch beim Nachtdienst gegen die echte Dauer', () => {
    // 22:00–06:00 = 480 Min; ohne Mitternachts-Rechnung waere die Dauer
    // negativ und jede Pause "zu lang".
    expect(() => assertZeitfenster('22:00', '06:00', 400, 'Dienst')).not.toThrow()
    expect(() => assertZeitfenster('22:00', '06:00', 480, 'Dienst')).toThrow(/Dienstdauer/)
  })

  it('überspringt die Pausenprüfung, wenn keine Pause übergeben wurde', () => {
    expect(() => assertZeitfenster('08:00', '16:00', undefined, 'Dienst')).not.toThrow()
  })

  it('wirft UserFacingError, damit die Meldung den Nutzer erreicht', () => {
    expect(() => assertZeitfenster('10:00', '10:00', 0, 'Schicht')).toThrow(UserFacingError)
  })
})

describe('assertDatum', () => {
  it('lässt ein ISO-Datum durch', () => expect(() => assertDatum('2026-09-10')).not.toThrow())
  it('lehnt deutsches Format ab', () => expect(() => assertDatum('10.09.2026')).toThrow())
  it('lehnt leer ab', () => expect(() => assertDatum('')).toThrow())
  it('lehnt null ab', () => expect(() => assertDatum(null)).toThrow())
})

describe('createSchicht — Zeitprüfung vor dem Schreiben', () => {
  it('schreibt nichts, wenn Beginn und Ende identisch sind', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: {} }))
    await expect(createSchicht(fake.client, {
      organizationId: ORG, bezeichnung: 'Frühdienst', startZeit: '06:00', endZeit: '06:00',
    })).rejects.toThrow(/identisch/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('schreibt nichts bei unlesbarer Uhrzeit', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: {} }))
    await expect(createSchicht(fake.client, {
      organizationId: ORG, bezeichnung: 'Frühdienst', startZeit: '6:00', endZeit: '14:00',
    })).rejects.toThrow()
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('legt einen Nachtdienst an', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: { id: ID } }))
    await createSchicht(fake.client, {
      organizationId: ORG, bezeichnung: 'Nachtdienst', startZeit: '22:00', endZeit: '06:00', pauseMinuten: 30,
    })
    expect(fake.ersterAuf('dienstplan_schichten', 'insert')).toBeDefined()
  })
})

describe('updateSchicht — Prüfung gegen den Bestand', () => {
  it('erkennt den Null-Dienst, der erst durch das Verschieben des Beginns entsteht', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.operation === 'select' ? { data: { start_zeit: '06:00:00', end_zeit: '14:00:00', pause_minuten: 30 } } : { data: {} },
    )
    await expect(updateSchicht(fake.client, ID, ORG, { startZeit: '14:00' })).rejects.toThrow(/identisch/)
    expect(fake.auf('dienstplan_schichten').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('erkennt die Pause, die erst durch das Kürzen der Schicht zu lang wird', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.operation === 'select' ? { data: { start_zeit: '06:00:00', end_zeit: '14:00:00', pause_minuten: 300 } } : { data: {} },
    )
    await expect(updateSchicht(fake.client, ID, ORG, { endZeit: '10:00' })).rejects.toThrow(/Dienstdauer/)
  })

  it('prüft nicht, wenn keine Zeit angefasst wird', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: { id: ID } }))
    await updateSchicht(fake.client, ID, ORG, { farbe: '#123456' })
    expect(fake.auf('dienstplan_schichten')).toHaveLength(1)
    expect(fake.auf('dienstplan_schichten')[0].operation).toBe('update')
  })

  it('meldet eine unbekannte Schicht mit 404 statt sie stumm zu ändern', async () => {
    const fake = erstelleFakeSupabase(a => (a.operation === 'select' ? { data: null } : { data: {} }))
    await expect(updateSchicht(fake.client, ID, ORG, { startZeit: '07:00' })).rejects.toThrow(/nicht gefunden/)
  })

  it('liest den Bestand mit Mandanten-Fence', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.operation === 'select' ? { data: { start_zeit: '06:00:00', end_zeit: '14:00:00', pause_minuten: 0 } } : { data: { id: ID } },
    )
    await updateSchicht(fake.client, ID, ORG, { startZeit: '07:00' })
    const lese = fake.auf('dienstplan_schichten').find(a => a.operation === 'select')
    expect(lese?.filter).toContainEqual({ methode: 'eq', spalte: 'organization_id', wert: ORG })
  })
})

describe('createEintrag / updateEintrag — Zeitprüfung', () => {
  const basis = {
    organizationId: ORG, datum: '2026-09-10', startZeit: '08:00', endZeit: '16:00',
    erstelltVon: '00000000-0000-4000-8000-0000000000u1',
  }

  it('lehnt einen Dienst ohne Dauer ab', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: {} }))
    await expect(createEintrag(fake.client, { ...basis, endZeit: '08:00' })).rejects.toThrow(/identisch/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('lehnt ein unbrauchbares Datum ab, bevor Postgres es tut', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: {} }))
    await expect(createEintrag(fake.client, { ...basis, datum: '10.09.2026' })).rejects.toThrow(/Datum/)
    expect(fake.aufrufe).toHaveLength(0)
  })

  it('lässt den Nachtdienst durch', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: { id: ID } }))
    await createEintrag(fake.client, { ...basis, startZeit: '22:00', endZeit: '06:00' })
    expect(fake.ersterAuf('dienstplan_eintraege', 'insert')).toBeDefined()
  })

  it('prüft beim Update gegen den Bestand', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.operation === 'select'
        ? { data: { status: 'geplant', start_zeit: '08:00:00', end_zeit: '16:00:00', pause_minuten: 45 } }
        : { data: {} },
    )
    await expect(updateEintrag(fake.client, ID, ORG, { endZeit: '08:30' })).rejects.toThrow(/Dienstdauer/)
    expect(fake.auf('dienstplan_eintraege').filter(a => a.operation === 'update')).toHaveLength(0)
  })

  it('lässt einen abgeschlossenen Dienst weiterhin unangetastet', async () => {
    const fake = erstelleFakeSupabase(a =>
      a.operation === 'select'
        ? { data: { status: 'abgeschlossen', start_zeit: '08:00:00', end_zeit: '16:00:00', pause_minuten: 0 } }
        : { data: {} },
    )
    await expect(updateEintrag(fake.client, ID, ORG, { startZeit: '09:00' })).rejects.toThrow(/abgeschlossen/)
  })
})
