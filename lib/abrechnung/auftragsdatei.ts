import { berlinParts } from '@/lib/utils/timezone'

// ═══════════════════════════════════════════════════════════════
// Auftragsdatei (Begleitzettel/"Lieferschein") zur Nutzdatendatei
// Quelle: Technische Anlage 1, Anhang 1 "Struktur Auftragsdatei",
// Version 2.0 (gültig ab 07/2007) — Datenaustausch § 105 Abs. 2 SGB XI.
//
// Der Auftragssatz ist ein Satz FESTER Länge von 348 Bytes
// (Objekt "Krankenkassen-Kommunikation", VERSION 01).
// Feldtypen: N = numerisch, rechtsbündig mit führenden Nullen;
//            A/AN = linksbündig, mit Leerzeichen aufgefüllt.
// Dateiname der Auftragsdatei = physikalischer Dateiname + ".AUF"
// (z. B. "EPFL0001.AUF" zur Nutzdatendatei "EPFL0001").
// ═══════════════════════════════════════════════════════════════

/** numerisches Feld: rechtsbündig, führende Nullen */
function num(wert: number | string, laenge: number): string {
  const s = String(wert).replace(/\D/g, '')
  if (s.length > laenge) throw new Error(`Auftragsdatei: Wert "${wert}" länger als ${laenge} Stellen`)
  return s.padStart(laenge, '0')
}

/** alphanumerisches Feld: linksbündig, mit Leerzeichen aufgefüllt */
function an(wert: string, laenge: number): string {
  const s = (wert || '').slice(0, laenge)
  return s.padEnd(laenge, ' ')
}

