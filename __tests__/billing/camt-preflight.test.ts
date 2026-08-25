// ═══════════════════════════════════════════════════════════════════════
// CAMT-PREFLIGHT — Trockenlauf über eine echte Bankdatei
//
// Die drei Eigenschaften, an denen ein Trockenlauf scheitert, und die
// deshalb hier einzeln festgehalten sind:
//
//   1. ER DARF NICHTS SCHREIBEN. Ein Trockenlauf, der bucht, ist die
//      schlimmste denkbare Fassung dieses Moduls. Der Doppelgänger
//      protokolliert jede Operation — die Prüfung ist deshalb nicht
//      „wahrscheinlich nichts geschrieben", sondern: kein einziger
//      insert/update/delete über den gesamten Lauf.
//   2. ER MUSS BEWERTEN WIE DER SCHARFE LAUF. Deshalb ruft er
//      bewerteBuchung() aus der Matching-Engine auf und rechnet nicht selbst.
//   3. ER DARF BEI ZWEIFEL NICHT FREIGEBEN. Jede Einordnung, die einen
//      scharfen Lauf stören würde, muss `freigabefaehig` kippen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  camtPreflight,
  pruefeFelderRein,
  ermittleMehrdeutigkeiten,
  kuerzeIban,
  AUTO_SCHWELLE,
} from '@/lib/billing/camt/camt-preflight'
import { baueCamtPreflightBericht } from '@/lib/billing/camt/camt-preflight-bericht'
import { camtImportModus, camtImportBucht } from '@/lib/billing/camt/camt-modus'
import { parseCamtXml } from '@/lib/billing/camt/camt-parser'
import type { MatchCandidate } from '@/lib/billing/matching/matching-engine'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000042'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000099'

// ---------------------------------------------------------------------------
// XML-Bausteine
// ---------------------------------------------------------------------------

function auszug(ntries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M1</MsgId><CreDtTm>2026-08-24T09:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>S1</Id>
      <CreDtTm>2026-08-24T09:00:00</CreDtTm>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      ${ntries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

function eingang(opt: {
  betrag?: string
  ccy?: string
  zweck?: string
  e2e?: string
  iban?: string
  name?: string
  sts?: string
  ref?: string
} = {}): string {
  return `
<Ntry>
  <Amt Ccy="${opt.ccy ?? 'EUR'}">${opt.betrag ?? '150.50'}</Amt>
  <CdtDbtInd>CRDT</CdtDbtInd>
  <Sts>${opt.sts ?? 'BOOK'}</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <ValDt><Dt>2026-08-21</Dt></ValDt>
  <AcctSvcrRef>${opt.ref ?? 'REF-1'}</AcctSvcrRef>
  <NtryDtls><TxDtls>
    <Refs><EndToEndId>${opt.e2e ?? 'E2E-1'}</EndToEndId></Refs>
    <RltdPties>
      <Dbtr><Nm>${opt.name ?? 'Erika Mustermann'}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${opt.iban ?? 'DE89370400440532013000'}</IBAN></Id></DbtrAcct>
    </RltdPties>
    <RmtInf><Ustrd>${opt.zweck ?? 'RE-2026-0001'}</Ustrd></RmtInf>
  </TxDtls></NtryDtls>
</Ntry>`
}

// ---------------------------------------------------------------------------
// Datenbank-Doppelgänger
// ---------------------------------------------------------------------------

interface DbLage {
  /** Offene Rechnungen der eigenen Organisation. */
  rechnungen?: {
    id: string
    invoice_number: string
    invoice_number_formatted: string | null
    total_amount: number
    paid_amount: number | null
    client_id: string
    client: { first_name: string; last_name: string } | null
  }[]
  /** buchungsHash-Werte, die schon verbucht sind. */
  verbuchteHashes?: string[]
  /** Datei bereits importiert? */
  dateiBekannt?: boolean
  /** Zu welcher Org gehört die EndToEndId in sepa_batch_items? */
  batchItemOrgs?: string[]
  /** Zu welcher Org gehört die Rechnungsnummer aus dem Verwendungszweck? */
  rechnungsnummerOrgs?: string[]
  /** Eigene Gläubiger-ID. */
  glaeubigerId?: string | null
}

function db(lage: DbLage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'camt_imports':
        return { data: lage.dateiBekannt ? { id: 'import-alt' } : null }

      case 'zahlungseingaenge':
        return { data: (lage.verbuchteHashes ?? []).map(h => ({ quelldatei_hash: h })) }

      case 'organizations':
        return { data: { sepa_creditor_id: lage.glaeubigerId ?? null } }

      case 'invoices': {
        // Der Preflight liest invoices auf zwei Wegen: die offenen
        // Rechnungen (mit organization_id-Filter) und die
        // Mandantengrenzen-Prüfung (mit .in auf die Nummer, OHNE org-Filter).
        const istGrenzpruefung = a.filter.some(f => f.methode === 'in')
        if (istGrenzpruefung) {
          return { data: (lage.rechnungsnummerOrgs ?? []).map(o => ({ organization_id: o })) }
        }
        return { data: lage.rechnungen ?? [] }
      }

      case 'sepa_batch_items':
        return { data: (lage.batchItemOrgs ?? []).map(o => ({ organization_id: o })) }

      case 'sepa_mandates':
        return { data: [] }

      default:
        return { data: [] }
    }
  }
}

