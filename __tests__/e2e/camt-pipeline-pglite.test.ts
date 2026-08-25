/**
 * CAMT-Produktionsreife — die ganze Strecke auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Phase 4.5 hat den PARSER gehaertet (SHA-256, fail-closed, die
 * Ruecklastschrift-Heuristik). Getestet war danach aber nur der Parser:
 * ab dem Punkt, an dem eine Buchung zu einer ZEILE wird, lief die Strecke
 * ungeprueft — Kontoauszugs-Datensatz, `zahlungseingaenge`, Matching,
 * Ruecklastschrift-Handler, Klaerfaelle, Audit.
 *
 * Genau dort sitzen die schweren Fehler, weil dort die Datenbank
 * mitredet: Spaltentypen, CHECK-Constraints, Fremdschluessel. Ein
 * Fake-DB-Test sieht davon nichts (siehe
 * testschema-lockerer-als-produktion), deshalb laeuft diese Suite gegen
 * ein echtes Postgres mit den Tabellen WORTGLEICH aus den Migrationen.
 *
 * Gefahren wird der ECHTE Route-Handler POST /api/billing/camt/import.
 * Gemockt sind nur Authentifizierung und der Admin-Client — alles
 * dahinter ist Produktionscode.
 *
 * ── ABGEDECKTE FAELLE ──────────────────────────────────────────────────
 *   1  Normale Zahlung, Match ueber die Rechnungsnummer
 *   2  Ruecklastschrift (RvslInd / RDDT / RRTN / RtrInf)
 *   3  Zwei Rechnungen mit gleichem Betrag (Mehrdeutigkeit)
 *   4  Fehlende Referenz (kein Match)
 *   5  Sammelbuchung (mehrere Teilbetraege in einem Ntry)
 *   6  PDNG (vorgemerkt) — kein Geldeingang
 *   7  Ausgehende Zahlung (DBIT) — kein Zahlungseingang
 *   8  Ungueltiger Betrag (0 / negativ / unlesbar)
 *   9  Fehlendes Datum
 *  10  Duplikat — derselbe Auszug ein zweites Mal
 *  11  Falscher Mandant (Cross-Tenant)
 *  +   SHA-256, quelldatei_hash, Fehlerpfade ohne stilles Verschlucken
 *
 * PREISE: alle Betraege sind Testwerte innerhalb der In-Memory-Instanz.
 * Es wird kein Tarif und kein Kassensatz behauptet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

// ─────────────────────────────────────────────────────────────────────
// Aussenschnittstellen
// ─────────────────────────────────────────────────────────────────────
const halter = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  /** Wer gerade importiert — je Test umstellbar (Mandantengrenze). */
  auth: { organizationId: '', userId: '' },
  /** Gesetzt ⇒ requireOpsAdmin liefert diese Ablehnung statt ok. */
  ablehnung: null as null | { status: number; body: unknown },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

vi.mock('@/lib/ops/api-auth', () => ({
  requireOpsAdmin: async (_b?: string) => {
    if (halter.ablehnung) {
      const { NextResponse } = await import('next/server')
      return {
        ok: false as const,
        response: NextResponse.json(halter.ablehnung.body, { status: halter.ablehnung.status }),
      }
    }
    return {
      ok: true as const,
      ctx: {
        organizationId: halter.auth.organizationId,
        userId: halter.auth.userId,
        role: 'admin',
        name: 'Alltagsengel',
      },
    }
  },
}))

import { POST as camtImport } from '@/app/api/billing/camt/import/route'
import { parseCamtXml, computeCamtFileHash } from '@/lib/billing/camt/camt-parser'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────
// Feste IDs
// ─────────────────────────────────────────────────────────────────────
const ORG_A   = 'aaaaaaaa-0000-4000-8000-00000000ca01'
const ORG_B   = 'bbbbbbbb-0000-4000-8000-00000000ca01'
const ADMIN_A = '11111111-0000-4000-8000-00000000ca01'
const ADMIN_B = '22222222-0000-4000-8000-00000000ca01'

const KLIENT_A  = 'c1111111-0000-4000-8000-00000000ca01'
const KLIENT_A2 = 'c1111111-0000-4000-8000-00000000ca02'
const KLIENT_B  = 'c2222222-0000-4000-8000-00000000ca01'

const IBAN_KUNDE = 'DE89370400440532013000'

let db: PGlite
let admin: ReturnType<typeof macheSupabaseClient>

function alsSupabase(c: ReturnType<typeof macheSupabaseClient>): SupabaseClient {
  return c as unknown as SupabaseClient
}

// ─────────────────────────────────────────────────────────────────────
// CAMT-Bausteine
// ─────────────────────────────────────────────────────────────────────

