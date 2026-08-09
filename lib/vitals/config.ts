// ═══════════════════════════════════════════════════════════════
// Vitalwerte — regulatorischer Kill-Switch für die Grenzwert-Alarme
// ═══════════════════════════════════════════════════════════════
// Die automatische Bewertung von Vitalwerten gegen Grenzwerte (Warnung/
// kritisch) kann eine Medizinprodukt-Funktion im Sinne der MDR sein — die
// Abgrenzung (Zweckbestimmung, Medizinproduktstatus, Risiko, Konformität)
// ist noch NICHT geklärt. Siehe docs/VITALWERTE_REGULATORIK.md.
//
// Deshalb FAIL-CLOSED: Die Alarmfunktion ist AUS, solange sie nicht
// explizit und bewusst per Umgebungsvariable freigeschaltet wird — und das
// darf erst nach dokumentierter regulatorischer Abnahme geschehen.
//
// NICHT betroffen (immer erlaubt): Erfassung, Speicherung und
// Verlaufsdarstellung der Messwerte. Das ist reine Dokumentation.
//
// Bewusst env-basiert (nicht über kf_feature_flags): ein Sicherheits-
// Kill-Switch darf nicht durch eine DB-Zeile umlegbar sein, muss ohne
// DB-Abhängigkeit fail-closed sein und ist eine Deployment-Entscheidung.

export const VITALS_ALARM_ENV = 'VITALS_GRENZWERT_ALARME_AKTIV'

/**
 * Sind die Grenzwert-Alarme produktiv aktiv?
 * Nur true, wenn die Env-Variable exakt auf 'true' steht. Jeder andere
 * Wert (auch unset) → false.
 */
export function grenzwertAlarmeAktiv(): boolean {
  return process.env[VITALS_ALARM_ENV] === 'true'
}
