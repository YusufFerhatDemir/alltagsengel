// ═══════════════════════════════════════════════════════════════════
// Buchung stornieren (Track A, 31.08.2026)
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND: Die Stornierung war vollstaendig VORGESEHEN und nirgends
// ANGESCHLOSSEN.
//
//   • Der Uebergangs-Trigger `enforce_booking_status_transition`
//     (20260719000100) erlaubt dem Kunden ausdruecklich
//     pending|accepted → cancelled und dem Engel accepted → cancelled.
//   • Die Kunden-Buchungsliste kennt die Beschriftung „Storniert".
//   • Die Warteseite textet „Diese Anfrage wurde storniert."
//
// Geschrieben hat diesen Status im gesamten Anwendungscode NIEMAND. Ein
// Kunde, der eine Anfrage gestellt hatte, konnte sie nicht zuruecknehmen;
// er konnte nur warten, bis der Engel zusagte. Der Zustand war gedacht,
// beschriftet, in der Datenbank erlaubt — und unerreichbar.
//
// ── STORNO IST EINE KETTE, KEIN STATUSFELD ────────────────────────
// Sobald der Engel angenommen hat, hat lib/bookings/einsatz-kette.ts
// bereits zwei weitere Zeilen erzeugt: einen `assignment` (GEPLANT) und
// einen `service_record` (Entwurf). Wer nur `bookings.status` setzt,
// hinterlaesst genau das, was Track A1 beseitigt hat — nur andersherum:
// der Einsatz bliebe auf der Einsatzliste des Engels stehen, und der
// Nachweisentwurf bliebe im Abrechnungsweg. Der Engel faehrt zu einem
// abgesagten Termin, und der Entwurf wird spaeter mitabgerechnet.
//
// Deshalb entscheidet diese Datei ZUERST ueber die ganze Kette und
// schreibt erst danach — fail-closed. Ist ein Glied nicht stornierbar,
// wird nichts angefasst.
//
// ── WAS HIER BEWUSST NICHT ENTSCHIEDEN WIRD ───────────────────────
// Keine Stornofrist und keine Ausfallgebuehr. Beides sind
// Geschaeftsentscheidungen (AGB, Vertrag), keine technischen. `pruefeFrist`
// unten ist die vorgesehene Stelle dafuer und laesst heute jede Frist
// durch; eine erfundene 24-Stunden-Regel waere schlimmer als keine, weil
// sie wie eine vereinbarte aussaehe.

import { UserFacingError } from '@/lib/api/user-facing-error'
import { assertStornierbar, type NachweisZustand } from '@/lib/leistungsnachweis/nachweis-regeln'

/** Buchungsstatus, aus denen heraus ueberhaupt storniert werden kann. */
export const STORNIERBARE_BUCHUNGSSTATUS = ['pending', 'accepted'] as const

/**
 * Einsatzstatus, aus denen heraus der Einsatz noch abgesagt werden kann.
 *
 * Erlaubnisliste, nicht Sperrliste: ein Status, den diese Datei nicht
 * kennt, ist nicht stornierbar. Die umgekehrte Richtung liesse jeden neu
 * eingefuehrten Zustand stillschweigend durch — an einem Weg, an dem
 * Geleistetes zurueckgenommen wird, ist das die falsche Voreinstellung.
 */
export const ABSAGBARE_EINSATZSTATUS = ['GEPLANT', 'BESTAETIGT', 'active'] as const

/** Einsatzstatus, die belegen, dass bereits gearbeitet wurde. */
export const ANGEFANGENE_EINSATZSTATUS = ['UNTERWEGS', 'GESTARTET', 'BEENDET'] as const

/** Wer den Storno ausloest — bestimmt, welche Uebergaenge erlaubt sind. */
export type StornoRolle = 'kunde' | 'engel' | 'admin'

export interface StornoLage {
  buchungsStatus: string | null
  /** Fehlt, wenn die Buchung nie angenommen wurde — dann gibt es keine Kette. */
  einsatzStatus?: string | null
  nachweis?: NachweisZustand | null
}