/** Zeitstempel JJJJMMTTssmmss */
function zeitstempel(d: Date): string {
  const p = berlinParts(d)
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`
}

export interface AuftragsdateiParams {
  /** IK des Absenders (Eigner der Daten = verschlüsselnde Stelle) */
  absender_ik: string
  /** IK des physikalischen Absenders (Default = absender_ik) */
  absender_physikalisch_ik?: string
  /** IK der Datenannahmestelle mit Entschlüsselungsbefugnis (EMPFÄNGER_NUTZER) */
  datenannahmestelle_ik: string
  /** IK des physikalischen Empfängers (Default = Datenannahmestelle) */
  empfaenger_physikalisch_ik?: string
  /** logischer Dateiname (11 Stellen, identisch mit UNB-Anwendungsreferenz) */
  dateiname: string
  /** Dateigröße der unverschlüsselten Nutzdatendatei in Bytes */
  dateigroesse_nutzdaten: number
  /** Dateigröße der übertragenen (ggf. verschlüsselten) Datei in Bytes */
  dateigroesse_uebertragung?: number
  /** true = Testlieferung → VERFAHREN_KENNUNG "TPFL0" statt "EPFL0" */
  test?: boolean
  /** laufende Transfernummer (je Kommunikationspartner, 0–999) */
  transfer_nummer?: number
  /** Erstellungszeitpunkt (Default: jetzt) */
  erstellt_am?: Date
  /** true = Nutzdaten sind PKCS#7-verschlüsselt (SECON) */
  verschluesselt?: boolean
  /** Art der abgegebenen Leistung (TA3 2.4) für DATEI_BEZEICHNUNG Stelle 319-320 */
  leistungsart?: string
  /** physikalischer Dateiname (Stellen 275-318), z. B. "EPFL0001" */
  physikalischer_dateiname?: string
}

/**
 * Erzeugt den 348-Byte-Auftragssatz. Rückgabe als String (ISO-8859-1-
 * kompatibel, keine Umlaute enthalten).
 */
export function generateAuftragsdatei(params: AuftragsdateiParams): string {
  const jetzt = params.erstellt_am ?? new Date()
  const verfahrenKennung = params.test ? 'TPFL0' : 'EPFL0'
  const teile: string[] = []

  // ── Teil 1: Allgemeine Beschreibung der KK-Kommunikation (Stellen 1–210)
  teile.push(num('500000', 6))                                  //   1-  6 IDENTIFIKATOR (Konstante)
  teile.push(num('01', 2))                                      //   7-  8 VERSION
  teile.push(num('00000348', 8))                                //   9- 16 LÄNGE_AUFTRAG
  teile.push(num('000', 3))                                     //  17- 19 SEQUENZ_NR (000 = komplett)
  teile.push(an(verfahrenKennung, 5))                           //  20- 24 VERFAHREN_KENNUNG (EPFL0/TPFL0)
  teile.push(num(params.transfer_nummer ?? 1, 3))               //  25- 27 TRANSFER_NUMMER
  teile.push(an('', 5))                                         //  28- 32 VERFAHREN_KENNUNG_SPEZIFIKATION
  teile.push(an(params.absender_ik, 15))                        //  33- 47 ABSENDER_EIGNER
  teile.push(an(params.absender_physikalisch_ik ?? params.absender_ik, 15)) // 48- 62 ABSENDER_PHYSIKALISCH
  teile.push(an(params.datenannahmestelle_ik, 15))              //  63- 77 EMPFÄNGER_NUTZER (entschlüsselt)
  teile.push(an(params.empfaenger_physikalisch_ik ?? params.datenannahmestelle_ik, 15)) // 78- 92 EMPFÄNGER_PHYSIKALISCH
  teile.push(num('000000', 6))                                  //  93- 98 FEHLER_NUMMER
  teile.push(num('000000', 6))                                  //  99-104 FEHLER_MASSNAHME
  teile.push(an(params.dateiname, 11))                          // 105-115 DATEINAME (logischer Dateiname)
  teile.push(zeitstempel(jetzt))                                // 116-129 DATUM_ERSTELLUNG
  teile.push(num(0, 14))                                        // 130-143 DATUM_ÜBERTRAGUNG_GESENDET
  teile.push(num(0, 14))                                        // 144-157 DATUM_ÜBERTRAGUNG_EMPFANGEN_START
  teile.push(num(0, 14))                                        // 158-171 DATUM_ÜBERTRAGUNG_EMPFANGEN_ENDE
  teile.push(num('000000', 6))                                  // 172-177 DATEIVERSION
  teile.push(num('0', 1))                                       // 178     KORREKTUR
  teile.push(num(params.dateigroesse_nutzdaten, 12))            // 179-190 DATEIGRÖSSE_NUTZDATEN
  teile.push(num(params.dateigroesse_uebertragung ?? params.dateigroesse_nutzdaten, 12)) // 191-202 DATEIGRÖSSE_ÜBERTRAGUNG
  teile.push(an('I8', 2))                                       // 203-204 ZEICHENSATZ (ISO 8-Bit DIN 66303)
  teile.push(num('00', 2))                                      // 205-206 KOMPRIMIERUNG (00 = keine)
  teile.push(num(params.verschluesselt ? '03' : '00', 2))       // 207-208 VERSCHLÜSSELUNGSART (03 = PKCS#7)
  teile.push(num(params.verschluesselt ? '03' : '00', 2))       // 209-210 ELEKTRONISCHE_UNTERSCHRIFT

  // ── Teil 2: Datenträgerspezifisch (bei DFÜ Konstanten, Stellen 211–226)
  teile.push(an('', 3))                                         // 211-213 SATZFORMAT (DFÜ: Leerzeichen)
  teile.push(num('00000', 5))                                   // 214-218 SATZLÄNGE
  teile.push(num('00000000', 8))                                // 219-226 BLOCKLÄNGE

  // ── Teil 3: Statusinformationen (Stellen 227–274)
  teile.push(an(' ', 1))                                        // 227     Status (Anlieferung: Leerzeichen)
  teile.push(num('00', 2))                                      // 228-229 Wiederholung
  teile.push(num('0', 1))                                       // 230     Übertragungsweg
  teile.push(num(0, 10))                                        // 231-240 Verzögerter Versand
  teile.push(num('000000', 6))                                  // 241-246 Info-/Fehlerfelder
  teile.push(an('', 28))                                        // 247-274 Variables Info-Feld

  // ── Teil 4: RZ-interne Verarbeitung (Stellen 275–348)
  teile.push(an(params.physikalischer_dateiname ?? '', 44))     // 275-318 DATEINAME_PHYSIKALISCH
  // DATEI_BEZEICHNUNG: Stelle 319-320 = Schlüssel Art der abgegebenen Leistung
  teile.push(an(params.leistungsart ?? '01', 30))               // 319-348 DATEI_BEZEICHNUNG

  const satz = teile.join('')
  if (satz.length !== 348) {
    throw new Error(`Auftragsdatei hat ${satz.length} Bytes statt 348 — Feldaufbau prüfen!`)
  }
  return satz
}

/** Dateiname der Auftragsdatei zum physikalischen Nutzdaten-Dateinamen. */
export function auftragsdateiName(physikalischerDateiname: string): string {
  return `${physikalischerDateiname}.AUF`
}

// ═══════════════════════════════════════════════════════════════
// Feldverzeichnis, Parser und Nachtrag zur Übertragung
//
// Der Auftragssatz wird beim Export erzeugt, aber erst beim Versand
// übertragen. Zwischen beiden Zeitpunkten ändern sich Tatsachen, die im
// Satz stehen: die Nutzdaten werden SECON-verschlüsselt (andere Größe,
// Verschlüsselungsart 03, elektronische Unterschrift 03) und der
// Sendezeitpunkt entsteht überhaupt erst. Ohne Nachtrag meldet die
// Auftragsdatei der Annahmestelle eine unverschlüsselte Datei der
// falschen Größe — sie würde die Lieferung abweisen.
// ═══════════════════════════════════════════════════════════════

/** Offset (0-basiert) und Länge jedes Feldes im 348-Byte-Satz. */
export const AUFTRAGSDATEI_FELDER = {
  IDENTIFIKATOR: [0, 6],
  VERSION: [6, 2],
  LAENGE_AUFTRAG: [8, 8],
  SEQUENZ_NR: [16, 3],
  VERFAHREN_KENNUNG: [19, 5],
  TRANSFER_NUMMER: [24, 3],
  VERFAHREN_KENNUNG_SPEZIFIKATION: [27, 5],
  ABSENDER_EIGNER: [32, 15],
  ABSENDER_PHYSIKALISCH: [47, 15],
  EMPFAENGER_NUTZER: [62, 15],
  EMPFAENGER_PHYSIKALISCH: [77, 15],
  FEHLER_NUMMER: [92, 6],
  FEHLER_MASSNAHME: [98, 6],
  DATEINAME: [104, 11],
  DATUM_ERSTELLUNG: [115, 14],
  DATUM_UEBERTRAGUNG_GESENDET: [129, 14],
  DATUM_UEBERTRAGUNG_EMPFANGEN_START: [143, 14],
  DATUM_UEBERTRAGUNG_EMPFANGEN_ENDE: [157, 14],
  DATEIVERSION: [171, 6],
  KORREKTUR: [177, 1],
  DATEIGROESSE_NUTZDATEN: [178, 12],
  DATEIGROESSE_UEBERTRAGUNG: [190, 12],
  ZEICHENSATZ: [202, 2],
  KOMPRIMIERUNG: [204, 2],
  VERSCHLUESSELUNGSART: [206, 2],
  ELEKTRONISCHE_UNTERSCHRIFT: [208, 2],
  SATZFORMAT: [210, 3],
  SATZLAENGE: [213, 5],
  BLOCKLAENGE: [218, 8],
  STATUS: [226, 1],
  WIEDERHOLUNG: [227, 2],
  UEBERTRAGUNGSWEG: [229, 1],
  VERZOEGERTER_VERSAND: [230, 10],
  INFO_FEHLER: [240, 6],
  VARIABLES_INFO: [246, 28],
  DATEINAME_PHYSIKALISCH: [274, 44],
  DATEI_BEZEICHNUNG: [318, 30],
} as const satisfies Record<string, readonly [number, number]>

export type AuftragsdateiFeld = keyof typeof AUFTRAGSDATEI_FELDER

export const AUFTRAGSDATEI_LAENGE = 348

/** Verschlüsselungsart/elektronische Unterschrift: 00 = keine, 03 = PKCS#7 (SECON). */
export const VERSCHLUESSELUNGSART = { KEINE: '00', PKCS7: '03' } as const

/** Liest ein Feld aus einem Auftragssatz (ohne Trimmen der Füllzeichen). */
export function leseAuftragsdateiFeld(satz: string, feld: AuftragsdateiFeld): string {
  const [offset, laenge] = AUFTRAGSDATEI_FELDER[feld]
  return satz.slice(offset, offset + laenge)
}

/** Zerlegt einen 348-Byte-Auftragssatz in seine Felder (Werte getrimmt). */
export function parseAuftragsdatei(satz: string): Record<AuftragsdateiFeld, string> {
  if (satz.length !== AUFTRAGSDATEI_LAENGE) {
    throw new Error(
      `Auftragsdatei hat ${satz.length} Bytes statt ${AUFTRAGSDATEI_LAENGE} — keine gültige Auftragsdatei`,
    )
  }
  const felder = {} as Record<AuftragsdateiFeld, string>
  for (const name of Object.keys(AUFTRAGSDATEI_FELDER) as AuftragsdateiFeld[]) {
    felder[name] = leseAuftragsdateiFeld(satz, name).trim()
  }
  return felder
}

/** Ersetzt ein Feld längentreu. Numerische Felder rechtsbündig mit Nullen. */
function setzeFeld(satz: string, feld: AuftragsdateiFeld, wert: string, numerisch: boolean): string {
  const [offset, laenge] = AUFTRAGSDATEI_FELDER[feld]
  const roh = numerisch ? String(wert).replace(/\D/g, '') : String(wert)
  if (roh.length > laenge) {
    throw new Error(`Auftragsdatei: Wert "${wert}" für ${feld} länger als ${laenge} Stellen`)
  }
  const gefuellt = numerisch ? roh.padStart(laenge, '0') : roh.padEnd(laenge, ' ')
  return satz.slice(0, offset) + gefuellt + satz.slice(offset + laenge)
}

export interface AuftragsdateiNachtrag {
  /** Größe der tatsächlich übertragenen (ggf. verschlüsselten) Datei in Bytes */
  dateigroesse_uebertragung?: number
  /** true = Nutzlast ist SECON-verschlüsselt und signiert (PKCS#7) */
  verschluesselt?: boolean
  /** Sendezeitpunkt — füllt DATUM_ÜBERTRAGUNG_GESENDET */
  gesendet_am?: Date
  /** laufende Transfernummer je Kommunikationspartner (0–999) */
  transfer_nummer?: number
  /** physikalischer Dateiname der übertragenen Datei */
  physikalischer_dateiname?: string
}

/**
 * Trägt die erst beim Versand bekannten Tatsachen in einen bereits
 * erzeugten Auftragssatz nach — längentreu, alle anderen Felder bleiben
 * unverändert. Gibt immer wieder genau 348 Bytes zurück.
 */
export function patcheAuftragsdatei(satz: string, nachtrag: AuftragsdateiNachtrag): string {
  if (satz.length !== AUFTRAGSDATEI_LAENGE) {
    throw new Error(
      `Auftragsdatei hat ${satz.length} Bytes statt ${AUFTRAGSDATEI_LAENGE} — Nachtrag abgelehnt`,
    )
  }
  let ergebnis = satz

  if (nachtrag.dateigroesse_uebertragung !== undefined) {
    ergebnis = setzeFeld(ergebnis, 'DATEIGROESSE_UEBERTRAGUNG', String(nachtrag.dateigroesse_uebertragung), true)
  }
  if (nachtrag.verschluesselt !== undefined) {
    const art = nachtrag.verschluesselt ? VERSCHLUESSELUNGSART.PKCS7 : VERSCHLUESSELUNGSART.KEINE
    ergebnis = setzeFeld(ergebnis, 'VERSCHLUESSELUNGSART', art, true)
    ergebnis = setzeFeld(ergebnis, 'ELEKTRONISCHE_UNTERSCHRIFT', art, true)
  }
  if (nachtrag.gesendet_am) {
    ergebnis = setzeFeld(ergebnis, 'DATUM_UEBERTRAGUNG_GESENDET', zeitstempel(nachtrag.gesendet_am), true)
  }
  if (nachtrag.transfer_nummer !== undefined) {
    ergebnis = setzeFeld(ergebnis, 'TRANSFER_NUMMER', String(nachtrag.transfer_nummer), true)
  }
  if (nachtrag.physikalischer_dateiname !== undefined) {
    ergebnis = setzeFeld(ergebnis, 'DATEINAME_PHYSIKALISCH', nachtrag.physikalischer_dateiname, false)
  }

  if (ergebnis.length !== AUFTRAGSDATEI_LAENGE) {
    throw new Error(`Nachtrag hat die Satzlänge auf ${ergebnis.length} verändert — Feldtabelle prüfen!`)
  }
  return ergebnis
}
