/**
 * Kette 5 — Budget fast ausgeschöpft → aktive Warnung an PDL/Admin.
 *
 * `pruefeBudget()` (lib/personal/einsatzfreigabe.ts) berechnet den
 * Ausschöpfungsgrad und liefert ab 80 % eine Warn-Nachricht zurück — aber
 * nur SYNCHRON als Antwort auf einen Freigabe-Check bei der Einsatz-
 * planung. Ohne bevorstehenden Einsatz erfährt niemand aktiv davon, dass
 * ein Klientenbudget sich der Grenze nähert. Diese Datei schließt die
 * Lücke: täglicher Cron-Lauf über alle Klienten mit Budget im laufenden
 * Jahr, aktive Benachrichtigung an PDL/Admin ab 80 %.
 *
 * Schwellen: 80 % (§45b Entlastungsbetrag 1.572 €/Jahr, §42a VP/KZP 3.539 €)
 * und 100 % (Überschreitung) — siehe lib/config/budget-constants.ts.
 *
 * DUBLETTENSCHUTZ: höchstens eine Benachrichtigung pro (Klient, Budgettyp,
 * Jahr, Schwellenstufe) — sonst würde ein Klient, der bei 85 % verharrt,
 * jeden Tag erneut eine Warnung auslösen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { pruefeBudget } from '@/lib/personal/einsatzfreigabe'
import { heuteBerlin } from '@/lib/utils/timezone'
import { rollentraegerDerOrg, BETRIEBS_EMPFAENGER_ROLLEN } from './org-empfaenger'
import type { BudgetTyp } from '@/lib/config/budget-constants'

const BUDGET_TYPEN: BudgetTyp[] = ['entlastung', 'verhinderungspflege']

function stufe(prozent: number, blockiert: boolean): '80' | '100' | null {
  if (blockiert || prozent >= 100) return '100'
  if (prozent >= 80) return '80'
  return null
}

function markierung(clientId: string, budgetTyp: BudgetTyp, jahr: number, stufeLabel: string): string {
  return `[BUDGET:${budgetTyp}:${jahr}:${stufeLabel}:${clientId.slice(0, 8)}]`
}

export interface BudgetWarnungErgebnis {
  geprueft: number
  gewarnt: number
  fehler: string[]
}

export async function pruefeAlleBudgetsUndWarnen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<BudgetWarnungErgebnis> {
  const jahr = parseInt(heuteBerlin().slice(0, 4), 10)

  const { data: budgets, error } = await supabase
    .from('client_budgets')
    .select('client_id')
    .eq('organization_id', organizationId)
    .eq('year', jahr)

  if (error) {
    return { geprueft: 0, gewarnt: 0, fehler: [`client_budgets: ${error.message}`] }
  }

  const clientIds = Array.from(new Set((budgets ?? []).map((b: { client_id: string }) => b.client_id)))
  const fehler: string[] = []
  let gewarnt = 0
  const empfaengerIds = await rollentraegerDerOrg(supabase, organizationId, [...BETRIEBS_EMPFAENGER_ROLLEN])

  if (clientIds.length === 0 || empfaengerIds.length === 0) {
    return { geprueft: clientIds.length, gewarnt: 0, fehler }
  }

  for (const clientId of clientIds) {
    for (const budgetTyp of BUDGET_TYPEN) {
      try {
        const ergebnis = await pruefeBudget(supabase, clientId, organizationId, budgetTyp)
        const stufeLabel = stufe(ergebnis.prozent, ergebnis.blockiert)
        if (!stufeLabel || !ergebnis.warnung) continue

        const marker = markierung(clientId, budgetTyp, jahr, stufeLabel)
        const { data: vorhanden, error: dupErr } = await supabase
          .from('ops_benachrichtigungen')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('bezug_id', clientId)
          .ilike('titel', `%${marker}%`)
          .limit(1)
          .maybeSingle()

        if (dupErr) {
          fehler.push(`${clientId}/${budgetTyp}: Dublettenprüfung fehlgeschlagen — ${dupErr.message}`)
          continue
        }
        if (vorhanden) continue

        const { data: client } = await supabase
          .from('clients')
          .select('first_name, last_name')
          .eq('id', clientId)
          .maybeSingle()
        const clientName = client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() : clientId

        const titel = `${marker} Budgetwarnung: ${clientName}`
        const rows = empfaengerIds.map(empfaengerId => ({
          organization_id: organizationId,
          empfaenger_id: empfaengerId,
          titel,
          inhalt: ergebnis.warnung,
          typ: stufeLabel === '100' ? ('fehler' as const) : ('warnung' as const),
          kategorie: 'abrechnung' as const,
          bezug_typ: 'kunde' as const,
          bezug_id: clientId,
          email_gesendet: false,
          push_gesendet: false,
        }))

        const { error: insErr } = await supabase.from('ops_benachrichtigungen').insert(rows)
        if (insErr) {
          fehler.push(`${clientId}/${budgetTyp}: ${insErr.message}`)
          continue
        }
        gewarnt++
      } catch (err) {
        fehler.push(`${clientId}/${budgetTyp}: ${(err as Error).message}`)
      }
    }
  }

  return { geprueft: clientIds.length, gewarnt, fehler }
}
