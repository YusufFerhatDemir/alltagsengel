// ═══════════════════════════════════════════════════════════
// KUNDENSTAMMDATEN — Whitelist + Prüfung
// ═══════════════════════════════════════════════════════════
// Liegt bewusst in lib/ und nicht in der route.ts: ein Nicht-Handler-
// Export aus einer route.ts lässt `next build` erst nach dem grünen
// Compile fehlschlagen (siehe docs/, Vercel-Route-Export-Typecheck).
// ═══════════════════════════════════════════════════════════

/**
 * Felder, die über die "Gesundheitsdaten & Notfallkontakte"-Sektion
 * (app/admin/clients/[id]/page.tsx, HealthSection) editierbar sind.
 */
export const HEALTH_FIELDS = [
  'allergies', 'medications', 'mobility_status', 'dietary_restrictions', 'medical_conditions',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
  'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_email', 'next_of_kin_relationship',
  'hausarzt_name', 'hausarzt_phone',
  'versichertennummer', 'pflegekasse_name', 'pflegekasse_ik',
] as const

/**
 * Kontaktstammdaten. Bis dahin waren Name, Adresse, Telefon, E-Mail und
 * Geburtsdatum nach der Anlage über keine Oberfläche mehr änderbar — ein
 * Umzug oder eine Namensänderung war schlicht nicht abbildbar
 * (docs/FUNKTIONALE_LUECKENANALYSE.md, Bereich 1).
 *
 * Bewusst NICHT hier: `status`/`pipeline_status` (eigener fachlicher Weg,
 * PATCH /api/admin/clients/[id]/status), `care_level`/`pflegegrad`
 * (PATCH .../pflegegrad), `customer_number` und `organization_id`.
 */
export const STAMMDATEN_FIELDS = [
  'first_name', 'last_name', 'date_of_birth',
  'address', 'zip_code', 'city', 'phone', 'email',
] as const

export const ALLOWED_CLIENT_FIELDS = [...STAMMDATEN_FIELDS, ...HEALTH_FIELDS] as const

export const STAMMDATEN_SET: ReadonlySet<string> = new Set<string>(STAMMDATEN_FIELDS)

export const MOBILITY_VALUES = ['mobil', 'eingeschraenkt', 'rollstuhl', 'bettlaegerig']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/
const PLZ_RE = /^\d{5}$/

/** Leerer/fehlender Wert? (undefined, null oder nur Leerzeichen) */
function leer(wert: unknown): boolean {
  return wert === undefined || wert === null || String(wert).trim() === ''
}

/**
 * Prüft die Kontaktstammdaten. Gibt die erste Fehlermeldung zurück oder
 * null, wenn alles passt. Bewusst fail-closed: ein unbekanntes Format
 * wird abgewiesen, statt es in die Datenbank durchzureichen.
 *
 * @param heute Vergleichsdatum für die Zukunftsprüfung (Test-Hook).
 */
export function pruefeStammdaten(
  body: Record<string, unknown>,
  heute: string = new Date().toISOString().slice(0, 10),
): string | null {
  for (const feld of ['first_name', 'last_name'] as const) {
    if (!(feld in body)) continue
    const wert = body[feld]
    if (typeof wert !== 'string' || wert.trim() === '') {
      return 'Vor- und Nachname dürfen nicht leer sein.'
    }
  }

  if (!leer(body.email) && !EMAIL_RE.test(String(body.email).trim())) {
    return 'E-Mail-Adresse ist ungültig.'
  }

  if (!leer(body.date_of_birth)) {
    const dob = String(body.date_of_birth).trim()
    if (!DATUM_RE.test(dob)) {
      return 'Geburtsdatum muss im Format JJJJ-MM-TT sein.'
    }
    // Ein Geburtsdatum in der Zukunft ist immer ein Tippfehler und würde
    // die Altersberechnung in Auswertungen und PDFs verfälschen.
    if (dob > heute) {
      return 'Geburtsdatum darf nicht in der Zukunft liegen.'
    }
  }

  if (!leer(body.zip_code) && !PLZ_RE.test(String(body.zip_code).trim())) {
    return 'Postleitzahl muss aus 5 Ziffern bestehen.'
  }

  if (
    !leer(body.mobility_status) &&
    !MOBILITY_VALUES.includes(String(body.mobility_status))
  ) {
    return 'Ungültiger Wert für Mobilität.'
  }

  if (!leer(body.next_of_kin_email) && !EMAIL_RE.test(String(body.next_of_kin_email).trim())) {
    return 'E-Mail-Adresse des Angehörigen ist ungültig.'
  }

  return null
}
