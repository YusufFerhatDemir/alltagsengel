/**
 * Die Leistungen, die im Kundenablauf zur Auswahl stehen.
 *
 * ── DIE WERTE SIND TARIF-SCHLÜSSEL, KEINE WÖRTER ───────────────────────
 * Gespeichert wird `hauswirtschaft`, nicht „Haushalt". Das ist der
 * kanonische Schlüssel aus lib/billing/leistungsarten.ts, an dem später
 * die Abrechnung hängt.
 *
 * Der Grund steht im Bestand: Erfassung und Abrechnung führten dieselbe
 * Leistung unter zwei Namen (`service_type` als Klartext,
 * `leistungsart` als Schlüssel). Fünf von acht angebotenen Leistungen
 * hatten unter ihrem Erfassungsnamen gar keinen Tarif — auffallen tat das
 * erst am Ende der Kette, bei der Rechnung. Wer hier Wörter sammelt,
 * baut denselben Bruch neu.
 */

import { TARIF_LEISTUNGSARTEN, type TarifLeistungsart } from '@/lib/billing/leistungsarten'
import type { Option } from '@/components/onboarding/Auswahl'

export interface LeistungsOption extends Option {
  wert: TarifLeistungsart
}

export const LEISTUNGEN: readonly LeistungsOption[] = [
  { wert: 'hauswirtschaft', label: 'Haushalt und Wäsche', hinweis: 'Putzen, Waschen, Aufräumen' },
  { wert: 'einkaufsservice', label: 'Einkaufen und Besorgungen', hinweis: 'Auch Apotheke und Post' },
  { wert: 'begleitservice', label: 'Begleitung zu Terminen', hinweis: 'Arzt, Behörde, Friseur' },
  { wert: 'alltagsbegleitung', label: 'Spaziergänge und Ausflüge', hinweis: 'Draußen unterwegs sein' },
  { wert: 'betreuung_45a', label: 'Gesellschaft und Gespräche', hinweis: 'Vorlesen, Spielen, Zuhören' },
  { wert: 'demenzbetreuung', label: 'Betreuung bei Demenz', hinweis: 'Von geschulten Begleitpersonen' },
  { wert: 'nachtbetreuung', label: 'Nachtbetreuung' },
  { wert: 'wochenendbetreuung', label: 'Betreuung am Wochenende' },
  { wert: 'sonstige', label: 'Etwas anderes', hinweis: 'Sagen Sie uns im nächsten Schritt, was Sie brauchen.' },
]

/** Klartext zu einem Schlüssel — für Zusammenfassung und Anfrage. */
export function leistungLabel(schluessel: string): string {
  return LEISTUNGEN.find(l => l.wert === schluessel)?.label ?? schluessel
}

/**
 * Jeder angebotene Wert MUSS ein bekannter Tarif-Schlüssel sein.
 * Als Funktion und nicht als Kommentar, damit der Test es prüfen kann.
 */
export function unbekannteLeistungen(): string[] {
  const bekannt = new Set<string>(TARIF_LEISTUNGSARTEN)
  return LEISTUNGEN.map(l => l.wert).filter(w => !bekannt.has(w))
}
