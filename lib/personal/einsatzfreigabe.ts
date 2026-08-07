import type { SupabaseClient } from '@supabase/supabase-js'

export interface FreigabeErgebnis {
  caregiverId: string
  caregiverName: string
  freigegeben: boolean
  vertragsstatus: string | null
  probleme: string[]
  abgelaufeneQualifikationen: { id: string; title: string; validUntil: string | null }[]
}

export async function pruefeEinsatzfreigabe(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<FreigabeErgebnis> {
  const { data: cg, error: cgErr } = await supabase
    .from('caregivers')
    .select('id, first_name, last_name, einsatzfreigabe, vertragsstatus')
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .single()
  if (cgErr || !cg) throw new Error('Mitarbeiter nicht gefunden.')

  const probleme: string[] = []
  const name = `${cg.first_name ?? ''} ${cg.last_name ?? ''}`.trim()

  if (cg.vertragsstatus !== 'aktiv') {
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
  }
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
