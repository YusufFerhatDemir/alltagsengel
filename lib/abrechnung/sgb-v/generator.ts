/**
 * § 302 SGB V — Datenerzeugung (Block 17): FAIL-CLOSED
 *
 * Dieses Modul erzeugt absichtlich NOCH KEINE Abrechnungsdatei.
 *
 * Warum nicht: der § 302-Datensatz ist in der Technischen Anlage 1 zur
 * Vereinbarung nach § 302 Abs. 2 SGB V spezifiziert — Nachrichtentypen
 * SLGA/SLLA, deren Segmentfolgen, Feldlängen und die zugehörigen
 * Schlüsselverzeichnisse (Leistungserbringergruppenschlüssel, Abrechnungs-
 * positionsnummern, Tarifkennzeichen). Diese Werte liegen derzeit nicht vor.
 *
 * Aus dem Gedächtnis rekonstruierte Segmente wären das schlimmste Ergebnis:
 * die Datei sähe gültig aus, würde den Validator passieren und erst bei der
 * Krankenkasse auffallen — oder dort falsch verarbeitet. Für einen Kanal, über
 * den echte Abrechnungen an Kostenträger gehen, ist „plausibel" nicht gut
 * genug. Deshalb verweigert der Generator die Arbeit, bis die Anlage vorliegt
 * und die Formatversion im Register als spec-bestätigt markiert ist.
 *
 * Dasselbe Muster nutzt das Projekt bereits bei SECON (lib/abrechnung/secon.ts):
 * die Anforderung ist benannt, der Weg vorbereitet, die Ausführung gesperrt.
 *
 * WAS bis dahin nutzbar ist:
 *   - Positionsaufbereitung  → ./positionen.ts   (vollständig, testbar)
 *   - Versionsauflösung      → ./versionen.ts    (vollständig)
 *   - Kassen-Routing         → ./routing.ts      (vollständig)
 *   - Readiness/Blockerliste → ./readiness.ts
 *
 * ZUM FREISCHALTEN (Reihenfolge):
 *   1. Technische Anlage 1 zur § 302-Vereinbarung + Schlüsselverzeichnisse
 *      beschaffen (gkv-datenaustausch.de) und im Repo als Quelle vermerken.
 *   2. Segment-Builder analog zu lib/abrechnung/edifact-segments.ts anlegen
 *      (dort für PLGA/PLAA nach TA1 6.5.1 — dieselbe Struktur, andere Inhalte).
 *   3. Validator analog zu edifact-validator.ts.
 *   4. Formatversion in sgb_v_formatversionen auf spec_bestaetigt = true
 *      setzen, mit spec_quelle (Dokumentname + Stand).
 *   5. erzeugeSgbVDatei() implementieren und die Sperre unten entfernen.
 */

import type { HkpAufbereitung } from './positionen'
import type { SgbVFormat, SgbVFormatVersion } from './versionen'

/**
 * Wird geworfen, wenn ein Export versucht wird, obwohl die Spezifikation
 * fehlt. Eigene Klasse, damit die API-Schicht das von echten Fehlern
 * unterscheiden und als 409/„noch nicht freigeschaltet" beantworten kann.
 */
export class SgbVSpecFehltError extends Error {
  readonly code = 'SGB_V_SPEC_FEHLT'
  readonly format: SgbVFormat
  readonly taVersion: string | null

  constructor(format: SgbVFormat, taVersion: string | null) {
    super(
      `§ 302-Export für Format "${format}"${taVersion ? ` (TA-Version ${taVersion})` : ''} ist gesperrt: ` +
      'die Technische Anlage liegt nicht vor. Segmentstrukturen werden nicht geraten — ' +
      'siehe lib/abrechnung/sgb-v/generator.ts für die Freischaltschritte.'
    )
    this.name = 'SgbVSpecFehltError'
    this.format = format
    this.taVersion = taVersion
  }
}

export interface SgbVErzeugungsParams {
  aufbereitung: HkpAufbereitung
  version: SgbVFormatVersion
  absenderIk: string
  datenannahmestelleIk: string
  abrechnungsmonat: string
  /** '0' = Test, '2' = Produktion — analog zum § 105-Dateiindikator. */
  dateiindikator: '0' | '2'
}

export interface SgbVDatei {
  format: SgbVFormat
  taVersion: string
  logischerDateiname: string
  inhalt: string
  anzahlFaelle: number
  anzahlPositionen: number
  gesamtbetragCent: number
}

/**
 * Erzeugt die § 302-Nutzdatendatei.
 *
 * Derzeit immer eine Sperre — siehe Modul-Kommentar. Die Signatur steht schon
 * so, wie sie nach dem Freischalten gebraucht wird, damit Aufrufer (API,
 * Pipeline, Tests) sich nicht ändern müssen.
 */
export function erzeugeSgbVDatei(params: SgbVErzeugungsParams): SgbVDatei {
  const { version } = params

  // Doppelte Sperre: auch wenn jemand die Version im Register versehentlich auf
  // spec_bestaetigt = true setzt, fehlt hier weiterhin die Implementierung.
  // Der Fehler ist besser als eine leere oder erfundene Datei.
  throw new SgbVSpecFehltError(version.format, version.ta_version)
}

/**
 * Kann für diese Version überhaupt erzeugt werden? Erlaubt der Oberfläche, den
 * Export-Button zu sperren, statt den Nutzer in den Fehler laufen zu lassen.
 */
export function exportImplementiert(_format: SgbVFormat): boolean {
  // Wird true, sobald Schritt 2–3 der Freischaltliste erledigt sind.
  return false
}
