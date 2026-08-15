import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { pruefeMonatsabschlussVollstaendigkeit } from '@/lib/automation/monatsabschluss-pruefung'

const ORG = 'org-1'
const ACTOR = 'actor-1'

describe('monatsabschluss-pruefung — Kette 7', () => {
  it('alle Nachweise vollständig → keine Aufgabe', async () => {
    const mock = createAutomationMock()
    const urspruenglichesFrom = mock.client.from
    mock.client.from = ((table: string) => {
      if (table === 'service_records') {
        return { select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ count: 0, error: null }) }) }) }) }) } as any
      }
      return urspruenglichesFrom(table)
    }) as any

    const ergebnis = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)
    expect(ergebnis.unvollstaendig).toBe(0)
    expect(ergebnis.aufgabeErstellt).toBe(false)
  })

  it('unvollständige Nachweise → Aufgabe an PDL', async () => {
    const mock = createAutomationMock()
    const urspruenglichesFrom = mock.client.from
    mock.client.from = ((table: string) => {
      if (table === 'service_records') {
        return { select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ count: 3, error: null }) }) }) }) }) } as any
      }
      return urspruenglichesFrom(table)
    }) as any
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(ergebnis.unvollstaendig).toBe(3)
    expect(ergebnis.aufgabeErstellt).toBe(true)
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.metadata.unvollstaendig).toBe(3)
  })
})
