import { createHash } from 'node:crypto';
import { euroZuCent } from '@/lib/geld';
/**
 * CAMT.053 / CAMT.054 Parser
 *
 * Parst ISO 20022 Kontoauszuege (camt.053 BkToCstmrStmt)
 * und Einzelbuchungs-Avise (camt.054 BkToCstmrDbtCdtNtfctn).
 *
 * Extrahiert alle relevanten Felder fuer das Zahlungs-Matching:
 * Betrag, Valuta, Buchungsdatum, Debitor, Verwendungszweck,
 * EndToEndId, MandateId, Ruecklastschrift-Kennzeichen.
 *
 * ── FAIL-CLOSED (Delta-Check Phase 4.5) ────────────────────────────────
 * Dieser Parser speist unmittelbar Geldbewegungen: jede Buchung wird zu
 * einer Zeile in `zahlungseingaenge`, laeuft ins Matching und — wenn sie
 * als Ruecklastschrift gilt — in verarbeiteRuecklastschrift(), das eine
 * Rechnung wieder oeffnet, eine Gebuehr bucht und das SEPA-Mandat sperren
 * kann. Eine falsch geratene Angabe ist hier also kein Anzeigefehler,
 * sondern eine Falschbuchung beim Kunden.
 *
 * Deshalb gilt durchgehend: was nicht sicher aus der Datei hervorgeht,
 * wird NICHT geschaetzt, sondern als Fehler gemeldet. Ein abgewiesener
 * Kontoauszug ist reparierbar, eine stille Falschbuchung nicht.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Eine Buchung liess sich nicht eindeutig lesen.
 *
 * parseCamtXml() faengt das je Buchung, sammelt die Meldung in `fehler`
 * und liefert die Buchung NICHT aus — so kann keine halb geratene Zeile
 * in die Zahlungsverarbeitung gelangen.
 */
export class CamtBuchungUnlesbarError extends Error {
  constructor(grund: string) {
    super(grund);
    this.name = 'CamtBuchungUnlesbarError';
  }
}

export interface CamtBuchung {
  /** Betrag in Cent (positiv = Haben/Eingang, negativ = Soll/Ausgang) */
  betragCent: number;
  waehrung: string;
  /** CRDT = Haben (Eingang), DBIT = Soll (Ausgang) */
  richtung: 'CRDT' | 'DBIT';
  buchungsdatum: string;
  valutadatum: string | null;
  status: string;
  debitorName: string | null;
  debitorIban: string | null;
  kreditorName: string | null;
  kreditorIban: string | null;
  verwendungszweck: string | null;
  endToEndId: string | null;
  mandateId: string | null;
  /**
   * Glaeubiger-Identifikationsnummer aus <CdtrSchmeId> (z. B. DE98ZZZ0…).
   *
   * Nur bei Lastschriften vorhanden, bei Ueberweisungen nie. Wird NICHT
   * fuer die Zuordnung benutzt, sondern nur geprueft: eine Ruecklastschrift,
   * die eine fremde Glaeubiger-ID traegt, gehoert nicht zu diesem Haus, und
   * ein Buchungsvorschlag dafuer waere eine Falschbuchung.
   */
  glaeubigerId: string | null;
  buchungsreferenz: string | null;
  istRuecklastschrift: boolean;
  /**
   * Grund der Ruecklastschrift-Einordnung, oder null. Dient dem Nachweis:
   * bei einer Fehlbuchung muss ablesbar sein, WORAN die Datei erkannt
   * wurde, nicht nur dass sie erkannt wurde.
   */
  ruecklastschriftGrund: string | null;
  /** true, wenn die Buchung gebucht (BOOK) und damit endgueltig ist */
  istGebucht: boolean;
  /** Hash fuer Duplikaterkennung */
  buchungsHash: string;
}

export interface CamtParseResult {
  /** camt.053 oder camt.054 */
  format: 'camt.053' | 'camt.054';
  kontoIban: string | null;
  auszugsDatum: string | null;
  buchungen: CamtBuchung[];
  fehler: string[];
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Einfacher XML-Tag-Extraktor ohne externen Parser.
 * Genuegt fuer die flache Struktur der CAMT-Tags.
 */
function getTagContent(xml: string, tag: string): string | null {
  // Suche nach <tag>...</tag> und <ns:tag>...</ns:tag>
  const patterns = [
    new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 's'),
    new RegExp(`<[a-zA-Z0-9]+:${tag}[^>]*>([^<]*)</[a-zA-Z0-9]+:${tag}>`, 's'),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Extrahiert alle Vorkommen eines XML-Blocks.
 */
function getAllBlocks(xml: string, tag: string): string[] {
  const results: string[] = [];
  // Regex fuer <Tag>...</Tag> (inkl. Namespace-Prefix)
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>[\\s\\S]*?</(?:[a-zA-Z0-9]+:)?${tag}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[0]);
  }
  return results;
}

