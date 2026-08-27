// ═══════════════════════════════════════════════════════════════════════
// Zugangsschranke des Bonusmoduls
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026)
// Drei Stellen gaben drei verschiedene Antworten auf die Frage, wer Boni
// verwalten darf:
//
//   Oberflaeche   /admin/bonuses               personal.lesen/.schreiben
//                                              -> admin, pdl
//   Schnittstelle /api/admin/analytics/bonuses berichte.lesen
//                                              -> admin, pdl, qm, buchhaltung
//   Datenbank     bonus_regeln, _berechnungen, _freigaben
//                                              is_admin()
//                                              -> admin, superadmin
//
// Die Datenbank gilt — und zwar live gelesen am 27.08.2026 aus pg_policies:
// alle sechs Policies auf den drei Tabellen tragen `USING is_admin()` und
// `WITH CHECK is_admin()`, und is_admin() ist auf ARRAY['admin','superadmin']
// beschraenkt (aus pg_proc.prosrc).
//
// Der Unterschied gab den Rollen dazwischen KEINEN zusaetzlichen Zugriff —
// aber eine falsche Auskunft, und das ist die eigentliche Schadenslage:
//
//   Lesewege  (GET /regeln, /historie) laufen ueber den RLS-Client. RLS
//             filtert ZEILENWEISE, ohne Fehler. Die PDL bekam eine LEERE
//             Regelliste und eine LEERE Freigabeliste — und keinen Hinweis
//             darauf, dass sie etwas nicht sehen darf. Genau die stillen
//             0/leer-Werte der QM/PDL-Dashboards (d707cda) und des
//             Angehoerigenportals (48d6f3b).
//
//   Schreibwege (POST /regeln, /berechnen, /freigeben) laufen in denselben
//             RLS-Client und bekommen 42501. Der Fehler-Sanitizer verkuerzt
//             das zu 'Interner Serverfehler': die Anwendung sah kaputt aus,
//             wo sie nur nein sagte.
//
// ABHILFE
// Eine eigene Berechtigung 'bonus.verwalten' unter dem Vorbehalt der
// Administration (NUR_ADMINISTRATION in lib/auth/rollen.ts). Sie sagt
// dasselbe wie is_admin() und wird VOR der Datenbank geprueft — die
// Antwort ist damit ein ehrliches 403 statt einer leeren Liste oder eines
// erfundenen Serverfehlers.
//
// Bewusst KEINE neue RLS-Policy: die Datenbank sagt bereits das Richtige.
// Zu aendern war die Schnittstelle, die ihr vorauslief.
// ═══════════════════════════════════════════════════════════════════════

import { requireOpsAdmin, type OpsAuthResult } from '@/lib/ops/api-auth'

/**
 * Verlangt 'bonus.verwalten' — also admin oder superadmin, deckungsgleich
 * mit is_admin() in den bonus_*-Policies.
 */
export async function requireBonusVerwaltung(): Promise<OpsAuthResult> {
  return requireOpsAdmin('bonus.verwalten')
}
