// ═══════════════════════════════════════════════════════════════════════════
// CAMT-PILOT — der begleitete erste Kontoauszug
//
// Fünf Eigenschaften, an denen dieses Modul scheitern kann, ohne dass es
// auffällt — und die deshalb hier einzeln festgehalten sind:
//
//   1. DIE BETRIEBSART IST FEST. Steht CAMT_IMPORT_MODE in der Umgebung auf
//      LIVE, darf der Pilotlauf trotzdem nichts buchen. Ein Pilot, dessen
//      Verhalten an einer Variablen hängt, die jemand anders für den
//      Regelbetrieb setzt, ist kein Pilot.
//   2. ER SCHREIBT NICHTS. Nicht „wahrscheinlich nicht", sondern: kein
//      einziger insert/update/delete über den gesamten Lauf.
//   3. ER BEWERTET NICHT SELBST. Die Einordnung kommt aus dem Preflight und
//      von dort aus bewerteBuchung() — demselben Code, den der scharfe Lauf
//      benutzt.
//   4. ER FINDET DUBLETTEN IN DERSELBEN DATEI. Das ist der Punkt, den weder
//      der Preflight noch der scharfe Import sieht: beide entdoppeln nur
//      gegen die Datenbank.
//   5. ER GIBT KEINE VOLLSTÄNDIGE IBAN AUS. Der Bericht wird ausgedruckt und
//      weitergereicht.
//
// SYNTHETISCHE DATEN: sämtliche XML-Bausteine dieser Datei sind erfunden.
// Die IBANs sind die öffentlichen Beispiel-IBANs aus der ISO-20022-
// Dokumentation, die Beträge Testwerte. Es wird keine echte Bankdatei
// gelesen und keine echte Bankverbindung genannt.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  camtPilotLauf,
  pilotBerichtText,
  beurteilePilot,
  dublettenInDatei,
  baueRechnungsreferenzen,
  centAlsText,
  PILOT_MODUS,
  PILOT_QUELLE,
} from '@/lib/pilot/camt-pilot'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000000000042'
const FREMDE_ORG = '00000000-0000-4000-8000-000000000099'

