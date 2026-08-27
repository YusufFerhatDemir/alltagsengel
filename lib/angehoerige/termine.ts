// ═══════════════════════════════════════════════════════════════
// Angehörigenportal — Termine
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026): Das Portal las die Termine eines Klienten aus
// `bookings` und filterte mit `.in('customer_id', <clients.id>)`.
// `bookings` ist aber die Tabelle der öffentlichen Web-Buchungen und
// hat per Fremdschlüssel überhaupt keine Verbindung zu `clients`:
//
//   bookings_customer_id_fkey        -> profiles(id)
//   bookings_care_recipient_id_fkey  -> care_recipients(id)
//   bookings_angel_id_fkey           -> angels(id)
//
// Der Filter vergleicht damit zwei getrennte ID-Räume und kann per
// Schema nie treffen — live am 27.08.2026 gegengeprüft: von 10
// Buchungen trifft keine einzige eine `clients.id` (und auch keine
// `clients.user_id`, denn die ist bei allen Klienten NULL). Die
// Terminseite des Portals war damit dauerhaft leer, ohne Fehlermeldung.
//
// Die Termine eines Klienten stehen in `assignments` — daran hängen
// Tourenplanung, Kalender, Engel-App und Leistungsnachweis. Dort gibt
// es `client_id` und `organization_id`, der Filter ist also derselbe
// wie im Rest des Systems.

/**
 * Statuswerte aus `assignments_status_check`, die einen Termin als
 * offen/anstehend ausweisen.
 *
 * Bewusst eine Erlaubnisliste: eine Sperrliste würde jeden künftig
 * ergänzten Statuswert stillschweigend als „steht an" mitzählen — und
 * ein abgesagter Termin, der dem Angehörigen weiter angekündigt wird,
 * ist genau der Fehler, den niemand bemerkt. `BEENDET`, `STORNIERT`,
 * `NO_SHOW` und `cancelled` fehlen deshalb absichtlich.
 */
export const OFFENE_TERMIN_STATUS = [
  'active',
  'GEPLANT',
  'BESTAETIGT',
  'UNTERWEGS',
  'GESTARTET',
] as const

/** Alle Statuswerte, die das Portal überhaupt anzeigt (auch vergangene). */
export const SICHTBARE_TERMIN_STATUS = [
  ...OFFENE_TERMIN_STATUS,
  'BEENDET',
  'STORNIERT',
  'NO_SHOW',
] as const

/** Spaltenliste für die Terminabfrage — bewusst ohne `notes`. */
export const TERMIN_SPALTEN =
  'id, client_id, assignment_date, start_time, end_time, service_type, status'

export interface AssignmentZeile {
  id: string
  client_id: string
  assignment_date: string | null
  start_time: string | null
  end_time: string | null
  service_type: string | null
  status: string | null
}

export interface PortalTermin {
  id: string
  client_id: string
  client_name: string
  datum: string | null
  von: string | null
  bis: string | null
  leistungsart: string | null
  status: string | null
}

/**
 * Formt einen Einsatz in die Termin-Darstellung des Portals.
 *
 * `notes` des Einsatzes wird bewusst NICHT übernommen: dort stehen
 * interne Dispositionshinweise, die zum Bereich „Termine" nicht
 * freigegeben sind.
 */
export function zuPortalTermin(a: AssignmentZeile, clientName: string): PortalTermin {
  return {
    id: a.id,
    client_id: a.client_id,
    client_name: clientName,
    datum: a.assignment_date ?? null,
    von: a.start_time ?? null,
    bis: a.end_time ?? null,
    leistungsart: a.service_type ?? null,
    status: a.status ?? null,
  }
}
