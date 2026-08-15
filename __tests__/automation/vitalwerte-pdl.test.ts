import { describe, it, expect, afterEach } from 'vitest'
import { createAutomationMock } from './_mock'
import { pruefeVitalwerteUndMeldePdl } from '@/lib/automation/vitalwerte-pdl'
import { VITALS_ALARM_ENV } from '@/lib/vitals/config'

const ORG = 'org-1'
const ACTOR = 'actor-1'

const urspruenglich = process.env[VITALS_ALARM_ENV]
afterEach(() => {
  if (urspruenglich === undefined) delete process.env[VITALS_ALARM_ENV]
  else process.env[VITALS_ALARM_ENV] = urspruenglich
})

describe('vitalwerte-pdl — Kette 12', () => {
  it('MDR-Schalter AUS (Default) → keine Alarm-Aufgabe, auch bei kritischem Wert', async () => {
    delete process.env[VITALS_ALARM_ENV]
    const mock = createAutomationMock()
    mock.setzeAntwort('vital_sign_thresholds', 'select', [])

    const ergebnis = await pruefeVitalwerteUndMeldePdl(mock.client as any, ORG, ACTOR)

    expect(ergebnis.alarmeGeprueft).toBe(0)
    expect(ergebnis.alarmAufgabenErstellt).toBe(0)
    expect(mock.aufrufe.some(a => a.table === 'vital_signs')).toBe(false)
  })

  it('MDR-Schalter AN + kritischer Wert → Aufgabe an PDL', async () => {
    process.env[VITALS_ALARM_ENV] = 'true'
    const mock = createAutomationMock()
    mock.setzeAntwort('vital_signs', 'select', [
      { client_id: 'client-1', type: 'puls', value: 180, value_secondary: null, measured_at: '2026-08-14T10:00:00.000Z' },
    ])
    mock.setzeAntwort('vital_sign_thresholds', 'select', [
      { client_id: 'client-1', type: 'puls', min_warn: 60, max_warn: 100, min_critical: 50, max_critical: 130, enabled: true },
    ])
    mock.setzeAntwort('clients', 'select', { first_name: 'Erika', last_name: 'Muster' })
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await pruefeVitalwerteUndMeldePdl(mock.client as any, ORG, ACTOR)

    expect(ergebnis.alarmAufgabenErstellt).toBe(1)
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben' && i.payload.tags?.includes('vital_alarm'))
    expect(insert?.payload.client_id).toBe('client-1')
    expect(insert?.payload.prioritaet).toBe('kritisch')
  })

  it('Dokumentationslücke läuft unabhängig vom MDR-Schalter', async () => {
    delete process.env[VITALS_ALARM_ENV]
    const mock = createAutomationMock()
    mock.setzeAntwort('vital_sign_thresholds', 'select', [{ client_id: 'client-2' }])
    mock.setzeAntwort('vital_signs', 'select', null) // nie gemessen
    mock.setzeAntwort('clients', 'select', { first_name: 'Max', last_name: 'Mustermann' })
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await pruefeVitalwerteUndMeldePdl(mock.client as any, ORG, ACTOR)

    expect(ergebnis.dokuLueckenGeprueft).toBe(1)
    expect(ergebnis.dokuLueckenAufgabenErstellt).toBe(1)
  })
})
