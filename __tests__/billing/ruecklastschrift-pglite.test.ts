/**
 * Ruecklastschrift-Handler auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `verarbeiteRuecklastschrift()` ist der teuerste Pfad der ganzen
 * Zahlungsstrecke: er nimmt eine Zahlung zurueck, oeffnet eine Rechnung
 * wieder, bucht eine Gebuehr, sperrt ein Lastschriftmandat und erhoeht
 * die Mahnstufe — fuenf schreibende Wirkungen auf einen Kunden, ausgeloest
 * von einer einzigen Bankbuchung. Trifft er den falschen Kunden oder
 * scheitert er auf halber Strecke, merkt es niemand: die Funktion faengt
 * jede Ausnahme selbst ab und gibt ein Ergebnisobjekt zurueck.
 *
 * Getestet war bisher nur der Parser davor. Diese Suite faehrt den
 * Handler selbst gegen ein echtes Postgres — die drei bereits gefixten
 * Befunde im Modulkopf (Betrags-Fallback ohne Mandatsfilter, `status`
 * statt `widerspruch_status`, unbekannte kuerzung_kategorie) waren alle
 * CHECK- bzw. Spaltenfehler. Eine Fake-DB haette keinen davon gezeigt.
 *
 * ── BEFUND, DEN DIESE SUITE AUSGELOEST HAT ─────────────────────────────
 *   R-1  Die zurueckgenommene Zuordnung wurde mit
 *        `allocation_type = 'rueckzahlung'` markiert. Der Wert stand
 *        nicht im CHECK-Constraint (20260808210000); das UPDATE scheiterte
 *        mit 23514 und der Fehler wurde nicht gelesen. Die Zuordnung blieb
 *        als 'vollzahlung' stehen — sie behauptete weiter, die Rechnung
 *        sei bezahlt — waehrend `payments.allocated_cents` im selben
 *        Vorgang reduziert wurde. Migration 20261004000000 nimmt den Wert
 *        auf; ohne sie faellt der Code jetzt auf das Entfernen der Zeile
 *        zurueck und benennt das im Ergebnis.
 *
 * BETRAEGE: Testwerte innerhalb der In-Memory-Instanz. Die
 * Ruecklastschriftgebuehr von 5,00 EUR stammt als Konstante aus dem
 * Modul selbst — hier wird nicht behauptet, dass sie so vereinbart ist,
 * sondern nur geprueft, dass gebucht wird, was das Modul meldet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { liesMigration } from '../helpers/sql-extract'
import type { CamtBuchung } from '@/lib/billing/camt/camt-parser'
import { verarbeiteRuecklastschrift } from '@/lib/billing/sepa/ruecklastschrift'

const M_ALLOC_RUECK = '20261004000000_payment_allocation_rueckzahlung.sql'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000e101'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000e101'
const ADMIN_A = '11111111-0000-4000-8000-00000000e101'

const KLIENT_A = 'c1111111-0000-4000-8000-00000000e101'
const KLIENT_A2 = 'c1111111-0000-4000-8000-00000000e102'
const KLIENT_B = 'c2222222-0000-4000-8000-00000000e101'

const IBAN_KUNDE = 'DE89370400440532013000'

let db: PGlite
let admin: SupabaseClient

// ─────────────────────────────────────────────────────────────────────
// Hilfen
// ─────────────────────────────────────────────────────────────────────
async function zeilen<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const r = await db.query<T>(sql)
  return r.rows
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`,
  )
  return r.rows[0]?.n ?? 0
}

/** Eine als Ruecklastschrift erkannte CAMT-Buchung. */
function buchung(w: Partial<CamtBuchung> & { betragCent: number }): CamtBuchung {
  return {
    waehrung: 'EUR',
    richtung: 'DBIT',
    buchungsdatum: '2026-08-20',
    valutadatum: '2026-08-21',
    status: 'BOOK',
    debitorName: 'Erika Mustermann',
    debitorIban: IBAN_KUNDE,
    kreditorName: null,
    kreditorIban: null,
    verwendungszweck: 'RETOURE LASTSCHRIFT',
    endToEndId: null,
    mandateId: null,
    buchungsreferenz: 'REF-RL',
    istRuecklastschrift: true,
    ruecklastschriftGrund: 'RtrInf/RDDT',
    istGebucht: true,
    buchungsHash: 'hash-rl',
    ...w,
  }
}

