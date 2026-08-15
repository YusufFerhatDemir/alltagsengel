import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { meldeFehlendeNachweise } from '@/lib/automation/nachweis-fehlt'

const ORG = 'org-1'
const ACTOR = 'actor-1'

describe('nachweis-fehlt — Kette 1', () => {
  it('keine überfälligen Entwürfe → keine Aufgabe', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [])

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)

    expect(ergebnis.geprueft).toBe(0)
    expect(ergebnis.aufgabenErstellt).toBe(0)
    expect(ergebnis.fehler).toEqual([])
  })

  it('ein überfälliger Entwurf → je eine Aufgabe für Engel und PDL', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      { id: 'sr-1', date: '2026-08-01', client_id: 'client-1', caregiver_id: 'cg-1', service_type: 'grundpflege', clients: { first_name: 'Erika', last_name: 'Muster' } },
    ])
    mock.setzeAntwort('caregivers', 'select', { user_id: 'user-cg-1', first_name: 'Anna', last_name: 'Engel' })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'select', null) // keine Dublette
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)

    expect(ergebnis.fehler).toEqual([])
    expect(ergebnis.aufgabenErstellt).toBe(2)

    const aufgabenInserts = mock.inserts.filter(i => i.table === 'ops_aufgaben')
    expect(aufgabenInserts).toHaveLength(2)
    const rollen = aufgabenInserts.map(i => i.payload.metadata.zielrolle).sort()
    expect(rollen).toEqual(['engel', 'pdl'])
    for (const ins of aufgabenInserts) {
      expect(ins.payload.organization_id).toBe(ORG)
      expect(ins.payload.metadata.service_record_id).toBe('sr-1')
    }
  })

  it('bereits existierende Aufgabe → keine Dublette', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('service_records', 'select', [
      { id: 'sr-1', date: '2026-08-01', client_id: 'client-1', caregiver_id: 'cg-1', service_type: 'grundpflege', clients: null },
    ])
    mock.setzeAntwort('caregivers', 'select', { user_id: 'user-cg-1' })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'select', { id: 'existiert-schon' })

    const ergebnis = await meldeFehlendeNachweise(mock.client as any, ORG, ACTOR)

    expect(ergebnis.aufgabenErstellt).toBe(0)
    expect(mock.inserts.filter(i => i.table === 'ops_aufgaben')).toHaveLength(0)
  })
})
