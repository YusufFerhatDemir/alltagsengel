/**
 * Rollenbasierte Empfänger einer Organisation — geteilter Helfer für die
 * Automatisierungsketten in diesem Verzeichnis.
 *
 * Zwei Queries statt eines PostgREST-Embeds: zwischen `organization_members`
 * und `profiles` existiert kein Foreign Key — ein `profiles!inner(...)`-Embed
 * scheitert mit PGRST200 und liefert still eine leere Liste. Derselbe Fehler
 * hat schon rollenbasierte Benachrichtigungen lautlos abgeschaltet (siehe
 * lib/ops/ereignis-emitter.ts, lib/abrechnung/ruecklaeufer-aufgaben.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function rollentraegerDerOrg(
  supabase: SupabaseClient,
  organizationId: string,
  rollen: string[],
): Promise<string[]> {
  const { data: mitglieder, error: mErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)

  if (mErr) {
    console.error(`[automation] organization_members fehlgeschlagen: ${mErr.message}`)
    return []
  }

  const userIds = (mitglieder ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)
  if (userIds.length === 0) return []

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .in('role', rollen)
    .is('deleted_at', null)

  if (pErr) {
    console.error(`[automation] profiles fehlgeschlagen: ${pErr.message}`)
    return []
  }

  return (profile ?? []).map((p: { id: string }) => p.id)
}

/** Erster PDL/Admin der Organisation — Fallback-Verantwortlicher für automatisch erstellte Aufgaben. */
export async function ersterPdlDerOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const ids = await rollentraegerDerOrg(supabase, organizationId, ['admin', 'superadmin'])
  return ids[0] ?? null
}
