// ═══════════════════════════════════════════════════════════
// NACHGELAGERTES SPEICHERN DER REGISTRIERUNGSDATEN
// ═══════════════════════════════════════════════════════════
// Bei aktivierter E-Mail-Bestätigung liefert supabase.auth.signUp()
// KEINE Session. Die Registrierungsseite konnte das Profil deshalb
// nicht schreiben — PLZ, Ort und Name gingen still verloren, und der
// Kunde landete ohne Postleitzahl in der App. Genau das bricht den
// Umkreis-Filter (siehe /api/engel/match).
//
// Lösung: Die Angaben werden lokal geparkt und beim ersten
// erfolgreichen Login nachgetragen. Bewusst nur unkritische
// Profilfelder — niemals Passwörter oder Tokens.
// ═══════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'ae_pending_profile'

export type PendingProfile = {
  /** User-ID aus signUp — Schutz davor, fremde Daten in ein anderes Konto zu schreiben. */
  id: string
  role?: string
  first_name?: string
  last_name?: string
  email?: string
  location?: string
  postal_code?: string
  agb_accepted_at?: string
  agb_version?: string
}

/** Registrierungsdaten für den ersten Login parken. */
export function stashPendingProfile(daten: PendingProfile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(daten))
  } catch {
    // Private-Mode / volles Quota → Profil bleibt unvollständig,
    // der Kunde kann die PLZ im Profil nachtragen.
  }
}

/**
 * Geparkte Daten ins Profil schreiben, sofern sie zum angemeldeten
 * User gehören. Wird nach jedem Login aufgerufen und ist ein No-Op,
 * wenn nichts geparkt ist.
 */
export async function flushPendingProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  if (typeof window === 'undefined') return
  let daten: PendingProfile | null = null
  try {
    const roh = window.localStorage.getItem(KEY)
    if (!roh) return
    daten = JSON.parse(roh) as PendingProfile
  } catch {
    window.localStorage.removeItem(KEY)
    return
  }

  // Fremde oder kaputte Daten verwerfen statt anwenden
  if (!daten?.id || daten.id !== userId) {
    window.localStorage.removeItem(KEY)
    return
  }

  try {
    await supabase.from('profiles').upsert(daten)
  } catch {
    return // Beim nächsten Login erneut versuchen
  }
  window.localStorage.removeItem(KEY)
}
