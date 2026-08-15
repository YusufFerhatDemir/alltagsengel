import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { pruefeAlleBudgetsUndWarnen } from '@/lib/automation/budget-warnung'

const ORG = 'org-1'

describe('budget-warnung — Kette 5', () => {
  it('80%-Entlastung und überschrittenes VP/KZP → zwei Warnungen', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('client_budgets', 'select', [{ client_id: 'client-1' }]) // Klientenliste
    mock.setzeAntwort('client_budgets', 'select', { // pruefeBudget('entlastung')
      annual_amount: 1572, carryover_amount: 0, used_amount: 1572 * 0.85,
      combined_annual_amount: 0, combined_used_amount: 0,
    })
    mock.setzeAntwort('client_budgets', 'select', { // pruefeBudget('verhinderungspflege')
      annual_amount: 0, carryover_amount: 0, used_amount: 0,
      combined_annual_amount: 3539, combined_used_amount: 3600,
    })
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-admin-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-admin-1' }])
    mock.setzeAntwort('ops_benachrichtigungen', 'select', null) // keine Dublette
    mock.setzeAntwort('clients', 'select', { first_name: 'Erika', last_name: 'Muster' })
    mock.setzeAntwort('ops_benachrichtigungen', 'insert', [{ id: 'neue-benachrichtigung' }])

    const ergebnis = await pruefeAlleBudgetsUndWarnen(mock.client as any, ORG)

    expect(ergebnis.fehler).toEqual([])
    expect(ergebnis.geprueft).toBe(1)
    expect(ergebnis.gewarnt).toBe(2)

    const inserts = mock.inserts.filter(i => i.table === 'ops_benachrichtigungen')
    expect(inserts).toHaveLength(2)
    const typen = inserts.map(i => i.payload[0].typ).sort()
    expect(typen).toEqual(['fehler', 'warnung']) // 100% → fehler, 80% → warnung
  })

  it('keine Klienten mit Budget → keine Warnung', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('client_budgets', 'select', [])

    const ergebnis = await pruefeAlleBudgetsUndWarnen(mock.client as any, ORG)

    expect(ergebnis.geprueft).toBe(0)
    expect(ergebnis.gewarnt).toBe(0)
  })
})
