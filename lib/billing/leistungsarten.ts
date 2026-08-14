/**
 * Leistungsart-Vokabular — die EINE Brücke zwischen Erfassung und Abrechnung.
 *
 * ── Das Problem, das diese Datei löst ───────────────────────────────────
 * Es gibt live ZWEI Schreibweisen für dieselbe Leistung:
 *
 *   Erfassung   service_records.service_type   'Haushaltshilfe'
 *   Abrechnung  billing_tariffs.leistungsart   'hauswirtschaft'
 *
 * create_invoice_draft_atomic() verbindet beide über
 * `LOWER(bt.leistungsart) = LOWER(sr.service_type)`. Das trägt genau dort,
 * wo die Wörter zufällig identisch sind ('Alltagsbegleitung',
 * 'Demenzbetreuung', 'Sonstige') — und bricht bei allen anderen mit
 * MISSING_VALID_TARIFF, also erst am Ende der Kette, lange nach der
 * Leistungserbringung.
 *
 * Befund vom 14.08.2026: 5 der 8 in den Erfassungsmasken angebotenen
 * Leistungsarten ('Haushaltshilfe', 'Einkaufshilfe', 'Arztbegleitung',
 * 'Betreuung / Gesellschaft', 'Spaziergang / Mobilität') haben live
 * KEINEN Tarif unter diesem Namen. 12 von 30 Leistungsnachweisen waren
 * dadurch nicht abrechenbar, ohne dass es bei der Erfassung auffiel.
 *
 * ── Regel ───────────────────────────────────────────────────────────────
 * Führend ist der Tarif-Schlüssel (billing_tariffs.leistungsart). Jede
 * Erfassungs-Schreibweise wird hier auf ihn abgebildet. Neue Erfassungs-
 * Bezeichnungen gehören in ALIAS, neue Tarifarten in TARIF_LEISTUNGSARTEN
 * — und in beide Fälle zusätzlich in die SQL-Funktion
 * public.tarif_leistungsart() (Migration 20260908000000). Der Test
 * __tests__/billing/leistungsart-mapping.test.ts hält TypeScript und SQL
 * deckungsgleich.
 *
 * Bewusst NICHT abgebildet sind Leistungen, für die es fachlich keinen
 * §45a/Privat-Tarif gibt (z. B. Körperpflege, Medikamentengabe — das sind
 * SGB-V-Leistungen aus leistungspreise). Sie bleiben fail-closed: besser
 * eine klare Absage bei der Erfassung als eine Rechnung zum falschen Satz.
 */

/**
 * Kanonische Tarif-Schlüssel. Muss der Wertemenge von
 * billing_tariffs.leistungsart entsprechen (live 2026-08-14 geprüft).
 */
export const TARIF_LEISTUNGSARTEN = [
  'alltagsbegleitung',
  'begleitservice',
  'betreuung_45a',
  'demenzbetreuung',
  'einkaufsservice',
  'hauswirtschaft',
  'nachtbetreuung',
  'wochenendbetreuung',
  'wegepauschale',
  'sonstige',
] as const

export type TarifLeistungsart = typeof TARIF_LEISTUNGSARTEN[number]

const KANONISCH = new Set<string>(TARIF_LEISTUNGSARTEN)

/**
 * Erfassungs-Schreibweise → Tarif-Schlüssel.
 *
 * Schlüssel sind normalisiert (klein, ohne Leerzeichen um Trennzeichen),
 * damit 'Betreuung / Gesellschaft' und 'Betreuung/Gesellschaft' — beide
 * Varianten existieren in den Masken — dieselbe Zuordnung treffen.
 *
 * Fachliche Zuordnungen:
 *   Haushaltshilfe            → hauswirtschaft   (haushaltsnahe Leistung §45a)
 *   Einkaufshilfe             → einkaufsservice
 *   Arztbegleitung            → begleitservice   (Begleitung außer Haus)
 *   Betreuung / Gesellschaft  → betreuung_45a    (psychosoziale Betreuung)
 *   Spaziergang / Mobilität   → alltagsbegleitung (Begleitung im Alltag)
 */
const ALIAS: Record<string, TarifLeistungsart> = {
  'haushaltshilfe': 'hauswirtschaft',
  'hauswirtschaftliche unterstuetzung': 'hauswirtschaft',
  'einkaufshilfe': 'einkaufsservice',
  'einkaufsbegleitung': 'einkaufsservice',
  'arztbegleitung': 'begleitservice',
  'begleitung': 'begleitservice',
  'betreuung/gesellschaft': 'betreuung_45a',
  'gesellschaft': 'betreuung_45a',
  'betreuung': 'betreuung_45a',
  'spaziergang/mobilitaet': 'alltagsbegleitung',
  'spaziergang': 'alltagsbegleitung',
  'mobilitaet': 'alltagsbegleitung',
}

/**
 * Normalisiert eine Erfassungs-Schreibweise: klein, Umlaute aufgelöst,
 * Leerzeichen um '/' entfernt, Mehrfach-Leerzeichen zusammengezogen.
 *
 * Muss zeichengleich zur SQL-Funktion public.normalisiere_leistungsart()
 * arbeiten — sonst weicht die Vorprüfung bei der Erfassung von der
 * Tarifauflösung in der Rechnung ab.
 */
export function normalisiereLeistungsart(wert: string): string {
  return wert
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Liefert den Tarif-Schlüssel zu einer Erfassungs-Schreibweise,
 * oder null wenn es fachlich keinen gibt.
 *
 * null heißt: diese Leistung ist über billing_tariffs nicht abrechenbar.
 * Der Aufrufer MUSS das als Fehler behandeln und darf nicht auf 'sonstige'
 * ausweichen — 'sonstige' trägt einen eigenen Preis (40,00 €/h) und würde
 * z. B. Körperpflege stillschweigend zum Begleitungssatz abrechnen.
 */
export function tarifLeistungsart(
  serviceType: string | null | undefined,
): TarifLeistungsart | null {
  if (!serviceType) return null
  const n = normalisiereLeistungsart(serviceType)
  if (KANONISCH.has(n)) return n as TarifLeistungsart
  return ALIAS[n] ?? null
}

/** Alle Erfassungs-Schreibweisen, die auflösbar sind — für Fehlermeldungen. */
export function bekannteLeistungsarten(): string[] {
  return [...TARIF_LEISTUNGSARTEN, ...Object.keys(ALIAS)].sort()
}