let zaehler = 0
function neueId(praefix: string): string {
  zaehler++
  return `${praefix}-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
}

interface Aufbau {
  invoiceId: string
  mandateId: string
  batchItemId: string
  paymentId: string
  allocationId: string
}

/**
 * Baut den vollstaendigen Zustand NACH einem erfolgreichen Einzug auf:
 * Rechnung bezahlt, Zahlung zugeordnet, SEPA-Posten offen, Mahnzeile da.
 */
async function baueEingezogenenPosten(opts: {
  org: string
  klient: string
  nummer: string
  betragCent: number
  mandatsReferenz: string
  endToEndId: string
  mitZahlung?: boolean
  mitMahnzeile?: boolean
}): Promise<Aufbau> {
  const invoiceId = neueId('f0000000')
  const mandateId = neueId('d0000000')
  const batchId = neueId('a0000000')
  const batchItemId = neueId('b0000000')
  const paymentId = neueId('90000000')
  const allocationId = neueId('80000000')
  const euro = opts.betragCent / 100

  await db.query(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, paid_amount, status, bezahlt,
        bezahlt_am, dunning_level)
     VALUES ($1, $2, $3, $4, $4, '2026-07-01', '2026-07-31', $5, $5,
             'bezahlt', true, '2026-08-05', 'offen')`,
    [invoiceId, opts.org, opts.klient, opts.nummer, euro] as never[],
  )

  await db.query(
    `INSERT INTO public.sepa_mandates
       (id, organization_id, client_id, mandate_reference, mandate_date,
        sequence_type, debtor_name, debtor_iban, status)
     VALUES ($1, $2, $3, $4, '2026-08-01', 'RCUR', 'Erika Mustermann', $5, 'aktiv')`,
    [mandateId, opts.org, opts.klient, opts.mandatsReferenz, IBAN_KUNDE] as never[],
  )

  await db.query(
    `INSERT INTO public.sepa_batches
       (id, organization_id, batch_number, total_items, total_cents,
        requested_collection_date)
     VALUES ($1, $2, $3, 1, $4, '2026-08-10')`,
    [batchId, opts.org, `SEPA-${opts.nummer}`, opts.betragCent] as never[],
  )

  await db.query(
    `INSERT INTO public.sepa_batch_items
       (id, organization_id, batch_id, invoice_id, mandate_id, amount_cents,
        end_to_end_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'eingezogen')`,
    [batchItemId, opts.org, batchId, invoiceId, mandateId, opts.betragCent, opts.endToEndId] as never[],
  )

  if (opts.mitZahlung !== false) {
    await db.query(
      `INSERT INTO public.payments
         (id, organization_id, payment_date, amount_cents, payment_method,
          matching_status, allocated_cents)
       VALUES ($1, $2, '2026-08-12', $3, 'lastschrift', 'automatisch_zugeordnet', $3)`,
      [paymentId, opts.org, opts.betragCent] as never[],
    )
    await db.query(
      `INSERT INTO public.payment_allocations
         (id, organization_id, payment_id, invoice_id, amount_cents, allocation_type)
       VALUES ($1, $2, $3, $4, $5, 'vollzahlung')`,
      [allocationId, opts.org, paymentId, invoiceId, opts.betragCent] as never[],
    )
  }

  if (opts.mitMahnzeile !== false) {
    await db.query(
      `INSERT INTO public.dunning_entries
         (organization_id, invoice_id, dunning_level, due_date, amount_due_cents)
       VALUES ($1, $2, 'offen', '2026-08-15', $3)`,
      [opts.org, invoiceId, opts.betragCent] as never[],
    )
  }

  return { invoiceId, mandateId, batchItemId, paymentId, allocationId }
}

