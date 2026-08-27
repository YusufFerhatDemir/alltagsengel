import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { heuteBerlin, datumBerlin, berlinParts } from '@/lib/utils/timezone'
import {
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'
import type { BudgetTyp } from '@/lib/config/budget-constants'

export interface FreigabeErgebnis {
  caregiverId: string
  caregiverName: string
  freigegeben: boolean
  vertragsstatus: string | null
  probleme: string[]
  abgelaufeneQualifikationen: { id: string; title: string; validUntil: string | null }[]
  budgetWarnung: string | null
  budgetBlockiert: boolean
}

export interface ClientFreigabeErgebnis {
  clientId: string
  clientName: string
  freigegeben: boolean
  probleme: string[]
}

/**
 * Die sachlichen Voraussetzungen der Einsatzfreigabe — OHNE das Kennzeichen
 * `caregivers.einsatzfreigabe` selbst.
 *
 * Bewusst getrennt von `pruefeEinsatzfreigabe`: Beim Erteilen der Freigabe ist
 * das Kennzeichen naturgemäß noch nicht gesetzt. Läge die Flag-Prüfung mit in
 * derselben Funktion, könnte `setzeEinsatzfreigabe` die Voraussetzungen nie
 * gegen ein sauberes Ergebnis prüfen — es bliebe immer mindestens „Freigabe
 * nicht erteilt" stehen und die Freigabe wäre nicht erteilbar.
 */
async function sammleVoraussetzungen(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<{
  name: string
  vertragsstatus: string | null
  einsatzfreigabe: boolean
  probleme: string[]
  abgelaufen: { id: string; title: string; valid_until: string | null }[]
}> {
  const { data: cg, error: cgErr } = await supabase
    .from('caregivers')
    .select('id, first_name, last_name, einsatzfreigabe, vertragsstatus, status')
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .single()
  if (cgErr || !cg) throw new UserFacingError('Mitarbeiter nicht gefunden.', 404)

  const probleme: string[] = []
  const name = `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim()

  if (cg.status && !['aktiv', 'active'].includes(cg.status)) {
    probleme.push(`Mitarbeiter-Status ist "${cg.status}" (erwartet: aktiv)`)
  }

  if (cg.vertragsstatus && cg.vertragsstatus !== 'aktiv') {
    probleme.push(`Vertragsstatus ist "${cg.vertragsstatus}" (erwartet: aktiv)`)
  }

  // FAIL-CLOSED: Eine nicht lesbare Qualifikationsliste ist kein Nachweis.
  // Vorher wurde `error` verschluckt; bei Schema-Drift/RLS-Fehler kam
  // `quals = null` zurück und die Pflichtprüfung meldete zwar „fehlt", aber
  // mit einer Begruendung, die den echten Grund verdeckte.
  const { data: quals, error: qualErr } = await supabase
    .from('caregiver_qualifications')
    .select('id, title, valid_until, einsatzrelevant, pflicht')
    .eq('caregiver_id', caregiverId)
    .eq('organization_id', organizationId)
    .eq('einsatzrelevant', true)
  if (qualErr) {
    probleme.push('Qualifikationen sind derzeit nicht prüfbar — Freigabe nicht möglich.')
    return { name, vertragsstatus: cg.vertragsstatus, einsatzfreigabe: !!cg.einsatzfreigabe, probleme, abgelaufen: [] }
  }

  const heute = heuteBerlin()
  const abgelaufen = (quals ?? []).filter(q =>
    q.valid_until && q.valid_until < heute
  )

  if (abgelaufen.length > 0) {
    probleme.push(`${abgelaufen.length} einsatzrelevante Qualifikation(en) abgelaufen`)
  }

  // Enforcing: Führungszeugnis + Erste Hilfe müssen als Pflichtqualifikation vorliegen
  for (const pflicht of PFLICHT_QUALIFIKATIONEN) {
    const vorhanden = (quals ?? []).find(q =>
      q.title?.toLowerCase().includes(pflicht.suchbegriff) && q.pflicht
    )
    if (!vorhanden) {
      probleme.push(`Pflichtqualifikation "${pflicht.label}" fehlt`)
    } else if (vorhanden.valid_until && vorhanden.valid_until < heute) {
      // Die Sammelmeldung oben nennt nur die Anzahl. Fuer eine Pflicht-
      // qualifikation gehoert der Name in den Klartext — sonst sucht die
      // Disposition, welcher Nachweis nachgereicht werden muss.
      probleme.push(`Pflichtqualifikation "${pflicht.label}" ist am ${vorhanden.valid_until} abgelaufen`)
    }
  }

  return { name, vertragsstatus: cg.vertragsstatus, einsatzfreigabe: !!cg.einsatzfreigabe, probleme, abgelaufen }
}

export async function pruefeEinsatzfreigabe(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<FreigabeErgebnis> {
  const basis = await sammleVoraussetzungen(supabase, caregiverId, organizationId)
  const probleme = [...basis.probleme]

  if (!basis.einsatzfreigabe) {
    probleme.push('Einsatzfreigabe ist nicht erteilt')
  }

  return {
    caregiverId,
    caregiverName: basis.name,
    freigegeben: probleme.length === 0,
    vertragsstatus: basis.vertragsstatus,
    probleme,
    abgelaufeneQualifikationen: basis.abgelaufen.map(q => ({
      id: q.id,
      title: q.title,
      validUntil: q.valid_until,
    })),
    budgetWarnung: null,
    budgetBlockiert: false,
  }
}

const PFLICHT_QUALIFIKATIONEN = [
  { suchbegriff: 'führungszeugnis', label: 'Erweitertes Führungszeugnis' },
  { suchbegriff: 'erste hilfe', label: 'Erste-Hilfe-Nachweis' },
] as const

export async function pruefeClientFreigabe(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
  einsatzDatum?: string,
): Promise<ClientFreigabeErgebnis> {
  const { data: client, error: clErr } = await supabase
    .from('clients')
    .select('id, first_name, last_name, status, aufnahmestatus, organization_id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .single()
  // 404 statt des Default-400: der Klient existiert unter dieser ID in dieser
  // Organisation nicht. Ohne den ausdruecklichen Status kam die Meldung mit
  // 400 zurueck — und weil die Aufrufer den Wurf gar nicht auffingen, ueber
  // `withTracking` hinaus als HTTP 500 ohne jeden Klartext. Gleicher Status
  // wie bei `sammleVoraussetzungen` fuer den Mitarbeiter.
  if (clErr || !client) throw new UserFacingError('Klient nicht gefunden oder gehört zu einer anderen Organisation.', 404)

  const probleme: string[] = []
  const name = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()

  if (client.status && !['aktiv', 'active', 'neu'].includes(client.status)) {
    probleme.push(`Klient-Status ist "${client.status}" (erwartet: aktiv)`)
  }

  if (einsatzDatum) {
    const { data: vertraege } = await supabase
      .from('akten_vertraege')
      .select('id, status, vertragsende')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .in('status', ['aktiv', 'unterschrieben'])

    if (!vertraege || vertraege.length === 0) {
      probleme.push('Kein aktiver Vertrag vorhanden')
    } else {
      const hatGueltig = vertraege.some(v =>
        !v.vertragsende || v.vertragsende >= einsatzDatum
      )
      if (!hatGueltig) {
        probleme.push(`Alle Verträge enden vor dem Einsatzdatum (${einsatzDatum})`)
      }
    }
  }

  return { clientId, clientName: name, freigegeben: probleme.length === 0, probleme }
}

export interface BudgetPruefErgebnis {
  warnung: string | null
  blockiert: boolean
  prozent: number
  budgetTyp: BudgetTyp
}

/**
 * Prüft, wie weit das Jahresbudget eines Klienten ausgeschöpft ist.
 *
 * LIVE-SCHEMA: client_budgets führt EINE Zeile je Kunde und Jahr; der
 * Budgettyp steckt in den Spalten, nicht in einer `budget_type`-Zeile
 * (ausführlich in lib/budget/auto-budget.ts). Ein `eq('budget_type', …)`
 * ließ die Abfrage vorher mit 42703 scheitern — das Ergebnis sah aus wie
 * „kein Budget hinterlegt" und die Prüfung lief FAIL-OPEN durch.
 *
 * Fehler und fehlendes Budget blockieren deshalb jetzt beide.
 */
export async function pruefeBudget(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
  budgetTyp: BudgetTyp = 'entlastung',
): Promise<BudgetPruefErgebnis> {
  const year = parseInt(heuteBerlin().slice(0, 4), 10)
  const { data: budget, error } = await supabase
    .from('client_budgets')
    .select('annual_amount, carryover_amount, used_amount, combined_annual_amount, combined_used_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)
    .maybeSingle()

  // FAIL-CLOSED: eine nicht lesbare Budgetzeile ist kein freies Budget.
  if (error) {
    return {
      warnung: `Budget nicht prüfbar (${error.message}) — Einsatz nicht freigegeben.`,
      blockiert: true,
      prozent: 0,
      budgetTyp,
    }
  }
  // Keine Zeile heißt nicht „Fehler": Selbstzahler haben kein Kassenbudget.
  // Das ist ein Hinweis für die Disposition, keine Sperre.
  if (!budget) {
    return {
      warnung: `Für ${year} ist kein Budget hinterlegt (Selbstzahler?) — bitte prüfen.`,
      blockiert: false,
      prozent: 0,
      budgetTyp,
    }
  }

  const istVp = budgetTyp === 'verhinderungspflege'
  const defaultAmount = istVp ? VP_KZP_KOMBINIERT_EUR : ENTLASTUNG_JAEHRLICH_EUR
  const anspruch = istVp
    ? Number(budget.combined_annual_amount ?? 0) || defaultAmount
    : Number(budget.annual_amount ?? 0) || defaultAmount
  // § 42a kennt keinen Übertrag — carryover zählt nur beim Entlastungsbetrag.
  const available = anspruch + (istVp ? 0 : Number(budget.carryover_amount ?? 0))
  const used = Number((istVp ? budget.combined_used_amount : budget.used_amount) ?? 0)
  const pct = available > 0 ? Math.round((used / available) * 100) : 0

  const label = budgetTyp === 'verhinderungspflege' ? 'VP-Budget' : 'Budget'

  if (pct >= 100) {
    return {
      warnung: `${label} vollständig ausgeschöpft (${pct}%, ${(used - available).toFixed(2)} EUR über Limit)`,
      blockiert: true,
      prozent: pct,
      budgetTyp,
    }
  }
  if (pct >= 95) {
    return {
      warnung: `${label} zu ${pct}% ausgeschöpft (${(available - used).toFixed(2)} EUR verbleibend)`,
      blockiert: false,
      prozent: pct,
      budgetTyp,
    }
  }
  // 80%-Schwelle: frühzeitige Warnung, damit Disposition/PDL noch vor der
  // 95%-Blockiergrenze reagieren können (Automatisierungskette 5).
  if (pct >= 80) {
    return {
      warnung: `${label} zu ${pct}% ausgeschöpft (${(available - used).toFixed(2)} EUR verbleibend)`,
      blockiert: false,
      prozent: pct,
      budgetTyp,
    }
  }
  return { warnung: null, blockiert: false, prozent: pct, budgetTyp }
}

export async function pruefeVPBudget(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
): Promise<BudgetPruefErgebnis & { vpKzpKombiniertWarnung: string | null }> {
  const vpResult = await pruefeBudget(supabase, clientId, organizationId, 'verhinderungspflege')

  const year = parseInt(heuteBerlin().slice(0, 4), 10)
  const { data: budget } = await supabase
    .from('client_budgets')
    .select('used_amount, combined_used_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)
    .maybeSingle()

  let vpKzpKombiniertWarnung: string | null = null
  if (budget) {
    const combinedUsed = Number(budget.combined_used_amount ?? 0)
    if (combinedUsed > VP_KZP_KOMBINIERT_EUR) {
      vpKzpKombiniertWarnung =
        `VP+KZP Kombinationsbudget überschritten (${combinedUsed.toFixed(2)} / ${VP_KZP_KOMBINIERT_EUR} EUR)`
    } else if (combinedUsed > VP_KZP_KOMBINIERT_EUR * 0.95) {
      vpKzpKombiniertWarnung =
        `VP+KZP Kombinationsbudget zu ${Math.round((combinedUsed / VP_KZP_KOMBINIERT_EUR) * 100)}% ausgeschöpft (${(VP_KZP_KOMBINIERT_EUR - combinedUsed).toFixed(2)} EUR verbleibend)`
    }
  }

  return { ...vpResult, vpKzpKombiniertWarnung }
}

/**
 * Setzt oder entzieht die Einsatzfreigabe.
 *
 * ERTEILEN ist an die Voraussetzungen gebunden. Vorher war
 * `pruefeEinsatzfreigabe` reine Anzeige: die POST-Route schrieb
 * `einsatzfreigabe = true` direkt aus dem Body, ohne die Pruefung je
 * aufzurufen. Damit konnte eine Betreuungskraft ohne erweitertes
 * Fuehrungszeugnis, ohne gueltigen Erste-Hilfe-Nachweis oder mit
 * gekuendigtem Vertrag freigegeben werden — genau die Nachweise, die bei
 * einer MD-Pruefung verlangt werden.
 *
 * ENTZIEHEN (`freigabe = false`) bleibt jederzeit moeglich: eine Sperre darf
 * nie an einer Pruefung scheitern.
 */
export async function setzeEinsatzfreigabe(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
  freigabe: boolean,
): Promise<void> {
  if (freigabe) {
    const { probleme } = await sammleVoraussetzungen(supabase, caregiverId, organizationId)
    if (probleme.length > 0) {
      throw new UserFacingError(
        `Einsatzfreigabe nicht möglich: ${probleme.join('; ')}.`,
        409,
      )
    }
  }

  const update: Record<string, unknown> = {
    einsatzfreigabe: freigabe,
    einsatzfreigabe_am: freigabe ? heuteBerlin() : null,
  }
  const { error } = await supabase
    .from('caregivers')
    .update(update)
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Einsatzfreigabe konnte nicht gesetzt werden: ${error.message}`)
}
