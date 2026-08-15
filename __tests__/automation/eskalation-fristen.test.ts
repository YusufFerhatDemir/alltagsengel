import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { eskaliereAbgelaufeneFristen } from '@/lib/automation/eskalation-fristen'

const ORG = 'org-1'
const ACTOR = 'actor-1'

function abgelaufeneQualifikation() {
  return [{
    id: 'q-1', qualification_type: 'pflegefachkraft', title: 'Pflegefachkraft',
    valid_until: '2020-01-01', caregiver_id: 'cg-1', caregivers: { first_name: 'Anna', last_name: 'Engel' },
  }]
}

describe('eskalation-fristen — Kette 3 (Qualifikation/Verordnung überfällig)', () => {
  it('abgelaufene Qualifikation → Eskalations-Aufgabe an PDL', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('caregiver_qualifications', 'select', abgelaufeneQualifikation())
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await eskaliereAbgelaufeneFristen(mock.client as any, ORG, ACTOR)

    expect(ergebnis.geprueft).toBe(1)
    expect(ergebnis.aufgabenErstellt).toBe(1)
    expect(ergebnis.fehler).toEqual([])

    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.kategorie).toBe('qualifikation')
    expect(insert?.payload.prioritaet).toBe('kritisch')
    expect(insert?.payload.caregiver_id).toBe('cg-1')
    expect(insert?.payload.metadata.frist_entitaet_id).toBe('q-1')
    expect(insert?.payload.metadata.frist_entitaet_typ).toBe('qualifikation')
  })

  it('bereits eskaliert → keine zweite Aufgabe', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('caregiver_qualifications', 'select', abgelaufeneQualifikation())
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'select', { id: 'existiert-schon' })

    const ergebnis = await eskaliereAbgelaufeneFristen(mock.client as any, ORG, ACTOR)

    expect(ergebnis.aufgabenErstellt).toBe(0)
    expect(mock.inserts.filter(i => i.table === 'ops_aufgaben')).toHaveLength(0)
  })

  it('keine überfälligen Fristen → keine Aufgaben', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('caregiver_qualifications', 'select', [])

    const ergebnis = await eskaliereAbgelaufeneFristen(mock.client as any, ORG, ACTOR)

    expect(ergebnis.geprueft).toBe(0)
    expect(ergebnis.aufgabenErstellt).toBe(0)
  })
})
