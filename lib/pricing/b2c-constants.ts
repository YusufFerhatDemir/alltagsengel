/**
 * B2C-Preiskonstanten für die Kunden-UI (Marketplace-Buchung).
 *
 * ACHTUNG: Diese Werte sollten langfristig aus der Datenbank (service_pricing / app_settings)
 * geladen werden, damit Preisänderungen ohne Code-Deployment möglich sind.
 *
 * Die B2B-Abrechnungspreise (35 EUR/h Entlastung, 40 EUR/h privat) liegen in der
 * service_pricing-Tabelle und werden über /api/pricing bereitgestellt — dort NICHT
 * diese Konstanten verwenden.
 *
 * Quelle der aktuellen Werte: bestehende Produktionswerte aus dem Kunden-UI.
 */

/** Kundenpreis pro Stunde (brutto, inkl. Plattformgebühr) */
export const CUSTOMER_HOURLY_RATE = 32

/** Plattformgebühr als Dezimalfaktor (8.5 % = 0.085) */
export const PLATFORM_FEE_FACTOR = 0.085

/** Engel-Vergütung pro Stunde */
export const ENGEL_HOURLY_RATE = 20

/** Fallback-Stundensatz für native App, wenn kein service_pricing-Eintrag vorhanden */
export const NATIVE_FALLBACK_HOURLY_RATE = 35
