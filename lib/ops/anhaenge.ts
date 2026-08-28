import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDokument } from '@/lib/akten/dokumente'
import { assertBenutzerInOrg } from '@/lib/organizations/benutzer-guard'
import type { OpsAufgabeAnhang } from './types'

export async function listAnhaenge(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string },
): Promise<OpsAufgabeAnhang[]> {
  const { data, error } = await supabase
    .from('ops_aufgaben_anhaenge')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('aufgabe_id', params.aufgabeId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Anhaenge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsAufgabeAnhang[]
}

export async function createAnhang(
  supabase: SupabaseClient,
  params: { organizationId: string; aufgabeId: string; dokumentId: string; hinzugefuegtVon?: string },
): Promise<OpsAufgabeAnhang> {
  if (!params.dokumentId?.trim()) throw new UserFacingError('Dokument-ID ist ein Pflichtfeld.')

  // dokument_id hat nur eine einfache FK auf akten_dokumente(id) — ohne
  // diese Pruefung liesse sich mit einer erratenen/bekannten fremden
  // Dokument-ID ein Anhang anlegen, der auf ein Dokument einer ANDEREN
  // Organisation zeigt (weder Composite-FK noch Trigger faengt das ab,
  // siehe Audit ops-anhaenge-cross-org-dokument-id).
  const dokument = await getDokument(supabase, params.dokumentId, params.organizationId)
  if (!dokument) {
    throw new UserFacingError('Dokument nicht gefunden oder gehoert nicht zur Organisation.')
  }

  // Dieselbe Luecke wie bei dokument_id, nur auf der anderen Seite der
  // Verknuepfung: aufgabe_id kam ungeprueft aus dem Pfad. Mit einer
  // fremden Aufgaben-UUID entstand eine Anhangszeile, die auf die Aufgabe
  // einer ANDEREN Organisation zeigt (organization_id der Zeile bliebe die
  // des Aufrufers, die Verknuepfung zeigt aber hinaus).
  const { data: aufgabe, error: aufgabeFehler } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('id', params.aufgabeId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (aufgabeFehler) {
    throw new Error(`Aufgabe konnte nicht geprueft werden: ${aufgabeFehler.message}`)
  }
  if (!aufgabe) {
    throw new UserFacingError('Aufgabe nicht gefunden oder gehoert nicht zur Organisation.')
  }

  // Urheberschaft: `hinzugefuegt_von` kam bisher roh aus dem Rumpf
  // (`body.hinzugefuegt_von || auth.ctx.userId`) und ist eine uuid auf
  // auth.users — also mandantenuebergreifend. Ein beliebiges Konto liess
  // sich damit als Urheber eintragen.
  if (params.hinzugefuegtVon) {
    await assertBenutzerInOrg(supabase, params.hinzugefuegtVon, params.organizationId, 'Hinzugefuegt von')
  }

  const { data, error } = await supabase
    .from('ops_aufgaben_anhaenge')
    .insert({
      organization_id: params.organizationId,
      aufgabe_id: params.aufgabeId,
      dokument_id: params.dokumentId,
      hinzugefuegt_von: params.hinzugefuegtVon ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Anhang konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabeAnhang
}

export async function deleteAnhang(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_aufgaben_anhaenge')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Anhang konnte nicht geloescht werden: ${error.message}`)
}