/** Baut eine camt.053-Datei um beliebige <Ntry>-Bloecke. */
function auszug(ntries: string, msgId = 'M1'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>${msgId}</MsgId><CreDtTm>2026-08-24T09:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>S-${msgId}</Id>
      <CreDtTm>2026-08-24T09:00:00</CreDtTm>
      <Acct><Id><IBAN>DE02120300000000202051</IBAN></Id></Acct>
      ${ntries}
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

interface NtryWunsch {
  betrag: string
  richtung?: 'CRDT' | 'DBIT'
  status?: string
  buchungsdatum?: string | null
  valuta?: string | null
  ref?: string
  e2e?: string | null
  mndt?: string | null
  zweck?: string | null
  debitorName?: string | null
  debitorIban?: string | null
  extra?: string
}

function ntry(w: NtryWunsch): string {
  const {
    betrag, richtung = 'CRDT', status = 'BOOK',
    buchungsdatum = '2026-08-20', valuta = '2026-08-21',
    ref = 'REF-1', e2e = null, mndt = null, zweck = null,
    debitorName = 'Erika Mustermann', debitorIban = IBAN_KUNDE, extra = '',
  } = w
  const refs = [
    e2e ? `<EndToEndId>${e2e}</EndToEndId>` : '',
    mndt ? `<MndtId>${mndt}</MndtId>` : '',
  ].join('')
  return `
<Ntry>
  <Amt Ccy="EUR">${betrag}</Amt>
  <CdtDbtInd>${richtung}</CdtDbtInd>
  <Sts><Cd>${status}</Cd></Sts>
  ${buchungsdatum ? `<BookgDt><Dt>${buchungsdatum}</Dt></BookgDt>` : ''}
  ${valuta ? `<ValDt><Dt>${valuta}</Dt></ValDt>` : ''}
  <AcctSvcrRef>${ref}</AcctSvcrRef>
  ${extra}
  <NtryDtls><TxDtls>
    ${refs ? `<Refs>${refs}</Refs>` : ''}
    <RltdPties>
      ${debitorName ? `<Dbtr><Nm>${debitorName}</Nm></Dbtr>` : ''}
      ${debitorIban ? `<DbtrAcct><Id><IBAN>${debitorIban}</IBAN></Id></DbtrAcct>` : ''}
    </RltdPties>
    ${zweck ? `<RmtInf><Ustrd>${zweck}</Ustrd></RmtInf>` : ''}
  </TxDtls></NtryDtls>
</Ntry>`
}

/** Ruft den echten Route-Handler mit einer CAMT-Datei auf. */
async function importiere(xml: string, dateiname = 'auszug.xml') {
  const fd = new FormData()
  fd.append('file', new File([xml], dateiname, { type: 'application/xml' }))
  const req = new Request('http://localhost/api/billing/camt/import', {
    method: 'POST',
    body: fd,
  })
  const res = await camtImport(req as never)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`
  )
  return r.rows[0]?.n ?? 0
}

async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

/** Legt eine festgeschriebene Rechnung an und gibt ihre ID zurueck. */
let rechnungsZaehler = 0
async function legeRechnung(opts: {
  org: string
  klient: string
  nummer: string
  betragEuro: number
  status?: string
}): Promise<string> {
  rechnungsZaehler++
  const id = `f0000000-0000-4000-8000-${String(rechnungsZaehler).padStart(12, '0')}`
  await db.exec(`
    INSERT INTO public.invoices
      (id, organization_id, client_id, invoice_number, invoice_number_formatted,
       period_start, period_end, total_amount, status, dunning_level)
    VALUES ('${id}', '${opts.org}', '${opts.klient}', '${opts.nummer}', '${opts.nummer}',
            '2026-07-01', '2026-07-31', ${opts.betragEuro},
            '${opts.status ?? 'freigegeben'}', 'offen');
  `)
  return id
}

// ─────────────────────────────────────────────────────────────────────

/**
 * Diese Suite prueft den BUCHENDEN Weg. Der Import laeuft seit
 * lib/billing/camt/camt-modus.ts fail-closed: ohne CAMT_IMPORT_MODE=LIVE
 * antwortet die Route mit einem Trockenlauf (200, nichts geschrieben).
 *
 * Der Schalter wird hier ausdruecklich gesetzt und nach der Suite wieder
 * zurueckgenommen — nicht global in der Testumgebung. Eine Testumgebung, in
 * der der scharfe Modus dauerhaft an ist, koennte die Absicherung selbst
 * nicht mehr pruefen; genau dafuer gibt es den Abschnitt
 * „Betriebsart" weiter unten.
 */
const MODUS_VORHER = process.env.CAMT_IMPORT_MODE

beforeAll(async () => {
  process.env.CAMT_IMPORT_MODE = 'LIVE'
  db = await baueKettenSchema()
  await baueCamtTabellen(db)

  admin = macheSupabaseClient(db)
  halter.client = alsSupabase(admin)
  halter.auth = { organizationId: ORG_A, userId: ADMIN_A }

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN_A}', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin-b@example.org');

    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin', 'Admin', 'Beta',  'admin-b@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code) VALUES
      ('${KLIENT_A}',  '${ORG_A}', 'A-0001', 'Erika',  'Mustermann', '60311'),
      ('${KLIENT_A2}', '${ORG_A}', 'A-0002', 'Hans',   'Zweitkunde', '60311'),
      ('${KLIENT_B}',  '${ORG_B}', 'B-0001', 'Berta',  'Fremdorg',   '80331');
  `)
}, 120000)

afterAll(async () => {
  if (MODUS_VORHER === undefined) delete process.env.CAMT_IMPORT_MODE
  else process.env.CAMT_IMPORT_MODE = MODUS_VORHER
  await db?.close()
})

beforeEach(() => {
  halter.ablehnung = null
  halter.auth = { organizationId: ORG_A, userId: ADMIN_A }
})

/** Leert die CAMT-Strecke zwischen den Abschnitten. */
async function leereStrecke(): Promise<void> {
  await db.exec(`
    DELETE FROM public.klaerfaelle;
    DELETE FROM public.zahlungseingaenge;
    DELETE FROM public.camt_imports;
    DELETE FROM public.payment_allocations;
    DELETE FROM public.payment_differences;
    DELETE FROM public.payments;
    DELETE FROM public.sepa_batch_items;
    DELETE FROM public.sepa_batches;
    DELETE FROM public.sepa_mandates;
    DELETE FROM public.billing_audit_trail;
    DELETE FROM public.dunning_entries;
    DELETE FROM public.invoices;
  `)
}

