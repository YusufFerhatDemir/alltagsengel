// ═══════════════════════════════════════════════════════════════════════
// Delta-Check Phase 4.5 — CAMT-Parser (lib/billing/camt/camt-parser.ts)
//
// Das Modul hatte 315 Zeilen und KEINEN Test, speist aber unmittelbar
// Geldbewegungen: jede Buchung wird eine Zeile in `zahlungseingaenge`,
// laeuft ins Matching und — als Ruecklastschrift eingeordnet — in
// verarbeiteRuecklastschrift(), das eine Rechnung wieder oeffnet, 5,00 EUR
// Gebuehr bucht, die Mahnstufe hochsetzt und das SEPA-Mandat sperren kann.
//
// Festgehaltene Befunde (alle vorher vorhanden):
//   B1  Jede ausgehende SEPA-Ueberweisung mit EndToEndId galt als
//       Ruecklastschrift ("DBIT + E2E vorhanden" als Heuristik).
//   B2  Sammelbuchungen: jede Teilbuchung erhielt den GESAMTbetrag der
//       Sammelbuchung statt ihres eigenen.
//   B3  Ein unlesbarer Betrag wurde stillschweigend 0,00 EUR.
//   B4  Fehlte jedes Datum, erfand der Parser das heutige.
//   B5  <Sts><Cd>PDNG</Cd></Sts> wurde nicht gelesen → alles galt als
//       gebucht (BOOK).
//   B6  32-Bit-Hash fuer die Dublettenerkennung; zwei echte Zahlungen mit
//       gleichem Betrag/Tag/Zahler/Zweck ergaben denselben Hash.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { parseCamtXml, computeCamtFileHash } from '@/lib/billing/camt/camt-parser'

/** Baut eine camt.053-Datei um beliebige <Ntry>-Bloecke. */
function auszug(ntries: string, kopf = ''): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M1</MsgId><CreDtTm>2026-08-24T09:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>S1</Id>
      <CreDtTm>2026-08-24T09:00:00</CreDtTm>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      ${kopf}
      ${ntries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

/** Eine normale Kundenzahlung (Eingang). */
const EINGANG = `
<Ntry>
  <Amt Ccy="EUR">150.50</Amt>
  <CdtDbtInd>CRDT</CdtDbtInd>
  <Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <ValDt><Dt>2026-08-21</Dt></ValDt>
  <AcctSvcrRef>REF-EIN-1</AcctSvcrRef>
  <NtryDtls><TxDtls>
    <Refs><EndToEndId>E2E-KUNDE-1</EndToEndId></Refs>
    <RltdPties>
      <Dbtr><Nm>Erika Mustermann</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
    </RltdPties>
    <RmtInf><Ustrd>RE-2026-0001</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>`

describe('B1: ausgehende Ueberweisungen sind keine Ruecklastschriften', () => {
  it('eigene Lohn-/Lieferantenueberweisung (DBIT mit EndToEndId) gilt NICHT als Ruecklastschrift', () => {
    // Genau dieser Fall loeste vorher Rechnungsstorno, 5,00 EUR Gebuehr
    // und ggf. den Mandatswiderruf beim Kunden aus.
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">2400.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-01</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>LOHN-08-2026</EndToEndId></Refs>
          <RmtInf><Ustrd>Gehalt August</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`))

    expect(r.fehler).toEqual([])
    expect(r.buchungen).toHaveLength(1)
    expect(r.buchungen[0].istRuecklastschrift).toBe(false)
    expect(r.buchungen[0].ruecklastschriftGrund).toBeNull()
    // Ausgang bleibt negativ vorzeichenbehaftet
    expect(r.buchungen[0].betragCent).toBe(-240000)
  })

  it('DBIT mit MndtId allein gilt ebenfalls NICHT als Ruecklastschrift', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">89.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-05</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><MndtId>MANDAT-4711</MndtId></Refs>
        </TxDtls></NtryDtls>
      </Ntry>`))
    expect(r.buchungen[0].istRuecklastschrift).toBe(false)
  })

  it('RvslInd=true wird erkannt', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">150.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <RvslInd>true</RvslInd>
        <BookgDt><Dt>2026-08-22</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].istRuecklastschrift).toBe(true)
    expect(r.buchungen[0].ruecklastschriftGrund).toBe('RvslInd=true')
  })

  it('BkTxCd/Fmly/Cd=RDDT wird erkannt', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">150.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-22</Dt></BookgDt>
        <BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RDDT</Cd><SubFmlyCd>UPDD</SubFmlyCd></Fmly></Domn></BkTxCd>
      </Ntry>`))
    expect(r.buchungen[0].istRuecklastschrift).toBe(true)
    expect(r.buchungen[0].ruecklastschriftGrund).toBe('BkTxCd/Fmly/Cd=RDDT')
  })

  it('RtrInf mit Rueckgabegrund wird erkannt und der Grund benannt', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">150.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-22</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>E2E-KUNDE-1</EndToEndId></Refs>
          <RtrInf><Rsn><Cd>AM04</Cd></Rsn><AddtlInf>Kontostand nicht ausreichend</AddtlInf></RtrInf>
        </TxDtls></NtryDtls>
      </Ntry>`))
    expect(r.buchungen[0].istRuecklastschrift).toBe(true)
    expect(r.buchungen[0].ruecklastschriftGrund).toBe('RtrInf/Rsn=AM04')
  })

  it('eine normale Kundenzahlung ist nie eine Ruecklastschrift', () => {
    const r = parseCamtXml(auszug(EINGANG))
    expect(r.buchungen[0].istRuecklastschrift).toBe(false)
    expect(r.buchungen[0].richtung).toBe('CRDT')
    expect(r.buchungen[0].betragCent).toBe(15050)
  })
})

