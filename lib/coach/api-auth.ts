// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/coach/** — DiPA "Digitaler PflegeCoach"
//
// ABWEICHUNG von lib/pflege/api-auth.ts (bewusst):
//  * KEIN Admin-/Rollen-Check gegen profiles, KEINE Organisation —
//    der PflegeCoach ist ein Endnutzer-Produkt, jeder eingeloggte
//    Nutzer darf ausschließlich SEINE eigenen Daten sehen.
//  * KEIN createAdminClient (service_role) — alle Datenzugriffe laufen
//    über den Session-Client, damit die coach_*-RLS die einzige
//    Zugriffs-Wahrheit bleibt (DiPAV-Produktgrenze).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { heuteBerlin } from '@/lib/utils/timezone'
import type { CoachUser } from './types'
import {
  EINWILLIGUNG_FEHLT_CODE, EINWILLIGUNG_FEHLT_TEXT,
  FREISCHALTUNG_NOETIG_CODE, FREISCHALTUNG_NOETIG_TEXT,
  hatAktiveEinwilligung, PFLICHT_CONSENT,
} from './consent'
import { freischaltungPflicht } from './config'
import { istFreigeschaltet, type FreischaltungZeile } from './freischaltung'

export type CoachSessionResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

export type CoachUserResult =
  | { ok: true; supabase: SupabaseClient; user: User; coachUser: CoachUser }
  | { ok: false; response: NextResponse }

/** Nur Session prüfen — für Onboarding (coach_users-Zeile existiert noch nicht). */
export async function requireCoachSession(): Promise<CoachSessionResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 }) }
  }
  return { ok: true, supabase, user }
}

export interface CoachUserOptions {
  /**
   * Setzen, wenn die Route NEUE Gesundheitsdaten des Nutzers anlegt oder
   * ändert. Dann werden zusätzlich geprüft:
   *   1. die Pflicht-Einwilligung (Art. 9) — ist sie widerrufen, ist
   *      Schreiben gesperrt (lib/coach/consent.ts),
   *   2. die Freischaltung, sofern COACH_FREISCHALTUNG_PFLICHT aktiv ist.
   *
   * NICHT setzen bei: Lesen, Export, Löschung, Einwilligungs-Verwaltung und
   * Darstellungseinstellungen — diese Wege müssen auch nach einem Widerruf
   * offen bleiben, sonst käme der Nutzer an seine eigenen Daten nicht heran.
   *
   * Kosten: je eine zusätzliche Abfrage. Die Freischaltungs-Abfrage
   * entfällt vollständig, solange der Schalter aus ist (Normalbetrieb).
   */
  schreibzugriff?: boolean
}

/** Session + coach_users-Profil (RLS: nur die eigene Zeile ist sichtbar). */
export async function requireCoachUser(optionen: CoachUserOptions = {}): Promise<CoachUserResult> {
  const session = await requireCoachSession()
  if (!session.ok) return session

  const { data: coachUser, error } = await session.supabase
    .from('coach_users')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, response: NextResponse.json({ error: 'PflegeCoach-Profil konnte nicht geladen werden.' }, { status: 500 }) }
  }
  if (!coachUser) {
    return { ok: false, response: NextResponse.json({ error: 'Kein PflegeCoach-Profil. Bitte zuerst das Onboarding abschließen.', code: 'NO_COACH_PROFILE' }, { status: 403 }) }
  }

  const treffer: CoachUserResult = {
    ok: true, supabase: session.supabase, user: session.user, coachUser: coachUser as CoachUser,
  }
  if (!optionen.schreibzugriff) return treffer

  const sperre = await pruefeSchreibzugriff(session.supabase, (coachUser as CoachUser).id)
  return sperre ?? treffer
}

/**
 * Prüft die Voraussetzungen für schreibende Zugriffe.
 * Rückgabe `null` = erlaubt, sonst die fertige Ablehnung.
 *
 * Fail-closed: kann die Einwilligung nicht geprüft werden, wird NICHT
 * geschrieben. Ein Datenbankfehler darf nicht dazu führen, dass ohne
 * gültige Rechtsgrundlage Gesundheitsdaten entstehen.
 */
async function pruefeSchreibzugriff(
  supabase: SupabaseClient,
  coachUserId: string
): Promise<{ ok: false; response: NextResponse } | null> {
  const { data: consents, error: consentFehler } = await supabase
    .from('coach_consents')
    .select('consent_typ, erteilt, widerrufen_am')
    .eq('coach_user_id', coachUserId)

  if (consentFehler) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Ihre Einwilligung konnte nicht geprüft werden. Bitte später erneut versuchen.' }, { status: 503 }),
    }
  }
  if (!hatAktiveEinwilligung(consents ?? [], PFLICHT_CONSENT)) {
    return {
      ok: false,
      response: NextResponse.json({ error: EINWILLIGUNG_FEHLT_TEXT, code: EINWILLIGUNG_FEHLT_CODE }, { status: 403 }),
    }
  }

  if (!freischaltungPflicht()) return null

  const { data: freischaltungen, error: freischaltFehler } = await supabase
    .from('coach_freischaltungen')
    .select('status, gueltig_von, gueltig_bis')
    .eq('coach_user_id', coachUserId)

  if (freischaltFehler) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Ihr Zugang konnte nicht geprüft werden. Bitte später erneut versuchen.' }, { status: 503 }),
    }
  }
  if (!istFreigeschaltet((freischaltungen ?? []) as FreischaltungZeile[], heuteBerlin())) {
    return {
      ok: false,
      response: NextResponse.json({ error: FREISCHALTUNG_NOETIG_TEXT, code: FREISCHALTUNG_NOETIG_CODE }, { status: 403 }),
    }
  }
  return null
}
