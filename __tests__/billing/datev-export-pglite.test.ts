/**
 * DATEV-Export auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Der DATEV-Buchungsstapel ist das, was der Steuerberater einliest. Ein
 * Fehler darin faellt nicht in der Anwendung auf, sondern in der
 * Finanzbuchhaltung — Monate spaeter, bei der Saldenabstimmung.
 *
 * Bis hierher war der Export ungeprueft, und zwar aus einem konkreten
 * Grund: `generateBuchungssaetze()` benutzt drei PostgREST-Merkmale, die
 * der PGlite-Shim gar nicht kannte —
 *
 *   • `.or('correction_type.is.null,correction_type.eq.rechnung,…')`
 *   • `.not('status', 'eq', 'entwurf')`
 *   • verschachtelte und eins-zu-viele Einbettungen wie
 *     `payment:payments(… allocations:payment_allocations(invoice:invoices(…)))`
 *
 * Alle drei sind in __tests__/e2e/helpers/pglite-supabase.ts ergaenzt
 * worden; die Begruendung steht dort. Diese Suite ist der Nachweis, dass
 * der Generator mit ihnen laeuft.
 *
 * ── WAS HIER *NICHT* GEPRUEFT WIRD ─────────────────────────────────────
 * `erstelleDatevExport()` schreibt in Supabase Storage. Storage bildet der
 * Shim nicht ab, deshalb laeuft die Suite auf den beiden Schichten
 * darunter: dem Buchungssatz-Generator (Datenbank) und dem CSV-Format
 * (rein). Die Storage-Schicht bleibt ungeprueft — hier benannt statt
 * stillschweigend uebergangen.
 *
 * KONTEN UND BETRAEGE: Die Kontonummern stammen aus dem SKR03/SKR04-
 * Standardkontenrahmen (lib/billing/datev/kontenrahmen.ts) und sind keine
 * Erfindung. Alle Betraege sind Testwerte innerhalb der In-Memory-Instanz;
 * es wird kein Verguetungssatz und kein echter Geschaeftsvorfall
 * behauptet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen, baueDatevTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { generateBuchungssaetze } from '@/lib/billing/datev/buchungssatz-generator'
import {
  generateDatevCsv,
  generateDatevBuchungszeile,
  formatDatevBetrag,
  type DatevBuchungssatz,
  type DatevHeaderParams,
} from '@/lib/billing/datev/datev-format'
import {
  getOrCreateDebitorennummer,
  upsertKontenzuordnung,
  pruefeDebitorennummer,
  getKonto,
} from '@/lib/billing/datev/kontenrahmen'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000da7e'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000da7e'
const KLIENT_A = 'c1111111-0000-4000-8000-00000000da7e'
const KLIENT_A2 = 'c2222222-0000-4000-8000-00000000da7e'
const KLIENT_B = 'c3333333-0000-4000-8000-00000000da7e'

const VON = '2026-03-01'
const BIS = '2026-03-31'

let db: PGlite
let admin: SupabaseClient

/** SKR03 aus dem Standardkontenrahmen — nicht frei gewaehlt. */
const ERLOES_SKR03 = getKonto('SKR03', 'erloesePflege').konto
const BANK_SKR03 = getKonto('SKR03', 'bank').konto
const MAHN_SKR03 = getKonto('SKR03', 'mahngebuehren').konto
const FORDERUNG_SKR03 = getKonto('SKR03', 'forderungen').konto

async function sql(text: string, params: unknown[] = []): Promise<void> {
  await db.query(text, params as never[])
}

async function baueStammdaten(): Promise<void> {
  await sql(
    `INSERT INTO public.organizations (id, name) VALUES
       ($1, 'Testmandant A'), ($2, 'Testmandant B')`,
    [ORG_A, ORG_B],
  )
  await sql(
    `INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name) VALUES
       ($1, $4, 'K-0001', 'Vorname', 'Musterfrau'),
       ($2, $4, 'K-0002', 'Vorname', 'Mustermann'),
       ($3, $5, 'K-0003', 'Vorname', 'Fremdmandant')`,
    [KLIENT_A, KLIENT_A2, KLIENT_B, ORG_A, ORG_B],
  )
}

interface RechnungOpts {
  id: string
  org?: string
  klient?: string
  nummer: string
  betrag: number
  status?: string
  correctionType?: string | null
  datum?: string
  deletedAt?: string | null
}

async function rechnung(o: RechnungOpts): Promise<void> {
  await sql(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, status, correction_type, created_at, deleted_at)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      o.id, o.org ?? ORG_A, o.klient ?? KLIENT_A, o.nummer,
      VON, BIS, o.betrag, o.status ?? 'sent',
      o.correctionType ?? null, `${o.datum ?? '2026-03-15'}T10:00:00Z`, o.deletedAt ?? null,
    ],
  )
}

