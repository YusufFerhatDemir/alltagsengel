import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { erinnereFehlendeUnterschriften } from '@/lib/automation/unterschrift-erinnerung'

const ORG = 'org-1'
const ACTOR = 'actor-1'

describe('unterschrift-erinnerung — Kette 8', () => {
  it('keine unsignierten Nachweise → keine Erinnerung', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [])

    const ergebnis = await erinnereFehlendeUnterschriften(mock.client as any, ORG, ACTOR)

    expect(ergebnis.geprueft).toBe(0)
    expect(ergebnis.aufgabenErstellt).toBe(0)
  })

  it('unsignierter Nachweis mit bekanntem Mitarbeiter → Erinnerungsaufgabe', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      { id: 'sr-1', date: '2026-08-01', client_id: 'client-1', caregiver_id: 'cg-1' },
    ])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('caregivers', 'select', { user_id: 'user-cg-1' })
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await erinnereFehlendeUnterschriften(mock.client as any, ORG, ACTOR)

    expect(ergebnis.fehler).toEqual([])
    expect(ergebnis.aufgabenErstellt).toBe(1)
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.verantwortlich_id).toBe('user-cg-1')
    expect(insert?.payload.metadata.service_record_id).toBe('sr-1')
  })

  it('Mitarbeiter ohne Nutzerkonto → wird als Fehler gemeldet, kein Crash', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      { id: 'sr-2', date: '2026-08-01', client_id: 'client-1', caregiver_id: 'cg-ohne-login' },
    ])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('caregivers', 'select', null)

    const ergebnis = await erinnereFehlendeUnterschriften(mock.client as any, ORG, ACTOR)

    expect(ergebnis.aufgabenErstellt).toBe(0)
    expect(ergebnis.fehler.length).toBe(1)
  })
})