describe('B2: Sammelbuchung — jede Teilbuchung mit EIGENEM Betrag', () => {
  const SAMMEL = auszug(`
    <Ntry>
      <Amt Ccy="EUR">300.00</Amt>
      <CdtDbtInd>CRDT</CdtDbtInd>
      <Sts>BOOK</Sts>
      <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      <NtryDtls>
        <TxDtls>
          <Amt Ccy="EUR">100.00</Amt>
          <Refs><EndToEndId>E2E-A</EndToEndId></Refs>
          <RltdPties><Dbtr><Nm>Kunde A</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>RE-A</Ustrd></RmtInf>
        </TxDtls>
        <TxDtls>
          <Amt Ccy="EUR">50.00</Amt>
          <Refs><EndToEndId>E2E-B</EndToEndId></Refs>
          <RltdPties><Dbtr><Nm>Kunde B</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>RE-B</Ustrd></RmtInf>
        </TxDtls>
        <TxDtls>
          <Amt Ccy="EUR">150.00</Amt>
          <Refs><EndToEndId>E2E-C</EndToEndId></Refs>
          <RltdPties><Dbtr><Nm>Kunde C</Nm></Dbtr></RltdPties>
          <RmtInf><Ustrd>RE-C</Ustrd></RmtInf>
        </TxDtls>
      </NtryDtls>
    </Ntry>`)

  it('drei Teilbuchungen ergeben drei Buchungen', () => {
    const r = parseCamtXml(SAMMEL)
    expect(r.fehler).toEqual([])
    expect(r.buchungen).toHaveLength(3)
  })

  it('die Betraege sind die der Teilbuchungen, nicht der Gesamtbetrag', () => {
    // Vorher: [30000, 30000, 30000] — dreimal der Sammelbetrag. Damit
    // waeren 900 EUR Zahlungseingang aus 300 EUR Kontobewegung entstanden.
    const r = parseCamtXml(SAMMEL)
    expect(r.buchungen.map(b => b.betragCent)).toEqual([10000, 5000, 15000])
  })

  it('die Summe der Teilbuchungen entspricht dem Sammelbetrag', () => {
    const r = parseCamtXml(SAMMEL)
    expect(r.buchungen.reduce((s, b) => s + b.betragCent, 0)).toBe(30000)
  })

  it('jede Teilbuchung behaelt ihren eigenen Zahler und ihre eigene Referenz', () => {
    const r = parseCamtXml(SAMMEL)
    expect(r.buchungen.map(b => b.debitorName)).toEqual(['Kunde A', 'Kunde B', 'Kunde C'])
    expect(r.buchungen.map(b => b.endToEndId)).toEqual(['E2E-A', 'E2E-B', 'E2E-C'])
  })

  it('Teilbuchungen haben verschiedene Hashes', () => {
    const r = parseCamtXml(SAMMEL)
    expect(new Set(r.buchungen.map(b => b.buchungsHash)).size).toBe(3)
  })
})

