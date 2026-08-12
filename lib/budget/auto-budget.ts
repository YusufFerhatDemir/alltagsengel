import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinParts } from '@/lib/utils/timezone'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'

/**
 * Erstellt Initialbudgets für einen neuen Klienten.
 *
 * §45b Entlastungsbetrag: ab PG 1, anteilig wenn PG unterjährig beginnt.
 * §42a VP/KZP: ab PG 2, immer voller Jahresbetrag (kein Übertrag).
 *
 * @param pgBeginnMonat 1-12, Monat ab dem der Pflegegrad gilt (Default: aktueller Monat)
 */
export async function erstelleInitialBudgets(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
  pflegegrad: number,
  pgBeginnMonat?: number,
): Promise<{ erstellt: boolean; fehler?: string }> {
  if (pflegegrad < 1) {
    return { erstellt: false, fehler: 'Kein Budget ohne Pflegegrad' }
  }

  const year = parseInt(berlinParts(new Date()).year, 10)
  const monat = pgBeginnMonat ?? parseInt(berlinParts(new Date()).month, 10)
  const version = budgetVersionFuerJahr(year)

  const { data: existing } = await supabase
    .from('client_budgets')
    .select('budget_type')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)

  const vorhandeneTypen = new Set((existing ?? []).map((b: { budget_type: string }) => b.budget_type))
  const zuErstellen: Array<Record<string, unknown>> = []

  if (!vorhandeneTypen.has('entlastung')) {
    const restMonate = 12 - monat + 1
    const anteilig = restMonate * version.entlastungMonatlich

    zuErstellen.push({
      client_id: clientId,
      organization_id: organizationId,
      year,
      budget_type: 'entlastung',
      annual_amount: anteilig,
      monthly_amount: version.entlastungMonatlich,
      carryover_amount: 0,
      used_amount: 0,
      combined_used_amount: 0,
    })
  }

  if (pflegegrad >= version.minPflegegradVpKzp && !vorhandeneTypen.has('verhinderungspflege')) {
    zuErstellen.push({
      client_id: clientId,
      organization_id: organizationId,
      year,
      budget_type: 'verhinderungspflege',
      annual_amount: version.vpKzpKombiniert,
      monthly_amount: 0,
      carryover_amount: 0,
      used_amount: 0,
      combined_used_amount: 0,
      combined_annual_amount: version.vpKzpKombiniert,
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

/**
 * Überträgt nicht verbrauchte Entlastungsbudgets ins Folgejahr (§45b Abs. 1 S. 5 SGB XI).
 *
 * FIFO-Annahme: Übertrag aus dem Vorjahr wird zuerst verbraucht (weil er früher verfällt).
 * Maximum Übertrag = Jahresanspruch (abgelaufener Vorjahres-Übertrag wird nicht mitgenommen).
 * VP/KZP wird NICHT übertragen (§42a kennt keinen Übertrag).
 */
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

  const nachJahrVersion = budgetVersionFuerJahr(nachJahr)
  let uebertragen = 0
  let uebersprungen = 0
  const fehler: string[] = []
  const verfallsDatum = `${nachJahr}-06-30`

  for (const alt of alteBudgets) {
    const annual = alt.annual_amount ?? 0
    const carryover = alt.carryover_amount ?? 0
    const used = alt.used_amount ?? 0

    // FIFO: Übertrag aus Vorjahr (carryover) wurde zuerst verbraucht, da er am 30.06. verfällt.
    // Nur der nicht verbrauchte Anteil des JAHRESANSPRUCHS kann übertragen werden.
    const verbrauchAusJahresbudget = Math.max(0, used - carryover)
    const rest = Math.max(0, annual - verbrauchAusJahresbudget)

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
          annual_amount: nachJahrVersion.entlastungJaehrlich,
          monthly_amount: nachJahrVersion.entlastungMonatlich,
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
