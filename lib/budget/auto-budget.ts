import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinParts } from '@/lib/utils/timezone'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'

// ═══════════════════════════════════════════════════════════════════
// LIVE-SCHEMA VON client_budgets — bitte vor jeder Änderung lesen
// ═══════════════════════════════════════════════════════════════════
//
// client_budgets führt in der produktiven Datenbank GENAU EINE Zeile je
// Kunde und Jahr. Die beiden Ansprüche stehen nebeneinander in derselben
// Zeile:
//
//   annual_amount / monthly_amount / carryover_amount / used_amount
//       → § 45b SGB XI Entlastungsbetrag
//   combined_annual_amount / combined_used_amount
//       → § 42a SGB XI gemeinsamer Jahresbetrag VP + KZP
//
// Eine Spalte `budget_type` gibt es dort NICHT. Die Migration, die sie
// einführen würde (20260831020000_d2_vp_budget.sql), ist nicht angewendet.
// Ein `select`/`eq` darauf lässt die GANZE Abfrage mit PostgREST-Fehler
// 42703 scheitern — bei einem `select` sieht das Ergebnis dann aus wie
// „kein Budget vorhanden", beim `insert` wie „Budget angelegt, aber leer".
// Genau daran sind Neuanlage und Jahresübertrag vorher still gescheitert.
//
// Dieselbe Ein-Zeilen-Sicht benutzen lib/pilot/kundenkette.ts,
// lib/personal/einsatzfreigabe.ts und alle /admin-Budgetseiten.
// ═══════════════════════════════════════════════════════════════════

/** Eine Budgetzeile, so wie sie live existiert. */
interface BudgetZeile {
  id: string
  annual_amount: number | null
  monthly_amount: number | null
  combined_annual_amount: number | null
}

/**
 * Erstellt bzw. ergänzt das Budget eines Klienten für das laufende Jahr.
 *
 * §45b Entlastungsbetrag: ab PG 1, anteilig wenn PG unterjährig beginnt.
 * §42a VP/KZP: ab PG 2, immer voller Jahresbetrag (kein Übertrag).
 *
 * Idempotent: eine bereits vorhandene Zeile wird NICHT überschrieben.
 * Ergänzt wird nur, was noch fehlt — beim Hochstufen PG 1 → PG 2 kommt so
 * der VP/KZP-Anspruch zur bestehenden Zeile dazu.
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

  const restMonate = 12 - monat + 1
  const entlastungAnteilig = restMonate * version.entlastungMonatlich
  const vpAnspruch = pflegegrad >= version.minPflegegradVpKzp ? version.vpKzpKombiniert : 0

  const { data: vorhanden, error: leseFehler } = await supabase
    .from('client_budgets')
    .select('id, annual_amount, monthly_amount, combined_annual_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)
    .maybeSingle<BudgetZeile>()

  // FAIL-CLOSED: ein Lesefehler darf nicht als „noch kein Budget" gelten,
  // sonst legt der nächste Aufruf eine zweite Zeile für dasselbe Jahr an.
  if (leseFehler) {
    return { erstellt: false, fehler: leseFehler.message }
  }

  if (!vorhanden) {
    const { error } = await supabase.from('client_budgets').insert({
      client_id: clientId,
      organization_id: organizationId,
      year,
      annual_amount: entlastungAnteilig,
      monthly_amount: version.entlastungMonatlich,
      carryover_amount: 0,
      used_amount: 0,
      combined_annual_amount: vpAnspruch,
      combined_used_amount: 0,
    })
    if (error) return { erstellt: false, fehler: error.message }
    return { erstellt: true }
  }

  // Zeile existiert: nur fehlende Ansprüche nachtragen, nie überschreiben.
  const nachtrag: Record<string, unknown> = {}
  if (!Number(vorhanden.annual_amount)) {
    nachtrag.annual_amount = entlastungAnteilig
    nachtrag.monthly_amount = version.entlastungMonatlich
  }
  if (vpAnspruch > 0 && !Number(vorhanden.combined_annual_amount)) {
    nachtrag.combined_annual_amount = vpAnspruch
  }

  if (Object.keys(nachtrag).length === 0) {
    return { erstellt: false }
  }

  const { error } = await supabase
    .from('client_budgets')
    .update(nachtrag)
    .eq('id', vorhanden.id)

  if (error) return { erstellt: false, fehler: error.message }
  return { erstellt: true }
}

/**
 * Überträgt nicht verbrauchte Entlastungsbudgets ins Folgejahr (§45b Abs. 1 S. 5 SGB XI).
 *
 * FIFO-Annahme: Übertrag aus dem Vorjahr wird zuerst verbraucht (weil er früher verfällt).
 * Maximum Übertrag = Jahresanspruch (abgelaufener Vorjahres-Übertrag wird nicht mitgenommen).
 * VP/KZP wird NICHT übertragen (§42a kennt keinen Übertrag) — deshalb bleibt
 * combined_annual_amount im Folgejahr bei 0 und wird erst durch
 * erstelleInitialBudgets anhand des dann gültigen Pflegegrads gesetzt.
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
          annual_amount: nachJahrVersion.entlastungJaehrlich,
          monthly_amount: nachJahrVersion.entlastungMonatlich,
          carryover_amount: rest,
          carryover_expires: verfallsDatum,
          used_amount: 0,
          combined_annual_amount: 0,
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