/**
 * Prueft, ob die gesamte Kette storniert werden darf — und wirft mit
 * Klartext, wenn nicht.
 *
 * Rein und ohne Datenbank, damit jede Regel einzeln pruefbar ist. Der
 * Aufrufer laedt die Lage, ruft diese Funktion, und schreibt erst danach.
 */
export function assertBuchungStornierbar(lage: StornoLage, rolle: StornoRolle): void {
  const status = (lage.buchungsStatus ?? '').trim()

  if (status === 'cancelled') {
    throw new UserFacingError('Diese Buchung ist bereits storniert.', 409)
  }
  if (!(STORNIERBARE_BUCHUNGSSTATUS as readonly string[]).includes(status)) {
    throw new UserFacingError(
      status === 'completed'
        ? 'Dieser Termin ist bereits abgeschlossen und kann nicht mehr storniert werden.'
        : status === 'declined'
          ? 'Diese Anfrage wurde bereits abgelehnt.'
          : 'Diese Buchung kann in ihrem aktuellen Zustand nicht storniert werden.',
      409,
    )
  }

  // Der Engel beantwortet eine offene Anfrage mit „ablehnen", nicht mit
  // „stornieren" — sonst gaebe es zwei Wege in zwei verschiedene Zustaende
  // fuer dieselbe Handlung, und die Absage-Nachricht an den Kunden
  // haengt am Ablehnen-Weg.
  if (rolle === 'engel' && status === 'pending') {
    throw new UserFacingError(
      'Eine offene Anfrage wird abgelehnt, nicht storniert.',
      409,
    )
  }

  const einsatz = (lage.einsatzStatus ?? '').trim()
  if (einsatz) {
    if ((ANGEFANGENE_EINSATZSTATUS as readonly string[]).includes(einsatz)) {
      throw new UserFacingError(
        'Der Einsatz hat bereits begonnen und kann nicht mehr storniert werden. '
        + 'Bitte wenden Sie sich an Alltagsengel.',
        409,
      )
    }
    if (!(ABSAGBARE_EINSATZSTATUS as readonly string[]).includes(einsatz)) {
      throw new UserFacingError(
        `Der zugehörige Einsatz steht im Status „${einsatz}" und kann nicht abgesagt werden.`,
        409,
      )
    }
  }

  // Dieselbe Regel wie beim Storno von Hand (/api/leistungsnachweis/crud).
  // Zwei Fassungen davon waeren genau die Drift, an der ein Nachweis auf
  // einem Weg storniert wird, den der andere verbietet.
  if (lage.nachweis) assertStornierbar(lage.nachweis)
}

/**
 * Stornofrist. Heute ohne Wirkung — die Stelle ist benannt, damit eine
 * spaetere Frist EINEN Ort hat und nicht in die Route gestreut wird.
 *
 * Bewusst nicht erfunden: welche Frist gilt und ob eine Ausfallgebuehr
 * anfaellt, steht im Vertrag, nicht im Code.
 */
export function pruefeFrist(_terminIso: string, _jetzt: Date = new Date()): void {
  // BUSINESS_INPUT: Frist und Gebuehr sind vertraglich zu klaeren.
}

/** Darf diese Rolle diese Buchung ueberhaupt anfassen? */
export function darfStornieren(
  rolle: StornoRolle,
  buchung: { customer_id: string | null; angel_id: string | null },
  benutzerId: string,
): boolean {
  if (rolle === 'admin') return true
  if (rolle === 'kunde') return buchung.customer_id === benutzerId
  if (rolle === 'engel') return buchung.angel_id === benutzerId
  return false
}

/**
 * Leitet die Rolle aus der Buchung ab. Admin gewinnt, damit eine
 * Nachsteuerung nicht daran scheitert, dass der Admin zufaellig auch
 * Kunde ist.
 */
export function rolleAusBuchung(
  buchung: { customer_id: string | null; angel_id: string | null },
  benutzerId: string,
  istAdmin: boolean,
): StornoRolle | null {
  if (istAdmin) return 'admin'
  if (buchung.customer_id === benutzerId) return 'kunde'
  if (buchung.angel_id === benutzerId) return 'engel'
  return null
}
