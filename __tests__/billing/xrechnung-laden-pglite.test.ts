/**
 * XRechnung/ZUGFeRD — Datenbeschaffung auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `loadInvoiceXRechnungData()` traegt alles zusammen, was in eine
 * elektronische Rechnung geht: Rechnungskopf, Klient, Bankverbindung,
 * Positionen und — bei Korrekturen — die Nummer des Ursprungsbelegs. Das
 * Ergebnis verlaesst danach das Haus: es geht als CII-Datei an einen
 * Kostentraeger. Was hier falsch eingesammelt wird, ist nicht mehr
 * einzufangen.
 *
 * Der Generator dahinter (`cii-generator.ts`) ist eine reine Funktion und
 * hat eigene Tests. Ungeprueft war genau die Schicht dazwischen — die
 * Abfragen. Deshalb laeuft diese Suite gegen ein echtes Postgres:
 * Spaltennamen, Typen (numeric kommt als Zeichenkette), `date` gegen
 * Zeichenkette und die Mandantenfilter sind Datenbankfragen.
 *
 * ── BEFUND, DEN DIESE SUITE AUSGELOEST HAT ─────────────────────────────
 *   X-1  Die Nachschlage-Abfrage auf den Ursprungsbeleg (`correction_of`)
 *        hatte KEINEN Mandantenfilter. Zeigte das Feld auf eine Rechnung
 *        eines anderen Mandanten, wanderte dessen Rechnungsnummer als
 *        BT-25 in die ausgehende Datei.
 *
 * BETRAEGE: Testwerte innerhalb der In-Memory-Instanz. Kein Tarif und
 * kein Kassensatz wird behauptet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import {
  loadInvoiceXRechnungData,
  generateXRechnungXml,
} from '@/lib/billing/xrechnung/invoice-to-xrechnung'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000c001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000c001'

const KLIENT_A = 'c1111111-0000-4000-8000-00000000c001'
const KLIENT_B = 'c2222222-0000-4000-8000-00000000c001'

/** Beispiel-IBAN, kein echtes Konto. */
const IBAN_ORG = 'DE02500105170137075030'
/** Struktur-gueltige IK (9 Stellen) — Pflichtformat des CHECK-Constraints. */
const IK_A = '460629986'

let db: PGlite
let admin: SupabaseClient

async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

let zaehler = 0
async function legeRechnung(opts: {
  org: string
  klient: string
  nummer: string
  betragEuro: number
  status?: string
  correctionType?: string | null
  correctionOf?: string | null
  faellig?: string | null
  zahlungszielTage?: number
}): Promise<string> {
  zaehler++
  const id = `f0000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
  await db.query(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, status, correction_type,
        correction_of, due_date, payment_terms_days, created_at)
     VALUES ($1, $2, $3, $4, $4, '2026-07-01', '2026-07-31', $5, $6, $7, $8, $9, $10,
             '2026-08-05T09:00:00Z')`,
    [
      id, opts.org, opts.klient, opts.nummer, opts.betragEuro,
      opts.status ?? 'freigegeben',
      opts.correctionType ?? null,
      opts.correctionOf ?? null,
      opts.faellig === undefined ? '2026-08-19' : opts.faellig,
      opts.zahlungszielTage ?? 14,
    ] as never[],
  )
  return id
}