function params(org = ORG_A) {
  return { organizationId: org, zeitraumVon: VON, zeitraumBis: BIS, kontenrahmen: 'SKR03' as const }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueCamtTabellen(db)
  await baueDatevTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
})

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await sql(`
    TRUNCATE public.datev_kontenzuordnung, public.datev_exports,
             public.payment_allocations, public.payments,
             public.dunning_entries, public.zahlungseingaenge,
             public.camt_imports, public.invoice_items, public.invoices,
             public.clients, public.organizations
    RESTART IDENTITY CASCADE
  `)
  await baueStammdaten()
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Beträge, Soll/Haben, Vorzeichen
// ═══════════════════════════════════════════════════════════════════════

describe('Beträge und Buchungsrichtung', () => {
  it('Rechnung wird als Debitor (S) an Erlös gebucht', async () => {
    await rechnung({ id: 'd0000001-0000-4000-8000-00000000da7e', nummer: 'RE-2026-0001', betrag: 435.5 })

    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())

    expect(statistik.rechnungen).toBe(1)
    expect(buchungen).toHaveLength(1)
    expect(buchungen[0]).toMatchObject({
      umsatz: 435.5,
      sollHaben: 'S',
      gegenkonto: ERLOES_SKR03,
      belegnummer: 'RE-2026-0001',
      ustSchluessel: 0,      // Pflege ist steuerfrei (§ 4 Nr. 16 UStG)
    })
    // Das Konto ist die Debitorennummer, nicht das Sachkonto.
    expect(buchungen[0].konto).toMatch(/^\d{5}$/)
  })

  it('Zahlungseingang wird in Euro umgerechnet: Bank (S) an Debitor', async () => {
    const inv = 'd0000002-0000-4000-8000-00000000da7e'
    const pay = 'd0000003-0000-4000-8000-00000000da7e'
    await rechnung({ id: inv, nummer: 'RE-2026-0002', betrag: 120 })
    await sql(
      `INSERT INTO public.payments (id, organization_id, payment_date, amount_cents)
       VALUES ($1, $2, '2026-03-20', 12000)`, [pay, ORG_A])
    await sql(
      `INSERT INTO public.payment_allocations
         (organization_id, payment_id, invoice_id, amount_cents, created_at)
       VALUES ($1, $2, $3, 12000, '2026-03-20T09:00:00Z')`, [ORG_A, pay, inv])

    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())
    const zahlung = buchungen.find(b => b.buchungstext.startsWith('Zahlung'))

    expect(statistik.zahlungen).toBe(1)
    expect(zahlung).toBeDefined()
    expect(zahlung!.umsatz).toBe(120)          // 12000 Cent
    expect(zahlung!.sollHaben).toBe('S')
    expect(zahlung!.konto).toBe(BANK_SKR03)
    expect(zahlung!.gegenkonto).toMatch(/^\d{5}$/)
    // Der Klientenname stammt aus der VERSCHACHTELTEN Einbettung
    // invoice:invoices(… client:clients(last_name)).
    expect(zahlung!.buchungstext).toContain('Musterfrau')
  })

  it('Gutschrift wird als Betrag OHNE Vorzeichen mit Storno-Kennzeichen gebucht', async () => {
    // DATEV kennt keine negativen Umsätze im Buchungsstapel — die Richtung
    // steht in Soll/Haben, die Generalumkehr im Storno-Feld.
    await rechnung({
      id: 'd0000004-0000-4000-8000-00000000da7e',
      nummer: 'GS-2026-0001', betrag: -55.25, correctionType: 'gutschrift',
    })

    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())

    expect(statistik.gutschriften).toBe(1)
    expect(statistik.rechnungen).toBe(0)
    expect(buchungen[0]).toMatchObject({
      umsatz: 55.25,
      sollHaben: 'S',
      konto: ERLOES_SKR03,       // Erlös im Soll = Umkehrung der Rechnung
      storno: true,
      ustSchluessel: 0,
    })
    expect(buchungen[0].gegenkonto).toMatch(/^\d{5}$/)
  })

  it('Gutschrift und Rechnung gleichen sich betragsgleich aus', async () => {
    await rechnung({ id: 'd0000005-0000-4000-8000-00000000da7e', nummer: 'RE-0003', betrag: 87.35 })
    await rechnung({
      id: 'd0000006-0000-4000-8000-00000000da7e',
      nummer: 'GS-0003', betrag: -87.35, correctionType: 'storno',
    })

    const { buchungen } = await generateBuchungssaetze(admin, params())
    const re = buchungen.find(b => b.belegnummer === 'RE-0003')!
    const gs = buchungen.find(b => b.belegnummer === 'GS-0003')!

    expect(re.umsatz).toBe(gs.umsatz)
    // Gegenläufig: bei der Rechnung steht der Erlös im Gegenkonto, bei der
    // Gutschrift im Konto.
    expect(re.gegenkonto).toBe(ERLOES_SKR03)
    expect(gs.konto).toBe(ERLOES_SKR03)
  })

  it('Mahngebühr wird als Debitor (S) an Mahnerlöse gebucht', async () => {
    const inv = 'd0000007-0000-4000-8000-00000000da7e'
    await rechnung({ id: inv, nummer: 'RE-0004', betrag: 100 })
    await sql(
      `INSERT INTO public.dunning_entries
         (organization_id, invoice_id, dunning_level, due_date, amount_due_cents,
          dunning_fee_cents, created_at)
       VALUES ($1, $2, 'mahnung_1', '2026-03-10', 10000, 500, '2026-03-25T08:00:00Z')`,
      [ORG_A, inv])

    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())
    const mahn = buchungen.find(b => b.buchungstext.startsWith('Mahngebuehr'))

    expect(statistik.mahngebuehren).toBe(1)
    expect(mahn!.umsatz).toBe(5)
    expect(mahn!.gegenkonto).toBe(MAHN_SKR03)
    expect(mahn!.sollHaben).toBe('S')
  })

  it('Mahnung ohne Gebühr erzeugt keine Buchung', async () => {
    const inv = 'd0000008-0000-4000-8000-00000000da7e'
    await rechnung({ id: inv, nummer: 'RE-0005', betrag: 100 })
    await sql(
      `INSERT INTO public.dunning_entries
         (organization_id, invoice_id, dunning_level, due_date, amount_due_cents,
          dunning_fee_cents, created_at)
       VALUES ($1, $2, 'erinnerung', '2026-03-10', 10000, 0, '2026-03-25T08:00:00Z')`,
      [ORG_A, inv])

    const { statistik } = await generateBuchungssaetze(admin, params())
    expect(statistik.mahngebuehren).toBe(0)
  })

  it('Rücklastschrift bucht Debitor (S) an Bank — und NUR das', async () => {
    const inv = 'd0000009-0000-4000-8000-00000000da7e'
    const pay = 'd000000a-0000-4000-8000-00000000da7e'
    const camt = 'd000000b-0000-4000-8000-00000000da7e'
    await rechnung({ id: inv, nummer: 'RE-0006', betrag: 60 })
    await sql(
      `INSERT INTO public.payments (id, organization_id, payment_date, amount_cents)
       VALUES ($1, $2, '2026-03-05', 6000)`, [pay, ORG_A])
    await sql(
      `INSERT INTO public.payment_allocations
         (organization_id, payment_id, invoice_id, amount_cents, created_at)
       VALUES ($1, $2, $3, 6000, '2026-02-01T09:00:00Z')`, [ORG_A, pay, inv])
    await sql(
      `INSERT INTO public.camt_imports (id, organization_id, dateiname, quelldatei_hash)
       VALUES ($1, $2, 'testauszug.xml', 'hash-rl-1')`, [camt, ORG_A])
    await sql(
      `INSERT INTO public.zahlungseingaenge
         (organization_id, camt_import_id, buchungsdatum, betrag_cent, debitor_name,
          ist_ruecklastschrift, payment_id, quelldatei_hash)
       VALUES ($1, $2, '2026-03-18', -6000, 'Musterfrau', true, $3, 'hash-rl-1')`,
      [ORG_A, camt, pay])

    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())
    const rl = buchungen.filter(b => b.buchungstext.startsWith('Ruecklastschrift'))

    expect(statistik.ruecklastschriften).toBe(1)
    // GENAU EINE Buchung. Früher kam eine zweite über pauschal 5,00 EUR
    // "Nebenkosten Geldverkehr" dazu — ein Literal im Generator, das auf
    // keinem Kontoauszug stand. Der Kommentar dort erklärt die Entfernung;
    // dieser Test hält sie fest.
    expect(rl).toHaveLength(1)
    expect(rl[0].umsatz).toBe(60)             // Betrag ohne Vorzeichen
    expect(rl[0].sollHaben).toBe('S')
    expect(rl[0].gegenkonto).toBe(BANK_SKR03)
    // Die Debitorennummer kommt aus der EINS-ZU-VIELE-Einbettung
    // payments → payment_allocations → invoices.
    expect(rl[0].konto).toMatch(/^\d{5}$/)
    expect(rl[0].belegnummer).toBe('RE-0006')

    // Kein einziger Buchungssatz gegen das Aufwandskonto.
    const aufwand = getKonto('SKR03', 'nebenkostenGeldverkehr').konto
    expect(buchungen.some(b => b.konto === aufwand || b.gegenkonto === aufwand)).toBe(false)
  })

  it('Rücklastschrift ohne zuordenbare Rechnung fällt auf das Forderungskonto', async () => {
    const camt = 'd000000c-0000-4000-8000-00000000da7e'
    await sql(
      `INSERT INTO public.camt_imports (id, organization_id, dateiname, quelldatei_hash)
       VALUES ($1, $2, 'testauszug2.xml', 'hash-rl-2')`, [camt, ORG_A])
    await sql(
      `INSERT INTO public.zahlungseingaenge
         (organization_id, camt_import_id, buchungsdatum, betrag_cent, debitor_name,
          ist_ruecklastschrift, quelldatei_hash)
       VALUES ($1, $2, '2026-03-18', -2500, 'Unbekannt', true, 'hash-rl-2')`,
      [ORG_A, camt])

    const { buchungen } = await generateBuchungssaetze(admin, params())
    expect(buchungen).toHaveLength(1)
    expect(buchungen[0].konto).toBe(FORDERUNG_SKR03)
    expect(buchungen[0].umsatz).toBe(25)
    expect(buchungen[0].belegnummer).toMatch(/^RL-/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Nur zulässige Buchungen — welche Belege überhaupt in den Stapel gehen
// ═══════════════════════════════════════════════════════════════════════

describe('Export nur zulässiger Buchungen', () => {
  it('Entwürfe bleiben draußen', async () => {
    await rechnung({
      id: 'd0000010-0000-4000-8000-00000000da7e',
      nummer: 'RE-ENTWURF', betrag: 99, status: 'entwurf',
    })
    const { statistik } = await generateBuchungssaetze(admin, params())
    expect(statistik.gesamt).toBe(0)
  })

  it('gelöschte Rechnungen bleiben draußen', async () => {
    await rechnung({
      id: 'd0000011-0000-4000-8000-00000000da7e',
      nummer: 'RE-GELOESCHT', betrag: 99, deletedAt: '2026-03-20T00:00:00Z',
    })
    const { statistik } = await generateBuchungssaetze(admin, params())
    expect(statistik.gesamt).toBe(0)
  })

  it('Beträge <= 0 erzeugen keine Buchung', async () => {
    await rechnung({ id: 'd0000012-0000-4000-8000-00000000da7e', nummer: 'RE-NULL', betrag: 0 })
    const { statistik } = await generateBuchungssaetze(admin, params())
    expect(statistik.gesamt).toBe(0)
  })

  it('Korrekturrechnung zählt als Ausgangsrechnung, nicht als Gutschrift', async () => {
    // createCorrectionInvoice() legt eine vollwertige Rechnung mit eigener
    // Nummer und eigenem Erlös an. Fiel sie durch beide Abfragen, fehlte sie
    // im Export vollständig — genau das prüft dieser Fall.
    await rechnung({
      id: 'd0000013-0000-4000-8000-00000000da7e',
      nummer: 'KO-2026-0001', betrag: 42, correctionType: 'korrektur',
    })
    const { statistik, buchungen } = await generateBuchungssaetze(admin, params())
    expect(statistik.rechnungen).toBe(1)
    expect(statistik.gutschriften).toBe(0)
    expect(buchungen[0].gegenkonto).toBe(ERLOES_SKR03)
  })

  it('jeder correction_type wird von genau einer der beiden Abfragen erfasst', async () => {
    const typen: Array<string | null> = [null, 'rechnung', 'korrektur', 'gutschrift', 'storno', 'teilstorno']
    for (const [i, typ] of typen.entries()) {
      await rechnung({
        id: `d10000${i}0-0000-4000-8000-00000000da7e`,
        nummer: `MIX-${i}`, betrag: 10, correctionType: typ,
      })
    }
    const { statistik } = await generateBuchungssaetze(admin, params())
    // Keiner doppelt, keiner vergessen.
    expect(statistik.rechnungen + statistik.gutschriften).toBe(typen.length)
    expect(statistik.rechnungen).toBe(3)   // null, rechnung, korrektur
    expect(statistik.gutschriften).toBe(3) // gutschrift, storno, teilstorno
  })

  it('Belege außerhalb des Zeitraums bleiben draußen', async () => {
    await rechnung({
      id: 'd0000014-0000-4000-8000-00000000da7e',
      nummer: 'RE-VORHER', betrag: 50, datum: '2026-02-28',
    })
    await rechnung({
      id: 'd0000015-0000-4000-8000-00000000da7e',
      nummer: 'RE-NACHHER', betrag: 50, datum: '2026-04-01',
    })
    await rechnung({
      id: 'd0000016-0000-4000-8000-00000000da7e',
      nummer: 'RE-DRIN', betrag: 50, datum: '2026-03-31',
    })
    const { buchungen } = await generateBuchungssaetze(admin, params())
    expect(buchungen.map(b => b.belegnummer)).toEqual(['RE-DRIN'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Mandantentrennung
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantentrennung', () => {
  it('Belege eines fremden Mandanten erscheinen nicht im Export', async () => {
    await rechnung({ id: 'd0000020-0000-4000-8000-00000000da7e', nummer: 'A-RE-1', betrag: 10 })
    await rechnung({
      id: 'd0000021-0000-4000-8000-00000000da7e',
      org: ORG_B, klient: KLIENT_B, nummer: 'B-RE-1', betrag: 999,
    })

    const a = await generateBuchungssaetze(admin, params(ORG_A))
    const b = await generateBuchungssaetze(admin, params(ORG_B))

    expect(a.buchungen.map(x => x.belegnummer)).toEqual(['A-RE-1'])
    expect(b.buchungen.map(x => x.belegnummer)).toEqual(['B-RE-1'])
  })

  it('Zahlungen, Mahngebühren und Rücklastschriften fremder Mandanten ebenso wenig', async () => {
    const inv = 'd0000022-0000-4000-8000-00000000da7e'
    const pay = 'd0000023-0000-4000-8000-00000000da7e'
    const camt = 'd0000024-0000-4000-8000-00000000da7e'
    await rechnung({ id: inv, org: ORG_B, klient: KLIENT_B, nummer: 'B-RE-2', betrag: 30 })
    await sql(
      `INSERT INTO public.payments (id, organization_id, payment_date, amount_cents)
       VALUES ($1, $2, '2026-03-20', 3000)`, [pay, ORG_B])
    await sql(
      `INSERT INTO public.payment_allocations
         (organization_id, payment_id, invoice_id, amount_cents, created_at)
       VALUES ($1, $2, $3, 3000, '2026-03-20T09:00:00Z')`, [ORG_B, pay, inv])
    await sql(
      `INSERT INTO public.dunning_entries
         (organization_id, invoice_id, dunning_level, due_date, amount_due_cents,
          dunning_fee_cents, created_at)
       VALUES ($1, $2, 'mahnung_1', '2026-03-10', 3000, 500, '2026-03-25T08:00:00Z')`,
      [ORG_B, inv])
    await sql(
      `INSERT INTO public.camt_imports (id, organization_id, dateiname, quelldatei_hash)
       VALUES ($1, $2, 'b.xml', 'hash-b')`, [camt, ORG_B])
    await sql(
      `INSERT INTO public.zahlungseingaenge
         (organization_id, camt_import_id, buchungsdatum, betrag_cent,
          ist_ruecklastschrift, payment_id, quelldatei_hash)
       VALUES ($1, $2, '2026-03-18', -3000, true, $3, 'hash-b')`, [ORG_B, camt, pay])

    const a = await generateBuchungssaetze(admin, params(ORG_A))
    expect(a.statistik).toMatchObject({
      rechnungen: 0, zahlungen: 0, gutschriften: 0, mahngebuehren: 0,
      ruecklastschriften: 0, gesamt: 0,
    })

    const b = await generateBuchungssaetze(admin, params(ORG_B))
    expect(b.statistik.gesamt).toBe(4)
  })

  it('Debitorennummern werden je Mandant getrennt vergeben', async () => {
    const a = await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A)
    const b = await getOrCreateDebitorennummer(admin, ORG_B, KLIENT_B)
    // Beide starten bei 10000 — die Nummernkreise sind unabhängig.
    expect(a).toBe('10000')
    expect(b).toBe('10000')

    const zeilen = await db.query<{ organization_id: string; debitorennummer: string }>(
      `SELECT organization_id, debitorennummer FROM public.datev_kontenzuordnung ORDER BY organization_id`,
    )
    expect(zeilen.rows).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Kontenzuordnung — Dubletten, Stabilität, fehlende Konten
// ═══════════════════════════════════════════════════════════════════════

describe('Debitorenkonten', () => {
  it('derselbe Klient bekommt immer dieselbe Nummer', async () => {
    const erst = await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A)
    const zweit = await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A)
    expect(zweit).toBe(erst)

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.datev_kontenzuordnung WHERE client_id = $1`,
      [KLIENT_A] as never[],
    )
    expect(rows[0].n).toBe(1)
  })

  it('zwei Klienten bekommen aufsteigende Nummern', async () => {
    expect(await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A)).toBe('10000')
    expect(await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A2)).toBe('10001')
  })

  it('die UNIQUE-Sperre der Datenbank verhindert eine Dublette', async () => {
    await getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A)
    const { error } = await admin.from('datev_kontenzuordnung').insert({
      organization_id: ORG_A, client_id: KLIENT_A, debitorennummer: '19999',
    })
    expect(error?.code).toBe('23505')
  })

  it('erschöpfter Nummernkreis wirft, statt eine ungültige Nummer zu vergeben', async () => {
    await sql(
      `INSERT INTO public.datev_kontenzuordnung (organization_id, client_id, debitorennummer)
       VALUES ($1, $2, '69999')`, [ORG_A, KLIENT_A])

    await expect(getOrCreateDebitorennummer(admin, ORG_A, KLIENT_A2))
      .rejects.toThrow(/erschoepft/i)
  })

  it('Buchungen desselben Klienten tragen dasselbe Debitorenkonto', async () => {
    await rechnung({ id: 'd0000030-0000-4000-8000-00000000da7e', nummer: 'RE-K1-A', betrag: 10 })
    await rechnung({ id: 'd0000031-0000-4000-8000-00000000da7e', nummer: 'RE-K1-B', betrag: 20 })
    await rechnung({
      id: 'd0000032-0000-4000-8000-00000000da7e',
      klient: KLIENT_A2, nummer: 'RE-K2-A', betrag: 30,
    })

    const { buchungen } = await generateBuchungssaetze(admin, params())
    const nach = (nr: string) => buchungen.find(b => b.belegnummer === nr)!.konto

    expect(nach('RE-K1-A')).toBe(nach('RE-K1-B'))
    expect(nach('RE-K2-A')).not.toBe(nach('RE-K1-A'))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4b. Zwei Befunde, die diese Suite gefunden hat
// ═══════════════════════════════════════════════════════════════════════

describe('Befund: manuell gesetzte Debitorennummer landete ungeprüft in der CSV', () => {
  // Die Debitorennummer wird bei JEDER Rechnungs-, Gutschrift- und
  // Mahnbuchung als Kontonummer in den Buchungsstapel geschrieben.
  // POST /api/billing/datev/kontenzuordnung prüfte sie nur auf "nicht leer",
  // und generateDatevBuchungszeile() schrieb sie als `"${konto}"` ohne
  // Verdoppeln der Anführungszeichen. Beides ist jetzt geschlossen — hier
  // beide Riegel einzeln.

  it('Riegel 1: eine Nummer außerhalb des Nummernkreises wird abgewiesen', () => {
    expect(pruefeDebitorennummer('10000')).toEqual({ ok: true })
    expect(pruefeDebitorennummer('69999')).toEqual({ ok: true })

    for (const schlecht of ['9999', '70000', '', '  ', 'ABC', '1";"9999', '="cmd"', '10000,5']) {
      const r = pruefeDebitorennummer(schlecht)
      expect(r.ok, `"${schlecht}" haette abgewiesen werden muessen`).toBe(false)
    }
  })

  it('Riegel 1: upsertKontenzuordnung schreibt eine ungültige Nummer nicht in die DB', async () => {
    await expect(upsertKontenzuordnung(admin, ORG_A, KLIENT_A, '1";"9999'))
      .rejects.toThrow(/Ziffern/)

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.datev_kontenzuordnung`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('Riegel 2: ein Anführungszeichen im Konto beendet das Feld nicht mehr', () => {
    const zeile = generateDatevBuchungszeile({
      umsatz: 100, sollHaben: 'S',
      konto: '1";"9999', gegenkonto: ERLOES_SKR03,
      belegdatum: '1503', belegnummer: 'RE-1', buchungstext: 'Rechnung RE-1', ustSchluessel: 0,
    })
    expect(zeile).toContain('"1"";""9999"')
    // Kein einzelnes, nicht verdoppeltes Anführungszeichen mehr — sonst
    // rutscht der Rest der Zeile in die falschen Spalten.
    expect(zeile).not.toContain('"1";"9999"')
  })

  it('Riegel 2: eine Formel im Konto wird entschärft', () => {
    const zeile = generateDatevBuchungszeile({
      umsatz: 100, sollHaben: 'S',
      konto: '=1+1', gegenkonto: '@8120',
      belegdatum: '1503', belegnummer: 'RE-1', buchungstext: 'Rechnung', ustSchluessel: 0,
    })
    expect(zeile).toContain(`"'=1+1"`)
    expect(zeile).toContain(`"'@8120"`)
  })

  it('gültige Nummern kommen unverändert durch — der Riegel ist kein Umbau', () => {
    const zeile = generateDatevBuchungszeile({
      umsatz: 100, sollHaben: 'S',
      konto: '10000', gegenkonto: ERLOES_SKR03,
      belegdatum: '1503', belegnummer: 'RE-1', buchungstext: 'Rechnung', ustSchluessel: 0,
    })
    expect(zeile.split(';')[2]).toBe('"10000"')
    expect(zeile.split(';')[3]).toBe(`"${ERLOES_SKR03}"`)
  })
})

describe('Befund: unbekannter Kontenrahmen warf einen nichtssagenden TypeError', () => {
  it('getKonto meldet den unbekannten Kontenrahmen im Klartext', () => {
    // getDatevConfig() castet den Wert aus der JSONB-Spalte nur
    // (`stored.kontenrahmen as Kontenrahmen`) — steht dort etwas anderes,
    // kam vorher "Cannot read properties of undefined (reading 'bank')"
    // aus der Tiefe des Generators.
    expect(() => getKonto('SKR49' as never, 'bank'))
      .toThrow(/Unbekannter Kontenrahmen "SKR49"/)
    expect(() => getKonto('SKR49' as never, 'bank')).not.toThrow(TypeError)
  })

  it('ein unbekanntes Konto im gültigen Rahmen meldet sich ebenfalls im Klartext', () => {
    expect(() => getKonto('SKR03', 'gibtEsNicht' as never))
      .toThrow(/nicht hinterlegt/)
  })

  it('der Export bricht mit dieser Meldung ab, statt mit einem TypeError', async () => {
    await rechnung({ id: 'd0000060-0000-4000-8000-00000000da7e', nummer: 'RE-KR-BAD', betrag: 10 })
    await expect(
      generateBuchungssaetze(admin, { ...params(), kontenrahmen: 'SKR49' as never }),
    ).rejects.toThrow(/Unbekannter Kontenrahmen/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Fail-Closed bei DB-Fehlern
// ═══════════════════════════════════════════════════════════════════════

describe('Fail-Closed', () => {
  /** Client, der genau eine Tabelle mit einem Lesefehler beantwortet. */
  function mitLesefehler(tabelle: string): SupabaseClient {
    const echt = macheSupabaseClient(db)
    return {
      ...echt,
      from(t: string) {
        if (t !== tabelle) return echt.from(t)
        const fehler = { message: `relation "${t}" does not exist`, code: '42P01' }
        const kette: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'gte', 'lte', 'gt', 'is', 'in', 'not', 'or', 'order', 'limit', 'returns']) {
          kette[m] = () => kette
        }
        kette.then = (auf: (w: unknown) => unknown) => Promise.resolve({ data: null, error: fehler }).then(auf)
        kette.single = async () => ({ data: null, error: fehler })
        kette.maybeSingle = async () => ({ data: null, error: fehler })
        return kette
      },
    } as unknown as SupabaseClient
  }

  it.each([
    ['invoices', /Rechnungen für DATEV nicht lesbar/],
    ['payment_allocations', /Zahlungszuordnungen für DATEV nicht lesbar/],
    ['dunning_entries', /Mahngebühren für DATEV nicht lesbar/],
    ['zahlungseingaenge', /Rücklastschriften für DATEV nicht lesbar/],
  ])('ein Lesefehler auf %s bricht den Export ab', async (tabelle, muster) => {
    await rechnung({ id: 'd0000040-0000-4000-8000-00000000da7e', nummer: 'RE-FC', betrag: 10 })
    await expect(generateBuchungssaetze(mitLesefehler(tabelle), params()))
      .rejects.toThrow(muster)
  })

  it('ein leerer Zeitraum ist KEIN Fehler, sondern ein leerer Stapel', async () => {
    const { buchungen, statistik } = await generateBuchungssaetze(admin, params())
    expect(buchungen).toEqual([])
    expect(statistik.gesamt).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. CSV-Format: Injection, Trennzeichen, Kontenrahmen, Steuerschlüssel
// ═══════════════════════════════════════════════════════════════════════

describe('DATEV-CSV', () => {
  const kopf: DatevHeaderParams = {
    beraternummer: '1234567',
    mandantennummer: '54321',
    wjBeginn: '20260101',
    sachkontenlaenge: 4,
    datumVon: '20260301',
    datumBis: '20260331',
  }

  function satz(ueber: Partial<DatevBuchungssatz> = {}): DatevBuchungssatz {
    return {
      umsatz: 100,
      sollHaben: 'S',
      konto: '10000',
      gegenkonto: ERLOES_SKR03,
      belegdatum: '1503',
      belegnummer: 'RE-0001',
      buchungstext: 'Rechnung RE-0001',
      ustSchluessel: 0,
      ...ueber,
    }
  }

  it('Beträge tragen Komma als Dezimaltrenner und immer zwei Nachkommastellen', () => {
    expect(formatDatevBetrag(435.5)).toBe('435,50')
    expect(formatDatevBetrag(0.05)).toBe('0,05')
    expect(formatDatevBetrag(1234.56)).toBe('1234,56')
  })

  it('eine Formel im Buchungstext wird entschärft (CSV-Injection)', () => {
    const zeile = generateDatevBuchungszeile(satz({ buchungstext: '=SUM(A1:A9)' }))
    expect(zeile).toContain(`"'=SUM(A1:A9)"`)
  })

  it('auch Belegnummer, KOST1 und KOST2 werden entschärft', () => {
    const zeile = generateDatevBuchungszeile(satz({
      belegnummer: '+RE-1', kost1: '-KST', kost2: '@KTR',
    }))
    expect(zeile).toContain(`"'+RE-1"`)
    expect(zeile).toContain(`"'-KST"`)
    expect(zeile).toContain(`"'@KTR"`)
  })

  it('Anführungszeichen werden verdoppelt und beenden das Feld nicht vorzeitig', () => {
    const zeile = generateDatevBuchungszeile(satz({ buchungstext: 'Rechnung "Sonderfall"' }))
    expect(zeile).toContain('"Rechnung ""Sonderfall"""')
    // Feldzahl bleibt stabil: 12 Spalten laut Beschriftungszeile.
    expect(zeile.split(';')).toHaveLength(12)
  })

  it('ein Semikolon im Text verschiebt die Spalten nicht', () => {
    const zeile = generateDatevBuchungszeile(satz({ buchungstext: 'Rechnung; Storno; Rest' }))
    // Das Semikolon steckt im Anführungszeichen-Feld — die reine
    // Zeichenzählung sieht es, die Spaltenzahl darf sich nicht ändern.
    expect(zeile).toContain('"Rechnung; Storno; Rest"')
  })

  it('Steuerschlüssel: 0 wird geschrieben, undefined bleibt leer', () => {
    const felderSteuerfrei = generateDatevBuchungszeile(satz({ ustSchluessel: 0 })).split(';')
    const felderOhne = generateDatevBuchungszeile(satz({ ustSchluessel: undefined })).split(';')
    expect(felderSteuerfrei[4]).toBe('0')
    expect(felderOhne[4]).toBe('')
    // Kein "0" verlieren: eine leere Spalte bedeutet in DATEV
    // "Automatikkonto entscheidet", eine 0 bedeutet ausdrücklich steuerfrei.
    expect(felderSteuerfrei[4]).not.toBe(felderOhne[4])
  })

  it('Generalumkehr steht nur bei Storno-Buchungen', () => {
    expect(generateDatevBuchungszeile(satz({ storno: true })).split(';')[8]).toBe('1')
    expect(generateDatevBuchungszeile(satz()).split(';')[8]).toBe('')
  })

  it('die Datei hat Header, Beschriftung und CRLF-Zeilenenden', () => {
    const csv = generateDatevCsv(kopf, [satz(), satz({ belegnummer: 'RE-0002' })])
    const zeilen = csv.split('\r\n').filter(Boolean)

    expect(zeilen).toHaveLength(4)          // Header + Beschriftung + 2 Sätze
    expect(zeilen[0]).toMatch(/^"EXTF";510;21;"Buchungsstapel"/)
    expect(zeilen[0]).toContain('"1234567"')
    expect(zeilen[0]).toContain('"54321"')
    expect(zeilen[0]).toContain('20260101')  // WJ-Beginn
    expect(zeilen[1]).toContain('"Umsatz (ohne Soll/Haben-Kz)"')
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.includes('\n\n')).toBe(false)
  })

  it('eine Formel in der Beraternummer wird ebenfalls entschärft', () => {
    const csv = generateDatevCsv({ ...kopf, beraternummer: '=CMD|calc' }, [])
    expect(csv).toContain(`"'=CMD|calc"`)
  })

  it('SKR03 und SKR04 liefern unterschiedliche, aber vollständige Konten', () => {
    for (const schluessel of ['erloesePflege', 'bank', 'forderungen', 'mahngebuehren'] as const) {
      const drei = getKonto('SKR03', schluessel)
      const vier = getKonto('SKR04', schluessel)
      expect(drei.konto).toMatch(/^\d{4}$/)
      expect(vier.konto).toMatch(/^\d{4}$/)
      expect(drei.konto).not.toBe(vier.konto)
    }
  })

  it('der gewählte Kontenrahmen schlägt bis in die Buchung durch', async () => {
    await rechnung({ id: 'd0000050-0000-4000-8000-00000000da7e', nummer: 'RE-KR', betrag: 10 })

    const skr03 = await generateBuchungssaetze(admin, params())
    const skr04 = await generateBuchungssaetze(admin, { ...params(), kontenrahmen: 'SKR04' })

    expect(skr03.buchungen[0].gegenkonto).toBe(getKonto('SKR03', 'erloesePflege').konto)
    expect(skr04.buchungen[0].gegenkonto).toBe(getKonto('SKR04', 'erloesePflege').konto)
  })
})
