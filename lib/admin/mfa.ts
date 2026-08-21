// ═══════════════════════════════════════════════════════════════
// Admin-MFA — Prüffunktionen für die Admin-Oberfläche
//
// Admin-Konten erfordern einen zweiten Faktor (TOTP). Wer keinen hat,
// wird zur Einrichtung weitergeleitet. Wer einen hat, aber die Sitzung
// nur auf AAL1 steht, muss den Code erneut eingeben.
//
// Dieses Modul ist bewusst frei von IO: nur reine Auswertung, damit die
// Regeln testbar sind und in Layout-Guards wie in API-Routen dieselben
// bleiben.
// ═══════════════════════════════════════════════════════════════

import type { MfaFaktor, MfaNiveau } from '@/lib/coach/mfa'

/** Pfade, die OHNE MFA-Prüfung erreichbar sein müssen (Einrichtung + Verifizierung). */
export const MFA_AUSNAHME_PFADE = [
  '/admin/mfa-einrichtung',
  '/admin/mfa-pruefen',
]

export interface AdminMfaStand {
  /** Hat mindestens einen bestätigten TOTP-Faktor. */
  eingerichtet: boolean
  /** AAL-Niveau der laufenden Sitzung. */
  niveau: MfaNiveau
  /** Sitzung auf AAL2 = MFA vollständig verifiziert. */
  verifiziert: boolean
}

/**
 * Leitet aus Faktoren und AAL-Niveau den MFA-Status ab.
 */
export function adminMfaStand(
  faktoren: MfaFaktor[] | null | undefined,
  niveau: MfaNiveau,
): AdminMfaStand {
  const eingerichtet = (faktoren ?? []).some(f => f.status === 'verified')
  return {
    eingerichtet,
    niveau,
    verifiziert: niveau === 'aal2',
  }
}

/**
 * Wohin muss ein Admin weitergeleitet werden?
 * `null` = alles in Ordnung, darf bleiben.
 */
export function adminMfaWeiterleitung(
  stand: AdminMfaStand,
  aktuellerPfad: string,
): string | null {
  // Ausnahme-Pfade durchlassen (Einrichtungs- und Prüfseite)
  if (MFA_AUSNAHME_PFADE.some(p => aktuellerPfad.startsWith(p))) return null

  // Kein Faktor eingerichtet → zur Einrichtung
  if (!stand.eingerichtet) return '/admin/mfa-einrichtung'

  // Faktor vorhanden, aber Sitzung nur AAL1 → Verifizierung
  if (stand.eingerichtet && !stand.verifiziert) return '/admin/mfa-pruefen'

  return null
}