async function leereStrecke(): Promise<void> {
  await db.exec(`
    DELETE FROM public.payment_differences;
    DELETE FROM public.payment_allocations;
    DELETE FROM public.payments;
    DELETE FROM public.dunning_entries;
    DELETE FROM public.sepa_batch_items;
    DELETE FROM public.sepa_batches;
    DELETE FROM public.sepa_mandates;
    DELETE FROM public.billing_audit_trail;
    DELETE FROM public.invoices;
  `)
}

// ─────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  db = await baueKettenSchema()
  await baueCamtTabellen(db)
  // Der CHECK-Stand MIT 'rueckzahlung' — Befund R-1. Ein eigener Fall
  // unten setzt ihn gezielt wieder zurueck und prueft den Rueckfall.
  await db.exec(liesMigration(M_ALLOC_RUECK))

  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN_A}', 'admin-a@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email)
      VALUES ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code) VALUES
      ('${KLIENT_A}',  '${ORG_A}', 'A-0001', 'Erika', 'Mustermann', '60311'),
      ('${KLIENT_A2}', '${ORG_A}', 'A-0002', 'Hans',  'Zweitkunde', '60311'),
      ('${KLIENT_B}',  '${ORG_B}', 'B-0001', 'Berta', 'Fremdorg',   '80331');
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await leereStrecke()
})

