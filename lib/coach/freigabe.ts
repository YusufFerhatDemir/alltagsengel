// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Datenfreigaben (coach_shares): reine Hilfsfunktionen
//
// Tabelle + RLS existieren bereits (Migration 20260819010000). Diese Datei
// bündelt nur, was app/api/coach/freigaben/** und die Oberfläche unter
// /pflegecoach/einstellungen/freigaben gemeinsam brauchen — bewusst ohne
// Supabase-Aufruf, damit die Regeln ohne DB-Verbindung testbar bleiben.
// ═══════════════════════════════════════════════════════════════

import type { CoachRolle } from './types'

export type EmpfaengerRolle = Extract<CoachRolle, 'angehoerig' | 'pflegedienst'>

export const EMPFAENGER_ROLLEN: EmpfaengerRolle[] = ['angehoerig', 'pflegedienst']

export const EMPFAENGER_ROLLE_LABELS: Record<EmpfaengerRolle, string> = {
  angehoerig: 'Pflegende/r Angehörige/r',
  pflegedienst: 'Pflegedienst',
}

/** Zeile aus der RPC coach_freigaben_liste() — bereits um die E-Mail der eingeladenen Person ergänzt. */
export interface CoachFreigabeZeile {
  id: string
  empfaenger_email: string
  empfaenger_rolle: EmpfaengerRolle
  erstellt_am: string
  widerrufen_am: string | null
}

export function istAktiveFreigabe(zeile: Pick<CoachFreigabeZeile, 'widerrufen_am'>): boolean {
  return zeile.widerrufen_am === null
}

/**
 * Leichte Plausibilitätsprüfung — keine vollständige RFC-5322-Validierung
 * (die übernimmt bereits `<input type="email">"` im Browser). Serverseitig
 * genügt ein grober Sanity-Check, bevor die E-Mail an die DB-Funktion geht.
 */
export function normalisiereEmail(rohwert: unknown): string | null {
  if (typeof rohwert !== 'string') return null
  const wert = rohwert.trim().toLowerCase()
  if (!wert || wert.length > 254) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert)) return null
  return wert
}

export const EIGENE_EMAIL_CODE = 'EIGENE_EMAIL'
export const EIGENE_EMAIL_TEXT = 'Sie können sich nicht selbst einladen.'

export const KEIN_KONTO_CODE = 'KEIN_KONTO'
export const KEIN_KONTO_TEXT =
  'Für diese E-Mail-Adresse besteht kein PflegeCoach-Konto. Die Person muss sich zuerst selbst ' +
  'im PflegeCoach registrieren — danach können Sie ihr Ihre Daten freigeben.'

export const BEREITS_FREIGEGEBEN_CODE = 'BEREITS_FREIGEGEBEN'
export const BEREITS_FREIGEGEBEN_TEXT = 'Für diese Person besteht bereits eine aktive Freigabe.'

export const FREIGABE_CONSENT_FEHLT_CODE = 'FREIGABE_EINWILLIGUNG_FEHLT'
export const FREIGABE_CONSENT_FEHLT_TEXT =
  'Um Daten freizugeben, erteilen Sie bitte zuerst in den Einstellungen die Einwilligung ' +
  '„Datenfreigabe an Angehörige/Pflegedienst".'
