// ═══════════════════════════════════════════════════════════════════════
// Rollenquelle — EINE Ermittlung fuer alle Fach-Guards
// ═══════════════════════════════════════════════════════════════════════
//
// Vorher trug jeder der dreizehn Guards in lib/**/api-auth.ts denselben
// Block: `auth.getUser()`, danach `profiles.select('role')`, danach
// `rolleDarf(profile.role, …)`. Dreizehn Kopien einer Ermittlung, die
// app_metadata.role gar nicht kannte — waehrend proxy.ts, lib/auth/guard.ts
// und app/admin/layout.tsx genau umgekehrt app_metadata.role bevorzugten
// und profiles nur als Rueckfall lasen.
//
// Dieses Modul liest BEIDE Quellen einmal und uebergibt sie an die
// wirksam*-Funktionen in lib/auth/rollen.ts, die die Entscheidungsregel
// tragen (Schnittmenge; profiles bindend). Ein Guard, der von hier liest,
// kann die beiden Quellen nicht mehr unterschiedlich auslegen.
//
// Bewusst NICHT in lib/auth/guard.ts: jenes Modul zieht next/server und
// den Server-Supabase-Client mit sich und bringt eigene Antwort-Typen mit.
// Die Fach-Guards brauchen nur die Ermittlung, nicht die Antwort.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  wirksamDarf,
  wirksamIstAdministration,
  wirksameRolle,
  type Berechtigung,
} from './rollen'

export interface RollenQuellen {
  userId: string
  /** Rolle aus dem Token (app_metadata) — '' wenn nicht gesetzt. */
  appRolle: string
  /** Rolle aus public.profiles — '' wenn kein Datensatz oder ohne Rolle. */
  profilRolle: string
  /** Wirksame Rolle fuer Anzeige und Protokoll (siehe wirksameRolle). */
  rolle: string
  vorname: string
  nachname: string
  /** Anzeigename, faellt auf 'Alltagsengel' zurueck. */
  name: string
}

/**
 * Ermittelt Benutzer und beide Rollenquellen.
 *
 * `null` bedeutet: keine gueltige Sitzung (⇒ 401). Ein Benutzer OHNE
 * profiles-Datensatz kommt hier mit `profilRolle: ''` zurueck — das ist
 * kein 401, sondern fuehrt in `quellenDuerfen()` zu einem klaren Nein,
 * genau wie das bisherige `if (!profile) → 403` der Fach-Guards.
 */
export async function holeRollenQuellen(
  supabase: SupabaseClient,
): Promise<RollenQuellen | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const appRolle =
    typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : ''

  // maybeSingle statt single: ein fehlender Datensatz ist ein regulaerer
  // Fall (Konto ohne Profil) und soll zu „keine Berechtigung" fuehren,
  // nicht zu einem geworfenen PostgREST-Fehler.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  const profilRolle = typeof profile?.role === 'string' ? profile.role : ''
  const vorname = typeof profile?.first_name === 'string' ? profile.first_name : ''
  const nachname = typeof profile?.last_name === 'string' ? profile.last_name : ''

  return {
    userId: user.id,
    appRolle,
    profilRolle,
    rolle: wirksameRolle(appRolle, profilRolle),
    vorname,
    nachname,
    name: [vorname, nachname].filter(Boolean).join(' ') || 'Alltagsengel',
  }
}

/** Eine Berechtigung gegen beide Quellen. */
export function quellenDuerfen(
  quellen: Pick<RollenQuellen, 'appRolle' | 'profilRolle'>,
  berechtigung: Berechtigung,
): boolean {
  return wirksamDarf(quellen.appRolle, quellen.profilRolle, berechtigung)
}

/** Vorbehaltsbereiche: beide gesetzten Quellen muessen Administration sagen. */
export function quellenSindAdministration(
  quellen: Pick<RollenQuellen, 'appRolle' | 'profilRolle'>,
): boolean {
  return wirksamIstAdministration(quellen.appRolle, quellen.profilRolle)
}