// ═════════════════════════════════════════════════════════════════════
describe('Zuordnung der Bankbuchung zur Lastschrift', () => {
  it('findet den Posten ueber die EndToEndId', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-1001',
      betragCent: 12000, mandatsReferenz: 'AE-A-0001-X1', endToEndId: 'AE-RE-2026-1001',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -12000, endToEndId: 'AE-RE-2026-1001' }),
      'e0000000-0000-4000-8000-000000000001', ORG_A, ADMIN_A,
    )

    expect(r.fehler).toBeNull()
    expect(r.invoiceId).toBe(a.invoiceId)
    expect(r.mandateId).toBe(a.mandateId)
  })

  it('findet den Posten ueber die Mandatsreferenz, wenn die EndToEndId fehlt', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-1002',
      betragCent: 9500, mandatsReferenz: 'AE-A-0001-X2', endToEndId: 'AE-RE-2026-1002',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -9500, endToEndId: null, mandateId: 'AE-A-0001-X2' }),
      'e0000000-0000-4000-8000-000000000002', ORG_A, ADMIN_A,
    )

    expect(r.fehler).toBeNull()
    expect(r.invoiceId).toBe(a.invoiceId)
  })

  /**
   * Der Kern des bereits gefixten Fallback-Befunds: bei gleichem Betrag
   * darf NICHT der Posten eines anderen Kunden getroffen werden. Runde
   * Betraege sind bei gleichem Tarif und gleicher Stundenzahl der
   * Normalfall.
   */
  it('trifft bei gleichem Betrag nicht den Posten eines anderen Kunden', async () => {
    const opfer = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-2026-1003',
      betragCent: 10000, mandatsReferenz: 'AE-A-0002-X1', endToEndId: 'AE-RE-2026-1003',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      // Mandatsreferenz eines Kunden, den es nicht gibt — Betrag passt aber.
      buchung({ betragCent: -10000, endToEndId: null, mandateId: 'AE-A-9999-XX' }),
      'e0000000-0000-4000-8000-000000000003', ORG_A, ADMIN_A,
    )

    expect(r.invoiceId).toBeNull()
    expect(r.fehler).toMatch(/Keine zugehoerige SEPA-Lastschrift/)

    // Der Unbeteiligte bleibt unangetastet.
    const [inv] = await zeilen<{ status: string }>(
      `SELECT status FROM public.invoices WHERE id = '${opfer.invoiceId}'`,
    )
    expect(inv.status).toBe('bezahlt')
    expect(await zaehle('payment_differences')).toBe(0)
  })

  it('greift nicht ueber die Mandantengrenze', async () => {
    await baueEingezogenenPosten({
      org: ORG_B, klient: KLIENT_B, nummer: 'RE-B-1001',
      betragCent: 7000, mandatsReferenz: 'AE-B-0001-X1', endToEndId: 'AE-RE-B-1001',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -7000, endToEndId: 'AE-RE-B-1001' }),
      'e0000000-0000-4000-8000-000000000004', ORG_A, ADMIN_A, // Mandant A verarbeitet
    )

    expect(r.invoiceId).toBeNull()
    expect(r.fehler).toMatch(/Keine zugehoerige SEPA-Lastschrift/)
    expect(await zaehle('payment_differences')).toBe(0)
  })

  it('laesst ohne Treffer alles unveraendert', async () => {
    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -5000, endToEndId: 'AE-GIBT-ES-NICHT' }),
      'e0000000-0000-4000-8000-000000000005', ORG_A, ADMIN_A,
    )

    expect(r.erkannt).toBe(true)
    expect(r.gebuehrCent).toBe(0)
    expect(r.mandatGesperrt).toBe(false)
    expect(await zaehle('billing_audit_trail')).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Wirkung auf Zahlung, Rechnung und Gebuehr', () => {
  it('nimmt die Zahlung zurueck und oeffnet die Rechnung wieder', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2001',
      betragCent: 12000, mandatsReferenz: 'AE-A-0001-Y1', endToEndId: 'AE-RE-2026-2001',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -12000, endToEndId: 'AE-RE-2026-2001' }),
      'e0000000-0000-4000-8000-000000002001', ORG_A, ADMIN_A,
    )
    expect(r.fehler).toBeNull()

    const [posten] = await zeilen<{ status: string; error_reason: string }>(
      `SELECT status, error_reason FROM public.sepa_batch_items WHERE id = '${a.batchItemId}'`,
    )
    expect(posten.status).toBe('ruecklastschrift')
    expect(posten.error_reason).toContain('2026-08-20')

    const [zahlung] = await zeilen<{ allocated_cents: number; matching_status: string }>(
      `SELECT allocated_cents, matching_status FROM public.payments WHERE id = '${a.paymentId}'`,
    )
    expect(Number(zahlung.allocated_cents)).toBe(0)
    expect(zahlung.matching_status).toBe('nicht_zugeordnet')

    const [inv] = await zeilen<{
      status: string; paid_amount: string | null; bezahlt: boolean; bezahlt_am: string | null
    }>(
      `SELECT status, paid_amount, bezahlt, bezahlt_am FROM public.invoices WHERE id = '${a.invoiceId}'`,
    )
    expect(inv.status).toBe('freigegeben')
    expect(Number(inv.paid_amount)).toBe(0)
    expect(inv.bezahlt).toBe(false)
    expect(inv.bezahlt_am).toBeNull()
  })

  /**
   * BEFUND R-1 — Regressionstest.
   *
   * Mit angewendeter Migration 20261004000000 traegt die Zuordnung den
   * Zustand 'rueckzahlung'. Entscheidend ist nicht der Wert selbst,
   * sondern dass `payment_allocations` und `payments.allocated_cents`
   * danach dasselbe sagen — vorher widersprachen sie sich.
   */
  it('markiert die zurueckgenommene Zuordnung, statt sie stehen zu lassen', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2002',
      betragCent: 8000, mandatsReferenz: 'AE-A-0001-Y2', endToEndId: 'AE-RE-2026-2002',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -8000, endToEndId: 'AE-RE-2026-2002' }),
      'e0000000-0000-4000-8000-000000002002', ORG_A, ADMIN_A,
    )
    expect(r.fehler).toBeNull()

    const [alloc] = await zeilen<{ allocation_type: string }>(
      `SELECT allocation_type FROM public.payment_allocations WHERE id = '${a.allocationId}'`,
    )
    expect(alloc.allocation_type).toBe('rueckzahlung')
  })

  it('faellt ohne die Migration auf das Entfernen zurueck und sagt es', async () => {
    // CHECK-Stand VOR 20261004000000 wiederherstellen.
    await db.exec(`
      ALTER TABLE public.payment_allocations
        DROP CONSTRAINT IF EXISTS payment_allocations_allocation_type_check;
      ALTER TABLE public.payment_allocations
        ADD CONSTRAINT payment_allocations_allocation_type_check
        CHECK (allocation_type IN ('vollzahlung','teilzahlung','ueberzahlung',
                                   'sammelzahlung_anteil','gutschrift_verrechnung'));
    `)
    try {
      const a = await baueEingezogenenPosten({
        org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2003',
        betragCent: 6000, mandatsReferenz: 'AE-A-0001-Y3', endToEndId: 'AE-RE-2026-2003',
      })

      const r = await verarbeiteRuecklastschrift(
        admin,
        buchung({ betragCent: -6000, endToEndId: 'AE-RE-2026-2003' }),
        'e0000000-0000-4000-8000-000000002003', ORG_A, ADMIN_A,
      )

      // Der Rueckfall bleibt sichtbar — kein stilles Verschlucken mehr.
      expect(r.fehler).toMatch(/20261004000000/)

      // Und die Buecher widersprechen sich nicht: keine Zuordnung, die
      // weiter behauptet, die Rechnung sei bezahlt.
      expect(
        await zaehle('payment_allocations', `id = '${a.allocationId}'`),
      ).toBe(0)
      const [zahlung] = await zeilen<{ allocated_cents: number }>(
        `SELECT allocated_cents FROM public.payments WHERE id = '${a.paymentId}'`,
      )
      expect(Number(zahlung.allocated_cents)).toBe(0)
    } finally {
      await db.exec(liesMigration(M_ALLOC_RUECK))
    }
  })

  it('bucht die Ruecklastschriftgebuehr als Zahlungsdifferenz', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2004',
      betragCent: 12000, mandatsReferenz: 'AE-A-0001-Y4', endToEndId: 'AE-RE-2026-2004',
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -12000, endToEndId: 'AE-RE-2026-2004' }),
      'e0000000-0000-4000-8000-000000002004', ORG_A, ADMIN_A,
    )

    expect(r.gebuehrCent).toBeGreaterThan(0)

    const [diff] = await zeilen<{
      organization_id: string; invoice_id: string; soll_cents: number
      ist_cents: number; kuerzung_kategorie: string; widerspruch_status: string
      kuerzung_grund: string
    }>('SELECT * FROM public.payment_differences')

    // Der gemeldete Betrag MUSS auch wirklich in der Tabelle stehen —
    // genau das war vorher nicht so (23514/42703, still verschluckt).
    expect(Number(diff.soll_cents)).toBe(r.gebuehrCent)
    expect(Number(diff.ist_cents)).toBe(0)
    expect(diff.organization_id).toBe(ORG_A)
    expect(diff.invoice_id).toBe(a.invoiceId)
    expect(diff.kuerzung_kategorie).toBe('sonstiges')
    expect(diff.widerspruch_status).toBe('offen')
    expect(diff.kuerzung_grund).toContain('Rücklastschrift')
  })

  it('reduziert bei einer Teil-Ruecklastschrift nur den zurueckgegebenen Betrag', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2005',
      betragCent: 20000, mandatsReferenz: 'AE-A-0001-Y5', endToEndId: 'AE-RE-2026-2005',
    })

    await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -7500, endToEndId: 'AE-RE-2026-2005' }),
      'e0000000-0000-4000-8000-000000002005', ORG_A, ADMIN_A,
    )

    const [inv] = await zeilen<{ status: string; paid_amount: string }>(
      `SELECT status, paid_amount FROM public.invoices WHERE id = '${a.invoiceId}'`,
    )
    expect(Number(inv.paid_amount)).toBeCloseTo(125, 2)
    expect(inv.status).toBe('teilweise_bezahlt')
  })

  it('kommt ohne zugeordnete Zahlung durch, ohne abzubrechen', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-2006',
      betragCent: 4000, mandatsReferenz: 'AE-A-0001-Y6', endToEndId: 'AE-RE-2026-2006',
      mitZahlung: false,
    })

    const r = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -4000, endToEndId: 'AE-RE-2026-2006' }),
      'e0000000-0000-4000-8000-000000002006', ORG_A, ADMIN_A,
    )

    expect(r.fehler).toBeNull()
    expect(r.paymentId).toBeNull()
    expect(r.gebuehrCent).toBeGreaterThan(0)
    const [inv] = await zeilen<{ status: string }>(
      `SELECT status FROM public.invoices WHERE id = '${a.invoiceId}'`,
    )
    expect(inv.status).toBe('freigegeben')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mandatssperre und Mahnstufe', () => {
  it('sperrt das Mandat erst ab der zweiten Ruecklastschrift', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-3001',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-Z1', endToEndId: 'AE-RE-2026-3001',
    })

    const erste = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3001' }),
      'e0000000-0000-4000-8000-000000003001', ORG_A, ADMIN_A,
    )
    expect(erste.mandatGesperrt).toBe(false)
    const [m1] = await zeilen<{ status: string }>(
      `SELECT status FROM public.sepa_mandates WHERE id = '${a.mandateId}'`,
    )
    expect(m1.status).toBe('aktiv')

    // Zweiter Einzug ueber DASSELBE Mandat, der ebenfalls zurueckkommt.
    const zweiterPosten = neueId('b0000000')
    const zweiteRechnung = neueId('f0000000')
    const batch = neueId('a0000000')
    await db.query(
      `INSERT INTO public.invoices
         (id, organization_id, client_id, invoice_number, invoice_number_formatted,
          period_start, period_end, total_amount, paid_amount, status, dunning_level)
       VALUES ($1, $2, $3, 'RE-2026-3002', 'RE-2026-3002', '2026-08-01', '2026-08-31',
               50, 50, 'bezahlt', 'offen')`,
      [zweiteRechnung, ORG_A, KLIENT_A] as never[],
    )
    await db.query(
      `INSERT INTO public.sepa_batches
         (id, organization_id, batch_number, total_items, total_cents, requested_collection_date)
       VALUES ($1, $2, 'SEPA-3002', 1, 5000, '2026-09-10')`,
      [batch, ORG_A] as never[],
    )
    await db.query(
      `INSERT INTO public.sepa_batch_items
         (id, organization_id, batch_id, invoice_id, mandate_id, amount_cents,
          end_to_end_id, status)
       VALUES ($1, $2, $3, $4, $5, 5000, 'AE-RE-2026-3002', 'eingezogen')`,
      [zweiterPosten, ORG_A, batch, zweiteRechnung, a.mandateId] as never[],
    )

    const zweite = await verarbeiteRuecklastschrift(
      admin,
      buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3002' }),
      'e0000000-0000-4000-8000-000000003002', ORG_A, ADMIN_A,
    )
    expect(zweite.mandatGesperrt).toBe(true)

    const [m2] = await zeilen<{ status: string; revoked_at: string | null; revoke_reason: string }>(
      `SELECT status, revoked_at, revoke_reason FROM public.sepa_mandates WHERE id = '${a.mandateId}'`,
    )
    expect(m2.status).toBe('widerrufen')
    expect(m2.revoked_at).not.toBeNull()
    expect(m2.revoke_reason).toMatch(/Automatisch gesperrt/)

    // Die Sperre steht im Pruefpfad.
    expect(
      await zaehle('billing_audit_trail', `action = 'auto_revoked_ruecklastschrift'`),
    ).toBe(1)
  })

  it('zaehlt Ruecklastschriften eines FREMDEN Mandats nicht mit', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-3003',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-Z2', endToEndId: 'AE-RE-2026-3003',
    })
    const b = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A2, nummer: 'RE-2026-3004',
      betragCent: 5000, mandatsReferenz: 'AE-A-0002-Z1', endToEndId: 'AE-RE-2026-3004',
    })

    await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3003' }),
      'e0000000-0000-4000-8000-000000003003', ORG_A, ADMIN_A,
    )
    const zweite = await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3004' }),
      'e0000000-0000-4000-8000-000000003004', ORG_A, ADMIN_A,
    )

    expect(zweite.mandatGesperrt).toBe(false)
    for (const id of [a.mandateId, b.mandateId]) {
      const [m] = await zeilen<{ status: string }>(
        `SELECT status FROM public.sepa_mandates WHERE id = '${id}'`,
      )
      expect(m.status).toBe('aktiv')
    }
  })

  it('hebt die Mahnstufe auf mindestens "mahnung_1" — auf Zeile UND Rechnung', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-3005',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-Z3', endToEndId: 'AE-RE-2026-3005',
    })

    await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3005' }),
      'e0000000-0000-4000-8000-000000003005', ORG_A, ADMIN_A,
    )

    const [eintrag] = await zeilen<{ dunning_level: string; last_dunning_at: string | null }>(
      `SELECT dunning_level, last_dunning_at FROM public.dunning_entries
       WHERE invoice_id = '${a.invoiceId}'`,
    )
    expect(eintrag.dunning_level).toBe('mahnung_1')
    expect(eintrag.last_dunning_at).not.toBeNull()

    // Beide Orte muessen dasselbe sagen — sonst mahnt der Lauf anders,
    // als die Rechnungsliste anzeigt.
    const [inv] = await zeilen<{ dunning_level: string }>(
      `SELECT dunning_level FROM public.invoices WHERE id = '${a.invoiceId}'`,
    )
    expect(inv.dunning_level).toBe('mahnung_1')
  })

  it('eskaliert von "mahnung_1" weiter auf "mahnung_2"', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-3006',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-Z4', endToEndId: 'AE-RE-2026-3006',
    })
    await db.exec(
      `UPDATE public.dunning_entries SET dunning_level = 'mahnung_1'
       WHERE invoice_id = '${a.invoiceId}'`,
    )

    await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3006' }),
      'e0000000-0000-4000-8000-000000003006', ORG_A, ADMIN_A,
    )

    const [eintrag] = await zeilen<{ dunning_level: string }>(
      `SELECT dunning_level FROM public.dunning_entries WHERE invoice_id = '${a.invoiceId}'`,
    )
    expect(eintrag.dunning_level).toBe('mahnung_2')
  })

  it('kommt ohne Mahnzeile durch, ohne abzubrechen', async () => {
    await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-3007',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-Z5', endToEndId: 'AE-RE-2026-3007',
      mitMahnzeile: false,
    })

    const r = await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-3007' }),
      'e0000000-0000-4000-8000-000000003007', ORG_A, ADMIN_A,
    )
    expect(r.fehler).toBeNull()
    expect(r.gebuehrCent).toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Pruefpfad', () => {
  it('schreibt einen Audit-Eintrag mit Mandant und Wirkung', async () => {
    const a = await baueEingezogenenPosten({
      org: ORG_A, klient: KLIENT_A, nummer: 'RE-2026-4001',
      betragCent: 5000, mandatsReferenz: 'AE-A-0001-W1', endToEndId: 'AE-RE-2026-4001',
    })

    await verarbeiteRuecklastschrift(
      admin, buchung({ betragCent: -5000, endToEndId: 'AE-RE-2026-4001' }),
      'e0000000-0000-4000-8000-000000004001', ORG_A, ADMIN_A,
    )

    const [eintrag] = await zeilen<{
      organization_id: string; entity_id: string; action: string
      new_state: Record<string, unknown>; checksum: string | null
    }>(
      `SELECT * FROM public.billing_audit_trail WHERE entity_type = 'ruecklastschrift'`,
    )
    expect(eintrag.organization_id).toBe(ORG_A)
    expect(eintrag.entity_id).toBe('e0000000-0000-4000-8000-000000004001')
    expect(eintrag.action).toBe('verarbeitet')
    expect(eintrag.new_state.invoiceId).toBe(a.invoiceId)
    expect(eintrag.checksum).toBeTruthy()
  })
})