// ═════════════════════════════════════════════════════════════════════
describe('Fall 1: normale Zahlung — Match ueber die Rechnungsnummer', () => {
  let rechnung: string

  beforeAll(async () => {
    await leereStrecke()
    rechnung = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0001', betragEuro: 150.5,
    })
  })

  it('der Import legt Kontoauszug und Zahlungseingang an', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '150.50', ref: 'REF-N1', e2e: 'E2E-N1', zweck: 'RE-2026-0001',
    })), 'normal.xml')

    expect(r.status).toBe(201)
    expect(r.body.buchungenGesamt).toBe(1)
    expect(await zaehle('camt_imports')).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(1)
  })

  it('der Zahlungseingang traegt Betrag, Zahler und Verwendungszweck', async () => {
    const [ze] = await zeilen<{ betrag_cent: string; debitor_iban: string; verwendungszweck: string }>(
      'SELECT * FROM public.zahlungseingaenge'
    )
    expect(Number(ze.betrag_cent)).toBe(15050)
    expect(ze.debitor_iban).toBe(IBAN_KUNDE)
    expect(ze.verwendungszweck).toBe('RE-2026-0001')
  })

  it('BEFUND: die Rechnungsnummer im Zweck reicht fuer die Auto-Zuordnung', async () => {
    // 50 (Rechnungsnummer) + 20 (Betrag exakt) = 70 = Schwellwert.
    const [ze] = await zeilen<{ zuordnungs_status: string; zuordnungs_confidence: number }>(
      'SELECT * FROM public.zahlungseingaenge'
    )
    expect(ze.zuordnungs_status).toBe('automatisch')
    expect(ze.zuordnungs_confidence).toBeGreaterThanOrEqual(70)
  })

  it('die Rechnung ist danach bezahlt und die Zahlung zugeordnet', async () => {
    const [inv] = await zeilen<{ status: string; paid_amount: string }>(
      `SELECT * FROM public.invoices WHERE id = '${rechnung}'`
    )
    expect(inv.status).toBe('bezahlt')
    expect(Number(inv.paid_amount)).toBeCloseTo(150.5, 2)
    expect(await zaehle('payment_allocations')).toBe(1)
  })

  it('der Vorgang steht im Pruefpfad', async () => {
    const arten = await zeilen<{ entity_type: string; action: string }>(
      'SELECT entity_type, action FROM public.billing_audit_trail'
    )
    expect(arten.map(a => a.entity_type)).toContain('camt_import')
    expect(arten.map(a => a.entity_type)).toContain('zahlungseingang')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 2: Ruecklastschrift', () => {
  const MANDAT = 'aaaa1111-0000-4000-8000-00000000ca01'
  const BATCH  = 'aaaa2222-0000-4000-8000-00000000ca01'
  let rechnung: string
  let rechnung2: string

  beforeAll(async () => {
    await leereStrecke()
    // Zwei Lastschriften desselben Mandats — nur so ist die Sperre nach
    // der ZWEITEN Ruecklastschrift ueberhaupt erreichbar: gezaehlt werden
    // Lastschriftposten, nicht Ereignisse.
    rechnung = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0002', betragEuro: 89,
      status: 'bezahlt',
    })
    rechnung2 = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0003', betragEuro: 89,
      status: 'bezahlt',
    })
    await db.exec(`
      UPDATE public.invoices SET paid_amount = 89
        WHERE id IN ('${rechnung}', '${rechnung2}');

      INSERT INTO public.sepa_mandates
        (id, organization_id, client_id, mandate_reference, mandate_date,
         debtor_name, debtor_iban, status)
      VALUES ('${MANDAT}', '${ORG_A}', '${KLIENT_A}', 'MANDAT-4711', '2026-01-01',
              'Erika Mustermann', '${IBAN_KUNDE}', 'aktiv');

      INSERT INTO public.sepa_batches
        (id, organization_id, batch_number, requested_collection_date)
      VALUES ('${BATCH}', '${ORG_A}', 'SEPA-1', '2026-08-10');

      INSERT INTO public.sepa_batch_items
        (organization_id, batch_id, invoice_id, mandate_id, amount_cents,
         end_to_end_id, status)
      VALUES
        ('${ORG_A}', '${BATCH}', '${rechnung}',  '${MANDAT}', 8900, 'E2E-LS-2', 'eingezogen'),
        ('${ORG_A}', '${BATCH}', '${rechnung2}', '${MANDAT}', 8900, 'E2E-LS-3', 'eingezogen');
    `)
  })

  it('RvslInd=true wird als Ruecklastschrift verbucht, nicht als Eingang', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '89.00', richtung: 'DBIT', ref: 'REF-RL', e2e: 'E2E-LS-2',
      mndt: 'MANDAT-4711', extra: '<RvslInd>true</RvslInd>',
    })), 'ruecklast.xml')

    expect(r.status).toBe(201)
    const [ze] = await zeilen<{ ist_ruecklastschrift: boolean }>(
      'SELECT * FROM public.zahlungseingaenge'
    )
    expect(ze.ist_ruecklastschrift).toBe(true)
  })

  it('der Lastschriftposten steht danach auf "ruecklastschrift"', async () => {
    const [item] = await zeilen<{ status: string; error_reason: string }>(
      "SELECT * FROM public.sepa_batch_items WHERE end_to_end_id = 'E2E-LS-2'"
    )
    expect(item.status).toBe('ruecklastschrift')
    expect(item.error_reason).toContain('2026-08-20')
  })

  it('die Rechnung ist wieder offen', async () => {
    const [inv] = await zeilen<{ status: string; paid_amount: string; bezahlt: boolean }>(
      `SELECT * FROM public.invoices WHERE id = '${rechnung}'`
    )
    expect(inv.status).toBe('freigegeben')
    expect(Number(inv.paid_amount)).toBe(0)
  })

  it('BEFUND: die Ruecklastschriftgebuehr wird gebucht', async () => {
    // verarbeiteRuecklastschrift() schreibt sie nach payment_differences.
    // Schlaegt der INSERT fehl, faellt das NIRGENDS auf: der Rueckgabewert
    // wird nicht geprueft. Genau das haelt dieser Test fest.
    expect(await zaehle('payment_differences')).toBe(1)
  })

  it('BkTxCd/Fmly/Cd=RRTN wird ebenso erkannt', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '89.00', richtung: 'DBIT', ref: 'REF-RRTN', e2e: 'E2E-LS-3',
      extra: '<BkTxCd><Domn><Cd>PMNT</Cd><Fmly><Cd>RRTN</Cd></Fmly></Domn></BkTxCd>',
    }), 'M-RRTN'), 'rrtn.xml')
    expect(r.status).toBe(201)
    expect(r.body.ergebnisse).toEqual([
      expect.objectContaining({ istRuecklastschrift: true, ruecklastschriftGrund: 'BkTxCd/Fmly/Cd=RRTN' }),
    ])
  })

  it('RtrInf mit Rueckgabegrund wird erkannt und der Grund festgehalten', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '89.00', richtung: 'DBIT', ref: 'REF-RTR', e2e: 'E2E-LS-2',
      extra: '<RtrInf><Rsn><Cd>MS03</Cd></Rsn></RtrInf>',
    }), 'M-RTR'), 'rtrinf.xml')
    expect(r.status).toBe(201)
    expect(r.body.ergebnisse).toEqual([
      expect.objectContaining({ ruecklastschriftGrund: 'RtrInf/Rsn=MS03' }),
    ])
  })

  it('nach zwei Ruecklastschriften ist das Mandat gesperrt', async () => {
    const [m] = await zeilen<{ status: string; revoke_reason: string }>(
      'SELECT * FROM public.sepa_mandates'
    )
    expect(m.status).toBe('widerrufen')
    expect(m.revoke_reason).toMatch(/Ruecklastschriften|Rücklastschriften/)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 3: zwei Rechnungen mit gleichem Betrag — Mehrdeutigkeit', () => {
  beforeAll(async () => {
    await leereStrecke()
    await legeRechnung({ org: ORG_A, klient: KLIENT_A,  nummer: 'RE-2026-0010', betragEuro: 200 })
    await legeRechnung({ org: ORG_A, klient: KLIENT_A2, nummer: 'RE-2026-0011', betragEuro: 200 })
  })

  it('ohne Rechnungsnummer im Zweck ordnet der Lauf NICHT automatisch zu', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '200.00', ref: 'REF-AMBIG', zweck: 'Zahlung', debitorIban: null,
      debitorName: null,
    })), 'ambig.xml')

    expect(r.status).toBe(201)
    expect(r.body.zugeordnet).toBe(0)
    expect(r.body.klaerfaelle).toBe(1)
  })

  it('der Klaerfall traegt beide Rechnungen als Vorschlag', async () => {
    const [kf] = await zeilen<{ grund: string; vorschlaege: unknown[] }>(
      'SELECT * FROM public.klaerfaelle'
    )
    expect(kf.vorschlaege).toHaveLength(2)
    expect(kf.grund).toMatch(/Schwellwert|Uebereinstimmung/)
  })

  it('keine Rechnung wurde angefasst', async () => {
    expect(await zaehle('payments')).toBe(0)
    expect(await zaehle('invoices', "status = 'bezahlt'")).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 4: fehlende Referenz — kein Match', () => {
  beforeAll(async () => {
    await leereStrecke()
    await legeRechnung({ org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-0020', betragEuro: 77.77 })
  })

  it('eine Zahlung ohne jede Referenz landet im Klaerfall', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '12.34', ref: 'REF-LEER', zweck: null,
      debitorName: null, debitorIban: null,
    })), 'ohne-referenz.xml')

    expect(r.status).toBe(201)
    expect(r.body.klaerfaelle).toBe(1)
    const [kf] = await zeilen<{ grund: string; vorschlaege: unknown[] }>(
      'SELECT * FROM public.klaerfaelle'
    )
    expect(kf.vorschlaege).toHaveLength(0)
    expect(kf.grund).toBe('Keine ausreichende Uebereinstimmung gefunden')
  })

  it('der Zahlungseingang bleibt trotzdem erhalten — Geld verschwindet nicht', async () => {
    const [ze] = await zeilen<{ betrag_cent: string; zuordnungs_status: string }>(
      'SELECT * FROM public.zahlungseingaenge'
    )
    expect(Number(ze.betrag_cent)).toBe(1234)
    expect(ze.zuordnungs_status).toBe('klaerfall')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 5: Sammelbuchung', () => {
  beforeAll(async () => {
    await leereStrecke()
    await legeRechnung({ org: ORG_A, klient: KLIENT_A,  nummer: 'RE-2026-0030', betragEuro: 100 })
    await legeRechnung({ org: ORG_A, klient: KLIENT_A2, nummer: 'RE-2026-0031', betragEuro: 50 })
  })

  const SAMMEL = `
<Ntry>
  <Amt Ccy="EUR">150.00</Amt>
  <CdtDbtInd>CRDT</CdtDbtInd>
  <Sts><Cd>BOOK</Cd></Sts>
  <BookgDt><Dt>2026-08-20</Dt></BookgDt>
  <ValDt><Dt>2026-08-21</Dt></ValDt>
  <AcctSvcrRef>REF-SAMMEL</AcctSvcrRef>
  <NtryDtls>
    <TxDtls>
      <Amt Ccy="EUR">100.00</Amt>
      <Refs><EndToEndId>E2E-S1</EndToEndId></Refs>
      <RmtInf><Ustrd>RE-2026-0030</Ustrd></RmtInf>
    </TxDtls>
    <TxDtls>
      <Amt Ccy="EUR">50.00</Amt>
      <Refs><EndToEndId>E2E-S2</EndToEndId></Refs>
      <RmtInf><Ustrd>RE-2026-0031</Ustrd></RmtInf>
    </TxDtls>
  </NtryDtls>
</Ntry>`

  it('jede Teilbuchung wird eine eigene Zeile mit IHREM Betrag', async () => {
    const r = await importiere(auszug(SAMMEL), 'sammel.xml')
    expect(r.status).toBe(201)
    expect(r.body.buchungenGesamt).toBe(2)

    const betraege = (await zeilen<{ betrag_cent: string }>(
      'SELECT betrag_cent FROM public.zahlungseingaenge ORDER BY betrag_cent DESC'
    )).map(z => Number(z.betrag_cent))
    expect(betraege).toEqual([10000, 5000])
  })

  it('die Summe der Zeilen entspricht der Sammelbuchung — kein Betrag doppelt', async () => {
    const [{ summe }] = await zeilen<{ summe: string }>(
      'SELECT COALESCE(sum(betrag_cent),0)::text AS summe FROM public.zahlungseingaenge'
    )
    expect(Number(summe)).toBe(15000)
  })

  it('beide Teilbetraege werden ihrer Rechnung zugeordnet', async () => {
    const zugeordnet = await zaehle('zahlungseingaenge', "zuordnungs_status = 'automatisch'")
    expect(zugeordnet).toBe(2)
    expect(await zaehle('invoices', "status = 'bezahlt'")).toBe(2)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 6: PDNG — vorgemerkte Buchung ist kein Geldeingang', () => {
  beforeAll(async () => { await leereStrecke() })

  it('ein Auszug aus lauter PDNG-Posten wird abgewiesen', async () => {
    const r = await importiere(auszug(
      ntry({ betrag: '99.00', status: 'PDNG', ref: 'REF-PDNG' }), 'M-PDNG'
    ), 'pdng.xml')

    expect(r.status).toBe(400)
    expect(r.body.vorgemerkt).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(0)
    expect(await zaehle('camt_imports')).toBe(0)
  })

  it('gemischter Auszug: nur der gebuchte Posten wird verbucht, der PDNG gezaehlt', async () => {
    const r = await importiere(auszug(
      ntry({ betrag: '99.00', status: 'PDNG', ref: 'REF-P2' }) +
      ntry({ betrag: '10.00', status: 'BOOK', ref: 'REF-B2' }),
      'M-MIX'
    ), 'gemischt.xml')

    expect(r.status).toBe(201)
    expect(r.body.buchungenGesamt).toBe(1)
    expect(r.body.vorgemerktUebersprungen).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(1)
  })

  it('der uebersprungene Posten steht in der Antwort — der Import sieht nicht vollstaendig aus', async () => {
    const [imp] = await zeilen<{ buchungen_anzahl: number; status: string }>(
      'SELECT * FROM public.camt_imports'
    )
    expect(imp.buchungen_anzahl).toBe(1)
    expect(imp.status).toBe('verarbeitet')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 7: ausgehende Zahlung (DBIT)', () => {
  beforeAll(async () => { await leereStrecke() })

  it('eine eigene Ueberweisung erzeugt KEINEN Zahlungseingang', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '2400.00', richtung: 'DBIT', ref: 'REF-LOHN',
      e2e: 'LOHN-08-2026', zweck: 'Gehalt August',
    })), 'lohn.xml')

    expect(r.status).toBe(201)
    expect(r.body.ausgehendeUebersprungen).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(0)
    expect(await zaehle('payments')).toBe(0)
  })

  it('DBIT mit MndtId allein bleibt ebenfalls aussen vor', async () => {
    const r = await importiere(auszug(ntry({
      betrag: '89.00', richtung: 'DBIT', ref: 'REF-MNDT', mndt: 'MANDAT-XYZ',
    }), 'M-MNDT'), 'mndt.xml')
    expect(r.body.ausgehendeUebersprungen).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 8/9: unlesbare Betraege und Datumsangaben', () => {
  beforeAll(async () => { await leereStrecke() })

  it('ein deutsch formatierter Betrag wird abgewiesen, nicht umgedeutet', async () => {
    const r = await importiere(auszug(ntry({ betrag: '1.234,56', ref: 'REF-KOMMA' })), 'komma.xml')
    expect(r.status).toBe(400)
    expect(String(r.body.error)).toContain('nicht vollständig lesbar')
    expect(await zaehle('camt_imports')).toBe(0)
  })

  it('ein Betrag von 0,00 EUR wird als Zeile angelegt — er ist lesbar', async () => {
    // Bewusst festgehalten: der Parser weist nur UNLESBARE Betraege ab.
    // Eine echte Nullbuchung (Entgeltabrechnung, Storno) ist gueltig und
    // muss sichtbar bleiben, statt still zu verschwinden.
    const r = await importiere(auszug(ntry({ betrag: '0.00', ref: 'REF-NULL' }), 'M-NULL'), 'null.xml')
    expect(r.status).toBe(201)
    const [ze] = await zeilen<{ betrag_cent: string }>('SELECT * FROM public.zahlungseingaenge')
    expect(Number(ze.betrag_cent)).toBe(0)
  })

  it('ein negativ notierter Betrag mit CRDT wird als Eingang gelesen', async () => {
    await leereStrecke()
    const r = await importiere(auszug(ntry({ betrag: '-50.00', ref: 'REF-NEG' }), 'M-NEG'), 'neg.xml')
    expect(r.status).toBe(201)
    const [ze] = await zeilen<{ betrag_cent: string }>('SELECT * FROM public.zahlungseingaenge')
    expect(Number(ze.betrag_cent)).toBe(5000)
  })

  it('eine Buchung ganz ohne Datum wird abgewiesen — kein erfundenes Datum', async () => {
    await leereStrecke()
    const r = await importiere(auszug(ntry({
      betrag: '10.00', ref: 'REF-KEINDATUM', buchungsdatum: null, valuta: null,
    })), 'kein-datum.xml')

    expect(r.status).toBe(400)
    expect(Array.isArray(r.body.fehler)).toBe(true)
    expect(String((r.body.fehler as string[])[0])).toContain('BookgDt/ValDt')
    expect(await zaehle('zahlungseingaenge')).toBe(0)
  })

  it('ganz oder gar nicht: eine kaputte Zeile verhindert den ganzen Import', async () => {
    await leereStrecke()
    const r = await importiere(auszug(
      ntry({ betrag: '10.00', ref: 'REF-OK' }) +
      ntry({ betrag: 'abc', ref: 'REF-KAPUTT' }),
      'M-TEIL'
    ), 'teilweise.xml')

    expect(r.status).toBe(400)
    expect(r.body.buchungenLesbar).toBe(1)
    expect(await zaehle('camt_imports')).toBe(0)
    expect(await zaehle('zahlungseingaenge')).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 10: Duplikate', () => {
  const XML = auszug(ntry({
    betrag: '42.00', ref: 'REF-DUP', e2e: 'E2E-DUP', zweck: 'Spende',
  }), 'M-DUP')

  beforeAll(async () => { await leereStrecke() })

  it('derselbe Auszug ein zweites Mal wird mit 409 abgewiesen', async () => {
    const erst = await importiere(XML, 'dup.xml')
    expect(erst.status).toBe(201)

    const zweit = await importiere(XML, 'dup.xml')
    expect(zweit.status).toBe(409)
    expect(zweit.body.importId).toBe(erst.body.importId)
    expect(await zaehle('zahlungseingaenge')).toBe(1)
  })

  it('der Dateiname ist egal — es zaehlt der Inhalt', async () => {
    const zweit = await importiere(XML, 'ganz-anderer-name.xml')
    expect(zweit.status).toBe(409)
  })

  it('der Dateihash ist SHA-256 ueber den Inhalt', () => {
    const erwartet = 'camt_' + createHash('sha256').update(XML, 'utf8').digest('hex')
    expect(computeCamtFileHash(XML)).toBe(erwartet)
    expect(computeCamtFileHash(XML)).toHaveLength('camt_'.length + 64)
  })

  it('ein geaenderter Inhalt ergibt einen anderen Hash', () => {
    expect(computeCamtFileHash(XML)).not.toBe(computeCamtFileHash(XML + ' '))
  })

  it('zahlungseingaenge.quelldatei_hash traegt den BUCHUNGS-Hash, nicht den Datei-Hash', async () => {
    const [ze] = await zeilen<{ quelldatei_hash: string }>(
      'SELECT * FROM public.zahlungseingaenge'
    )
    const gelesen = parseCamtXml(XML).buchungen[0]
    expect(ze.quelldatei_hash).toBe(gelesen.buchungsHash)
    expect(ze.quelldatei_hash.startsWith('bh_')).toBe(true)
    expect(ze.quelldatei_hash).not.toBe(computeCamtFileHash(XML))
  })

  it('zwei echte Zahlungen mit gleichem Betrag/Tag/Zahler haben VERSCHIEDENE Hashes', () => {
    const a = parseCamtXml(auszug(ntry({ betrag: '42.00', ref: 'R-A', e2e: 'E-A', zweck: 'Beitrag' })))
    const b = parseCamtXml(auszug(ntry({ betrag: '42.00', ref: 'R-B', e2e: 'E-B', zweck: 'Beitrag' })))
    expect(a.buchungen[0].buchungsHash).not.toBe(b.buchungen[0].buchungsHash)
  })

  it('dieselbe Buchung ergibt reproduzierbar denselben Hash', () => {
    const a = parseCamtXml(XML).buchungen[0].buchungsHash
    const b = parseCamtXml(XML).buchungen[0].buchungsHash
    expect(a).toBe(b)
  })

  it('BEFUND: eine Buchung aus einem UEBERLAPPENDEN Auszug wird nicht doppelt verbucht', async () => {
    // Banken schneiden Auszuege ueberlappend (camt.054-Avis, dann der
    // camt.053-Auszug derselben Periode). Der Dateihash unterscheidet
    // sich dann — die Dublettensperre auf Dateiebene greift also NICHT.
    // Der Buchungs-Hash steht zwar in `zahlungseingaenge`, wird beim
    // Import aber nie abgefragt.
    await leereStrecke()
    const gleicheBuchung = ntry({
      betrag: '42.00', ref: 'REF-OVL', e2e: 'E2E-OVL', zweck: 'Beitrag',
    })
    const auszug1 = auszug(gleicheBuchung, 'M-OVL-1')
    const auszug2 = auszug(gleicheBuchung + ntry({ betrag: '7.00', ref: 'REF-NEU' }), 'M-OVL-2')

    expect(computeCamtFileHash(auszug1)).not.toBe(computeCamtFileHash(auszug2))
    expect((await importiere(auszug1, 'a1.xml')).status).toBe(201)
    expect((await importiere(auszug2, 'a2.xml')).status).toBe(201)

    const hash = parseCamtXml(auszug1).buchungen[0].buchungsHash
    const doppelt = await zaehle('zahlungseingaenge', `quelldatei_hash = '${hash}'`)
    expect(doppelt).toBe(1)
  })

  it('die uebersprungene Dublette steht in der Antwort — sie fehlt nicht heimlich', async () => {
    await leereStrecke()
    const b = ntry({ betrag: '42.00', ref: 'REF-Z1', e2e: 'E2E-Z1', zweck: 'Beitrag' })
    expect((await importiere(auszug(b, 'M-Z1'), 'z1.xml')).status).toBe(201)

    const r = await importiere(
      auszug(b + ntry({ betrag: '9.00', ref: 'REF-Z2' }), 'M-Z2'), 'z2.xml'
    )
    expect(r.status).toBe(201)
    expect(r.body.dublettenUebersprungen).toBe(1)
    expect(r.body.buchungenGesamt).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(2)
  })

  it('sind ALLE Buchungen schon bekannt, antwortet die Route mit 409', async () => {
    await leereStrecke()
    const b = ntry({ betrag: '42.00', ref: 'REF-Z3', e2e: 'E2E-Z3', zweck: 'Beitrag' })
    expect((await importiere(auszug(b, 'M-Z3'), 'z3.xml')).status).toBe(201)

    const r = await importiere(auszug(b, 'M-Z4'), 'z4.xml')
    expect(r.status).toBe(409)
    expect(r.body.dublettenUebersprungen).toBe(1)
    expect(await zaehle('zahlungseingaenge')).toBe(1)
    expect(await zaehle('camt_imports')).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Die Datenbank haelt die Dublettensperre selbst', () => {
  // Eine Vorab-Abfrage kann zwei GLEICHZEITIGE Importlaeufe prinzipiell
  // nicht trennen. Migration 20261003000000 zieht deshalb einen
  // UNIQUE-Index nach; hier wird geprueft, dass er greift und dass er
  // mandantenbezogen ist.
  beforeAll(async () => {
    await leereStrecke()
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_zahlungseingaenge_org_buchungshash
        ON public.zahlungseingaenge (organization_id, quelldatei_hash);
      INSERT INTO public.camt_imports (id, organization_id, dateiname, quelldatei_hash)
      VALUES ('d0000000-0000-4000-8000-0000000000aa', '${ORG_A}', 'x.xml', 'file-a'),
             ('d0000000-0000-4000-8000-0000000000bb', '${ORG_B}', 'x.xml', 'file-b');
    `)
  })

  afterAll(async () => {
    await db.exec('DROP INDEX IF EXISTS public.uq_zahlungseingaenge_org_buchungshash;')
  })

  async function lege(org: string, imp: string, hash: string): Promise<string | null> {
    try {
      await db.exec(`
        INSERT INTO public.zahlungseingaenge
          (organization_id, camt_import_id, buchungsdatum, betrag_cent, quelldatei_hash)
        VALUES ('${org}', '${imp}', '2026-08-20', 4200, '${hash}');
      `)
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    }
  }

  it('derselbe Buchungshash geht beim selben Mandanten kein zweites Mal durch', async () => {
    expect(await lege(ORG_A, 'd0000000-0000-4000-8000-0000000000aa', 'bh_gleich')).toBeNull()
    const fehler = await lege(ORG_A, 'd0000000-0000-4000-8000-0000000000aa', 'bh_gleich')
    expect(fehler).toMatch(/uq_zahlungseingaenge_org_buchungshash|duplicate key/)
    expect(await zaehle('zahlungseingaenge', "quelldatei_hash = 'bh_gleich'")).toBe(1)
  })

  it('bei einem ANDEREN Mandanten ist derselbe Hash erlaubt', async () => {
    expect(await lege(ORG_B, 'd0000000-0000-4000-8000-0000000000bb', 'bh_gleich')).toBeNull()
    expect(await zaehle('zahlungseingaenge', "quelldatei_hash = 'bh_gleich'")).toBe(2)
  })

  it('die Sperre steht so auch in der Migration', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20261003000000_camt_buchungsdublette.sql'),
      'utf8'
    )
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_zahlungseingaenge_org_buchungshash')
    expect(sql).toContain('(organization_id, quelldatei_hash)')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fall 11: Mandantengrenze', () => {
  const XML = auszug(ntry({
    betrag: '333.00', ref: 'REF-ORG', zweck: 'RE-2026-0040',
  }), 'M-ORG')

  beforeAll(async () => {
    await leereStrecke()
    // Die Rechnung gehoert Mandant B.
    await legeRechnung({ org: ORG_B, klient: KLIENT_B, nummer: 'RE-2026-0040', betragEuro: 333 })
  })

  it('Mandant A ordnet die Rechnung von Mandant B NICHT zu', async () => {
    halter.auth = { organizationId: ORG_A, userId: ADMIN_A }
    const r = await importiere(XML, 'org-a.xml')

    expect(r.status).toBe(201)
    expect(r.body.zugeordnet).toBe(0)
    expect(await zaehle('payments')).toBe(0)
    expect(await zaehle('invoices', "status = 'bezahlt'")).toBe(0)
  })

  it('die Zeilen von Mandant A tragen dessen organization_id', async () => {
    expect(await zaehle('zahlungseingaenge', `organization_id = '${ORG_A}'`)).toBe(1)
    expect(await zaehle('zahlungseingaenge', `organization_id = '${ORG_B}'`)).toBe(0)
  })

  it('derselbe Auszug darf bei Mandant B eingelesen werden — die Sperre ist mandantenweit', async () => {
    halter.auth = { organizationId: ORG_B, userId: ADMIN_B }
    const r = await importiere(XML, 'org-b.xml')
    expect(r.status).toBe(201)
    expect(r.body.zugeordnet).toBe(1)
    expect(await zaehle('zahlungseingaenge', `organization_id = '${ORG_B}'`)).toBe(1)
  })

  it('bei Mandant B ist die Rechnung jetzt bezahlt, bei A blieb nichts zurueck', async () => {
    expect(await zaehle('invoices', "status = 'bezahlt'")).toBe(1)
    expect(await zaehle('payments', `organization_id = '${ORG_B}'`)).toBe(1)
    expect(await zaehle('payments', `organization_id = '${ORG_A}'`)).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Berechtigung und Eingabepruefung', () => {
  beforeAll(async () => { await leereStrecke() })

  it('ohne abrechnung.schreiben wird gar nichts importiert', async () => {
    halter.ablehnung = { status: 403, body: { error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' } }
    const r = await importiere(auszug(ntry({ betrag: '10.00', ref: 'R' })), 'verboten.xml')
    expect(r.status).toBe(403)
    expect(await zaehle('camt_imports')).toBe(0)
  })

  it('eine leere Datei wird abgewiesen', async () => {
    const r = await importiere('   ', 'leer.xml')
    expect(r.status).toBe(400)
    expect(String(r.body.error)).toContain('leer')
  })

  it('eine Datei ohne Buchungen wird abgewiesen', async () => {
    const r = await importiere(auszug('', 'M-LEER'), 'ohne-buchung.xml')
    expect(r.status).toBe(400)
    expect(String(r.body.error)).toContain('Keine Buchungen')
    expect(await zaehle('camt_imports')).toBe(0)
  })

  it('fehlt die Datei ganz, antwortet die Route mit 400', async () => {
    const req = new Request('http://localhost/api/billing/camt/import', {
      method: 'POST', body: new FormData(),
    })
    const res = await camtImport(req as never)
    expect(res.status).toBe(400)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fehlerpfade werden nicht still verschluckt', () => {
  beforeAll(async () => { await leereStrecke() })

  it('scheitert eine Zeile beim Speichern, meldet die Antwort sie namentlich', async () => {
    // Fremdschluessel auf eine nicht existierende Organisation: der
    // INSERT in zahlungseingaenge scheitert, der Import darf danach NICHT
    // als 'verarbeitet' gelten.
    halter.auth = { organizationId: ORG_A, userId: ADMIN_A }

    // Ein Trigger, der den zweiten INSERT scheitern laesst — er steht fuer
    // jede Ursache, die eine Zeile verhindert (Constraint, Ausfall).
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.test_blockiere_zweite() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.buchungsreferenz = 'REF-BLOCK' THEN
          RAISE EXCEPTION 'Testsperre';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_test_blockiere BEFORE INSERT ON public.zahlungseingaenge
        FOR EACH ROW EXECUTE FUNCTION public.test_blockiere_zweite();
    `)

    try {
      const r = await importiere(auszug(
        ntry({ betrag: '5.00', ref: 'REF-GEHT' }) +
        ntry({ betrag: '6.00', ref: 'REF-BLOCK' }),
        'M-BLOCK'
      ), 'blockiert.xml')

      expect(r.status).toBe(201)
      expect(r.body.nichtGespeichert).toEqual([
        expect.objectContaining({ buchung: 2 }),
      ])

      const [imp] = await zeilen<{ status: string }>('SELECT * FROM public.camt_imports')
      expect(imp.status).toBe('fehler')
    } finally {
      await db.exec('DROP TRIGGER IF EXISTS trg_test_blockiere ON public.zahlungseingaenge;')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Betriebsart — der Trockenlauf gegen echtes Postgres
// ═══════════════════════════════════════════════════════════════════════
//
// Alles darueber prueft den scharfen Weg. Dieser Abschnitt prueft die
// Absicherung davor, und zwar an der Stelle, an der sie zaehlt: nicht „der
// Preflight meldet nichts geschrieben", sondern „nach dem Aufruf stehen
// dieselben Zeilenzahlen in der Datenbank wie davor". Ein Doppelgaenger
// koennte das nicht belegen — eine echte Datenbank kann es.
describe('Betriebsart: ohne CAMT_IMPORT_MODE=LIVE wird nichts gebucht', () => {
  beforeAll(async () => { await leereStrecke() })

  /** Zeilenzahlen aller Tabellen, die ein Import anfassen wuerde. */
  async function bestand(): Promise<Record<string, number>> {
    const tabellen = [
      'camt_imports', 'zahlungseingaenge', 'klaerfaelle',
      'payments', 'payment_allocations', 'billing_audit_trail',
    ]
    const stand: Record<string, number> = {}
    for (const t of tabellen) stand[t] = await zaehle(t)
    return stand
  }

  it('antwortet mit 200 und einem Preflight, ohne eine einzige Zeile anzulegen', async () => {
    const vorher = await bestand()
    process.env.CAMT_IMPORT_MODE = ''
    try {
      const r = await importiere(auszug(ntry({ betrag: '150.50', ref: 'REF-TROCKEN' }), 'M-TROCKEN'), 'trocken.xml')

      // 200, nicht 201: es wurde nichts angelegt.
      expect(r.status).toBe(200)
      expect(r.body.gebucht).toBe(false)
      expect(r.body.modus).toBe('DRY_RUN')

      const preflight = r.body.preflight as Record<string, unknown>
      expect(preflight.gesamt).toBe(1)
      expect(Array.isArray(preflight.buchungen)).toBe(true)

      expect(await bestand()).toEqual(vorher)
    } finally {
      process.env.CAMT_IMPORT_MODE = 'LIVE'
    }
  })

  it('ein unbekannter Wert bucht ebenfalls nicht', async () => {
    const vorher = await bestand()
    process.env.CAMT_IMPORT_MODE = 'live'
    try {
      const r = await importiere(auszug(ntry({ betrag: '77.00', ref: 'REF-KLEIN' }), 'M-KLEIN'), 'kleingeschrieben.xml')
      expect(r.status).toBe(200)
      expect(r.body.gebucht).toBe(false)
      expect(await bestand()).toEqual(vorher)
    } finally {
      process.env.CAMT_IMPORT_MODE = 'LIVE'
    }
  })

  // Gegenprobe: derselbe Aufruf mit LIVE legt sehr wohl an. Ohne sie
  // koennte der Trockenlauf-Test auch dann gruen sein, wenn der Import
  // generell nichts mehr schreibt.
  it('Gegenprobe: mit LIVE entsteht ein Import und ein Zahlungseingang', async () => {
    const vorher = await bestand()
    const r = await importiere(auszug(ntry({ betrag: '150.50', ref: 'REF-SCHARF' }), 'M-SCHARF'), 'scharf.xml')
    expect(r.status).toBe(201)
    const nachher = await bestand()
    expect(nachher.camt_imports).toBe(vorher.camt_imports + 1)
    expect(nachher.zahlungseingaenge).toBe(vorher.zahlungseingaenge + 1)
  })
})
