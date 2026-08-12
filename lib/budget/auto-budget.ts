import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinParts } from '@/lib/utils/timezone'
import {
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'

export async function erstelleInitialBudgets(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
  pflegegrad: number,
): Promise<{ erstellt: boolean; fehler?: string }> {
  if (pflegegrad < 1) {
    return { erstellt: false, fehler: 'Kein Budget ohne Pflegegrad' }
  }

  const year = parseInt(berlinParts(new Date()).year, 10)

  const { data: existing } = await supabase
    .from('client_budgets')
    .select('budget_type')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)

  const vorhandeneTypen = new Set((existing ?? []).map((b: { budget_type: string }) => b.budget_type))
  const zuErstellen: Array<Record<string, unknown>> = []

  if (!vorhandeneTypen.has('entlastung')) {
    zuErstellen.push({
      client_id: clientId,
      organization_id: organizationId,
      year,
      budget_type: 'entlastung',
      annual_amount: ENTLASTUNG_JAEHRLICH_EUR,
      monthly_amount: ENTLASTUNG_JAEHRLICH_EUR / 12,
      carryover_amount: 0,
      used_amount: 0,
      combined_used_amount: 0,
    })
  }

  if (!vorhandeneTypen.has('verhinderungspflege')) {
    zuErstellen.push({
      client_id: clientId,
      organization_id: organizationId,
      year,
      budget_type: 'verhinderungspflege',
      annual_amount: VP_KZP_KOMBINIERT_EUR,
      monthly_amount: 0,
      carryover_amount: 0,
      used_amount: 0,
      combined_used_amount: 0,
      combined_annual_amount: VP_KZP_KOMBINIERT_EUR,
    })
  }

  if (zuErstellen.length === 0) {
    return { erstellt: false }
  }

  const { error } = await supabase.from('client_budgets').insert(zuErstellen)
  if (error) {
    return { erstellt: false, fehler: error.message }
  }

  return { erstellt: true }
}

export async function uebertrageJahresbudgets(
  supabase: SupabaseClient,
  organizationId: string,
  vonJahr: number,
  nachJahr: number,
): Promise<{ uebertragen: number; uebersprungen: number; fehler: string[] }> {
  const { data: alteBudgets, error: fetchErr } = await supabase
    .from('client_budgets')
    .select('client_id, annual_amount, carryover_amount, used_amount')
    .eq('organization_id', organizationId)
    .eq('year', vonJahr)
    .eq('budget_type', 'entlastung')

  if (fetchErr) {
    return { uebertragen: 0, uebersprungen: 0, fehler: [fetchErr.message] }
  }

  if (!alteBudgets || alteBudgets.length === 0) {
    return { uebertragen: 0, uebersprungen: 0, fehler: [] }
  }

  let uebertragen = 0
  let uebersprungen = 0
  const fehler: string[] = []
  const verfallsDatum = `${nachJahr}-06-30`

  for (const alt of alteBudgets) {
    const rest = (alt.annual_amount ?? 0) + (alt.carryover_amount ?? 0) - (alt.used_amount ?? 0)

    if (rest <= 0) {
      uebersprungen++
      continue
    }

    const { data: bestehendes } = await supabase
      .from('client_budgets')
      .select('id, carryover_amount')
      .eq('client_id', alt.client_id)
      .eq('organization_id', organizationId)
      .eq('year', nachJahr)
      .eq('budget_type', 'entlastung')
      .maybeSingle()

    if (bestehendes) {
      const { error: updateErr } = await supabase
        .from('client_budgets')
        .update({
          carryover_amount: rest,
          carryover_expires: verfallsDatum,
        })
        .eq('id', bestehendes.id)

      if (updateErr) {
        fehler.push(`Update für client ${alt.client_id}: ${updateErr.message}`)
      } else {
        uebertragen++
      }
    } else {
      const { error: insertErr } = await supabase
        .from('client_budgets')
        .insert({
          client_id: alt.client_id,
          organization_id: organizationId,
          year: nachJahr,
          budget_type: 'entlastung',
          annual_amount: ENTLASTUNG_JAEHRLICH_EUR,
          monthly_amount: ENTLASTUNG_JAEHRLICH_EUR / 12,
          carryover_amount: rest,
          carryover_expires: verfallsDatum,
          used_amount: 0,
          combined_used_amount: 0,
        })

      if (insertErr) {
        fehler.push(`Insert für client ${alt.client_id}: ${insertErr.message}`)
      } else {
        uebertragen++
      }
    }
  }

  return { uebertragen, uebersprungen, fehler }
}