describe('B3: unlesbarer Betrag ist ein Fehler, keine 0,00 EUR', () => {
  it('Buchstaben im Betrag werden gemeldet und die Buchung nicht ausgeliefert', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">keine Zahl</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen).toHaveLength(0)
    expect(r.fehler).toHaveLength(1)
    expect(r.fehler[0]).toMatch(/Betrag/)
  })

  it('ein deutsch formatierter Betrag wird abgewiesen statt falsch gelesen', () => {
    // parseFloat("1.234,56") ergaebe 1.234 → 123 Cent statt 123456.
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">1.234,56</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen).toHaveLength(0)
    expect(r.fehler[0]).toMatch(/ISO-20022/)
  })

  it('eine fehlerhafte Buchung reisst die uebrigen nicht mit, wird aber gemeldet', () => {
    const r = parseCamtXml(auszug(`
      ${EINGANG}
      <Ntry>
        <Amt Ccy="EUR">xx</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen).toHaveLength(1)
    expect(r.fehler).toHaveLength(1)
    // Die Import-Route weist bei fehler.length > 0 die GANZE Datei ab —
    // ein Kontoauszug wird vollstaendig importiert oder nicht.
  })

  it('Betrag ohne Nachkommastellen wird korrekt gerechnet', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">42</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].betragCent).toBe(4200)
  })

  it('Rundungsfall 0.005 wird kaufmaennisch gerundet, nicht abgeschnitten', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">19.999</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].betragCent).toBe(2000)
  })
})

describe('B4: kein erfundenes Buchungsdatum', () => {
  it('BookgDt hat Vorrang vor ValDt', () => {
    const r = parseCamtXml(auszug(EINGANG))
    expect(r.buchungen[0].buchungsdatum).toBe('2026-08-20')
    expect(r.buchungen[0].valutadatum).toBe('2026-08-21')
  })

  it('auch wenn ValDt im XML VOR BookgDt steht', () => {
    // Vorher nahm der Parser einfach das erste <Dt> im Ntry — hier also
    // das Valutadatum, entgegen dem eigenen Kommentar.
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <ValDt><Dt>2026-08-31</Dt></ValDt>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].buchungsdatum).toBe('2026-08-20')
    expect(r.buchungen[0].valutadatum).toBe('2026-08-31')
  })

  it('fehlt BookgDt, wird ValDt genommen', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <ValDt><Dt>2026-08-19</Dt></ValDt>
      </Ntry>`))
    expect(r.buchungen[0].buchungsdatum).toBe('2026-08-19')
  })

  it('fehlt jedes Datum, ist das ein Fehler — kein heutiges Datum', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">10.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
      </Ntry>`))
    expect(r.buchungen).toHaveLength(0)
    expect(r.fehler[0]).toMatch(/Buchungs- oder Valutadatum/)
  })
})

describe('B5: Buchungsstatus wird auch verschachtelt gelesen', () => {
  it('<Sts>BOOK</Sts> (flach)', () => {
    const r = parseCamtXml(auszug(EINGANG))
    expect(r.buchungen[0].status).toBe('BOOK')
    expect(r.buchungen[0].istGebucht).toBe(true)
  })

  it('<Sts><Cd>PDNG</Cd></Sts> (verschachtelt) gilt NICHT als gebucht', () => {
    // Vorher fiel der Status hier still auf 'BOOK' zurueck: eine nur
    // vorgemerkte Buchung sah wie ein eingegangener Betrag aus.
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">99.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>PDNG</Cd></Sts>
        <BookgDt><Dt>2026-08-23</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].status).toBe('PDNG')
    expect(r.buchungen[0].istGebucht).toBe(false)
  })

  it('<Sts><Cd>BOOK</Cd></Sts> gilt als gebucht', () => {
    const r = parseCamtXml(auszug(`
      <Ntry>
        <Amt Ccy="EUR">99.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><Dt>2026-08-23</Dt></BookgDt>
      </Ntry>`))
    expect(r.buchungen[0].istGebucht).toBe(true)
  })
})

describe('B6: Dublettenerkennung', () => {
  it('zwei ECHTE Zahlungen mit gleichem Betrag/Tag/Zahler/Zweck sind unterscheidbar', () => {
    // Der Regelfall bei monatlich gleichen Betraegen. Vorher identischer
    // Hash → die zweite Zahlung waere als Dublette durchgefallen.
    const bauen = (e2e: string, ref: string) => `
      <Ntry>
        <Amt Ccy="EUR">150.50</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-08-20</Dt></BookgDt>
        <AcctSvcrRef>${ref}</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>${e2e}</EndToEndId></Refs>
          <RltdPties>
            <Dbtr><Nm>Erika Mustermann</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>Pflegeleistung</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>`
    const r = parseCamtXml(auszug(bauen('E2E-1', 'REF-1') + bauen('E2E-2', 'REF-2')))
    expect(r.buchungen).toHaveLength(2)
    expect(r.buchungen[0].buchungsHash).not.toBe(r.buchungen[1].buchungsHash)
  })

  it('dieselbe Buchung ergibt denselben Hash (Wiederholung erkennbar)', () => {
    const a = parseCamtXml(auszug(EINGANG)).buchungen[0]
    const b = parseCamtXml(auszug(EINGANG)).buchungen[0]
    expect(a.buchungsHash).toBe(b.buchungsHash)
  })

  it('der Buchungs-Hash ist ein SHA-256 (64 Hexstellen), kein 32-Bit-Wert', () => {
    const r = parseCamtXml(auszug(EINGANG))
    expect(r.buchungen[0].buchungsHash).toMatch(/^bh_[0-9a-f]{64}$/)
  })

  it('der Datei-Hash ist ein SHA-256 und aendert sich mit dem Inhalt', () => {
    const h1 = computeCamtFileHash(auszug(EINGANG))
    const h2 = computeCamtFileHash(auszug(EINGANG + EINGANG))
    expect(h1).toMatch(/^camt_[0-9a-f]{64}$/)
    expect(h1).not.toBe(h2)
    expect(computeCamtFileHash(auszug(EINGANG))).toBe(h1)
  })
})

describe('Kopfdaten und Format', () => {
  it('camt.053 wird erkannt, IBAN und Auszugsdatum gelesen', () => {
    const r = parseCamtXml(auszug(EINGANG))
    expect(r.format).toBe('camt.053')
    expect(r.kontoIban).toBe('DE02120300000000202051')
    expect(r.auszugsDatum).toBe('2026-08-24')
    expect(r.fehler).toEqual([])
  })

  it('camt.054 wird erkannt', () => {
    const xml = `<?xml version="1.0"?><Document><BkToCstmrDbtCdtNtfctn><Ntfctn>
      <CreDtTm>2026-08-24T10:00:00</CreDtTm>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      ${EINGANG}
    </Ntfctn></BkToCstmrDbtCdtNtfctn></Document>`
    const r = parseCamtXml(xml)
    expect(r.format).toBe('camt.054')
    expect(r.buchungen).toHaveLength(1)
  })

  it('eine Datei, die keines der beiden Formate ist, wird gemeldet', () => {
    const r = parseCamtXml('<Document><Foo/></Document>')
    expect(r.fehler.some(f => /Unbekanntes CAMT-Format/.test(f))).toBe(true)
    expect(r.buchungen).toHaveLength(0)
  })

  it('Namespace-Prefixe (ns:) werden verarbeitet', () => {
    const xml = `<?xml version="1.0"?><ns:Document xmlns:ns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
      <ns:BkToCstmrStmt><ns:Stmt>
        <ns:CreDtTm>2026-08-24T09:00:00</ns:CreDtTm>
        <ns:Acct><ns:Id><ns:IBAN>DE02120300000000202051</ns:IBAN></ns:Id></ns:Acct>
        <ns:Ntry>
          <ns:Amt Ccy="EUR">75.00</ns:Amt>
          <ns:CdtDbtInd>CRDT</ns:CdtDbtInd>
          <ns:Sts>BOOK</ns:Sts>
          <ns:BookgDt><ns:Dt>2026-08-20</ns:Dt></ns:BookgDt>
        </ns:Ntry>
      </ns:Stmt></ns:BkToCstmrStmt></ns:Document>`
    const r = parseCamtXml(xml)
    expect(r.buchungen).toHaveLength(1)
    expect(r.buchungen[0].betragCent).toBe(7500)
    expect(r.buchungen[0].istGebucht).toBe(true)
  })
})
