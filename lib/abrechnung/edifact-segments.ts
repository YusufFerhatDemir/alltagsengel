// ═══════════════════════════════════════════════════════════════
// EDIFACT-Segment-Builder für die Abrechnung nach § 105 Abs. 2 SGB XI
// (Pflege, Teilprojekt 6) — Quelle: Technische Anlage 1, Version 6.5.1
// (gkv-datenaustausch.de, TA1_6.5.1_20260625.pdf) sowie TA3 6.5.0
// (Schlüsselverzeichnisse).
//
// Nachrichtentypen:
//   PLGA (Version 6) = Gesamtaufstellung der Abrechnung (Rechnung)
//        Segmente: FKT, REC, SRD, UST, GES, NAM
//   PLAA (Version 6) = Abrechnungsdaten je Abrechnungsfall
//        Segmente: FKT, REC, INV, NAD, MAN, ESK, ELS, ZUS, HIL, IAF
//
// WICHTIG: Es gibt in TP6 KEINE Segmente "EHG" oder "ENT" — das echte
// Format arbeitet mit MAN (Monatskopf), ESK (Einsatzkopf), ELS
// (Einzelleistung) und IAF (Abrechnungsfall-Ende).
//
// Zahlenformate laut TA1: Beträge mit KOMMA als Dezimaltrennzeichen
// ("9999999999,99"), Datum JJJJMMTT, Uhrzeit hhmm.
// ═══════════════════════════════════════════════════════════════

/** Trennzeichen laut UNA-Segment: Komponententrenner ':', Elementtrenner '+',
 *  Dezimalzeichen '.', Freigabezeichen '?', Segmentende "'" */
import { berlinParts } from '@/lib/utils/timezone'

export const SEGMENT_TERMINATOR = "'"

