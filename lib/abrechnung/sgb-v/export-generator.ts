/**
 * § 302 SGB V — Prüf-Export (Adapter-Pattern-Quelle für den Transport)
 *
 * WICHTIG: Das hier ist KEIN amtlicher DTA-/EDIFACT-Datensatz. Der bleibt an
 * ./generator.ts (erzeugeSgbVDatei) gesperrt, bis die Technische Anlage 1
 * vorliegt — siehe dort für die Begründung.
 *
 * Dieser Export erzeugt eine menschen- und maschinenlesbare Momentaufnahme
 * eines § 302-Laufs (Fälle, Positionen, Beträge) für:
 *   - interne Prüfung vor Freigabe
 *   - manuelle Übermittlung an eine Kasse als Fallback, solange kein
 *     automatischer Kanal existiert (z. B. Anhang einer E-Mail/eines Briefs)
 *   - Eingabe in ./transport-adapter.ts (Mock-/File-Export-Adapter)
 *
 * Jede Ausgabe trägt sichtbar den Hinweis "KEIN AMTLICHER DATENSATZ", damit
 * niemand sie versehentlich für eine EDIFACT-Übermittlung hält.
 */

import type { HkpAufbereitung, HkpFall } from './positionen'

export const PRUEF_EXPORT_HINWEIS =
  'KEIN AMTLICHER § 302-DATENSATZ — interner Prüf-Export, kein EDIFACT/SLGA-SLLA-Format. ' +
  'Nicht zur automatisierten Übermittlung an Kostenträger geeignet.'

export interface PruefExport {
  hinweis: string
  erzeugtAm: string
  abrechnungsmonat: string
  laufId: string
  anzahlFaelle: number
  anzahlPositionen: number
  gesamtbetragCent: number
  faelle: HkpFall[]
  abgelehnt: HkpAufbereitung['abgelehnt']
}

export function erzeugePruefExport(
  laufId: string,
  abrechnungsmonat: string,
  aufbereitung: HkpAufbereitung,
  erzeugtAm: string,
): PruefExport {
  return {
    hinweis: PRUEF_EXPORT_HINWEIS,
    erzeugtAm,
    abrechnungsmonat,
    laufId,
    anzahlFaelle: aufbereitung.faelle.length,
    anzahlPositionen: aufbereitung.anzahl_positionen,
    gesamtbetragCent: aufbereitung.summe_cent,
    faelle: aufbereitung.faelle,
    abgelehnt: aufbereitung.abgelehnt,
  }
}

export function pruefExportAlsJson(exp: PruefExport): string {
  return JSON.stringify(exp, null, 2)
}

/** CSV-Zeile je Position, für schnelle Sichtprüfung in Tabellenkalkulation. */
export function pruefExportAlsCsv(exp: PruefExport): string {
  const kopf = [
    '# ' + exp.hinweis,
    'kostentraeger_ik;klient_name;versichertennummer;verordnung_nummer;datum;leistungsart;betrag_cent',
  ]
  const zeilen = exp.faelle.flatMap(fall =>
    fall.positionen.map(p => [
      fall.kostentraeger_ik,
      fall.klient_name.replace(/;/g, ','),
      fall.versichertennummer,
      p.verordnung_nummer ?? '',
      p.datum,
      p.leistungsart ?? '',
      String(p.betrag_cent),
    ].join(';')),
  )
  return [...kopf, ...zeilen].join('\n')
}
