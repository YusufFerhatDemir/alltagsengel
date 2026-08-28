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
import { istZurLoeschungVorgemerkt } from './konto-status'
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
  /**
   * Gesetzt, wenn `profiles.deleted_at` einen Wert traegt — das Konto ist
   * zur Loeschung vorgemerkt. `profilRolle` ist dann leer, damit jede
   * Berechtigungsfrage mit Nein beantwortet wird (siehe konto-status.ts).
   */
  zurLoeschungVorgemerkt: boolean
}

/**
 * Ermittelt Benutzer und beide Rollenquellen.
 *
 * `null` bedeutet: keine gueltige Sitzung (⇒ 401). Ein Benutzer OHNE
 * profiles-Datensatz kommt hier mit `profilRolle: ''` zurueck — das ist
 * kein 401, sondern fuehrt in `quellenDuerfen()` zu einem klaren Nein,
 * genau wie das bisherige `if (!profile) → 403` der Fach-Guards.
 *
 * Ein zur Loeschung vorgemerktes Konto (Track 11) ergibt ebenfalls
 * `null`: die Sitzung besteht, sie traegt aber keinen Zugang mehr. 401
 * ist dafuer die richtige Antwort — 403 hiesse „angemeldet, aber zu
 * wenig Rechte", und das trifft es nicht.
 */
export async function holeRollenQuellen(
  supabase: SupabaseClient,
): Promise<RollenQuellen | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (quellen.zurLoeschungVorgemerkt) return null
  return quellen
}

/**
 * Minimaler Ausschnitt aus dem Supabase-Benutzer, den die Ermittlung braucht.
 *
 * Bewusst strukturell statt `User` aus @supabase/supabase-js: die Routen,
 * die hier umgestellt wurden, halten den angemeldeten Benutzer in
 * unterschiedlich eng typisierten Variablen, und ein Nominaltyp haette an
 * jeder dieser Stellen einen Cast erzwungen — also genau die Zeile, die
 * beim naechsten Umbau wieder falsch geschrieben wird.
 */
export interface RollenBenutzer {
  id: string
  app_metadata?: Record<string, unknown> | null
}

/**
 * Wie `holeRollenQuellen()`, aber fuer Aufrufer, die `auth.getUser()`
 * bereits ausgefuehrt haben.
 *
 * WARUM ES DIESE ZWEITE FORM GIBT: Die 49 API-Routen, die bis zum
 * 28.08.2026 `profiles.select('role')` selbst gelesen und damit
 * app_metadata gar nicht angewandt haben, pruefen den angemeldeten
 * Benutzer davor ohnehin — sie brauchen den 401-Zweig mit ihrem eigenen
 * Meldungstext. Ohne diese Form haette die Umstellung jeder dieser Routen
 * einen ZWEITEN `auth.getUser()`-Aufruf beschert: ein zusaetzlicher
 * Netzaufruf pro Anfrage, auf jedem Geldweg. Die Entscheidungsregel ist in
 * beiden Formen dieselbe.
 */
export async function holeRollenQuellenFuer(
  supabase: SupabaseClient,
  user: RollenBenutzer,
): Promise<RollenQuellen> {

  const appRolle =
    typeof user.app_metadata?.role === 'string' ? user.app_metadata.role : ''

  // maybeSingle statt single: ein fehlender Datensatz ist ein regulaerer
  // Fall (Konto ohne Profil) und soll zu „keine Berechtigung" fuehren,
  // nicht zu einem geworfenen PostgREST-Fehler.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name, deleted_at')
    .eq('id', user.id)
    .maybeSingle()

  // Ein zur Loeschung vorgemerktes Konto traegt keine wirksame Rolle mehr.
  // Die leere `profilRolle` ist hier kein Notbehelf, sondern genau die
  // Aussage, die das Modul ohnehin schon kennt: ohne profiles-Rolle gibt es
  // keine Berechtigung. Damit schliessen ALLE Guards, die von hier lesen,
  // in einem Zug — auch die, die `zurLoeschungVorgemerkt` gar nicht kennen.
  const vorgemerkt = istZurLoeschungVorgemerkt(profile)
  const profilRolle = !vorgemerkt && typeof profile?.role === 'string' ? profile.role : ''
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
    zurLoeschungVorgemerkt: vorgemerkt,
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

/**
 * Beide Quellen tragen GENAU die genannte Rolle.
 *
 * Fuer die wenigen Stellen, die nicht an einer Berechtigung haengen,
 * sondern am Rollennamen selbst: die Rollenverwaltung, die
 * plattformweite Preisverwaltung und der organisationsuebergreifende
 * Workflow-Endpunkt verlangen alle drei ausdruecklich `superadmin`.
 *
 * Eine leere `appRolle` ist zulaessig — bei den allermeisten Konten ist
 * app_metadata.role nie geschrieben worden, und die Regel darf nach dem
 * Grundsatz aus lib/auth/rollen.ts nur einschraenken, nie aussperren.
 */
export function quellenSindRolle(
  quellen: Pick<RollenQuellen, 'appRolle' | 'profilRolle'>,
  rolle: string,
): boolean {
  if (quellen.profilRolle !== rolle) return false
  return quellen.appRolle === '' || quellen.appRolle === rolle
}