const OFFENE_RECHNUNG = {
  id: 'inv-1',
  invoice_number: 'RE-2026-0001',
  invoice_number_formatted: 'RE-2026-0001',
  total_amount: 150.5,
  paid_amount: 0,
  client_id: 'client-1',
  client: { first_name: 'Erika', last_name: 'Mustermann' },
}

// ---------------------------------------------------------------------------
// Betriebsart
// ---------------------------------------------------------------------------

describe('CAMT_IMPORT_MODE — fail-closed', () => {
  it('ohne Variable wird NICHT gebucht', () => {
    const m = camtImportModus({})
    expect(m.modus).toBe('DRY_RUN')
    expect(m.buchend).toBe(false)
    expect(m.gesetzt).toBe(false)
  })

  it("nur der exakte Wert 'LIVE' bucht", () => {
    expect(camtImportBucht({ CAMT_IMPORT_MODE: 'LIVE' })).toBe(true)
  })

  for (const wert of ['live', 'Live', 'LIVE ', 'true', '1', 'PRODUKTION', '']) {
    it(`'${wert}' bucht NICHT`, () => {
      expect(camtImportBucht({ CAMT_IMPORT_MODE: wert })).toBe(false)
    })
  }

  it('ein unbekannter Wert wird als ungültig gemeldet, nicht als Absicht', () => {
    const m = camtImportModus({ CAMT_IMPORT_MODE: 'live' })
    expect(m.wertGueltig).toBe(false)
    expect(m.buchend).toBe(false)
  })

  it("'DRY_RUN' ist ein gültiger, ausdrücklicher Wert", () => {
    const m = camtImportModus({ CAMT_IMPORT_MODE: 'DRY_RUN' })
    expect(m.wertGueltig).toBe(true)
    expect(m.buchend).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Feldprüfungen (rein, ohne Datenbank)
// ---------------------------------------------------------------------------

function feld(xml: string, name: string, glaeubigerId?: string | null) {
  const b = parseCamtXml(auszug(xml)).buchungen[0]
  return pruefeFelderRein(b, glaeubigerId).find(p => p.feld === name)!
}

describe('Feldprüfungen', () => {
  it('gültige Zahler-IBAN besteht die MOD-97-Prüfung', () => {
    expect(feld(eingang(), 'iban').stand).toBe('ok')
  })

  it('IBAN mit falscher Prüfsumme ist ein Fehler', () => {
    // Eine Ziffer der Prüfsumme verdreht — formal richtig lang, aber ungültig.
    expect(feld(eingang({ iban: 'DE88370400440532013000' }), 'iban').stand).toBe('fehler')
  })

  it('Fremdwährung ist ein Fehler — es wird nichts umgerechnet', () => {
    const p = feld(eingang({ ccy: 'CHF' }), 'waehrung')
    expect(p.stand).toBe('fehler')
    expect(p.befund).toContain('CHF')
  })

  it('Betrag 0,00 ist ein Fehler', () => {
    expect(feld(eingang({ betrag: '0.00' }), 'betrag').stand).toBe('fehler')
  })

  it('ein ungewöhnlich hoher Betrag ist ein Hinweis, kein Fehler', () => {
    expect(feld(eingang({ betrag: '25000.00' }), 'betrag').stand).toBe('hinweis')
  })

  it('CRDT mit positivem Betrag ist stimmig', () => {
    expect(feld(eingang(), 'vorzeichen').stand).toBe('ok')
  })

  it('ein vorgemerkter Posten (PDNG) ist nicht buchbar', () => {
    const p = feld(eingang({ sts: 'PDNG' }), 'buchungsstatus')
    expect(p.stand).toBe('fehler')
    expect(p.befund).toContain('PDNG')
  })

  it('fehlender Verwendungszweck ist ein Hinweis', () => {
    expect(feld(eingang({ zweck: '' }), 'verwendungszweck').stand).toBe('hinweis')
  })

  it('fehlende EndToEndId ist ein Hinweis', () => {
    expect(feld(eingang({ e2e: 'NOTPROVIDED' }), 'end_to_end_id').stand).toBe('hinweis')
  })

  it('ohne Gläubiger-ID im Auszug ist die Prüfung nicht anwendbar', () => {
    expect(feld(eingang(), 'glaeubiger_id').stand).toBe('nicht_anwendbar')
  })

  it('eine fremde Gläubiger-ID im Auszug ist ein Fehler', () => {
    // Der Einzug stammt dann nicht von uns — ein Buchungsvorschlag dafür
    // wäre eine Falschbuchung.
    const xml = `
<Ntry>
  <Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <RtrInf><Rsn><Cd>AC04</Cd></Rsn></RtrInf>
  <NtryDtls><TxDtls>
    <Refs><MndtId>MND-1</MndtId></Refs>
    <RltdPties><CdtrSchmeId><Id><PrvtId><Othr><Id>DE11ZZZ00000012345</Id></Othr></PrvtId></Id></CdtrSchmeId></RltdPties>
  </TxDtls></NtryDtls>
</Ntry>`
    const p = feld(xml, 'glaeubiger_id', 'DE22ZZZ00000054321')
    expect(p.stand).toBe('fehler')
    expect(p.befund).toContain('fremden Gläubiger')
  })

  it('die eigene Gläubiger-ID im Auszug ist in Ordnung', () => {
    const xml = `
<Ntry>
  <Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <RtrInf><Rsn><Cd>AC04</Cd></Rsn></RtrInf>
  <NtryDtls><TxDtls>
    <RltdPties><CdtrSchmeId><Id><PrvtId><Othr><Id>DE22ZZZ00000054321</Id></Othr></PrvtId></Id></CdtrSchmeId></RltdPties>
  </TxDtls></NtryDtls>
</Ntry>`
    expect(feld(xml, 'glaeubiger_id', 'DE22ZZZ00000054321').stand).toBe('ok')
  })
})

describe('kuerzeIban', () => {
  it('zeigt Anfang und Ende, nie die Mitte', () => {
    expect(kuerzeIban('DE89370400440532013000')).toBe('DE89…3000')
  })
  it('verträgt Leerzeichen und Kleinschreibung', () => {
    expect(kuerzeIban('de89 3704 0044 0532 0130 00')).toBe('DE89…3000')
  })
  it('liefert null für nichts', () => {
    expect(kuerzeIban(null)).toBeNull()
  })
})

describe('ermittleMehrdeutigkeiten', () => {
  const k = (nr: string, c: number): MatchCandidate => ({
    invoiceId: nr, invoiceNumber: nr, clientId: 'c', clientName: 'Test',
    openCents: 1000, confidence: c, matchMethode: 'test',
  })

  it('ein einzelner klarer Treffer ist nicht mehrdeutig', () => {
    expect(ermittleMehrdeutigkeiten([k('A', 95)])).toEqual([])
  })

  it('zwei Treffer über der Schwelle sind mehrdeutig', () => {
    const m = ermittleMehrdeutigkeiten([k('A', 90), k('B', 75)])
    expect(m.join(' ')).toContain('2 Rechnungen')
  })

  // Der subtilere Fall: nur einer über der Schwelle, aber der zweite dicht
  // dahinter. Der Abstand entscheidet über die Verwechslungsgefahr, nicht
  // der Absolutwert.
  it('ein knapper Abstand zum Zweitbesten ist mehrdeutig', () => {
    const m = ermittleMehrdeutigkeiten([k('A', 72), k('B', 65)])
    expect(m.join(' ')).toContain('Prozentpunkte')
  })

  it('ein deutlicher Abstand ist nicht mehrdeutig', () => {
    expect(ermittleMehrdeutigkeiten([k('A', 95), k('B', 40)])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------

async function lauf(xml: string, lage: DbLage = {}) {
  const fake = erstelleFakeSupabase(db(lage))
  const ergebnis = await camtPreflight(fake.client, {
    organizationId: ORG,
    dateiname: 'auszug.xml',
    xmlInhalt: xml,
    quelle: {},
  })
  return { ergebnis, fake }
}

describe('camtPreflight — schreibt nichts', () => {
  // Die wichtigste Zusicherung dieses Moduls, und die einzige, die sich
  // nicht aus dem Ergebnis ablesen lässt: was NICHT passiert ist.
  it('kein einziger insert, update oder delete über den ganzen Lauf', async () => {
    const { fake } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const schreibend = fake.aufrufe.filter(a => a.operation !== 'select')
    expect(schreibend.map(a => `${a.operation} ${a.tabelle}`)).toEqual([])
  })

  it('auch bei einer Rücklastschrift wird nichts geschrieben', async () => {
    const rl = `
<Ntry>
  <Amt Ccy="EUR">150.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <RvslInd>true</RvslInd>
  <NtryDtls><TxDtls><Refs><MndtId>MND-1</MndtId></Refs></TxDtls></NtryDtls>
</Ntry>`
    const { fake, ergebnis } = await lauf(auszug(rl), { rechnungen: [OFFENE_RECHNUNG] })
    expect(ergebnis.buchungen[0].istRuecklastschrift).toBe(true)
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toHaveLength(0)
  })
})

describe('camtPreflight — Einordnung', () => {
  it('ordnet eine eindeutige Zahlung als MATCHED ein und würde sie buchen', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const b = ergebnis.buchungen[0]
    expect(b.einordnung).toBe('MATCHED')
    expect(b.wuerdeBuchen).toBe(true)
    expect(b.confidence).toBeGreaterThanOrEqual(AUTO_SCHWELLE)
    expect(ergebnis.freigabefaehig).toBe(true)
  })

  it('ohne offene Rechnung: UNMATCHED, und nichts würde gebucht', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), { rechnungen: [] })
    expect(ergebnis.buchungen[0].einordnung).toBe('UNMATCHED')
    expect(ergebnis.buchungen[0].wuerdeBuchen).toBe(false)
    // Ein Klärfall ist der vorgesehene Weg, kein Blocker.
    expect(ergebnis.freigabefaehig).toBe(true)
  })

  it('mehrere gleich starke Rechnungen: AMBIGUOUS, und NICHT buchbar', async () => {
    // Zwei offene Rechnungen über denselben Betrag, beide mit passendem
    // Namen — der Verwendungszweck nennt beide Nummern.
    const zweite = { ...OFFENE_RECHNUNG, id: 'inv-2', invoice_number: 'RE-2026-0002', invoice_number_formatted: 'RE-2026-0002' }
    const { ergebnis } = await lauf(
      auszug(eingang({ zweck: 'RE-2026-0001 RE-2026-0002' })),
      { rechnungen: [OFFENE_RECHNUNG, zweite] },
    )
    const b = ergebnis.buchungen[0]
    expect(b.einordnung).toBe('AMBIGUOUS')
    expect(b.wuerdeBuchen).toBe(false)
    expect(b.mehrdeutigkeiten.length).toBeGreaterThan(0)
  })

  it('eine bereits verbuchte Buchung ist DUPLICATE', async () => {
    const hash = parseCamtXml(auszug(eingang())).buchungen[0].buchungsHash
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG], verbuchteHashes: [hash],
    })
    expect(ergebnis.buchungen[0].einordnung).toBe('DUPLICATE')
    expect(ergebnis.buchungen[0].wuerdeBuchen).toBe(false)
  })

  it('Fremdwährung ist INVALID und blockiert die Freigabe', async () => {
    const { ergebnis } = await lauf(auszug(eingang({ ccy: 'CHF' })), { rechnungen: [OFFENE_RECHNUNG] })
    expect(ergebnis.buchungen[0].einordnung).toBe('INVALID')
    expect(ergebnis.freigabefaehig).toBe(false)
    expect(ergebnis.blocker.join(' ')).toContain('nicht buchbar')
  })

  it('ein vorgemerkter Posten ist INVALID', async () => {
    const { ergebnis } = await lauf(auszug(eingang({ sts: 'PDNG' })), { rechnungen: [OFFENE_RECHNUNG] })
    expect(ergebnis.buchungen[0].einordnung).toBe('INVALID')
  })

  it('eine ausgehende Zahlung ohne Rückgabemerkmal wird übersprungen, nicht gebucht', async () => {
    const lohn = `
<Ntry>
  <Amt Ccy="EUR">2400.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-01</Dt></BookgDt>
  <NtryDtls><TxDtls><Refs><EndToEndId>LOHN-08</EndToEndId></Refs>
  <RmtInf><Ustrd>Gehalt August</Ustrd></RmtInf></TxDtls></NtryDtls>
</Ntry>`
    const { ergebnis } = await lauf(auszug(lohn), { rechnungen: [OFFENE_RECHNUNG] })
    const b = ergebnis.buchungen[0]
    expect(b.wuerdeBuchen).toBe(false)
    expect(b.begruendung).toContain('überspringt')
  })
})

describe('camtPreflight — Mandantengrenze', () => {
  it('eine EndToEndId aus einem fremden Sammelauftrag blockiert', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG],
      batchItemOrgs: [FREMDE_ORG],
    })
    expect(ergebnis.buchungen[0].einordnung).toBe('CROSS_TENANT_BLOCKED')
    expect(ergebnis.freigabefaehig).toBe(false)
  })

  it('nennt den fremden Mandanten NICHT beim Namen', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG], batchItemOrgs: [FREMDE_ORG],
    })
    expect(JSON.stringify(ergebnis)).not.toContain(FREMDE_ORG)
  })

  // Rechnungsnummern sind je Mandant fortlaufend — dieselbe Nummer kann in
  // zwei Häusern existieren. Ein Fehlalarm hier hielte einen korrekten
  // Import auf.
  it('blockiert NICHT, wenn die Referenz auch im eigenen Haus existiert', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG],
      batchItemOrgs: [ORG, FREMDE_ORG],
    })
    expect(ergebnis.buchungen[0].einordnung).not.toBe('CROSS_TENANT_BLOCKED')
    const grenze = ergebnis.buchungen[0].pruefungen.find(p => p.feld === 'mandantengrenze')!
    expect(grenze.stand).toBe('hinweis')
  })

  it('eine ausschließlich fremde Rechnungsnummer im Zweck blockiert', async () => {
    const { ergebnis } = await lauf(auszug(eingang({ zweck: 'RE-2026-0777' })), {
      rechnungen: [OFFENE_RECHNUNG],
      rechnungsnummerOrgs: [FREMDE_ORG],
    })
    expect(ergebnis.buchungen[0].einordnung).toBe('CROSS_TENANT_BLOCKED')
  })

  it('CROSS_TENANT sticht DUPLICATE — der ernstere Befund gewinnt', async () => {
    const hash = parseCamtXml(auszug(eingang())).buchungen[0].buchungsHash
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG],
      verbuchteHashes: [hash],
      batchItemOrgs: [FREMDE_ORG],
    })
    expect(ergebnis.buchungen[0].einordnung).toBe('CROSS_TENANT_BLOCKED')
  })
})

