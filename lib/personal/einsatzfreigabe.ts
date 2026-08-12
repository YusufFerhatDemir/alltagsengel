import type { SupabaseClient } from '@supabase/supabase-js'

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

export async function pruefeEinsatzfreigabe(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<FreigabeErgebnis> {
  const { data: cg, error: cgErr } = await supabase
    .from('caregivers')
    .select('id, first_name, last_name, einsatzfreigabe, vertragsstatus, status')
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .single()
  if (cgErr || !cg) throw new Error('Mitarbeiter nicht gefunden.')

  const probleme: string[] = []
  const name = `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim()

  if (cg.status && !['aktiv', 'active'].includes(cg.status)) {
    probleme.push(`Mitarbeiter-Status ist "${cg.status}" (erwartet: aktiv)`)
  }

  if (cg.vertragsstatus && cg.vertragsstatus !== 'aktiv') {
    probleme.push(`Vertragsstatus ist "${cg.vertragsstatus}" (erwartet: aktiv)`)
  }

  if (!cg.einsatzfreigabe) {
    probleme.push('Einsatzfreigabe ist nicht erteilt')
  }

  const { data: quals } = await supabase
    .from('caregiver_qualifications')
    .select('id, title, valid_until, einsatzrelevant, pflicht')
    .eq('caregiver_id', caregiverId)
    .eq('organization_id', organizationId)
    .eq('einsatzrelevant', true)

  const heute = new Date().toISOString().split('T')[0]
  const abgelaufen = (quals ?? []).filter(q =>
    q.valid_until && q.valid_until < heute
  )

  if (abgelaufen.length > 0) {
    probleme.push(`${abgelaufen.length} einsatzrelevante Qualifikation(en) abgelaufen`)
  }

  return {
    caregiverId,
    caregiverName: name,
    freigegeben: probleme.length === 0,
    vertragsstatus: cg.vertragsstatus,
    probleme,
    abgelaufeneQualifikationen: abgelaufen.map(q => ({
      id: q.id,
      title: q.title,
      validUntil: q.valid_until,
    })),
    budgetWarnung: null,
    budgetBlockiert: false,
  }
}

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
  if (clErr || !client) throw new Error('Klient nicht gefunden oder gehört zu einer anderen Organisation.')

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

export async function pruefeBudget(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
): Promise<{ warnung: string | null; blockiert: boolean; prozent: number }> {
  const year = new Date().getFullYear()
  const { data: budget } = await supabase
    .from('client_budgets')
    .select('annual_amount, carryover_amount, used_amount')
    .eq('client_id', clientId)
    .eq('organization_id', organizationId)
    .eq('year', year)
    .maybeSingle()
  if (!budget) return { warnung: null, blockiert: false, prozent: 0 }
  const available = (budget.annual_amount ?? 1572) + (budget.carryover_amount ?? 0)
  const used = budget.used_amount ?? 0
  const pct = available > 0 ? Math.round((used / available) * 100) : 0
  if (pct >= 100) {
    return {
      warnung: `Budget vollständig ausgeschöpft (${pct}%, ${((used - available) / 100).toFixed(2)} EUR über Limit)`,
      blockiert: true,
      prozent: pct,
    }
  }
  if (pct >= 95) {
    return {
      warnung: `Budget zu ${pct}% ausgeschöpft (${((available - used) / 100).toFixed(2)} EUR verbleibend)`,
      blockiert: false,
      prozent: pct,
    }
  }
  return { warnung: null, blockiert: false, prozent: pct }
}

export async function setzeEinsatzfreigabe(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
  freigabe: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('caregivers')
    .update({ einsatzfreigabe: freigabe })
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Einsatzfreigabe konnte nicht gesetzt werden: ${error.message}`)
}
