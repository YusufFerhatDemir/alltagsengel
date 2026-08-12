/**
 * KIM / TI-Anbindung — Nachrichten-Warteschlange (Block 18)
 *
 * Datenmodell für eine Warteschlange von KIM-Nachrichten (laut Roadmap primär
 * Abrechnungsdateien, grundsätzlich aber jede Art von Dokument, das künftig
 * via KIM verschickt werden soll). Dieses Modul verwaltet nur die
 * Warteschlange selbst — Anlegen, Auflisten, Status setzen. Der tatsächliche
 * Versand ist in lib/kim/versand.ts fail-closed gesperrt.
 *
 * Statusmaschine (bewusst klein gehalten, solange der Versand gesperrt ist):
 *   entwurf  → wird vorbereitet, noch nicht zum Versand markiert
 *   wartend  → zum Versand markiert, wartet auf Freischaltung des Kanals
 *   gesperrt → ein Versandversuch wurde unternommen und vom fail-closed-Pfad
 *              abgewiesen (s. versand.ts) — bleibt hier stehen, bis der Kanal
 *              freigeschaltet ist
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type KimNachrichtStatus = 'entwurf' | 'wartend' | 'gesperrt'

export const KIM_NACHRICHT_STATUS_LABELS: Record<KimNachrichtStatus, string> = {
  entwurf: 'Entwurf',
  wartend: 'Wartend',
  gesperrt: 'Gesperrt',
}

export interface KimNachricht {
  id: string
  organization_id: string
  konfiguration_id: string | null
  betreff: string
  /** Freitext — kein erratenes KIM-Adressformat. */
  empfaenger_adresse: string | null
  /** Freiwillige Referenz auf den fachlichen Ursprung, z.B. 'sgb_v_lauf'. */
  bezug_typ: string | null
  bezug_id: string | null
  status: KimNachrichtStatus
  gesperrt_grund: string | null
  erstellt_von: string | null
  created_at: string
  updated_at: string
}

export interface KimNachrichtEingabe {
  konfiguration_id?: string | null
  betreff: string
  empfaenger_adresse?: string | null
  bezug_typ?: string | null
  bezug_id?: string | null
}

export function validiereNachricht(eingabe: KimNachrichtEingabe): string | null {
  if (!eingabe.betreff || eingabe.betreff.trim().length === 0) {
    return 'Betreff darf nicht leer sein.'
  }
  if (eingabe.empfaenger_adresse && eingabe.empfaenger_adresse.trim().length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eingabe.empfaenger_adresse.trim())) {
      return 'Empfängeradresse muss wie eine Adresse aufgebaut sein (Nutzer@Domain).'
    }
  }
  return null
}

export async function ladeNachrichten(
  supabase: SupabaseClient,
  organizationId: string,
  status?: KimNachrichtStatus
): Promise<KimNachricht[]> {
  let query = supabase
    .from('kim_nachrichten')
    .select('id, organization_id, konfiguration_id, betreff, empfaenger_adresse, bezug_typ, bezug_id, status, gesperrt_grund, erstellt_von, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`KIM-Nachrichten konnten nicht geladen werden: ${error.message}`)
  return (data || []) as KimNachricht[]
}

export async function erstelleEntwurf(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: KimNachrichtEingabe,
  userId?: string
): Promise<KimNachricht> {
  const fehler = validiereNachricht(eingabe)
  if (fehler) throw new Error(fehler)

  const { data, error } = await supabase
    .from('kim_nachrichten')
    .insert({
      organization_id: organizationId,
      konfiguration_id: eingabe.konfiguration_id || null,
      betreff: eingabe.betreff.trim(),
      empfaenger_adresse: eingabe.empfaenger_adresse?.trim() || null,
      bezug_typ: eingabe.bezug_typ?.trim() || null,
      bezug_id: eingabe.bezug_id || null,
      status: 'entwurf',
      erstellt_von: userId ?? null,
    })
    .select('id, organization_id, konfiguration_id, betreff, empfaenger_adresse, bezug_typ, bezug_id, status, gesperrt_grund, erstellt_von, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`KIM-Nachricht konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimNachricht
}

/**
 * Markiert einen Entwurf als versandbereit ('wartend'). Löst KEINEN Versand
 * aus — das bleibt lib/kim/versand.ts vorbehalten, das den eigentlichen
 * Versandversuch ausnahmslos abweist.
 */
export async function alsWartendMarkieren(
  supabase: SupabaseClient,
  organizationId: string,
  id: string
): Promise<KimNachricht> {
  const { data, error } = await supabase
    .from('kim_nachrichten')
    .update({ status: 'wartend', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'entwurf')
    .select('id, organization_id, konfiguration_id, betreff, empfaenger_adresse, bezug_typ, bezug_id, status, gesperrt_grund, erstellt_von, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht als wartend markiert werden: ${error?.message ?? 'nicht gefunden oder falscher Status'}`)
  return data as KimNachricht
}

/** Wird von der Versand-API aufgerufen, NACHDEM versendeKimNachricht() geworfen hat — hält die Sperre in der Warteschlange fest. */
export async function alsGesperrtMarkieren(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  grund: string
): Promise<KimNachricht> {
  const { data, error } = await supabase
    .from('kim_nachrichten')
    .update({ status: 'gesperrt', gesperrt_grund: grund, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id, organization_id, konfiguration_id, betreff, empfaenger_adresse, bezug_typ, bezug_id, status, gesperrt_grund, erstellt_von, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht als gesperrt markiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimNachricht
}

export async function loescheNachricht(
  supabase: SupabaseClient,
  organizationId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('kim_nachrichten')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(`KIM-Nachricht konnte nicht gelöscht werden: ${error.message}`)
}
