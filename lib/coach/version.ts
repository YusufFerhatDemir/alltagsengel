// ═══════════════════════════════════════════════════════════════
// Digitaler PflegeCoach — Produktversion
//
// Der PflegeCoach ist ein separat versioniertes Produkt (DiPAV:
// klare Produktidentität; Änderungsanzeigen beziehen sich auf diese
// Version, nicht auf Plattform-Deployments). Die Version wird überall
// ausgewiesen: UI-Fußzeile, Datenexport, Verlaufsberichte.
//
// SemVer: MAJOR.MINOR.PATCH — Erhöhung nach Änderungs-Kategorien:
//  * PATCH: Fehlerbehebungen ohne Funktionsänderung
//  * MINOR: neue/geänderte Funktionen (potenziell anzeigepflichtig,
//    siehe BfArM-Frage 20 in audit/dipa/bfarm_fragenkatalog.md)
//  * MAJOR: Änderungen an Zweckbestimmung/Produktgrenze (immer
//    regulatorisch zu bewerten)
// Jede Versionsänderung wird in audit/dipa/CHANGELOG_pflegecoach.md
// dokumentiert.
// ═══════════════════════════════════════════════════════════════

export const COACH_PRODUKT_NAME = 'Digitaler PflegeCoach'
export const COACH_PRODUKT_VERSION = '0.5.0'
export const COACH_PRODUKT_STAND = '2026-08-14'

/**
 * Support-Adresse des Produkts. Bewusst eine zentrale Konstante und keine
 * über die Seiten verstreute mailto-Adresse: Der Hersteller-Support ist
 * eine Produkteigenschaft (Verbraucherschutz), sie muss überall dieselbe
 * sein und darf nie versehentlich auf eine private Adresse zeigen.
 */
export const COACH_SUPPORT_EMAIL = 'info@alltagsengel.care'