/** Freigabezeichen: Sonderzeichen in Textfeldern müssen mit '?' maskiert werden. */
export function esc(text: string): string {
  return text.replace(/\?/g, '??').replace(/'/g, "?'").replace(/\+/g, '?+').replace(/:/g, '?:')
}

/** Betrag in Cent → EDIFACT-Betragsformat mit Komma ("123,45"). */
export function betrag(cent: number): string {
  const euro = Math.trunc(Math.abs(cent) / 100)
  const rest = Math.abs(cent) % 100
  const sign = cent < 0 ? '-' : ''
  return `${sign}${euro},${String(rest).padStart(2, '0')}`
}

/** Menge mit 2 Nachkommastellen ("1,00" / "2,50") — Form 9999,99. */
export function menge(wert: number): string {
  return wert.toFixed(2).replace('.', ',')
}

/** Datum als JJJJMMTT (aus ISO-String "YYYY-MM-DD" oder Date). */
export function datumJJJJMMTT(d: string | Date): string {
  if (d instanceof Date) {
    const p = berlinParts(d)
    return `${p.year}${p.month}${p.day}`
  }
  return d.replace(/-/g, '').slice(0, 8)
}

// ── Service-Segmente ────────────────────────────────────────────

/** UNA — Service String Advice (Trennzeichen-Definition). */
export function UNA(): string {
  return "UNA:+.? '"
}

/**
 * UNB — Kopfsegment der Nutzdatendatei.
 * Syntax UNOC:3 | Absender-IK | Empfänger-IK (Datenannahmestelle mit
 * Entschlüsselungsbefugnis) | Erstelldatum JJJJMMTT:hhmm | fortlaufende
 * Datenaustauschreferenz | (leer, Passwort entfällt) | Anwendungsreferenz
 * (logischer Dateiname, 11 Stellen, s. Anhang 3 Abschnitt 2.2.1) |
 * Dateiindikator (0=Test, 1=Erprobung, 2=Echtdatei)
 */
export function UNB(
  absenderIK: string,
  empfaengerIK: string,
  erstelldatum: Date,
  datenaustauschreferenz: number,
  anwendungsreferenz: string,
  // Fail-closed: ohne Angabe Testdatei. Eine Echtdatei entsteht nur, wenn
  // der Aufrufer '2' ausdrücklich übergibt.
  dateiindikator: '0' | '1' | '2' = '0',
): string {
  const datum = datumJJJJMMTT(erstelldatum)
  const bp = berlinParts(erstelldatum)
  const zeit = `${bp.hour}${bp.minute}`
  return `UNB+UNOC:3+${absenderIK}+${empfaengerIK}+${datum}:${zeit}+${String(datenaustauschreferenz).padStart(5, '0')}++${anwendungsreferenz}+${dateiindikator}'`
}

/** UNZ — Endesegment der Nutzdatendatei (Anzahl UNH-Segmente + Referenz wie UNB). */
export function UNZ(anzahlNachrichten: number, datenaustauschreferenz: number): string {
  return `UNZ+${anzahlNachrichten}+${String(datenaustauschreferenz).padStart(5, '0')}'`
}

/**
 * UNH — Nachrichtenkopfsegment.
 * Referenz = fortlaufende Nummer der UNH zwischen UNB und UNZ (beginnend 1).
 * Version: aktuell gültig PLGA 6 / PLAA 6 (gültig ab 01.09.2024, s. TA1 4.4).
 */
export function UNH(referenz: number, typ: 'PLGA' | 'PLAA', version: number = 6): string {
  return `UNH+${referenz}+${typ}:${version}'`
}

/** UNT — Nachrichtenendesegment (Anzahl Segmente inkl. UNH+UNT, Referenz wie UNH). */
export function UNT(anzahlSegmente: number, referenz: number): string {
  return `UNT+${anzahlSegmente}+${referenz}'`
}

// ── Nutzsegmente PLGA ───────────────────────────────────────────

/**
 * FKT (PLGA) — Funktionssegment der Gesamtaufstellung.
 * Verarbeitungskennzeichen (01=Abrechnung ohne Besonderheiten) |
 * Sammelrechnungskennzeichen ("J" nur bei Sammelrechnung, sonst leer) |
 * IK Rechnungssteller/Leistungserbringer | IK Kostenträger |
 * IK Pflegekasse (beginnt mit "18") | IK Absender der Datei
 */
export function FKT_PLGA(
  verarbeitungskennzeichen: string,
  leistungserbringerIK: string,
  kostentraegerIK: string,
  pflegekasseIK: string,
  absenderIK: string,
  sammelrechnung: boolean = false,
): string {
  return `FKT+${verarbeitungskennzeichen}+${sammelrechnung ? 'J' : ''}+${leistungserbringerIK}+${kostentraegerIK}+${pflegekasseIK}+${absenderIK}'`
}

/**
 * FKT (PLAA) — Funktionssegment der Abrechnungsdaten.
 * ACHTUNG: anders als in PLGA gibt es hier KEIN Sammelrechnungsfeld.
 * Verarbeitungskennzeichen | IK Leistungserbringer | IK Kostenträger |
 * IK Pflegekasse | IK Rechnungssteller
 */
export function FKT_PLAA(
  verarbeitungskennzeichen: string,
  leistungserbringerIK: string,
  kostentraegerIK: string,
  pflegekasseIK: string,
  rechnungsstellerIK: string,
): string {
  return `FKT+${verarbeitungskennzeichen}+${leistungserbringerIK}+${kostentraegerIK}+${pflegekasseIK}+${rechnungsstellerIK}'`
}

/**
 * REC — Rechnung/Zahlung (identisch in PLGA und zugehöriger PLAA).
 * Rechnungsnummer als Gruppe "Sammelrechnungsnr:Einzelrechnungsnr" — beim
 * Selbstabrechner steht die eigene Rechnungsnummer im ersten Teil, der
 * zweite Teil ist "0" (z. B. "4711:0").
 * Zulässige Zeichen der Rechnungsnummer: Buchstaben, Ziffern, "-" und "/".
 * Rechnungsart laut TA3 2.1 (1 = Abrechnung vom LE, Zahlung an IK des LE).
 */
export function REC(
  rechnungsnummer: string,
  einzelrechnungsnummer: string,
  rechnungsdatum: string | Date,
  rechnungsart: '1' | '2' | '3' = '1',
  waehrung: string = 'EUR',
): string {
  return `REC+${esc(rechnungsnummer)}:${esc(einzelrechnungsnummer)}+${datumJJJJMMTT(rechnungsdatum)}+${rechnungsart}+${waehrung}'`
}

/**
 * SRD — Rechnungsdaten (nur PLGA).
 * Leistungserbringergruppe = Abrechnungscode (TA3 2.2.1) + ":" +
 * Tarifkennzeichen (TA3 2.2.2, 5 Stellen: 2 Tarifbereich + 3 Sondertarif) |
 * Leistungsart (TA3 2.4, z. B. 01=ambulante Pflege, 10=Entlastungsleistungen §45b).
 * Je PLGA nur EINE Leistungsart — bei Wechsel neue Abrechnung.
 */
export function SRD(abrechnungscode: string, tarifkennzeichen: string, leistungsart: string): string {
  return `SRD+${abrechnungscode}:${tarifkennzeichen}+${leistungsart}'`
}

/**
 * UST — Umsatzsteuer-Kennzeichen (nur PLGA, nicht bei Sammelrechnung).
 * Ordnungsnummer (USt-ID inkl. Länderschlüssel, nur bei USt-Pflicht) |
 * Kennung "J" wenn befreit | Grund der Befreiung (TA3 2.13,
 * 01 = Befreiung nach § 4 Nr. 16 UStG — Pflege-/Betreuungsleistungen).
 */
export function UST(ustBefreit: boolean = true, ordnungsnummer: string = '', grund: string = '01'): string {
  if (ustBefreit) return `UST+${esc(ordnungsnummer)}+J+${grund}'`
  return `UST+${esc(ordnungsnummer)}'`
}

/**
 * GES — Rechnungssummen (nur PLGA).
 * Summe Gesamtbruttobeträge (aller IAF) | Summe Zuzahlungen/Eigenanteile |
 * Summe Beihilfebeträge | Gesamtrechnungsbetrag (= Summe Rechnungsbeträge
 * der PLAA) | Mehrwertsteuerbetrag. Kann-Felder ohne Inhalt bleiben leer.
 */
export function GES(
  summeBruttoCent: number,
  gesamtrechnungsbetragCent: number,
  summeZuzahlungCent: number = 0,
  summeBeihilfeCent: number = 0,
  mwstCent: number = 0,
): string {
  const zuzahlung = summeZuzahlungCent > 0 ? betrag(summeZuzahlungCent) : ''
  const beihilfe = summeBeihilfeCent > 0 ? betrag(summeBeihilfeCent) : ''
  const mwst = mwstCent > 0 ? `+${betrag(mwstCent)}` : ''
  return `GES+${betrag(summeBruttoCent)}+${zuzahlung}+${beihilfe}+${betrag(gesamtrechnungsbetragCent)}${mwst}'`
}

/**
 * NAM — Name/Firmenbezeichnung des Rechnungsstellers (nur PLGA).
 * Name 1 (max. 30 Zeichen, Pflicht) + bis zu 3 weitere Zeilen
 * (z. B. Ansprechpartner und Telefonnummer).
 */
export function NAM(name1: string, name2?: string, name3?: string, name4?: string): string {
  const teile = [name1, name2, name3, name4]
    .filter((t): t is string => !!t)
    .map(t => esc(t.slice(0, 30)))
  return `NAM+${teile.join('+')}'`
}

// ── Nutzsegmente PLAA ───────────────────────────────────────────

/**
 * INV — Information des Pflegebedürftigen (Beginn-Segment je Abrechnungsfall).
 * Krankenversichertennummer (max. 12, ohne Füllzeichen; entfällt nur im
 * Ersatzverfahren — dann MUSS die Anschrift im NAD stehen) |
 * eindeutige Belegnummer (max. 10; Buchstaben, Ziffern, "/" und "-").
 */
export function INV(versichertennummer: string, belegnummer: string): string {
  return `INV+${esc(versichertennummer)}+${esc(belegnummer)}'`
}

/**
 * NAD — Name und Anschrift des Versicherten (je Abrechnungsfall einmal).
 * Nachname | Vorname | Geburtsdatum JJJJMMTT | Straße | Hausnummer | PLZ | Ort.
 * Anschriftfelder sind Kann-Felder (Pflicht nur im Ersatzverfahren ohne KVNR).
 */
export function NAD(
  nachname: string,
  vorname: string,
  geburtsdatum: string | Date,
  strasse?: string,
  hausnummer?: string,
  plz?: string,
  ort?: string,
): string {
  const basis = `NAD+${esc(nachname.slice(0, 45))}+${esc(vorname.slice(0, 45))}+${datumJJJJMMTT(geburtsdatum)}`
  if (strasse || plz || ort) {
    return `${basis}+${esc(strasse || '')}+${esc(hausnummer || '')}+${esc(plz || '')}+${esc(ort || '')}'`
  }
  return `${basis}'`
}

/**
 * MAN — Monatskopfsegment (je Kalendermonat einmal je Abrechnungsfall).
 * Monat der Leistungserbringung JJJJMM | Pflegestufe (nur Zeiträume vor 2017,
 * leer) | Pflegeklasse (nur teil-/vollstationär, leer) | Pflegegrad (1–5).
 */
export function MAN(monatJJJJMM: string, pflegegrad: number): string {
  return `MAN+${monatJJJJMM}+++${pflegegrad}'`
}

/**
 * ESK — Einsatzkopfsegment (je Leistungseinsatz; chronologisch aufsteigend).
 * Kalendertag "01"–"31" (oder "99" nur bei fixen Monatspauschalen/stationär) |
 * Uhrzeit Beginn hhmm (Pflicht bei Vergütungsart 01, 02, 03, 06).
 */
export function ESK(kalendertag: string, uhrzeitBeginn?: string): string {
  return uhrzeitBeginn ? `ESK+${kalendertag}+${uhrzeitBeginn}'` : `ESK+${kalendertag}'`
}

/**
 * ELS — Einzelleistung (je erbrachte Leistung, mindestens eine je ESK).
 * Leistungsziffer-Gruppe "Art der Leistung (2.4) : Vergütungsart (2.5) :
 * Qualifikationsabhängige Vergütung (2.6) : Leistung (2.7.n)" |
 * Einzelpreis (Vertragspreis, Komma-Format) | Punktwert (Kann) | Punktzahl
 * (Kann) | Zusatzinfo lt. Vergütungsart ("00", Dauer in Minuten mmmm bei 02,
 * Bis-Uhrzeit hhmm bei 03, km bei 06) | Anzahl/Menge (9999,99) |
 * Beschäftigtennummer § 293 Abs. 8 SGB V (Pflicht bei ambulanten Diensten,
 * Ersatzwerte s. TA3 2.17) | ggf. 2. Beschäftigtennummer.
 */
export function ELS(params: {
  leistungsart: string
  verguetungsart: string
  qualifikation: string
  leistung: string
  einzelpreisCent: number
  zusatzinfo: string
  anzahl: number
  beschaeftigtennummer?: string
  beschaeftigtennummer2?: string
  punktwert?: string
  punktzahl?: string
}): string {
  const gruppe = `${params.leistungsart}:${params.verguetungsart}:${params.qualifikation}:${esc(params.leistung)}`
  const felder = [
    gruppe,
    betrag(params.einzelpreisCent),
    params.punktwert || '',
    params.punktzahl || '',
    params.zusatzinfo,
    menge(params.anzahl),
    params.beschaeftigtennummer || '',
    params.beschaeftigtennummer2 || '',
  ]
  // Leere Kann-Felder am Segmentende entfallen (TA1 4.2 Abs. 3)
  while (felder.length > 0 && felder[felder.length - 1] === '') felder.pop()
  return `ELS+${felder.join('+')}'`
}

/**
 * IAF — Abrechnungsfall-Endesegment (je Abrechnungsfall einmal).
 * Gesamtbruttobetrag (inkl. Zuzahlung/Eigenanteil, ggf. MwSt/Beihilfe) |
 * Zuzahlungsbetrag/Eigenanteil | Beihilfebetrag | Rechnungsbetrag
 * (= Brutto − Zuzahlung − Beihilfe, max. Höchstleistungsanspruch der Kasse).
 */
export function IAF(
  bruttoCent: number,
  rechnungsbetragCent: number,
  zuzahlungCent: number = 0,
  beihilfeCent: number = 0,
): string {
  const zuzahlung = zuzahlungCent > 0 ? betrag(zuzahlungCent) : ''
  const beihilfe = beihilfeCent > 0 ? betrag(beihilfeCent) : ''
  return `IAF+${betrag(bruttoCent)}+${zuzahlung}+${beihilfe}+${betrag(rechnungsbetragCent)}'`
}
