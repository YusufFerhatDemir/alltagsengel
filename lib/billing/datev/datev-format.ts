/**
 * DATEV CSV-Format — Buchungsstapel (Format 510/520)
 *
 * Generiert DATEV-kompatible CSV-Dateien nach der offiziellen Spezifikation.
 * Encoding: Windows-1252 (ANSI), Feldtrenner: Semikolon,
 * Dezimaltrenner: Komma, Datumsformat: TTMM (4-stellig).
 */

import { berlinParts } from '@/lib/utils/timezone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DatevHeaderParams {
  /** Beraternummer (vom Steuerberater, max. 7 Stellen) */
  beraternummer: string;
  /** Mandantennummer (max. 5 Stellen) */
  mandantennummer: string;
  /** WJ-Beginn im Format YYYYMMDD */
  wjBeginn: string;
  /** Sachkontenlänge (4 oder 5) */
  sachkontenlaenge: number;
  /** Buchungszeitraum Von (YYYYMMDD) */
  datumVon: string;
  /** Buchungszeitraum Bis (YYYYMMDD) */
  datumBis: string;
  /** Kürzel des Erzeugers, z.B. "AE" für Alltagsengel */
  erzeugerKuerzel?: string;
}

export interface DatevBuchungssatz {
  /** Betrag in EUR (positiv, mit max. 2 Nachkommastellen) */
  umsatz: number;
  /** S = Soll, H = Haben */
  sollHaben: 'S' | 'H';
  /** Sachkonto oder Debitorenkonto */
  konto: string;
  /** Gegenkonto */
  gegenkonto: string;
  /** Belegdatum im Format TTMM */
  belegdatum: string;
  /** Belegnummer (= Rechnungsnummer) */
  belegnummer: string;
  /** Buchungstext (max. 60 Zeichen) */
  buchungstext: string;
  /** USt-Schluessel: 0 = steuerfrei, 3 = 19% */
  ustSchluessel?: number;
  /** Storno-Kennzeichen */
  storno?: boolean;
  /** KOST1 (Kostenstelle) */
  kost1?: string;
  /** KOST2 (Kostentraeger) */
  kost2?: string;
  /** EU-Land (ISO 2-Letter) */
  euLand?: string;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Formatiert ein Datum (YYYY-MM-DD oder Date) als TTMM (4-stellig, kein Punkt).
 */
export function formatDatevDatum(datum: string | Date): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  const p = berlinParts(d);
  return `${p.day}${p.month}`;
}

/**
 * Formatiert ein Datum als YYYYMMDDHHMMSS000.
 */
function formatErzeugtDatum(): string {
  const p = berlinParts(new Date());
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}000`;
}

/**
 * Formatiert einen Betrag nach DATEV-Konvention: Komma als Dezimaltrenner, 2 Nachkommastellen.
 */
export function formatDatevBetrag(betrag: number): string {
  return betrag.toFixed(2).replace('.', ',');
}

/**
 * Escaped ein Textfeld fuer DATEV-CSV: in Anfuehrungszeichen, innere
 * Anfuehrungszeichen verdoppeln.
 *
 * ZWEI FEHLER, DIE HIER FRUEHER DRINSTECKTEN:
 *
 * 1. Gekuerzt wurde NACH dem Verdoppeln. Ein Wert, dessen verdoppeltes
 *    Anfuehrungszeichen-Paar genau auf der Grenze 60 lag, wurde mittendrin
 *    zerschnitten — uebrig blieb ein einzelnes `"`, das das Feld vorzeitig
 *    beendet und die restliche Zeile in die falschen Spalten schiebt. Ein
 *    Klientenname aus einem Kundenformular reicht dafuer aus. Jetzt wird
 *    erst gekuerzt, dann verdoppelt.
 *
 * 2. Kein Formel-Riegel. Ein Feld, das mit = + - @ beginnt, ist beim
 *    Oeffnen in Excel eine FORMEL, keine Zeichenkette (CSV-Injection). Der
 *    Buchungstext traegt heute ein festes Praefix ("Rechnung …") und ist
 *    damit zufaellig geschuetzt — KOST1/KOST2 und die Belegnummer nicht.
 *    Auf Zufall darf das nicht beruhen. Gleiche Entschaerfung wie in
 *    lib/utils/csv.ts: fuehrender Apostroph.
 *
 * Die Zeichenkette darf nach dem Verdoppeln laenger als 60 werden — das ist
 * richtig so: DATEV zaehlt die Nutzzeichen, nicht die Escape-Zeichen.
 */
function escapeText(text: string): string {
  const gekuerzt = text.substring(0, 60);
  const entschaerft = /^[=+\-@]/.test(gekuerzt) ? `'${gekuerzt}` : gekuerzt;
  return `"${entschaerft.replace(/"/g, '""')}"`;
}