/** true, wenn der Block das Tag ueberhaupt enthaelt (mit oder ohne Namespace). */
function hasTag(xml: string, tag: string): boolean {
  return new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[\\s>/]`).test(xml);
}

/**
 * Prueft ob ein XML-Tag vorhanden ist und den Wert 'true' hat.
 */
function hasFlag(xml: string, tag: string): boolean {
  const val = getTagContent(xml, tag);
  return val?.toLowerCase() === 'true';
}

/**
 * Liest einen Code, der entweder direkt im Tag oder in einem
 * verschachtelten <Cd> steht.
 *
 * ISO 20022 kennt beide Formen — `<Sts>BOOK</Sts>` (aeltere Auspraegung)
 * und `<Sts><Cd>BOOK</Cd></Sts>` (ab camt.053.001.04). Der Parser las
 * vorher nur die erste; bei der zweiten schlug getTagContent fehl (der
 * Inhalt ist kein `[^<]*`) und der Status fiel stillschweigend auf 'BOOK'
 * zurueck — eine noch vorlaeufige Buchung (PDNG) sah damit aus wie eine
 * endgueltige.
 */
function getCode(xml: string, tag: string): string | null {
  const direkt = getTagContent(xml, tag);
  if (direkt) return direkt;
  const bloecke = getAllBlocks(xml, tag);
  if (bloecke.length === 0) return null;
  return getTagContent(bloecke[0], 'Cd');
}

/**
 * Betrag-String (z.B. "1234.56") in Cent umrechnen.
 *
 * Wirft bei allem, was nicht als ISO-20022-Betrag lesbar ist. Vorher gab
 * die Funktion in diesem Fall 0 zurueck: eine unlesbare Zeile wurde dann
 * als Zahlungseingang ueber 0,00 EUR importiert und ins Matching gegeben,
 * ohne Fehler und ohne Spur.
 */
function betragToCent(betragStr: string): number {
  const roh = betragStr.trim();
  // ISO 20022 schreibt den Punkt als Dezimaltrennzeichen und laesst kein
  // Gruppentrennzeichen zu. Ein Komma waere ein deutsch formatierter
  // Betrag — parseFloat() haette daraus stillschweigend eine ganz andere
  // Zahl gemacht ("1.234,56" → 1.234 → 123 Cent).
  if (!/^-?\d+(\.\d+)?$/.test(roh)) {
    throw new CamtBuchungUnlesbarError(
      `Betrag "${betragStr}" ist kein gueltiger ISO-20022-Betrag (erwartet: Ziffern mit Punkt als Dezimaltrennzeichen).`
    );
  }
  const n = Number(roh);
  if (!Number.isFinite(n)) {
    throw new CamtBuchungUnlesbarError(`Betrag "${betragStr}" ist keine endliche Zahl.`);
  }
  // euroZuCent statt Math.round(n * 100): der Kontoauszug einer Bank
  // enthaelt regelmaessig Halb-Cent-Betraege (1.005), die als
  // `n * 100` in IEEE-754 auf 100.49999999999999 fallen und damit einen
  // Cent zu wenig verbuchen. Die Zeichenkette `roh` wird direkt
  // weitergereicht — sie ist oben bereits als ISO-20022-Betrag validiert
  // und traegt die exakte Dezimaldarstellung, die der Double verliert.
  return euroZuCent(roh);
}

/**
 * Hash fuer die Duplikaterkennung.
 *
 * SHA-256 statt des vorherigen 32-Bit-String-Hashes: bei 32 Bit liegt die
 * Kollisionswahrscheinlichkeit schon im fuenfstelligen Buchungsbereich bei
 * ueber 50 % (Geburtstagsparadox). Eine Kollision bedeutet hier, dass eine
 * ECHTE Buchung als Dublette gilt und damit nie verbucht wird — bzw. auf
 * Dateiebene, dass ein ganzer Kontoauszug mit 409 abgewiesen wird.
 */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Merkmale, an denen eine Ruecklastschrift SICHER erkennbar ist.
 *
 * ── WARUM DIE ALTE HEURISTIK FALSCH WAR ────────────────────────────────
 * Vorher galt zusaetzlich: "DBIT und (EndToEndId oder MndtId vorhanden)".
 * Das trifft auf praktisch JEDE ausgehende SEPA-Ueberweisung zu — Lohn,
 * Lieferantenrechnung, Miete. Jede davon lief damit in
 * verarbeiteRuecklastschrift(): Rechnung wieder geoeffnet, 5,00 EUR
 * Ruecklastschriftgebuehr gebucht, nach dem zweiten Treffer das
 * SEPA-Mandat widerrufen — beim Kunden, der nie etwas falsch gemacht hat.
 *
 * Es bleiben nur die eindeutigen ISO-20022-Merkmale:
 *   - <RvslInd>true</RvslInd>            Storno-/Reversal-Kennzeichen
 *   - BkTxCd → Fmly → Cd = RDDT/RRTN     Return Direct Debit / Returned Transaction
 *   - <RtrInf>                           Return Information (traegt den Rueckgabegrund)
 * Keines dieser Merkmale steht in einer normalen Ueberweisung.
 */
function ruecklastschriftGrund(ntryXml: string): string | null {
  // 1) Reversal-Indikator
  if (hasFlag(ntryXml, 'RvslInd')) return 'RvslInd=true';

  // 2) BkTxCd → Fmly → Cd = RDDT (Return Direct Debit) / RRTN (Returned Transaction)
  for (const fmly of getAllBlocks(ntryXml, 'Fmly')) {
    const cd = getTagContent(fmly, 'Cd');
    if (cd === 'RDDT' || cd === 'RRTN') return `BkTxCd/Fmly/Cd=${cd}`;
  }

  // 3) Return-Information — vorhanden nur bei zurueckgegebenen Zahlungen.
  if (hasTag(ntryXml, 'RtrInf')) {
    const rtr = getAllBlocks(ntryXml, 'RtrInf')[0] ?? '';
    const grund = getCode(rtr, 'Rsn');
    return grund ? `RtrInf/Rsn=${grund}` : 'RtrInf vorhanden';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Betrag + Waehrung aus dem ERSTEN <Amt Ccy="…"> eines Blocks. */
function betragAus(xml: string): { betragCent: number; waehrung: string } | null {
  const m = xml.match(/<(?:[a-zA-Z0-9]+:)?Amt[^>]*Ccy="([^"]*)"[^>]*>([^<]*)</);
  if (!m) return null;
  return { betragCent: betragToCent(m[2]), waehrung: m[1] || 'EUR' };
}

/**
 * Parst eine einzelne Ntry (Buchung) aus dem CAMT-XML.
 *
 * @param teilbuchung Bei einer Sammelbuchung das einzelne <TxDtls>. Dann
 *   gilt DESSEN Betrag, nicht der Gesamtbetrag der Sammelbuchung.
 */
function parseNtry(ntryXml: string, teilbuchung?: string): CamtBuchung {
  // ── Betrag + Waehrung ──
  // Bei einer Sammelbuchung steht im Ntry der GESAMTbetrag. Vorher wurde
  // fuer jede Teilbuchung dieser Gesamtbetrag uebernommen: aus einem
  // Sammelposten ueber 300 EUR mit drei Zahlungen wurden drei
  // Zahlungseingaenge von je 300 EUR.
  const quelle = teilbuchung ?? ntryXml;
  const betragInfo = betragAus(quelle) ?? (teilbuchung ? betragAus(ntryXml) : null);
  if (!betragInfo) {
    throw new CamtBuchungUnlesbarError('Kein Betrag (<Amt Ccy="…">) in der Buchung gefunden.');
  }
  const waehrung = betragInfo.waehrung;
  let betragCent = betragInfo.betragCent;

  // Richtung — bei einer Teilbuchung hat deren eigene Angabe Vorrang.
  const richtung = ((teilbuchung ? getTagContent(teilbuchung, 'CdtDbtInd') : null)
    ?? getTagContent(ntryXml, 'CdtDbtInd')
    ?? 'CRDT') as 'CRDT' | 'DBIT';
  if (richtung === 'DBIT') {
    betragCent = -Math.abs(betragCent);
  } else {
    betragCent = Math.abs(betragCent);
  }

  // ── Buchungsdatum ──
  // BookgDt hat Vorrang, dann ValDt. Vorher stand hier
  // `getTagContent(ntryXml, 'Dt')` VOR der BookgDt-Auswertung — das nahm
  // schlicht das erste <Dt> im Ntry, unabhaengig davon, ob es das Buchungs-
  // oder das Valutadatum war, und widersprach damit dem eigenen Kommentar.
  const datumAus = (tag: string): string | null => {
    const bloecke = getAllBlocks(ntryXml, tag);
    if (bloecke.length === 0) return null;
    return getTagContent(bloecke[0], 'Dt') ?? getTagContent(bloecke[0], 'DtTm')?.slice(0, 10) ?? null;
  };
  const valutadatum = datumAus('ValDt');
  const buchungsdatum = datumAus('BookgDt') ?? valutadatum;
  if (!buchungsdatum) {
    // Vorher fiel der Parser hier auf heuteBerlin() zurueck und erfand
    // damit ein Buchungsdatum — in einem Kontoauszug ist das eine
    // Falschaussage mit Wirkung auf Faelligkeiten und Mahnstufen.
    throw new CamtBuchungUnlesbarError(
      'Kein Buchungs- oder Valutadatum (BookgDt/ValDt) in der Buchung gefunden.'
    );
  }

  // Status (BOOK = gebucht, PDNG = vorgemerkt, INFO = informativ)
  const status = getCode(ntryXml, 'Sts') ?? 'BOOK';

  // Transaktionsdetails
  const txXml = teilbuchung ?? getAllBlocks(ntryXml, 'TxDtls')[0] ?? ntryXml;

  // Debitor
  const dbtrBlocks = getAllBlocks(txXml, 'Dbtr');
  const debitorName = dbtrBlocks.length > 0 ? getTagContent(dbtrBlocks[0], 'Nm') : null;
  const dbtrAcctBlocks = getAllBlocks(txXml, 'DbtrAcct');
  const debitorIban = dbtrAcctBlocks.length > 0 ? getTagContent(dbtrAcctBlocks[0], 'IBAN') : null;

  // Kreditor
  const cdtrBlocks = getAllBlocks(txXml, 'Cdtr');
  const kreditorName = cdtrBlocks.length > 0 ? getTagContent(cdtrBlocks[0], 'Nm') : null;
  const cdtrAcctBlocks = getAllBlocks(txXml, 'CdtrAcct');
  const kreditorIban = cdtrAcctBlocks.length > 0 ? getTagContent(cdtrAcctBlocks[0], 'IBAN') : null;

  // Referenzen
  const endToEndId = (() => {
    const v = getTagContent(txXml, 'EndToEndId');
    return v && v !== 'NOTPROVIDED' ? v : null;
  })();
  const mandateId = getTagContent(txXml, 'MndtId') || null;
  // Glaeubiger-ID: <CdtrSchmeId><Id><PrvtId><Othr><Id>DE98ZZZ…</Id>.
  // Bewusst ueber den umschliessenden Block gesucht statt direkt nach <Id>:
  // ein blankes getTagContent(txXml,'Id') faende das erste <Id> irgendwo im
  // Transaktionsblock — meist die Konto- oder Nachrichtenkennung.
  const glaeubigerId = (() => {
    const scheme = getAllBlocks(txXml, 'CdtrSchmeId')[0];
    if (!scheme) return null;
    const othr = getAllBlocks(scheme, 'Othr')[0] ?? scheme;
    return getTagContent(othr, 'Id') || null;
  })();
  const buchungsreferenz = getTagContent(ntryXml, 'AcctSvcrRef') || null;

  // Verwendungszweck (Ustrd + Strd zusammenfuehren)
  const ustrd = getTagContent(txXml, 'Ustrd');
  const strd = getTagContent(txXml, 'Strd');
  const verwendungszweck = [ustrd, strd].filter(Boolean).join(' ') || null;

  // Ruecklastschrift erkennen — bei einer Teilbuchung zaehlen deren
  // eigene Merkmale mit.
  const grund = ruecklastschriftGrund(teilbuchung ? `${ntryXml}${teilbuchung}` : ntryXml);

  // ── Hash fuer Duplikaterkennung ──
  // endToEndId und Buchungsreferenz gehoeren dazu: zwei ECHTE Zahlungen
  // mit gleichem Betrag, gleichem Tag, gleichem Zahler und gleichem
  // Verwendungszweck (der Regelfall bei monatlich gleichen Betraegen)
  // ergaben vorher denselben Hash — die zweite galt als Dublette.
  const hashInput = [
    betragCent,
    waehrung,
    buchungsdatum,
    valutadatum ?? '',
    debitorIban ?? '',
    verwendungszweck ?? '',
    endToEndId ?? '',
    buchungsreferenz ?? '',
  ].join('|');

  return {
    betragCent,
    waehrung,
    richtung,
    buchungsdatum,
    valutadatum,
    status,
    debitorName,
    debitorIban,
    kreditorName,
    kreditorIban,
    verwendungszweck,
    endToEndId,
    mandateId,
    glaeubigerId,
    buchungsreferenz,
    istRuecklastschrift: grund !== null,
    ruecklastschriftGrund: grund,
    istGebucht: status === 'BOOK',
    buchungsHash: 'bh_' + sha256(hashInput),
  };
}

/**
 * Parst eine CAMT.053 oder CAMT.054 XML-Datei.
 *
 * @param xmlContent - Der vollstaendige XML-Inhalt als String
 * @returns CamtParseResult mit allen extrahierten Buchungen
 */
export function parseCamtXml(xmlContent: string): CamtParseResult {
  const fehler: string[] = [];

  // Format erkennen
  const is053 = xmlContent.includes('BkToCstmrStmt') || xmlContent.includes('camt.053');
  const is054 = xmlContent.includes('BkToCstmrDbtCdtNtfctn') || xmlContent.includes('camt.054');
  const format: 'camt.053' | 'camt.054' = is054 ? 'camt.054' : 'camt.053';

  if (!is053 && !is054) {
    fehler.push('Unbekanntes CAMT-Format: Weder camt.053 noch camt.054 erkannt');
  }

  // Konto-IBAN
  const acctBlocks = getAllBlocks(xmlContent, 'Acct');
  const kontoIban = acctBlocks.length > 0 ? getTagContent(acctBlocks[0], 'IBAN') : null;

  // Auszugsdatum
  const stmtBlocks = getAllBlocks(xmlContent, 'Stmt');
  const ntfctnBlocks = getAllBlocks(xmlContent, 'Ntfctn');
  const rootBlock = stmtBlocks[0] ?? ntfctnBlocks[0] ?? xmlContent;
  const auszugsDatum = getTagContent(rootBlock, 'CreDtTm')?.slice(0, 10) ?? null;

  // Buchungen extrahieren
  const ntryBlocks = getAllBlocks(xmlContent, 'Ntry');
  const buchungen: CamtBuchung[] = [];

  for (let i = 0; i < ntryBlocks.length; i++) {
    // Pruefen ob Batch-Buchung (mehrere TxDtls)
    const txDtlsList = getAllBlocks(ntryBlocks[i], 'TxDtls');

    if (txDtlsList.length > 1) {
      // Sammelbuchung: jede TxDtls wird eine eigene Buchung — mit ihrem
      // EIGENEN Betrag (siehe parseNtry).
      txDtlsList.forEach((txDtls, j) => {
        try {
          buchungen.push(parseNtry(ntryBlocks[i], txDtls));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          fehler.push(`Fehler bei Buchung ${i + 1}, Teilbuchung ${j + 1}: ${msg}`);
        }
      });
    } else {
      try {
        buchungen.push(parseNtry(ntryBlocks[i]));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        fehler.push(`Fehler bei Buchung ${i + 1}: ${msg}`);
      }
    }
  }

  return { format, kontoIban, auszugsDatum, buchungen, fehler };
}

/**
 * Berechnet einen Content-Hash ueber den gesamten XML-Inhalt.
 * Wird als quelldatei_hash im camt_imports gespeichert.
 *
 * SHA-256 statt 32-Bit-Hash: eine Kollision haette hier bedeutet, dass
 * ein neuer Kontoauszug mit HTTP 409 als "bereits importiert" abgewiesen
 * wird und die enthaltenen Zahlungen nie ankommen.
 */
export function computeCamtFileHash(xmlContent: string): string {
  return 'camt_' + sha256(xmlContent);
}
