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
  const p = (x: number, l = 2) => String(x).padStart(l, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
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
  teile.push(an('', 44))                                        // 275-318 DATEINAME_PHYSIKALISCH
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
