// ═══════════════════════════════════════════════════════════
// HESSEN-PLZ-CHECK — Kassenleistung (§45a/§45b) nur in Hessen
// ═══════════════════════════════════════════════════════════
// Alltagsengel hat die Anerkennung nach §45a SGB XI ausschließlich
// in Hessen. Kunden außerhalb Hessens dürfen NUR "privat" als
// Zahlungsart sehen — kein "kasse", kein "kombi".
//
// Fail-safe-Richtung: Wenn die PLZ unbekannt oder nicht eindeutig
// Hessen zuzuordnen ist, wird KEINE Kassenleistung angeboten
// (false). Ein fälschliches "privat" ist ärgerlich, ein
// fälschliches "kasse" wäre ein Compliance-Verstoß.
//
// PLZ-Regionen sind nicht deckungsgleich mit Landesgrenzen —
// deshalb Präfix-Regeln PLUS 5-stellige Ausnahmelisten für die
// bekannten Grenzfälle (AKK-Stadtteile, Rhein-Lahn, Hessisches
// Ried, Kreis Bergstraße im 69er-Gebiet, Thüringer 364xx usw.).
// ═══════════════════════════════════════════════════════════

/** Extrahiert eine 5-stellige PLZ aus beliebigem Input ("65933 Frankfurt " → "65933"). */
export function normalizePlz(input: string | null | undefined): string | null {
  if (!input) return null
  const match = String(input).match(/\d{5}/)
  return match ? match[0] : null
}

/**
 * Ermittelt die maßgebliche PLZ aus Profil-Feldern:
 * postal_code hat Vorrang, sonst PLZ aus dem location-Freitext.
 */
export function resolvePlz(
  postalCode: string | null | undefined,
  location?: string | null
): string | null {
  return normalizePlz(postalCode) ?? normalizePlz(location)
}

// PLZ, die trotz nicht-hessischem Präfix in Hessen liegen
const HESSEN_TROTZ_FREMDEM_PRAEFIX = new Set([
  '55246', '55252', // Mainz-Kostheim / Mainz-Kastel (Stadtteile von Wiesbaden)
  '68519',          // Viernheim (Kreis Bergstraße)
  '68623', '68642', '68647', '68649', // Lampertheim, Bürstadt, Biblis, Groß-Rohrheim (Hessisches Ried)
  '69434',          // Neckarsteinach (Kreis Bergstraße)
  '69483', '69488', '69509', '69517', '69518', // Wald-Michelbach, Birkenau, Mörlenbach, Gorxheimertal, Abtsteinach
])

// PLZ, die trotz hessischem Präfix NICHT in Hessen liegen
const NICHT_HESSEN_TROTZ_PRAEFIX = new Set([
  '34346', '34355', // Hann. Münden, Staufenberg (Niedersachsen)
  '34414', '34431', '34434', '34439', // Warburg, Marsberg, Borgentreich, Willebadessen (NRW)
  '65558', '65582', '65623', '65624', '65626', '65629', // Rhein-Lahn-Kreis (RLP): Holzheim, Diez, Hahnstätten, Altendiez, Birlenbach, Niederneisen
])

// Präfixe, deren PLZ-Gebiete (abzüglich obiger Ausnahmen) in Hessen liegen.
// Bewusst NICHT enthalten: 364xx (Thüringen), 637–639xx (Bayern/Aschaffenburg),
// 37xxx außer 372xx (Niedersachsen), 55/68/69 (nur über Ausnahmeliste).
const HESSEN_PRAEFIXE = [
  '34',                       // Nordhessen (Kassel, Waldeck-Frankenberg, Schwalm-Eder)
  '35',                       // Mittelhessen (Marburg, Gießen, Wetzlar, Lahn-Dill)
  '360', '361', '362', '363', // Osthessen (Fulda, Bad Hersfeld, Schlüchtern)
  '372',                      // Werra-Meißner (Witzenhausen, Eschwege)
  '60',                       // Frankfurt am Main
  '61',                       // Hochtaunus / Wetterau
  '630', '631', '632', '633', '634', '635', '636', // Offenbach, Hanau, Main-Kinzig
  '64',                       // Darmstadt, Bergstraße, Odenwald, Groß-Gerau
  '65',                       // Wiesbaden, Rheingau-Taunus, Main-Taunus, Limburg, Frankfurt-West
]

/**
 * true, wenn die PLZ (nach bestem Wissen) in Hessen liegt.
 * Unbekannte / fehlende / nicht zuordenbare PLZ → false (fail-safe).
 */
export function isHessenPlz(input: string | null | undefined): boolean {
  const plz = normalizePlz(input)
  if (!plz) return false
  if (HESSEN_TROTZ_FREMDEM_PRAEFIX.has(plz)) return true
  if (NICHT_HESSEN_TROTZ_PRAEFIX.has(plz)) return false
  return HESSEN_PRAEFIXE.some(p => plz.startsWith(p))
}

/**
 * Darf diesem Kunden Kassenleistung (kasse/kombi) angeboten werden?
 * Alias mit sprechendem Namen für die Buchungs-UIs.
 */
export function kasseErlaubt(plz: string | null | undefined): boolean {
  return isHessenPlz(plz)
}
