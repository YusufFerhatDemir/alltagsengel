/**
 * Der VP/KZP-Hinweis, der schon einmal ausblieb — und still wieder konnte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 76)
 *
 * Zwei Stellen lesen `client_budgets`, um über Verhinderungs- und
 * Kurzzeitpflege Auskunft zu geben. Beide verwarfen ihren Lesefehler.
 *
 * 1. PATCH /api/admin/clients/[id]/pflegegrad — bei einer Herabstufung
 *    unter die VP/KZP-Schwelle soll der Hinweis kommen, dass ein
 *    bestehendes Budget NICHT gelöscht wurde und von Hand zu prüfen ist.
 *    Der Kommentar über der Abfrage hält fest, dass genau dieser Hinweis
 *    schon einmal „bei jeder Herabstufung" ausblieb — damals wegen eines
 *    42703 durch einen falschen Spaltennamen. Repariert wurden die
 *    Spaltennamen; der stille Kanal blieb. Jede andere Störung hätte
 *    denselben Ausfall bewirkt.
 *
 * 2. `pruefeVPBudget` in lib/personal/einsatzfreigabe.ts — dieselbe
 *    Tabelle, dieselben Filter, zwei Maßstäbe: `pruefeBudget` wenige
 *    Zeilen darüber ist ausdrücklich fail-closed („eine nicht lesbare
 *    Budgetzeile ist kein freies Budget"), der zweite Zugriff verwarf den
 *    Fehler. `null` heißt beim Aufrufer „keine Beanstandung am
 *    Kombinationsbudget" — und das ist die gesetzliche Obergrenze aus VP
 *    und KZP zusammen.
 *
 * Live gemessen: vier Budgetzeilen, alle mit `combined_annual_amount > 0`,
 * und alle vier Klienten stehen auf PG 2 oder 3 — also oberhalb der
 * VP/KZP-Schwelle. Eine Herabstufung träfe genau diesen Weg.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import { pruefeVPBudget } from '@/lib/personal/einsatzfreigabe'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'

/**
 * Erste Abfrage (pruefeBudget) gesund, zweite (Kombinationsbudget) nach
 * Wunsch — so ist der zweite Zugriff für sich prüfbar.
 */
function fake(zweite: { data?: unknown; error?: { message: string; code?: string } | null }) {
  let n = 0
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'client_budgets') return {}
    n += 1
    if (n === 1) {
      return {
        data: {
          annual_amount: 131, carryover_amount: 0, carryover_expires: null,
          used_amount: 0, combined_annual_amount: 1685, combined_used_amount: 0,
        },
      }
    }
    return zweite
  })
}

describe('pruefeVPBudget — der zweite Blick auf dieselbe Tabelle', () => {
  it('meldet einen Lesefehler, statt „keine Beanstandung" zu antworten', async () => {
    const r = await pruefeVPBudget(
      fake({ data: null, error: { message: 'connection reset', code: '08006' } }).client,
      CLIENT, ORG,
    )
    expect(r.vpKzpKombiniertWarnung).toMatch(/nicht prüfbar/)
  })

  it('und sagt, dass von Hand zu prüfen ist', async () => {
    const r = await pruefeVPBudget(
      fake({ data: null, error: { message: 'x', code: '42703' } }).client,
      CLIENT, ORG,
    )
    expect(r.vpKzpKombiniertWarnung).toMatch(/von Hand/)
  })

  it('schweigt weiterhin, wenn das Kombinationsbudget in Ordnung ist', async () => {
    const r = await pruefeVPBudget(
      fake({ data: { used_amount: 0, combined_used_amount: 100 } }).client,
      CLIENT, ORG,
    )
    expect(r.vpKzpKombiniertWarnung).toBeNull()
  })

  it('und meldet die Überschreitung unverändert', async () => {
    const r = await pruefeVPBudget(
      fake({ data: { used_amount: 0, combined_used_amount: 99999 } }).client,
      CLIENT, ORG,
    )
    expect(r.vpKzpKombiniertWarnung).toMatch(/überschritten/)
  })

  it('keine Budgetzeile ist kein Fehler', async () => {
    // Selbstzahler haben kein Kassenbudget.
    const r = await pruefeVPBudget(fake({ data: null, error: null }).client, CLIENT, ORG)
    expect(r.vpKzpKombiniertWarnung).toBeNull()
  })
})

describe('Quelltext: beide Stellen nach demselben Maß', () => {
  const EINSATZ = readFileSync('lib/personal/einsatzfreigabe.ts', 'utf8')
  const ROUTE = readFileSync('app/api/admin/clients/[id]/pflegegrad/route.ts', 'utf8')

  it('pruefeBudget bleibt fail-closed', () => {
    expect(EINSATZ).toContain('FAIL-CLOSED: eine nicht lesbare Budgetzeile ist kein freies Budget.')
  })

  it('und pruefeVPBudget nimmt seinen Fehler jetzt auch entgegen', () => {
    const rumpf = EINSATZ.slice(EINSATZ.indexOf('export async function pruefeVPBudget'))
    expect(rumpf).toContain('const { data: budget, error: budgetFehler }')
    expect(rumpf).toContain('if (budgetFehler) {')
  })

  it('die Herabstufung meldet einen unlesbaren Budgetstand', () => {
    expect(ROUTE).toContain('const { data: vpBudget, error: vpBudgetFehler }')
    expect(ROUTE).toContain('if (vpBudgetFehler) {')
    expect(ROUTE).toMatch(/nicht feststellbar/)
  })

  it('bricht dabei NICHT ab — der Pflegegrad steht schon', () => {
    const teil = ROUTE.slice(ROUTE.indexOf('if (vpBudgetFehler) {'))
      .slice(0, 900)
    expect(teil).not.toContain('status: 500')
    expect(teil).toContain('hinweise.push(')
  })

  it('der reguläre Hinweis bleibt erhalten', () => {
    expect(ROUTE).toMatch(/wurde NICHT gelöscht und muss manuell geprüft werden/)
  })
})