// ---------------------------------------------------------------------------
// XML-Bausteine — sämtlich erfunden
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
  bookg?: string
  val?: string
} = {}): string {
  return `
<Ntry>
  <Amt Ccy="${opt.ccy ?? 'EUR'}">${opt.betrag ?? '150.50'}</Amt>
  <CdtDbtInd>CRDT</CdtDbtInd>
  <Sts>${opt.sts ?? 'BOOK'}</Sts>
  <BookgDt><Dt>${opt.bookg ?? '2026-08-20'}</Dt></BookgDt>
  <ValDt><Dt>${opt.val ?? '2026-08-21'}</Dt></ValDt>
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
  rechnungen?: {
    id: string
    invoice_number: string
    invoice_number_formatted: string | null
    total_amount: number
    paid_amount: number | null
    client_id: string
    client: { first_name: string; last_name: string } | null
  }[]
  verbuchteHashes?: string[]
  dateiBekannt?: boolean
  rechnungsnummerOrgs?: string[]
  batchItemOrgs?: string[]
}

function db(lage: DbLage = {}) {
  return (a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'camt_imports':
        return { data: lage.dateiBekannt ? { id: 'import-alt' } : null }
      case 'zahlungseingaenge':
        return { data: (lage.verbuchteHashes ?? []).map(h => ({ quelldatei_hash: h })) }
      case 'organizations':
        return { data: { sepa_creditor_id: null } }
      case 'invoices': {
        const istGrenzpruefung = a.filter.some(f => f.methode === 'in')
        if (istGrenzpruefung) {
          return { data: (lage.rechnungsnummerOrgs ?? []).map(o => ({ organization_id: o })) }
        }
        return { data: lage.rechnungen ?? [] }
      }
      case 'sepa_batch_items':
        return { data: (lage.batchItemOrgs ?? []).map(o => ({ organization_id: o })) }
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

async function lauf(
  xml: string,
  lage: DbLage = {},
  umgebung: Record<string, string | undefined> = {},
) {
  const fake = erstelleFakeSupabase(db(lage))
  const bericht = await camtPilotLauf(fake.client as unknown as SupabaseClient, {
    organizationId: ORG,
    dateiname: 'auszug.xml',
    xmlInhalt: xml,
    umgebung,
  })
  return { bericht, fake }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Die Betriebsart ist fest
// ═══════════════════════════════════════════════════════════════════════

describe('Betriebsart', () => {
  it('PILOT_QUELLE steht auf DRY_RUN und ist eingefroren', () => {
    expect(PILOT_MODUS).toBe('DRY_RUN')
    expect(PILOT_QUELLE.CAMT_IMPORT_MODE).toBe('DRY_RUN')
    expect(Object.isFrozen(PILOT_QUELLE)).toBe(true)
  })

  it('bucht auch dann nicht, wenn die Umgebung auf LIVE steht', async () => {
    const { bericht, fake } = await lauf(
      auszug(eingang()),
      { rechnungen: [OFFENE_RECHNUNG] },
      { CAMT_IMPORT_MODE: 'LIVE' },
    )
    expect(bericht.modus).toBe('DRY_RUN')
    expect(bericht.buchend).toBe(false)
    expect(bericht.umgebung.laufBuchend).toBe(false)
    expect(fake.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('meldet einen LIVE-Umgebungsstand als Warnung, statt ihn zu verschweigen', async () => {
    const { bericht } = await lauf(
      auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] }, { CAMT_IMPORT_MODE: 'LIVE' },
    )
    expect(bericht.umgebung.umgebungModus).toBe('LIVE')
    expect(bericht.umgebung.umgebungBuchend).toBe(true)
    expect(bericht.warnungen.some(w => w.includes('LIVE'))).toBe(true)
  })

  it('ohne Umgebungsvariable ist der Umgebungsstand ebenfalls DRY_RUN', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] }, {})
    expect(bericht.umgebung.umgebungModus).toBe('DRY_RUN')
    expect(bericht.umgebung.umgebungBuchend).toBe(false)
    expect(bericht.warnungen.some(w => w.includes('LIVE'))).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Er schreibt nichts
// ═══════════════════════════════════════════════════════════════════════

describe('Schreibfreiheit', () => {
  it('kein insert, update oder delete über den ganzen Lauf', async () => {
    const { fake } = await lauf(
      auszug(eingang() + eingang({ zweck: 'ohne Bezug', e2e: 'E2E-2', ref: 'REF-2' })),
      { rechnungen: [OFFENE_RECHNUNG] },
    )
    const schreibend = fake.aufrufe.filter(a => a.operation !== 'select')
    expect(schreibend.map(a => `${a.operation} ${a.tabelle}`)).toEqual([])
  })

  it('jeder Posten trägt gebucht=false, auch wenn er buchbar wäre', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.posten.length).toBeGreaterThan(0)
    for (const p of bericht.posten) expect(p.gebucht).toBe(false)
  })

  it('wuerdeBuchen ist eine Aussage über den scharfen Lauf, nicht über diesen', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const p = bericht.posten[0]
    expect(p.wuerdeBuchen).toBe(p.einordnung === 'MATCHED')
    expect(p.gebucht).toBe(false)
  })

  it('das Modul exportiert keine Funktion mit "buch" oder "import" im Namen', async () => {
    const modul = await import('@/lib/pilot/camt-pilot')
    const verdaechtig = Object.keys(modul).filter(n =>
      /^(buche|importiere|speichere|schreibe)/i.test(n))
    expect(verdaechtig).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Vollständigkeit des Berichts
// ═══════════════════════════════════════════════════════════════════════

describe('Berichtsfelder', () => {
  it('trägt je Posten alle geforderten Felder', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const p = bericht.posten[0]

    expect(p.betragCent).toBe(15050)              // centgenau
    expect(p.betragAbsolutCent).toBe(15050)
    expect(p.betragText).toBe('150,50 €')
    expect(p.sollHaben).toBe('Haben')             // Soll/Haben
    expect(p.richtung).toBe('CRDT')
    expect(p.debitorIbanKurz).toBe('DE89…3000')   // IBAN, verkürzt
    expect(p.endToEndId).toBe('E2E-1')
    expect(p.verwendungszweck).toBe('RE-2026-0001')
    expect(p.debitorName).toBe('Erika Mustermann')
    expect(p.zahlungsdatum).toBe('2026-08-20')
    expect(p.valutadatum).toBe('2026-08-21')
    expect(p.organizationId).toBe(ORG)            // Mandant
    expect(typeof p.confidence).toBe('number')
    expect(p.dublettenschutz.buchungsHash).toMatch(/^bh_[0-9a-f]{64}$/)
    expect(p.rechnungsreferenzen.map(r => r.nummer)).toContain('RE-2026-0001')
  })

  it('gibt die Zahler-IBAN NIE vollständig aus — auch nicht im Textbericht', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const text = pilotBerichtText(bericht)
    const alsJson = JSON.stringify(bericht)
    for (const inhalt of [text, alsJson]) {
      expect(inhalt).not.toContain('DE89370400440532013000')
      expect(inhalt).not.toContain('DE02120300000000202051')
    }
    expect(text).toContain('DE89…3000')
  })

  it('nennt nie die Kennung eines fremden Mandanten', async () => {
    const { bericht } = await lauf(
      auszug(eingang({ zweck: 'RE-2026-9999' })),
      { rechnungsnummerOrgs: [FREMDE_ORG] },
    )
    const inhalt = pilotBerichtText(bericht) + JSON.stringify(bericht)
    expect(inhalt).not.toContain(FREMDE_ORG)
  })

  it('die erste Zeile des Textberichts sagt, dass nichts gebucht wurde', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    const zeilen = pilotBerichtText(bericht).split('\n')
    expect(zeilen.slice(0, 3).join(' ')).toContain('ES WURDE NICHTS GEBUCHT')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Einordnung
// ═══════════════════════════════════════════════════════════════════════

describe('Einordnung', () => {
  it('MATCHED bei genau einer passenden Rechnung', async () => {
    const { bericht } = await lauf(auszug(eingang()), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.posten[0].einordnung).toBe('MATCHED')
    expect(bericht.nachEinordnung.MATCHED).toBe(1)
    expect(bericht.summeBuchbarCent).toBe(15050)
  })

  it('UNMATCHED, wenn keine Rechnung in Frage kommt', async () => {
    const { bericht } = await lauf(auszug(eingang({ zweck: 'Spende', betrag: '7.00' })), {})
    expect(bericht.posten[0].einordnung).toBe('UNMATCHED')
    expect(bericht.posten[0].wuerdeBuchen).toBe(false)
    expect(bericht.summeBuchbarCent).toBe(0)
  })

  it('INVALID bei fremder Währung', async () => {
    const { bericht } = await lauf(
      auszug(eingang({ ccy: 'CHF' })), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.posten[0].einordnung).toBe('INVALID')
    // Eine ungültige Zeile ist ein Blocker des scharfen Imports — und damit
    // ist der Auszug auch als Pilotlauf untauglich.
    expect(bericht.blocker.length).toBeGreaterThan(0)
    expect(bericht.urteil).toBe('UNTAUGLICH')
  })

  it('INVALID bei nicht endgültig gebuchter Zeile', async () => {
    const { bericht } = await lauf(
      auszug(eingang({ sts: 'PDNG' })), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.posten[0].einordnung).toBe('INVALID')
  })

  it('CROSS_TENANT_BLOCKED, wenn die Rechnungsnummer nur woanders existiert', async () => {
    const { bericht } = await lauf(
      auszug(eingang({ zweck: 'RE-2026-9999' })),
      { rechnungsnummerOrgs: [FREMDE_ORG] },
    )
    expect(bericht.posten[0].einordnung).toBe('CROSS_TENANT_BLOCKED')
    expect(bericht.urteil).toBe('UNTAUGLICH')
  })

  it('DUPLICATE, wenn der Buchungshash schon verbucht ist', async () => {
    const xml = auszug(eingang())
    const ersterLauf = await lauf(xml, { rechnungen: [OFFENE_RECHNUNG] })
    const hash = ersterLauf.bericht.posten[0].dublettenschutz.buchungsHash

    const { bericht } = await lauf(xml, {
      rechnungen: [OFFENE_RECHNUNG],
      verbuchteHashes: [hash],
    })
    expect(bericht.posten[0].einordnung).toBe('DUPLICATE')
    expect(bericht.posten[0].dublettenschutz.bereitsVerbucht).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Dublette INNERHALB derselben Datei — der neue Befund
// ═══════════════════════════════════════════════════════════════════════

describe('Dublette in derselben Datei', () => {
  it('dublettenInDatei markiert die zweite Fundstelle, nicht die erste', () => {
    const m = dublettenInDatei(['a', 'b', 'a', 'c', 'a'])
    expect(m.get(1)).toBeNull()
    expect(m.get(2)).toBeNull()
    expect(m.get(3)).toBe(1)
    expect(m.get(4)).toBeNull()
    expect(m.get(5)).toBe(1)
  })

  it('stuft die zweite identische Buchung auf DUPLICATE herunter', async () => {
    // Zwei vollständig identische Ntry-Blöcke — gleicher Betrag, gleiche
    // Referenz, gleiches Datum. Der Parser erzeugt denselben Buchungshash.
    const zeile = eingang()
    const { bericht } = await lauf(auszug(zeile + zeile), { rechnungen: [OFFENE_RECHNUNG] })

    expect(bericht.gesamt).toBe(2)
    expect(bericht.dublettenInDatei).toBe(1)
    expect(bericht.posten[0].einordnung).toBe('MATCHED')
    expect(bericht.posten[1].einordnung).toBe('DUPLICATE')
    expect(bericht.posten[1].dublettenschutz.dublettVonZeile).toBe(1)
    expect(bericht.posten[1].begruendung).toContain('DERSELBEN Datei')
  })

  it('zählt die Dublette nicht als buchbar mit', async () => {
    const zeile = eingang()
    const { bericht } = await lauf(auszug(zeile + zeile), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.summeBuchbarCent).toBe(15050)   // nicht 30100
    expect(bericht.nachEinordnung.MATCHED).toBe(1)
    expect(bericht.nachEinordnung.DUPLICATE).toBe(1)
  })

  it('macht den Auszug als ERSTLAUF untauglich, ohne ihn zu blockieren', async () => {
    const zeile = eingang()
    const { bericht } = await lauf(auszug(zeile + zeile), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.urteil).toBe('NICHT_ALS_ERSTLAUF')
    expect(bericht.blocker).toEqual([])            // technisch importierbar
    expect(bericht.begruendung.join(' ')).toContain('23505')
  })

  it('ein schwererer Befund schlägt die Dublette in der Datei', async () => {
    // Beide Zeilen ungültig (Fremdwährung) UND identisch: INVALID gewinnt.
    const zeile = eingang({ ccy: 'CHF' })
    const { bericht } = await lauf(auszug(zeile + zeile), { rechnungen: [OFFENE_RECHNUNG] })
    expect(bericht.posten[1].einordnung).toBe('INVALID')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Das Piloturteil
// ═══════════════════════════════════════════════════════════════════════

describe('beurteilePilot', () => {
  const leer = { MATCHED: 0, AMBIGUOUS: 0, UNMATCHED: 0, DUPLICATE: 0, INVALID: 0, CROSS_TENANT_BLOCKED: 0 }

  it('UNTAUGLICH, sobald der scharfe Import blockieren würde', () => {
    const u = beurteilePilot(
      { freigabefaehig: false, blocker: ['Datei bereits importiert'], gesamt: 3, nachEinordnung: { ...leer, MATCHED: 3 } },
      0,
    )
    expect(u.urteil).toBe('UNTAUGLICH')
    expect(u.begruendung).toContain('Datei bereits importiert')
  })

  it('PILOT_TAUGLICH bei sauberem Auszug', () => {
    const u = beurteilePilot(
      { freigabefaehig: true, blocker: [], gesamt: 4, nachEinordnung: { ...leer, MATCHED: 4 } },
      0,
    )
    expect(u.urteil).toBe('PILOT_TAUGLICH')
  })

  it('NICHT_ALS_ERSTLAUF, wenn mehr als die Hälfte in den Klärfall ginge', () => {
    const u = beurteilePilot(
      { freigabefaehig: true, blocker: [], gesamt: 10, nachEinordnung: { ...leer, MATCHED: 4, UNMATCHED: 6 } },
      0,
    )
    expect(u.urteil).toBe('NICHT_ALS_ERSTLAUF')
    expect(u.begruendung.join(' ')).toContain('mehr als die Hälfte')
  })

  it('genau die Hälfte Klärfälle ist noch tauglich — die Schwelle ist streng "mehr als"', () => {
    const u = beurteilePilot(
      { freigabefaehig: true, blocker: [], gesamt: 10, nachEinordnung: { ...leer, MATCHED: 5, UNMATCHED: 5 } },
      0,
    )
    expect(u.urteil).toBe('PILOT_TAUGLICH')
  })

  it('eine leere Datei ist kein Erstlauf', () => {
    const u = beurteilePilot(
      { freigabefaehig: true, blocker: [], gesamt: 0, nachEinordnung: { ...leer } }, 0)
    expect(u.urteil).toBe('NICHT_ALS_ERSTLAUF')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Reine Hilfsfunktionen
// ═══════════════════════════════════════════════════════════════════════

describe('centAlsText', () => {
  it('rechnet centgenau und schreibt deutsch', () => {
    expect(centAlsText(0)).toBe('0,00 €')
    expect(centAlsText(1)).toBe('0,01 €')
    expect(centAlsText(15050)).toBe('150,50 €')
    expect(centAlsText(123456789)).toBe('1.234.567,89 €')
    expect(centAlsText(-4200)).toBe('-42,00 €')
  })
})

describe('baueRechnungsreferenzen', () => {
  it('kennzeichnet, welche Nummer bei diesem Mandanten existiert', () => {
    const r = baueRechnungsreferenzen('Zahlung RE-2026-0001 und RE-2026-0002', [
      { invoiceNumber: 'RE-2026-0001', clientName: 'A', confidence: 95, matchMethode: 'nummer', offenCent: 100 },
    ])
    const eins = r.find(x => x.nummer === 'RE-2026-0001')!
    expect(eins.eigenerMandant).toBe(true)
    expect(eins.confidence).toBe(95)

    const zwei = r.find(x => x.nummer === 'RE-2026-0002')
    if (zwei) {
      expect(zwei.eigenerMandant).toBe(false)
      expect(zwei.confidence).toBeNull()
    }
  })

  it('leerer Verwendungszweck ergibt keine Referenz', () => {
    expect(baueRechnungsreferenzen(null, [])).toEqual([])
  })
})