describe('camtPreflight — Freigabefähigkeit', () => {
  it('eine bereits importierte Datei ist nicht freigabefähig', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), {
      rechnungen: [OFFENE_RECHNUNG], dateiBekannt: true,
    })
    expect(ergebnis.dateiBereitsImportiert).toBe(true)
    expect(ergebnis.freigabefaehig).toBe(false)
  })

  it('eine unlesbare Zeile blockiert die ganze Datei — ganz oder gar nicht', async () => {
    const kaputt = `
<Ntry>
  <Amt Ccy="EUR">1.234,56</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
</Ntry>`
    const { ergebnis } = await lauf(auszug(eingang() + kaputt), { rechnungen: [OFFENE_RECHNUNG] })
    expect(ergebnis.parseFehler.length).toBeGreaterThan(0)
    expect(ergebnis.freigabefaehig).toBe(false)
    expect(ergebnis.blocker.join(' ')).toContain('ganz oder gar nicht')
  })

  it('eine leere Datei ist nicht freigabefähig', async () => {
    const { ergebnis } = await lauf(auszug(''))
    expect(ergebnis.gesamt).toBe(0)
    expect(ergebnis.freigabefaehig).toBe(false)
  })

  // Fail-closed an der wichtigsten Stelle: kann die Dublettenprüfung nicht
  // lesen, darf der Preflight nicht behaupten, es gäbe keine Dubletten.
  it('wirft, wenn die Dublettenprüfung nicht lesbar ist', async () => {
    const fake = erstelleFakeSupabase((a) =>
      a.tabelle === 'zahlungseingaenge'
        ? { error: { message: 'permission denied' } }
        : db({ rechnungen: [OFFENE_RECHNUNG] })(a))

    await expect(camtPreflight(fake.client, {
      organizationId: ORG, dateiname: 'a.xml', xmlInhalt: auszug(eingang()), quelle: {},
    })).rejects.toThrow(/Dublettenprüfung/)
  })

  it('summiert Ein- und Ausgänge getrennt', async () => {
    const ausgang = `
<Ntry>
  <Amt Ccy="EUR">100.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
  <BookgDt><Dt>2026-08-02</Dt></BookgDt>
  <NtryDtls><TxDtls><RmtInf><Ustrd>Miete</Ustrd></RmtInf></TxDtls></NtryDtls>
</Ntry>`
    const { ergebnis } = await lauf(auszug(eingang() + ausgang), { rechnungen: [OFFENE_RECHNUNG] })
    expect(ergebnis.summeEingangCent).toBe(15050)
    expect(ergebnis.summeAusgangCent).toBe(10000)
    // Nur der zugeordnete Eingang zählt als buchbar.
    expect(ergebnis.summeBuchbarCent).toBe(15050)
  })

  it('meldet die Betriebsart im Ergebnis', async () => {
    const fake = erstelleFakeSupabase(db({ rechnungen: [OFFENE_RECHNUNG] }))
    const e = await camtPreflight(fake.client, {
      organizationId: ORG, dateiname: 'a.xml', xmlInhalt: auszug(eingang()),
      quelle: { CAMT_IMPORT_MODE: 'LIVE' },
    })
    expect(e.modus).toBe('LIVE')
    expect(e.buchend).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

describe('Pilot-Bericht', () => {
  it('stellt die Freigabefrage in die erste Zeile des Ergebnisblocks', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const text = baueCamtPreflightBericht(ergebnis)
    expect(text).toContain('ERGEBNIS: Diese Datei kann scharf importiert werden.')
    expect(text).toContain('ES WURDE NICHTS GEBUCHT')
  })

  it('sagt beim Blocker ausdrücklich NICHT', async () => {
    const { ergebnis } = await lauf(auszug(eingang({ ccy: 'CHF' })), { rechnungen: [OFFENE_RECHNUNG] })
    const text = baueCamtPreflightBericht(ergebnis)
    expect(text).toContain('darf NICHT scharf importiert werden')
  })

  it('enthält keine vollständige IBAN', async () => {
    const { ergebnis } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const text = baueCamtPreflightBericht(ergebnis)
    expect(text).not.toContain('DE89370400440532013000')
    expect(text).toContain('DE89…3000')
  })

  it('führt in der Kurzfassung nur die auffälligen Buchungen auf', async () => {
    const { ergebnis } = await lauf(auszug(eingang() + eingang({ ref: 'REF-2', e2e: 'E2E-2' })), {
      rechnungen: [OFFENE_RECHNUNG],
    })
    const kurz = baueCamtPreflightBericht(ergebnis, { nurAuffaellige: true })
    expect(kurz).toContain('nicht einzeln aufgeführt')
  })
})
