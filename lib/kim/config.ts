/**
 * KIM / TI-Anbindung — Postfach-Konfiguration (Block 18)
 *
 * Verwaltet, WELCHES KIM-Postfach diese Organisation nutzt und in welchem
 * Freischaltungsstatus es sich befindet. Dieses Modul stellt ausdrücklich
 * KEINE Verbindung zu einem KIM-Provider oder der Telematikinfrastruktur her
 * — es ist reine Stammdatenverwaltung (Anlegen/Bearbeiten/Anzeigen).
 *
 * Die Postfachadresse ist ein Freitextfeld, das der Nutzer selbst befüllt,
 * sobald ein KIM-Provider-Vertrag besteht. Es gibt hier KEINE hartcodierte
 * Provider-URL und KEIN Protokoll-Handling — beides wäre nur zu erraten, weil
 * uns die KIM-Spezifikation (gematik) und Provider-Zugangsdaten nicht
 * vorliegen. Siehe lib/kim/versand.ts für die daraus folgende Versand-Sperre.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type KimFreischaltungsstatus =
  | 'nicht_beantragt'
  | 'beantragt'
  | 'freigeschaltet'
  | 'gesperrt'

export const KIM_FREISCHALTUNGSSTATUS: readonly KimFreischaltungsstatus[] = [
  'nicht_beantragt', 'beantragt', 'freigeschaltet', 'gesperrt',
] as const

export const KIM_FREISCHALTUNGSSTATUS_LABELS: Record<KimFreischaltungsstatus, string> = {
  nicht_beantragt: 'Nicht beantragt',
  beantragt: 'Beantragt',
  freigeschaltet: 'Freigeschaltet',
  gesperrt: 'Gesperrt',
}

export interface KimKonfiguration {
  id: string
  organization_id: string
  bezeichnung: string
  /** Freitext, vom Nutzer selbst befüllt — kein erratenes Provider-Format. */
  postfachadresse: string | null
  provider_name: string | null
  freischaltungsstatus: KimFreischaltungsstatus
  aktiv: boolean
  hinweis: string | null
  created_at: string
  updated_at: string
}

export interface KimKonfigurationEingabe {
  bezeichnung: string
  postfachadresse?: string | null
  provider_name?: string | null
  freischaltungsstatus?: KimFreischaltungsstatus
  aktiv?: boolean
  hinweis?: string | null
}

/**
 * Validiert nur die Form der Eingabe (Pflichtfeld, grobes E-Mail-artiges
 * Muster für die Postfachadresse) — KEINE Prüfung gegen ein echtes
 * KIM-Adressformat, das kennen wir nicht.
 */
export function validiereKonfiguration(eingabe: KimKonfigurationEingabe): string | null {
  if (!eingabe.bezeichnung || eingabe.bezeichnung.trim().length === 0) {
    return 'Bezeichnung darf nicht leer sein.'
  }
  if (eingabe.postfachadresse && eingabe.postfachadresse.trim().length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eingabe.postfachadresse.trim())) {
      return 'Postfachadresse muss wie eine Adresse aufgebaut sein (Nutzer@Domain).'
    }
  }
  if (eingabe.freischaltungsstatus && !KIM_FREISCHALTUNGSSTATUS.includes(eingabe.freischaltungsstatus)) {
    return `Unbekannter Freischaltungsstatus: ${eingabe.freischaltungsstatus}`
  }
  return null
}

export async function ladeKonfigurationen(
  supabase: SupabaseClient,
  organizationId: string
): Promise<KimKonfiguration[]> {
  const { data, error } = await supabase
    .from('kim_konfiguration')
    .select('id, organization_id, bezeichnung, postfachadresse, provider_name, freischaltungsstatus, aktiv, hinweis, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`KIM-Konfigurationen konnten nicht geladen werden: ${error.message}`)
  return (data || []) as KimKonfiguration[]
}

/** Die aktive Konfiguration — es kann mehrere geben (z.B. Test/Produktion), aktiv() markiert die genutzte. */
export function findeAktiveKonfiguration(konfigurationen: KimKonfiguration[]): KimKonfiguration | null {
  return konfigurationen.find(k => k.aktiv) ?? null
}

export async function erstelleKonfiguration(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: KimKonfigurationEingabe,
  userId?: string
): Promise<KimKonfiguration> {
  const fehler = validiereKonfiguration(eingabe)
  if (fehler) throw new Error(fehler)

  const { data, error } = await supabase
    .from('kim_konfiguration')
    .insert({
      organization_id: organizationId,
      bezeichnung: eingabe.bezeichnung.trim(),
      postfachadresse: eingabe.postfachadresse?.trim() || null,
      provider_name: eingabe.provider_name?.trim() || null,
      freischaltungsstatus: eingabe.freischaltungsstatus ?? 'nicht_beantragt',
      aktiv: eingabe.aktiv ?? false,
      hinweis: eingabe.hinweis?.trim() || null,
      created_by: userId ?? null,
    })
    .select('id, organization_id, bezeichnung, postfachadresse, provider_name, freischaltungsstatus, aktiv, hinweis, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`KIM-Konfiguration konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimKonfiguration
}

export async function aktualisiereKonfiguration(
  supabase: SupabaseClient,
  organizationId: string,
  id: string,
  eingabe: Partial<KimKonfigurationEingabe>
): Promise<KimKonfiguration> {
  if (eingabe.bezeichnung !== undefined || eingabe.postfachadresse !== undefined || eingabe.freischaltungsstatus !== undefined) {
    const fehler = validiereKonfiguration({
      bezeichnung: eingabe.bezeichnung ?? 'x',
      postfachadresse: eingabe.postfachadresse,
      freischaltungsstatus: eingabe.freischaltungsstatus,
    })
    if (fehler) throw new Error(fehler)
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (eingabe.bezeichnung !== undefined) patch.bezeichnung = eingabe.bezeichnung.trim()
  if (eingabe.postfachadresse !== undefined) patch.postfachadresse = eingabe.postfachadresse?.trim() || null
  if (eingabe.provider_name !== undefined) patch.provider_name = eingabe.provider_name?.trim() || null
  if (eingabe.freischaltungsstatus !== undefined) patch.freischaltungsstatus = eingabe.freischaltungsstatus
  if (eingabe.aktiv !== undefined) patch.aktiv = eingabe.aktiv
  if (eingabe.hinweis !== undefined) patch.hinweis = eingabe.hinweis?.trim() || null

  const { data, error } = await supabase
    .from('kim_konfiguration')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id, organization_id, bezeichnung, postfachadresse, provider_name, freischaltungsstatus, aktiv, hinweis, created_at, updated_at')
    .single()

  if (error || !data) throw new Error(`KIM-Konfiguration konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimKonfiguration
}

export async function loescheKonfiguration(
  supabase: SupabaseClient,
  organizationId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('kim_konfiguration')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(`KIM-Konfiguration konnte nicht gelöscht werden: ${error.message}`)
}
