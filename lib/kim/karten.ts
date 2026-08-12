/**
 * KIM / TI-Anbindung — eHBA/SMC-B-Kartenverwaltung (Block 18)
 *
 * Reine Zuordnungsschicht: „welche Karte gehört welcher Person/Organisation
 * und bis wann gilt sie". KEINE Kartenkommunikation — kein PIN-Handling, kein
 * Zertifikats-Handshake, kein Konnektor-Protokoll. Diese Dinge sind Teil der
 * gematik-Spezifikation und der Hardware/Middleware eines Kartenlesers bzw.
 * Konnektors, nicht dieser Anwendung.
 *
 * Kartennummer und Gültigkeit sind generische Freitext-/Datumsfelder, die der
 * Nutzer selbst befüllt (z.B. aus dem Anschreiben des Kartenherausgebers) —
 * es wird KEIN gematik-Kartennummernformat vorgegeben oder geprüft, weil uns
 * dieses Format nicht vorliegt.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type KimKartenTyp = 'smc_b' | 'ehba'

export const KIM_KARTENTYP_LABELS: Record<KimKartenTyp, string> = {
  smc_b: 'SMC-B (Institutionskarte)',
  ehba: 'eHBA (Heilberufsausweis)',
}

export type KimKartenStatus = 'beantragt' | 'aktiv' | 'gesperrt' | 'abgelaufen'

export const KIM_KARTENSTATUS_LABELS: Record<KimKartenStatus, string> = {
  beantragt: 'Beantragt',
  aktiv: 'Aktiv',
  gesperrt: 'Gesperrt',
  abgelaufen: 'Abgelaufen',
}

export interface KimKarte {
  id: string
  organization_id: string
  karten_typ: KimKartenTyp
  /** Freitext, vom Nutzer selbst befüllt — kein erratenes Kartennummernformat. */
  kartennummer: string | null
  /** Nur bei eHBA relevant — SMC-B gehört der Institution, nicht einer Person. */
  inhaber_user_id: string | null
  inhaber_name: string | null
  status: KimKartenStatus
  gueltig_von: string | null
  gueltig_bis: string | null
  hinweis: string | null
  created_at: string
  updated_at: string
}

export interface KimKarteEingabe {
  karten_typ: KimKartenTyp
  kartennummer?: string | null
  inhaber_user_id?: string | null
  inhaber_name?: string | null
  status?: KimKartenStatus
  gueltig_von?: string | null
  gueltig_bis?: string | null
  hinweis?: string | null
}

export function validiereKarte(eingabe: KimKarteEingabe): string | null {
  if (eingabe.karten_typ !== 'smc_b' && eingabe.karten_typ !== 'ehba') {
    return `Unbekannter Kartentyp: ${eingabe.karten_typ}`
  }
  if (eingabe.gueltig_von && eingabe.gueltig_bis && eingabe.gueltig_von > eingabe.gueltig_bis) {
    return 'Gültig-von darf nicht nach Gültig-bis liegen.'
  }
  if (eingabe.status && !['beantragt', 'aktiv', 'gesperrt', 'abgelaufen'].includes(eingabe.status)) {
    return `Unbekannter Status: ${eingabe.status}`
  }
  return null
}

/** Ist die Karte an einem Stichtag rein formal einsatzbereit (Status + Gültigkeit)? */
export function istEinsatzbereit(karte: Pick<KimKarte, 'status' | 'gueltig_von' | 'gueltig_bis'>, stichtag: string): boolean {
  if (karte.status !== 'aktiv') return false
  if (karte.gueltig_von && karte.gueltig_von > stichtag) return false
  if (karte.gueltig_bis && karte.gueltig_bis < stichtag) return false
  return true
}

export async function ladeKarten(
  supabase: SupabaseClient,
  organizationId: string
): Promise<KimKarte[]> {
  const { data, error } = await supabase
    .from('kim_karten')
    .select('id, organization_id, karten_typ, kartennummer, inhaber_user_id, inhaber_name, status, gueltig_von, gueltig_bis, hinweis, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`KIM-Karten konnten nicht geladen werden: ${error.message}`)
  return (data || []) as KimKarte[]
}

export async function erstelleKarte(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: KimKarteEingabe,
  userId?: string
): Promise<KimKarte> {
  const fehler = validiereKarte(eingabe)
  if (fehler) throw new Error(fehler)

  const { data, error } = await supabase
    .from('kim_karten')
    .insert({
      organization_id: organizationId,
      karten_typ: eingabe.karten_typ,
      kartennummer: eingabe.kartennummer?.trim() || null,
      inhaber_user_id: eingabe.inhaber_user_id || null,
      inhaber_name: eingabe.inhaber_name?.trim() || null,
      status: eingabe.status ?? 'beantragt',
      gueltig_von: eingabe.gueltig_von || null,
      gueltig_bis: eingabe.gueltig_bis || null,
      hinweis: eingabe.hinweis?.trim() || null,
      created_by: userId ?? null,
    })
    .select('id, organization_id, karten_typ, kartennummer, inhaber_user_id, inhaber_name, status, gueltig_von, gueltig_bis, hinweis, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`KIM-Karte konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimKarte
}

export async function aktualisiereKarte(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  eingabe: Partial<KimKarteEingabe>
): Promise<KimKarte> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (eingabe.karten_typ !== undefined) patch.karten_typ = eingabe.karten_typ
  if (eingabe.kartennummer !== undefined) patch.kartennummer = eingabe.kartennummer?.trim() || null
  if (eingabe.inhaber_user_id !== undefined) patch.inhaber_user_id = eingabe.inhaber_user_id || null
  if (eingabe.inhaber_name !== undefined) patch.inhaber_name = eingabe.inhaber_name?.trim() || null
  if (eingabe.status !== undefined) patch.status = eingabe.status
  if (eingabe.gueltig_von !== undefined) patch.gueltig_von = eingabe.gueltig_von || null
  if (eingabe.gueltig_bis !== undefined) patch.gueltig_bis = eingabe.gueltig_bis || null
  if (eingabe.hinweis !== undefined) patch.hinweis = eingabe.hinweis?.trim() || null

  const { data, error } = await supabase
    .from('kim_karten')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id, organization_id, karten_typ, kartennummer, inhaber_user_id, inhaber_name, status, gueltig_von, gueltig_bis, hinweis, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`KIM-Karte konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimKarte
}

export async function loescheKarte(
  supabase: SupabaseClient,
  organizationId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('kim_karten')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(`KIM-Karte konnte nicht gelöscht werden: ${error.message}`)
}
