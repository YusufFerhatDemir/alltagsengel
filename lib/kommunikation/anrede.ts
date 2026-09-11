/**
 * Anrede und Gruß für Mails an Kundinnen und Kunden.
 *
 * Projektregel (CLAUDE.md, Kundenkommunikation): Begrüßung „Hallo Frau/Herr
 * [Nachname],“, Verabschiedung „Herzliche Grüße — Ihr Team von
 * Alltagsengel“, NIE ein persönlicher Name im Absender.
 *
 * ── WARUM NICHT IMMER „FRAU/HERR“ ─────────────────────────────────────
 * `profiles` führt kein Anrede- oder Geschlechtsfeld (am 11.09.2026 per
 * OpenAPI geprüft: nur first_name/last_name). „Frau“ oder „Herr“ aus dem
 * Vornamen zu raten, spräche Menschen falsch an — schlimmer als eine
 * neutrale Anrede. Dieselbe Entscheidung steht schon in
 * lib/onboarding/notifications.ts („wird NICHT geraten“) und in
 * lib/billing/dunning/mahnung-pdf.ts („Sehr geehrte/r …“).
 *
 * Deshalb:
 *   Anredeform + Nachname bekannt  → „Hallo Frau Müller,“ / „Hallo Herr Müller,“
 *   Vor- und Nachname, keine Form  → „Guten Tag Erika Müller,“
 *   sonst                          → „Guten Tag,“
 * Ein Vorname allein ergibt KEIN „Hallo Erika,“ — die Sie-Form verträgt
 * keine Anrede per Vorname.
 */

export type Anredeform = 'frau' | 'herr' | null | undefined

export interface AnredeEingabe {
  vorname?: string | null
  nachname?: string | null
  anredeform?: Anredeform
}

/** Zeilenumbrüche raus (Header-/Mail-Injection), Länge kappen. */
function sauber(wert: string | null | undefined): string {
  return (wert ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Anrede als Klartext — für HTML vom Aufrufer escapen. */
export function kundenAnrede(e: AnredeEingabe): string {
  const vorname = sauber(e.vorname)
  const nachname = sauber(e.nachname)
  if (nachname && e.anredeform === 'frau') return `Hallo Frau ${nachname},`
  if (nachname && e.anredeform === 'herr') return `Hallo Herr ${nachname},`
  if (nachname && vorname) return `Guten Tag ${vorname} ${nachname},`
  return 'Guten Tag,'
}

/** Verabschiedung als Klartext (zwei Zeilen). */
export const KUNDEN_GRUSS = 'Herzliche Grüße\nIhr Team von Alltagsengel'

/** Verabschiedung als HTML. */
export const KUNDEN_GRUSS_HTML = 'Herzliche Grüße<br>Ihr Team von Alltagsengel'