async function legePosition(opts: {
  invoiceId: string
  beschreibung: string
  datum: string
  minuten: number | null
  betragEuro: number
  tarifPreisCent?: number | null
}): Promise<void> {
  await db.query(
    `INSERT INTO public.invoice_items
       (invoice_id, description, date, duration_minutes, amount, tariff_preis_cent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      opts.invoiceId, opts.beschreibung, opts.datum, opts.minuten,
      opts.betragEuro, opts.tarifPreisCent ?? null,
    ] as never[],
  )
}

async function leere(): Promise<void> {
  await db.exec(`
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;
  `)
}

beforeAll(async () => {
  db = await baueKettenSchema()
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO public.organizations
      (id, name, bundesland, status, ik_nummer, iban, bic, bank_name, settings) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active', '${IK_A}',
       '${IBAN_ORG}', 'INGDDEFFXXX', 'Testbank',
       '{"steuernummer":"04512345678","leitweg_id":"991-12345-67"}'::jsonb),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active', NULL,
       '${IBAN_ORG}', 'INGDDEFFXXX', 'Testbank', '{}'::jsonb);

    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name,
       address, city, zip_code, insurance_name, insurance_number) VALUES
      ('${KLIENT_A}', '${ORG_A}', 'A-0001', 'Erika', 'Mustermann',
       'Musterweg 1', 'Frankfurt am Main', '60311', 'Testkasse', 'V123456789'),
      ('${KLIENT_B}', '${ORG_B}', 'B-0001', 'Berta', 'Fremdorg',
       'Fremdweg 2', 'München', '80331', NULL, NULL);
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await leere()
})

// ═════════════════════════════════════════════════════════════════════
describe('Rechnungskopf, Klient und Zahlungsdaten', () => {
  it('traegt Kopf, Zeitraum, Bankverbindung und Zahlungsziel zusammen', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9001', betragEuro: 240.75,
    })

    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)

    expect(d.invoiceNumber).toBe('RE-2026-9001')
    expect(d.typeCode).toBe('380') // normale Rechnung
    expect(d.issueDate).toBe('2026-08-05')
    expect(d.periodStart).toBe('2026-07-01')
    expect(d.periodEnd).toBe('2026-07-31')
    expect(d.dueDate).toBe('2026-08-19')
    expect(d.payment.paymentTermsDays).toBe(14)
    expect(d.payment.iban).toBe(IBAN_ORG)
    expect(d.payment.bic).toBe('INGDDEFFXXX')
    // numeric kommt als Zeichenkette aus dem Treiber — der Betrag muss
    // trotzdem als Cent-Ganzzahl ankommen.
    expect(d.totalAmountCents).toBe(24075)
  })

  it('nimmt als Kaeufer die Kasse, wenn eine hinterlegt ist', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9002', betragEuro: 100,
    })

    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
    expect(d.buyer.name).toBe('Testkasse')
    expect(d.buyer.insuranceNumber).toBe('V123456789')
    expect(d.buyer.zip).toBe('60311')
    expect(d.buyer.leitwegId).toBe('991-12345-67')
  })

  it('nimmt den Klientennamen, wenn keine Kasse hinterlegt ist', async () => {
    const id = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-9001', betragEuro: 100,
    })

    const d = await loadInvoiceXRechnungData(admin, id, ORG_B)
    expect(d.buyer.name).toBe('Berta Fremdorg')
    expect(d.buyer.leitwegId).toBeNull()
  })

  it('traegt die IK-Nummer des Mandanten ein', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9003', betragEuro: 100,
    })

    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
    expect(d.seller.ikNummer).toBe(IK_A)
    expect(d.seller.taxId).toBe('04512345678')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mandantengrenze', () => {
  it('gibt eine Rechnung eines anderen Mandanten nicht heraus', async () => {
    const fremd = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-9002', betragEuro: 500,
    })

    await expect(loadInvoiceXRechnungData(admin, fremd, ORG_A))
      .rejects.toThrow(/Rechnung nicht gefunden/)
  })

  /**
   * BEFUND X-1 — Regressionstest.
   *
   * Der Nachschlag auf den Ursprungsbeleg hatte keinen Mandantenfilter.
   * Ein fehlgeleitetes `correction_of` zog damit die Rechnungsnummer
   * eines fremden Mandanten in die ausgehende Datei.
   */
  it('zieht KEINE Ursprungsnummer aus einem anderen Mandanten', async () => {
    const fremdesOriginal = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-GEHEIM-0001', betragEuro: 500,
    })
    const korrektur = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9004', betragEuro: 100,
      correctionType: 'korrektur', correctionOf: fremdesOriginal,
    })

    const d = await loadInvoiceXRechnungData(admin, korrektur, ORG_A)
    expect(d.correctionOfNumber).toBeNull()
    const xml = await generateXRechnungXml(admin, korrektur, ORG_A)
    expect(xml).not.toContain('RE-B-GEHEIM-0001')
  })

  it('nennt den Ursprungsbeleg des EIGENEN Mandanten', async () => {
    const original = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9005', betragEuro: 300,
    })
    const korrektur = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9006', betragEuro: 100,
      correctionType: 'korrektur', correctionOf: original,
    })

    const d = await loadInvoiceXRechnungData(admin, korrektur, ORG_A)
    expect(d.correctionOfNumber).toBe('RE-2026-9005')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Belegart aus correction_type', () => {
  const faelle: Array<[string | null, string]> = [
    [null, '380'],
    ['rechnung', '380'],
    ['korrektur', '384'],
    ['gutschrift', '381'],
    ['storno', '381'],
  ]

  for (const [typ, code] of faelle) {
    it(`ordnet correction_type=${typ ?? 'NULL'} dem Code ${code} zu`, async () => {
      const id = await legeRechnung({
        org: ORG_A, klient: KLIENT_A, nummer: `RE-TYP-${typ ?? 'NULL'}`,
        betragEuro: 100, correctionType: typ,
      })
      const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
      expect(d.typeCode).toBe(code)
    })
  }
})

// ═════════════════════════════════════════════════════════════════════
describe('Positionen', () => {
  it('rechnet Minuten in Stunden um und setzt die Einheit HUR', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9101', betragEuro: 90,
    })
    await legePosition({
      invoiceId: id, beschreibung: 'Alltagsbegleitung', datum: '2026-07-03',
      minuten: 90, betragEuro: 90, tarifPreisCent: 6000,
    })

    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
    expect(d.lineItems).toHaveLength(1)
    const p = d.lineItems[0]
    expect(p.lineId).toBe(1)
    expect(p.quantity).toBeCloseTo(1.5, 6)
    expect(p.unitCode).toBe('HUR')
    expect(p.unitPriceCents).toBe(6000)
    expect(p.lineTotalCents).toBe(9000)
    expect(p.leistungsdatum).toBe('2026-07-03')
  })

  it('setzt ohne Dauer Menge 1 und die Einheit C62', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9102', betragEuro: 25,
    })
    await legePosition({
      invoiceId: id, beschreibung: 'Fahrtkosten', datum: '2026-07-04',
      minuten: null, betragEuro: 25,
    })

    const [p] = (await loadInvoiceXRechnungData(admin, id, ORG_A)).lineItems
    expect(p.quantity).toBe(1)
    expect(p.unitCode).toBe('C62')
    expect(p.unitPriceCents).toBe(2500)
  })

  /**
   * Ohne hinterlegten Tarifpreis wird der Einzelpreis aus Zeilensumme und
   * Menge zurueckgerechnet. Die Probe muss aufgehen: Menge × Einzelpreis
   * darf nicht neben der Zeilensumme liegen, sonst weist der
   * Rechnungspruefer des Kostentraegers die Datei zurueck.
   */
  it('rechnet den Einzelpreis ohne Tarifpreis aus der Zeilensumme zurueck', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9103', betragEuro: 45,
    })
    await legePosition({
      invoiceId: id, beschreibung: 'Alltagsbegleitung', datum: '2026-07-05',
      minuten: 120, betragEuro: 45,
    })

    const [p] = (await loadInvoiceXRechnungData(admin, id, ORG_A)).lineItems
    expect(p.quantity).toBe(2)
    expect(p.unitPriceCents).toBe(2250)
    expect(p.unitPriceCents * p.quantity).toBe(p.lineTotalCents)
  })

  it('sortiert die Positionen nach Leistungsdatum', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9104', betragEuro: 60,
    })
    for (const tag of ['2026-07-20', '2026-07-02', '2026-07-11']) {
      await legePosition({
        invoiceId: id, beschreibung: `Einsatz ${tag}`, datum: tag,
        minuten: 60, betragEuro: 20,
      })
    }

    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
    expect(d.lineItems.map(p => p.leistungsdatum))
      .toEqual(['2026-07-02', '2026-07-11', '2026-07-20'])
    expect(d.lineItems.map(p => p.lineId)).toEqual([1, 2, 3])
  })

  it('nimmt keine Positionen einer anderen Rechnung mit', async () => {
    const eigene = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9105', betragEuro: 20,
    })
    const andere = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9106', betragEuro: 20,
    })
    await legePosition({
      invoiceId: eigene, beschreibung: 'Meins', datum: '2026-07-01',
      minuten: 60, betragEuro: 20,
    })
    await legePosition({
      invoiceId: andere, beschreibung: 'Fremd', datum: '2026-07-01',
      minuten: 60, betragEuro: 20,
    })

    const d = await loadInvoiceXRechnungData(admin, eigene, ORG_A)
    expect(d.lineItems.map(p => p.description)).toEqual(['Meins'])
  })

  it('kommt mit einer Rechnung ohne Positionen durch', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9107', betragEuro: 0.01,
    })
    const d = await loadInvoiceXRechnungData(admin, id, ORG_A)
    expect(d.lineItems).toEqual([])
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Erzeugte CII-Datei', () => {
  it('enthaelt Nummer, Betrag und Bankverbindung', async () => {
    const id = await legeRechnung({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-9201', betragEuro: 120,
    })
    await legePosition({
      invoiceId: id, beschreibung: 'Alltagsbegleitung', datum: '2026-07-08',
      minuten: 120, betragEuro: 120, tarifPreisCent: 6000,
    })

    const xml = await generateXRechnungXml(admin, id, ORG_A)

    expect(xml).toContain('RE-2026-9201')
    expect(xml).toContain('120.00')
    expect(xml).toContain(IBAN_ORG)
    expect(xml).toContain('Testkasse')
    // Kein fremder Mandant in der Datei.
    expect(xml).not.toContain('Fremdorg')
  })

  it('verweigert die Datei fuer eine fremde Rechnung', async () => {
    const fremd = await legeRechnung({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-9201', betragEuro: 100,
    })
    await expect(generateXRechnungXml(admin, fremd, ORG_A))
      .rejects.toThrow(/Rechnung nicht gefunden/)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Selbstpruefung der Testdaten', () => {
  it('legt Rechnungen wirklich getrennt nach Mandant ab', async () => {
    await legeRechnung({ org: ORG_A, klient: KLIENT_A, nummer: 'RE-P-1', betragEuro: 1 })
    await legeRechnung({ org: ORG_B, klient: KLIENT_B, nummer: 'RE-P-2', betragEuro: 1 })

    const verteilung = await zeilen<{ organization_id: string; n: number }>(
      'SELECT organization_id, count(*)::int AS n FROM public.invoices GROUP BY 1',
    )
    expect(verteilung).toHaveLength(2)
  })
})