/**
 * Kuerzt einen String auf maximal n Zeichen, ohne Sonderzeichen fuer Windows-1252.
 */
function sanitize(text: string, maxLen = 60): string {
  // Ersetze typische Problemzeichen
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .substring(0, maxLen);
}

// ---------------------------------------------------------------------------
// DATEV-CSV Generator
// ---------------------------------------------------------------------------

/**
 * Generiert die DATEV-Header-Zeile (Zeile 1 des Buchungsstapels).
 */
export function generateDatevHeader(params: DatevHeaderParams): string {
  const {
    beraternummer,
    mandantennummer,
    wjBeginn,
    sachkontenlaenge,
    datumVon,
    datumBis,
    erzeugerKuerzel = 'AE',
  } = params;

  const erzeugtDatum = formatErzeugtDatum();

  // Format 510 Header:
  // "EXTF";510;21;"Buchungsstapel";12;ErzeugtDatum;;"";"";"Kuerzel";"Mandantennummer";WJBeginn;Sachkontenlaenge;DatumVon;DatumBis;"";"";"";"";
  const fields = [
    '"EXTF"',       // Kennzeichen
    '510',          // Versionsnummer
    '21',           // Formatkategorie (Buchungsstapel)
    '"Buchungsstapel"', // Formatname
    '12',           // Formatversion
    erzeugtDatum,   // Erzeugt-Datum
    '',             // reserviert
    `"${escapeInner(beraternummer)}"`, // Beraternummer
    `"${escapeInner(mandantennummer)}"`, // Mandantennummer
    `"${escapeInner(erzeugerKuerzel)}"`, // Herkunfts-Kennzeichen
    `"${escapeInner(beraternummer)}"`,   // Exportiert von
    wjBeginn,       // WJ-Beginn (YYYYMMDD)
    String(sachkontenlaenge), // Sachkontenlänge
    datumVon,       // Datum von (YYYYMMDD)
    datumBis,       // Datum bis (YYYYMMDD)
    '""',           // Bezeichnung
    '""',           // Diktatkürzel
    '""',           // reserviert
    '""',           // reserviert
  ];

  return fields.join(';');
}

function escapeInner(s: string): string {
  // Auch die Kopfzeilen-Felder (Berater-/Mandantennummer, Erzeugerkuerzel)
  // stammen aus einer Eingabemaske und landen in derselben Excel-Zelle.
  const entschaerft = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return entschaerft.replace(/"/g, '""');
}

/**
 * Generiert die Beschriftungszeile (Zeile 2).
 */
export function generateDatevBeschriftung(): string {
  const felder = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel',
    'Belegdatum',
    'Belegfeld 1',
    'Buchungstext',
    'Generalumkehr (Storno)',
    'Kost1 - Kostenstelle',
    'Kost2 - Kostenträger',
    'EU-Land u. UStID',
  ];
  return felder.map(f => `"${f}"`).join(';');
}

/**
 * Generiert eine Buchungszeile.
 */
export function generateDatevBuchungszeile(bs: DatevBuchungssatz): string {
  const fields = [
    formatDatevBetrag(bs.umsatz),           // Umsatz
    `"${bs.sollHaben}"`,                    // S/H
    `"${bs.konto}"`,                        // Konto
    `"${bs.gegenkonto}"`,                   // Gegenkonto
    bs.ustSchluessel !== undefined ? String(bs.ustSchluessel) : '', // BU-Schluessel
    bs.belegdatum,                          // Belegdatum TTMM
    escapeText(sanitize(bs.belegnummer, 36)), // Belegfeld 1
    escapeText(sanitize(bs.buchungstext)),   // Buchungstext
    bs.storno ? '1' : '',                   // Generalumkehr
    bs.kost1 ? escapeText(bs.kost1) : '',   // KOST1
    bs.kost2 ? escapeText(bs.kost2) : '',   // KOST2
    bs.euLand ? `"${bs.euLand}"` : '',      // EU-Land
  ];
  return fields.join(';');
}

/**
 * Erzeugt die komplette DATEV-CSV-Datei als String (Windows-1252-kompatibel).
 *
 * Hinweis: Die tatsächliche Windows-1252-Konvertierung geschieht beim
 * Herunterladen (Buffer-Konvertierung im Export-Service).
 */
export function generateDatevCsv(
  header: DatevHeaderParams,
  buchungen: DatevBuchungssatz[],
): string {
  const lines: string[] = [];

  // Zeile 1: Header
  lines.push(generateDatevHeader(header));

  // Zeile 2: Beschriftung
  lines.push(generateDatevBeschriftung());

  // Zeile 3+: Buchungssätze
  for (const bs of buchungen) {
    lines.push(generateDatevBuchungszeile(bs));
  }

  // DATEV erwartet \r\n (Windows-Zeilenende)
  return lines.join('\r\n') + '\r\n';
}
