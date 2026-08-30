// ═══════════════════════════════════════════════════════════════════════════
// BERECHTIGUNGSPRUEFUNG FUER DIE MARKETING-ROUTEN
//
// Duenne Schicht ueber requireBerechtigung — sie existiert, damit die
// Antwort auf „wer darf Werbung verschicken" an EINER Stelle steht und
// nicht in acht Routen einzeln.
//
// Genau daran ist das Bonusmodul schon einmal auseinandergelaufen: die
// Seite fragte nach personal.lesen, die Schnittstelle nach berichte.lesen
// und die Datenbank antwortete mit is_admin(). Drei Antworten auf dieselbe
// Frage — die Rollen dazwischen bekamen leere Listen und interne
// Serverfehler statt eines ehrlichen 403.
//
// Hier gibt es deshalb genau eine Antwort:
//   Oberflaeche    /admin/marketing/*        -> marketing.verwalten
//   Schnittstelle  /api/admin/marketing/*    -> marketing.verwalten
//   Datenbank      marketing_*, email_*      -> is_admin()
//
// marketing.verwalten steht in NUR_ADMINISTRATION, gilt also nur fuer
// admin und superadmin — dieselbe Menge, die is_admin() in der Datenbank
// bezeichnet. Die drei Ebenen sagen damit dasselbe.
// ═══════════════════════════════════════════════════════════════════════════

import { requireBerechtigung, type GuardErgebnis } from '@/lib/auth/guard'

/** Alle Marketing-Routen. Lesen wie Schreiben — der Verteiler IST der Wert. */
export function requireMarketing(): Promise<GuardErgebnis> {
  return requireBerechtigung('marketing.verwalten')
}
