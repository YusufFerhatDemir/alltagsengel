/**
 * CAMT.053 / CAMT.054 Parser
 *
 * Parst ISO 20022 Kontoauszuege (camt.053 BkToCstmrStmt)
 * und Einzelbuchungs-Avise (camt.054 BkToCstmrDbtCdtNtfctn).
 *
 * Extrahiert alle relevanten Felder fuer das Zahlungs-Matching:
 * Betrag, Valuta, Buchungsdatum, Debitor, Verwendungszweck,
 * EndToEndId, MandateId, Ruecklastschrift-Kennzeichen.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  buchungsreferenz: string | null;
  istRuecklastschrift: boolean;
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

/**
 * Prueft ob ein XML-Tag vorhanden ist und den Wert 'true' hat.
 */
function hasFlag(xml: string, tag: string): boolean {
  const val = getTagContent(xml, tag);
  return val?.toLowerCase() === 'true';
}

/**
 * Betrag-String (z.B. "1234.56") in Cent umrechnen.
 */
function betragToCent(betragStr: string): number {
  const n = parseFloat(betragStr);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Einfacher SHA-256-aehnlicher Hash fuer Duplikaterkennung.
 * Nutzt einen deterministischen String-Hash (kein Crypto noetig fuer Dedup).
 */
function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h = ((h << 5) - h + ch) | 0;
  }
  // Hex + Prefix fuer Lesbarkeit
  return 'bh_' + (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Prueft ob eine Buchung eine Ruecklastschrift ist.
 * Erkennung ueber:
 * - RvslInd = true
 * - DBIT mit Referenz auf vorherige Buchung
 * - BkTxCd/Domn/Fmly/Cd = RDDT (Return Direct Debit Transaction)
 */
function istRuecklastschrift(ntryXml: string): boolean {
  // 1) Reversal-Indikator
  if (hasFlag(ntryXml, 'RvslInd')) return true;

  // 2) BkTxCd → RDDT (Return Direct Debit)
  const fmlyCd = getTagContent(ntryXml, 'Cd');
  // Suche spezifisch nach Fmly > Cd = RDDT
  if (ntryXml.includes('<Fmly>') || ntryXml.includes(':Fmly>')) {
    const fmlyBlocks = getAllBlocks(ntryXml, 'Fmly');
    for (const fmly of fmlyBlocks) {
      const cd = getTagContent(fmly, 'Cd');
      if (cd === 'RDDT') return true;
    }
  }

  // 3) DBIT mit SEPA-Referenz (EndToEndId oder MandateId vorhanden)
  const richtung = getTagContent(ntryXml, 'CdtDbtInd');
  if (richtung === 'DBIT') {
    const e2e = getTagContent(ntryXml, 'EndToEndId');
    const mnd = getTagContent(ntryXml, 'MndtId');
    if (e2e && e2e !== 'NOTPROVIDED') return true;
    if (mnd) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parst eine einzelne Ntry (Buchung) aus dem CAMT-XML.
 */
function parseNtry(ntryXml: string): CamtBuchung {
  // Betrag + Waehrung
  const amtMatch = ntryXml.match(/<(?:[a-zA-Z0-9]+:)?Amt[^>]*Ccy="([^"]*)"[^>]*>([^<]*)</);
  const waehrung = amtMatch?.[1] ?? 'EUR';
  const betragRaw = amtMatch?.[2] ?? '0';
  let betragCent = betragToCent(betragRaw);

  // Richtung
  const richtung = (getTagContent(ntryXml, 'CdtDbtInd') ?? 'CRDT') as 'CRDT' | 'DBIT';
  if (richtung === 'DBIT') {
    betragCent = -Math.abs(betragCent);
  }

  // Datum
  const buchungsdatum = getTagContent(ntryXml, 'Dt')
    // BookgDt > Dt hat Vorrang
    ?? (() => {
      const bookgDt = getAllBlocks(ntryXml, 'BookgDt');
      if (bookgDt.length > 0) return getTagContent(bookgDt[0], 'Dt');
      return null;
    })()
    ?? new Date().toISOString().slice(0, 10);

  // Valutadatum
  const valutadatum = (() => {
    const valDt = getAllBlocks(ntryXml, 'ValDt');
    if (valDt.length > 0) return getTagContent(valDt[0], 'Dt');
    return null;
  })();

  // Status (BOOK, PDNG, INFO)
  const status = getTagContent(ntryXml, 'Sts') ?? 'BOOK';

  // Transaktionsdetails
  const txDtls = getAllBlocks(ntryXml, 'TxDtls');
  const txXml = txDtls.length > 0 ? txDtls[0] : ntryXml;

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
  const buchungsreferenz = getTagContent(ntryXml, 'AcctSvcrRef') || null;

  // Verwendungszweck (Ustrd + Strd zusammenfuehren)
  const ustrd = getTagContent(txXml, 'Ustrd');
  const strd = getTagContent(txXml, 'Strd');
  const verwendungszweck = [ustrd, strd].filter(Boolean).join(' ') || null;

  // Ruecklastschrift erkennen
  const isRuecklastschrift = istRuecklastschrift(ntryXml);

  // Hash fuer Duplikaterkennung
  const hashInput = [betragCent, buchungsdatum, debitorIban ?? '', verwendungszweck ?? ''].join('|');
  const buchungsHash = simpleHash(hashInput);

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
    buchungsreferenz,
    istRuecklastschrift: isRuecklastschrift,
    buchungsHash,
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
    try {
      // Pruefen ob Batch-Buchung (mehrere TxDtls)
      const txDtlsList = getAllBlocks(ntryBlocks[i], 'TxDtls');

      if (txDtlsList.length > 1) {
        // Batch: Jede TxDtls wird eine eigene Buchung
        for (const txDtls of txDtlsList) {
          // Baue ein synthetisches Ntry-XML mit nur diesem TxDtls
          const syntheticNtry = ntryBlocks[i].replace(
            /<(?:[a-zA-Z0-9]+:)?NtryDtls[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?NtryDtls>/g,
            `<NtryDtls>${txDtls}</NtryDtls>`
          );
          buchungen.push(parseNtry(syntheticNtry));
        }
      } else {
        buchungen.push(parseNtry(ntryBlocks[i]));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      fehler.push(`Fehler bei Buchung ${i + 1}: ${msg}`);
    }
  }

  return { format, kontoIban, auszugsDatum, buchungen, fehler };
}

/**
 * Berechnet einen Content-Hash ueber den gesamten XML-Inhalt.
 * Wird als quelldatei_hash im camt_imports gespeichert.
 */
export function computeCamtFileHash(xmlContent: string): string {
  let h = 0;
  for (let i = 0; i < xmlContent.length; i++) {
    const ch = xmlContent.charCodeAt(i);
    h = ((h << 5) - h + ch) | 0;
  }
  return 'camt_' + (h >>> 0).toString(16).padStart(8, '0');
}
