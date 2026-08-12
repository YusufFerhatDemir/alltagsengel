// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Produktschalter (Deployment-Entscheidungen)
//
// Bewusst env-basiert und nicht über eine DB-Zeile: Es sind regulatorische
// bzw. betriebliche Freigaben, keine Laufzeit-Einstellungen. Alle Schalter
// sind fail-safe voreingestellt — der Default darf nie dazu führen, dass
// etwas Unfreigegebenes scharf ist oder etwas Funktionierendes ausfällt.
// ═══════════════════════════════════════════════════════════════

export const COACH_DIPA_MODUS_ENV = 'COACH_DIPA_MODUS'
export const COACH_FREISCHALTUNG_ENV = 'COACH_FREISCHALTUNG_PFLICHT'
export const COACH_NUTZUNGSNACHWEIS_ENV = 'COACH_NUTZUNGSNACHWEIS_AKTIV'

/**
 * Ist der PflegeCoach im DiPA-Modus (BfArM-Listing vorhanden)?
 *
 * Default AUS — der PflegeCoach laeuft als freier digitaler Service.
 * Wenn aktiviert: Anspruchspruefung, Kassenreferenzen und Abrechnungswege
 * werden im UI sichtbar.
 */
export function dipaModus(): boolean {
  return process.env[COACH_DIPA_MODUS_ENV] === 'true'
}

/**
 * Muss der Zugang per Freischaltcode aktiviert sein, bevor der PflegeCoach
 * genutzt werden kann?
 *
 * Default AUS. Grund: Ob ein Code-Verfahren für DiPA verbindlich vorgesehen
 * ist, ist regulatorisch nicht geklärt (audit/dipa/nutzerflow_dipa.md).
 * Der Mechanismus ist vollständig gebaut und sofort aktivierbar — er wird
 * aber erst scharf geschaltet, wenn das Verfahren feststeht. Bis dahin
 * bleibt der bestehende Zugang unverändert nutzbar.
 */
export function freischaltungPflicht(): boolean {
  return process.env[COACH_FREISCHALTUNG_ENV] === 'true'
}

/**
 * Werden pseudonymisierte Nutzungsereignisse für die Evaluation erfasst?
 *
 * Default AUS. Die Erfassung setzt zusätzlich die Einwilligung
 * 'wissenschaftliche_auswertung' des jeweiligen Nutzers voraus — der
 * Schalter allein genügt nie (doppelte Absicherung, Art. 9 DSGVO).
 */
export function nutzungsnachweisAktiv(): boolean {
  return process.env[COACH_NUTZUNGSNACHWEIS_ENV] === 'true'
}
