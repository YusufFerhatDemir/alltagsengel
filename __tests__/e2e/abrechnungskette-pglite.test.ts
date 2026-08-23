/**
 * E2E: Buchung → Zahlung, vollstaendig auf echtem PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Faehrt die komplette Abrechnungskette in ZWOELF benannten Schritten auf
 * EINER PGlite-Instanz durch. Anders als __tests__/e2e/go-live-pilot-
 * hauptkette.test.ts (Fake-DB im Arbeitsspeicher) laufen hier
 * CHECK-Constraints, NOT-NULL, Fremdschluessel, UNIQUE-Indizes, die echte
 * SECURITY-DEFINER-RPC und die echten RLS-Policies mit — genau die
 * Fehlerklasse, die eine Fake-DB systematisch uebersieht.
 *
 *    1. Kunde anlegen
 *    2. Buchung erstellen
 *    3. Assignment (Engel → Buchung)
 *    4. Einsatz durchfuehren
 *    5. Leistungsnachweis mit Details
 *    6. Signatur
 *    7. Rechnung (createInvoiceDraft → geprueft → freezeInvoice)
 *    8. Zustellversuch (ohne RESEND_API_KEY ⇒ 'uebersprungen')
 *    9. invoice_email_log
 *   10. Zahlung (payment + payment_allocation)
 *   11. billing_audit_trail
 *   12. notification_delivery_log
 *
 * Dazu:
 *   • Mandantengrenze — eine zweite Organisation sieht nichts davon
 *   • Sammelrechnungslauf — mehrere Nachweise ⇒ EINE Rechnung
 *   • Fail-Closed-Gegenprobe — § 45b bleibt gesperrt
 *
 * JEDER Schritt hat sein eigenes `it`. Bricht die Kette, benennt der
 * Testname die Bruchstelle; die Folgeschritte melden „Schritt N ist nicht
 * gelaufen" statt mit Folgefehlern zu rauschen.
 *
 * PREISE: alle Betraege in dieser Datei sind Testwerte innerhalb der
 * In-Memory-Instanz. Sie beruehren keine produktive Preistabelle. Der
 * einzige gesetzliche Wert ist der Entlastungsbetrag, und der kommt aus
 * lib/config/budget-constants.ts — er wird hier nicht abgeschrieben.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  baueProtokollTabellen,
  aktiviereMandantengrenze,
} from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

// ─────────────────────────────────────────────────────────────────────
// Aussenschnittstellen
// ─────────────────────────────────────────────────────────────────────
//
// Gemockt wird NUR, was das Haus verlaesst oder ausserhalb der Datenbank
// liegt: die PDF-Erzeugung samt Storage-Upload. Der E-Mail-Weg selbst
// laeuft ECHT durch lib/notifications — ohne RESEND_API_KEY endet er im
// 'skipped'-Zweig, und genau dieser Zweig schreibt die Zustellspur.

const halter = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: async (_c: unknown, p: { invoiceId: string }) => ({
    invoiceId: p.invoiceId,
    invoiceNumber: 'RE-TEST',
    belegart: 'rechnung',
    pdfBytes: new Uint8Array([37, 80, 68, 70]), // "%PDF"
    checksum: 'a'.repeat(64),
    pageCount: 1,
    storagePath: null,
  }),
  RechnungsPaketError: class extends Error {},
}))

// Die Zustellspur holt sich ihren Client selbst (lib/notifications/
// delivery-log.ts → holeClient). Hier bekommt sie den PGlite-Client.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

import { createInvoiceDraft, freezeInvoice } from '@/lib/billing/core/invoice-engine'
import { createPayment, allocatePayment } from '@/lib/billing/core/payments'
import { fuehreSammelrechnungslaufAus } from '@/lib/billing/core/sammelrechnung'
import { versendeRechnungPerEmail } from '@/lib/billing/versand/rechnung-versand'
import { ENTLASTUNG_JAEHRLICH_EUR, ENTLASTUNG_MONATLICH_EUR } from '@/lib/config/budget-constants'
import { ZAHLUNGSZIEL_STANDARD_TAGE } from '@/lib/billing/core/zahlungsziel'

// ─────────────────────────────────────────────────────────────────────
// Feste IDs
// ─────────────────────────────────────────────────────────────────────
const ORG_A       = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B       = 'bbbbbbbb-0000-4000-8000-000000000001'
const ADMIN_A     = '11111111-0000-4000-8000-000000000001'
const ADMIN_B     = '22222222-0000-4000-8000-000000000001'
const KUNDE_NUTZER = '33333333-0000-4000-8000-000000000001'
const ENGEL_NUTZER = '44444444-0000-4000-8000-000000000001'

const KLIENT      = 'c1111111-0000-4000-8000-000000000001'
const KLIENT_B    = 'c2222222-0000-4000-8000-000000000001'
const KLIENT_SAMMEL = 'c3333333-0000-4000-8000-000000000001'
const ENGEL       = 'e1111111-0000-4000-8000-000000000001'
const BUCHUNG     = 'b1111111-0000-4000-8000-000000000001'
const EINSATZ     = 'a1111111-0000-4000-8000-000000000001'
const NACHWEIS    = '51111111-0000-4000-8000-000000000001'

const MONAT = '2026-07'
const EINSATZ_TAG = '2026-07-06'   // Montag — kein Wochenend-/Feiertagszuschlag
const JAHR = 2026

/**
 * Testtarif: 30,00 EUR je Stunde, Rechtsgrundlage 'privat'.
 *
 * Bewusst PRIVAT und nicht § 45b: Kassentarife sind produktiv nicht
 * verifiziert und bleiben fail-closed gesperrt (billing_tariffs.
 * tarif_status). Die Kette laeuft deshalb ueber den Weg, der real Umsatz
 * traegt — Privatkunde gegen Rechnung. Dass § 45b gesperrt BLEIBT, prueft
 * der Abschnitt „Fail-Closed-Gegenprobe" ausdruecklich.
 */
const TARIF_PREIS_CENT = 3000
const DAUER_MINUTEN = 120
const ERWARTETER_BETRAG_EUR = 60   // 30,00 EUR/h × 2 h

// ─────────────────────────────────────────────────────────────────────

let db: PGlite
let admin: ReturnType<typeof macheSupabaseClient>

/** Zustand, den die Schritte aneinander weiterreichen. */
const kette: {
  rechnungId?: string
  rechnungsNummer?: string
  betragCent?: number
  zahlungId?: string
  versandGrund?: string
} = {}

function alsSupabase(c: ReturnType<typeof macheSupabaseClient>): SupabaseClient {
  return c as unknown as SupabaseClient
}

/** Bricht mit klarer Meldung ab, wenn ein Vorschritt nicht gelaufen ist. */
function brauche<T>(wert: T | undefined, schritt: string): T {
  if (wert === undefined || wert === null) {
    throw new Error(`Vorbedingung fehlt: ${schritt} ist nicht gelaufen.`)
  }
  return wert
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`
  )
  return r.rows[0]?.n ?? 0
}

beforeAll(async () => {
  // Ohne Schluessel meldet sendRawEmail 'uebersprungen' — genau der Pfad,
  // den Schritt 8 prueft. Der Wert wird hier bewusst geleert, damit die
  // Umgebung des Entwicklerrechners das Ergebnis nicht veraendert.
  delete process.env.RESEND_API_KEY

  db = await baueKettenSchema()
  await baueProtokollTabellen(db)

  admin = macheSupabaseClient(db)
  halter.client = alsSupabase(admin)

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN_A}', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin-b@example.org'),
      ('${KUNDE_NUTZER}', 'kunde@example.org'),
      ('${ENGEL_NUTZER}', 'engel@example.org');

    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN_A}', 'admin', 'Admin', 'Alpha', 'admin-a@example.org'),
      ('${ADMIN_B}', 'admin', 'Admin', 'Beta',  'admin-b@example.org'),
      ('${KUNDE_NUTZER}', 'kunde', 'Erika', 'Testfall', 'kunde@example.org'),
      ('${ENGEL_NUTZER}', 'engel', 'Marek', 'Beispiel', 'engel@example.org');

    INSERT INTO public.angels (id, hourly_rate) VALUES ('${ENGEL_NUTZER}', 20);

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG_A}', 'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');
  `)

  // Preisliste des Mandanten. Nur der Privattarif ist verifiziert; der
  // § 45b-Tarif steht ausdruecklich auf 'blocked'.
  await db.exec(`
    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES
      ('${ORG_A}', 'betreuung_45a', 'privat', 'zeit_stunde',
       ${TARIF_PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture'),
      ('${ORG_A}', 'betreuung_45a', '§45b SGB XI', 'zeit_stunde',
       ${TARIF_PREIS_CENT}, 'stunde', '2020-01-01', 'blocked', 'Testfixture');
  `)
}, 120000)

afterAll(async () => {
  await db?.close()
})

// ═════════════════════════════════════════════════════════════════════
describe('Kette: Buchung → Zahlung', () => {

  // ── 1 ──────────────────────────────────────────────────────────────
  it('Schritt 1: Kunde wird angelegt', async () => {
    const { error } = await admin.from('clients').insert({
      id: KLIENT,
      organization_id: ORG_A,
      user_id: KUNDE_NUTZER,
      customer_number: 'K-0001',
      first_name: 'Erika',
      last_name: 'Testfall',
      geburtsdatum: '1942-03-11',
      address: 'Musterweg 1',
      zip_code: '60311',
      city: 'Frankfurt am Main',
      email: 'kunde@example.org',
      care_level: 2,
      pflegegrad: 2,
      pflegekasse_name: 'AOK Hessen',
      insurance_name: 'AOK Hessen',
      insurance_number: '123456789',
    })
    expect(error, `Klient nicht anlegbar: ${error?.message}`).toBeNull()

    // Der Entlastungsbetrag kommt aus der Konfiguration, nicht aus diesem
    // Test — er ist ein gesetzlicher Wert, kein Testwert.
    const { error: budgetFehler } = await admin.from('client_budgets').insert({
      client_id: KLIENT,
      organization_id: ORG_A,
      year: JAHR,
      annual_amount: ENTLASTUNG_JAEHRLICH_EUR,
      monthly_amount: ENTLASTUNG_MONATLICH_EUR,
    })
    expect(budgetFehler, `Budget nicht anlegbar: ${budgetFehler?.message}`).toBeNull()

    expect(await zaehle('clients', `id = '${KLIENT}'`)).toBe(1)
  })

  // ── 2 ──────────────────────────────────────────────────────────────
  it('Schritt 2: Buchung wird erstellt', async () => {
    const { error } = await admin.from('bookings').insert({
      id: BUCHUNG,
      organization_id: ORG_A,
      customer_id: KUNDE_NUTZER,
      angel_id: ENGEL_NUTZER,
      service: 'Betreuung',
      date: EINSATZ_TAG,
      time: '09:00:00',
      duration_hours: 2,
      status: 'pending',
      payment_method: 'privat',
    })
    expect(error, `Buchung nicht anlegbar: ${error?.message}`).toBeNull()

    const { data } = await admin.from('bookings').select('*').eq('id', BUCHUNG).single()
    expect(data?.status).toBe('pending')
  })

  // ── 3 ──────────────────────────────────────────────────────────────
  it('Schritt 3: Engel wird der Buchung zugewiesen (assignment)', async () => {
    const { error: engelFehler } = await admin.from('caregivers').insert({
      id: ENGEL,
      organization_id: ORG_A,
      user_id: ENGEL_NUTZER,
      first_name: 'Marek',
      last_name: 'Beispiel',
      initials: 'MB',
    })
    expect(engelFehler, `Betreuungskraft nicht anlegbar: ${engelFehler?.message}`).toBeNull()

    const { error } = await admin.from('assignments').insert({
      id: EINSATZ,
      organization_id: ORG_A,
      client_id: KLIENT,
      caregiver_id: ENGEL,
      assignment_date: EINSATZ_TAG,
      start_time: '09:00:00',
      end_time: '11:00:00',
      service_type: 'Betreuung',
      is_recurring: false,
      status: 'geplant',
    })
    expect(error, `Einsatz nicht anlegbar: ${error?.message}`).toBeNull()

    // Die Annahme der Buchung ist der Statuswechsel, an dem live der
    // Einsatz entsteht (siehe __tests__/e2e/buchung-einsatz-kette.test.ts).
    const { error: updFehler } = await admin
      .from('bookings').update({ status: 'accepted' }).eq('id', BUCHUNG)
    expect(updFehler).toBeNull()

    expect(await zaehle('assignments', `client_id = '${KLIENT}'`)).toBe(1)
  })

  // ── 4 ──────────────────────────────────────────────────────────────
  it('Schritt 4: Einsatz wird durchgefuehrt (service_record)', async () => {
    const { error } = await admin.from('service_records').insert({
      id: NACHWEIS,
      organization_id: ORG_A,
      client_id: KLIENT,
      caregiver_id: ENGEL,
      assignment_id: EINSATZ,
      date: EINSATZ_TAG,
      start_time: '09:00:00',
      end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN,
      service_type: 'Betreuung',
      budget_type: 'private',
      caregiver_initials: 'MB',
      status: 'draft',
      proof_status: 'ENTWURF',
    })
    expect(error, `Leistungsnachweis nicht anlegbar: ${error?.message}`).toBeNull()

    const { data } = await admin.from('service_records').select('*').eq('id', NACHWEIS).single()
    expect(data?.status).toBe('draft')
    expect(data?.proof_status).toBe('ENTWURF')
  })

  // ── 5 ──────────────────────────────────────────────────────────────
  it('Schritt 5: Leistungsnachweis wird vervollstaendigt', async () => {
    const { error } = await admin.from('service_records').update({
      notes: 'Begleitung zum Arzttermin, 2 Stunden.',
      amount: ERWARTETER_BETRAG_EUR,
      status: 'complete',
      updated_at: new Date().toISOString(),
    }).eq('id', NACHWEIS)
    expect(error, `Nachweis nicht vervollstaendigbar: ${error?.message}`).toBeNull()

    const { data } = await admin.from('service_records').select('*').eq('id', NACHWEIS).single()
    expect(data?.status).toBe('complete')
    expect(Number(data?.amount)).toBe(ERWARTETER_BETRAG_EUR)
  })

  // ── 6 ──────────────────────────────────────────────────────────────
  it('Schritt 6: Unterschrift wird erfasst', async () => {
    // organization_id AUSDRUECKLICH: der Spalten-Default ist
    // current_org_id(), und der faellt beim service-role-Client (kein JWT)
    // auf die Stamm-Organisation zurueck. Ohne explizite Angabe landete
    // die Unterschrift im falschen Mandanten — hier scheitert sie am
    // Fremdschluessel, live waere sie still verrutscht.
    const { error: sigFehler } = await admin.from('service_signatures').insert({
      organization_id: ORG_A,
      service_record_id: NACHWEIS,
      signer_role: 'client',
      signer_name: 'Erika Testfall',
      signature_image: 'data:image/png;base64,AAAA',
    })
    expect(sigFehler, `Signatur nicht speicherbar: ${sigFehler?.message}`).toBeNull()

    const unterschriebenAm = `${EINSATZ_TAG}T11:05:00.000Z`
    const { error } = await admin.from('service_records').update({
      proof_status: 'UNTERSCHRIEBEN',
      signature_hash: 'b'.repeat(64),
      client_signed_at: unterschriebenAm,
      client_signer_name: 'Erika Testfall',
      status: 'signed',
    }).eq('id', NACHWEIS)
    expect(error, `Unterschriftsstatus nicht setzbar: ${error?.message}`).toBeNull()

    const { data } = await admin.from('service_records').select('*').eq('id', NACHWEIS).single()
    expect(data?.status).toBe('signed')
    expect(data?.proof_status).toBe('UNTERSCHRIEBEN')
    expect(data?.client_signed_at).toBeTruthy()
  })

  // ── 7 ──────────────────────────────────────────────────────────────
  it('Schritt 7: Rechnung wird erzeugt und festgeschrieben', async () => {
    const entwurf = await createInvoiceDraft(alsSupabase(admin), {
      clientId: KLIENT,
      periodMonth: MONAT,
      budgetType: 'private',
      actorId: ADMIN_A,
    })

    expect(entwurf.alreadyExists).toBe(false)
    expect(entwurf.lineCount).toBe(1)
    expect(entwurf.priceSource).toBe('billing_tariffs')
    // 30,00 EUR/h × 2 h — aus dem Tarif gerechnet, nicht aus
    // service_records.amount uebernommen.
    expect(entwurf.totalAmountCents).toBe(ERWARTETER_BETRAG_EUR * 100)

    kette.rechnungId = entwurf.invoiceId
    kette.betragCent = entwurf.totalAmountCents

    // Der Nachweis ist danach fakturiert und faellt aus jeder weiteren
    // Rechnung heraus.
    const { data: nachweis } = await admin
      .from('service_records').select('*').eq('id', NACHWEIS).single()
    expect(nachweis?.status).toBe('invoiced')

    // Faelligkeit: 14 Tage Zahlungsziel (20260901020000).
    const { data: entwurfZeile } = await admin
      .from('invoices').select('*').eq('id', entwurf.invoiceId).single()
    expect(entwurfZeile?.due_date, 'due_date wurde nicht nachgezogen').toBeTruthy()
    expect(Number(entwurfZeile?.payment_terms_days)).toBe(ZAHLUNGSZIEL_STANDARD_TAGE)

    // Sachliche Pruefung — die Statusmaschine verlangt 'geprueft' vor
    // der Festschreibung.
    const { error: pruefFehler } = await admin
      .from('invoices').update({ status: 'geprueft' })
      .eq('id', entwurf.invoiceId).eq('status', 'entwurf')
    expect(pruefFehler).toBeNull()

    const fest = await freezeInvoice(alsSupabase(admin), entwurf.invoiceId, ADMIN_A, ORG_A)
    expect(fest.version).toBe(1)
    expect(fest.checksum).toMatch(/^[0-9a-f]{64}$/)
    kette.rechnungsNummer = fest.invoiceNumber

    const { data: fertig } = await admin
      .from('invoices').select('*').eq('id', entwurf.invoiceId).single()
    expect(fertig?.status).toBe('freigegeben')
    expect(fertig?.frozen_at).toBeTruthy()

    // Der Snapshot ist der Beleg — ohne ihn ist die Festschreibung leer.
    expect(await zaehle('invoice_snapshots', `invoice_id = '${entwurf.invoiceId}'`)).toBe(1)
    expect(await zaehle('invoice_line_snapshots')).toBe(1)
    // Festschreibung legt zugleich den Mahneintrag an.
    expect(await zaehle('dunning_entries', `invoice_id = '${entwurf.invoiceId}'`)).toBe(1)
  })

  // ── 8 ──────────────────────────────────────────────────────────────
  it('Schritt 8: Zustellversuch meldet ohne Schluessel "uebersprungen"', async () => {
    const rechnungId = brauche(kette.rechnungId, 'Schritt 7')

    const ergebnis = await versendeRechnungPerEmail(alsSupabase(admin), {
      invoiceId: rechnungId,
      organizationId: ORG_A,
      actorId: ADMIN_A,
    })

    expect(ergebnis.status).toBe('uebersprungen')
    expect(ergebnis.empfaenger).toBe('kunde@example.org')
    expect(ergebnis.grund).toContain('RESEND_API_KEY')
    expect(ergebnis.protokolliert).toBe(true)
    kette.versandGrund = ergebnis.grund

    // Entscheidend: sent_at bleibt LEER. Sonst gilt die Rechnung als
    // zugestellt und geht beim naechsten Lauf mit Schluessel nicht mehr mit.
    const { data } = await admin.from('invoices').select('*').eq('id', rechnungId).single()
    expect(data?.sent_at, 'sent_at darf beim Ueberspringen nicht gesetzt werden').toBeNull()
  })

  // ── 9 ──────────────────────────────────────────────────────────────
  it('Schritt 9: invoice_email_log traegt den Versuch', async () => {
    const rechnungId = brauche(kette.rechnungId, 'Schritt 7')

    const { data } = await admin
      .from('invoice_email_log').select('*').eq('invoice_id', rechnungId)
    expect(data).toHaveLength(1)

    const zeile = data![0]
    expect(zeile.status).toBe('uebersprungen')
    expect(zeile.organization_id).toBe(ORG_A)
    expect(zeile.empfaenger_email).toBe('kunde@example.org')
    expect(Number(zeile.versuch)).toBe(1)
    expect(String(zeile.grund)).toContain('RESEND_API_KEY')
    // Kein Schluessel im Klartext — der Grund nennt nur den Namen der
    // Variablen.
    expect(String(zeile.grund)).not.toMatch(/re_[A-Za-z0-9]{8,}/)
  })

  // ── 10 ─────────────────────────────────────────────────────────────
  it('Schritt 10: Zahlung wird verbucht (payment + allocation)', async () => {
    const rechnungId = brauche(kette.rechnungId, 'Schritt 7')
    const betragCent = brauche(kette.betragCent, 'Schritt 7')

    // autoMatch bewusst aus: die Zuordnung erfolgt gleich ausdruecklich.
    // Mit Auto-Matching wuerde allocatePayment ein zweites Mal auf
    // dieselbe Rechnung buchen.
    const zahlung = await createPayment(alsSupabase(admin), {
      organizationId: ORG_A,
      paymentDate: '2026-07-20',
      amountCents: betragCent,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      payerName: 'Erika Testfall',
      verwendungszweck: kette.rechnungsNummer ?? '',
      actorId: ADMIN_A,
      autoMatch: false,
    })
    expect(zahlung.matchingStatus).toBe('nicht_zugeordnet')
    kette.zahlungId = zahlung.paymentId

    await allocatePayment(alsSupabase(admin), {
      paymentId: zahlung.paymentId,
      allocations: [{ invoiceId: rechnungId, amountCents: betragCent }],
      actorId: ADMIN_A,
    })

    const { data: alloc } = await admin
      .from('payment_allocations').select('*').eq('invoice_id', rechnungId)
    expect(alloc).toHaveLength(1)
    expect(alloc![0].allocation_type).toBe('vollzahlung')
    expect(Number(alloc![0].amount_cents)).toBe(betragCent)

    const { data: rechnung } = await admin
      .from('invoices').select('*').eq('id', rechnungId).single()
    expect(rechnung?.status).toBe('bezahlt')
    expect(Math.round(Number(rechnung?.paid_amount) * 100)).toBe(betragCent)

    const { data: bezahlt } = await admin
      .from('payments').select('*').eq('id', zahlung.paymentId).single()
    expect(bezahlt?.matching_status).toBe('manuell_zugeordnet')
    expect(Number(bezahlt?.allocated_cents)).toBe(betragCent)
    // GENERATED-Spalte: Postgres rechnet sie, nicht die Anwendung.
    expect(Number(bezahlt?.unallocated_cents)).toBe(0)

    // Der Mahneintrag geht mit auf 'bezahlt'.
    const { data: mahnung } = await admin
      .from('dunning_entries').select('*').eq('invoice_id', rechnungId).single()
    expect(mahnung?.dunning_level).toBe('bezahlt')
  })

  // ── 11 ─────────────────────────────────────────────────────────────
  it('Schritt 11: Audit-Trail belegt jeden Schritt', async () => {
    const rechnungId = brauche(kette.rechnungId, 'Schritt 7')
    const zahlungId = brauche(kette.zahlungId, 'Schritt 10')

    const { data } = await admin
      .from('billing_audit_trail').select('*').eq('organization_id', ORG_A)
    const eintraege = data ?? []

    const schluessel = eintraege.map(e => `${e.entity_type}:${e.action}`)

    // Rechnungserstellung (aus der RPC selbst), Festschreibung,
    // Versandergebnis, Zahlung und Zuordnung.
    expect(schluessel).toContain('invoice:created')
    expect(schluessel).toContain('invoice:frozen')
    expect(schluessel).toContain('invoice:email_uebersprungen')
    expect(schluessel).toContain('payment:created')
    expect(schluessel).toContain('payment_allocation:allocated')

    // Jeder Eintrag traegt Mandant, Akteur und Checksumme — ohne die ist
    // er als Nachweis wertlos.
    for (const e of eintraege) {
      expect(e.organization_id, `Eintrag ${e.entity_type}:${e.action} ohne Mandant`).toBe(ORG_A)
      expect(e.actor_id, `Eintrag ${e.entity_type}:${e.action} ohne Akteur`).toBeTruthy()
      expect(String(e.checksum)).toMatch(/^[0-9a-f]{64}$/)
    }

    const erstellt = eintraege.find(e => e.entity_type === 'invoice' && e.action === 'created')
    expect((erstellt?.new_state as Record<string, unknown>)?.rpc_version).toBe('v9_audit_persistenz')
    expect(eintraege.some(e => e.entity_id === rechnungId)).toBe(true)
    expect(eintraege.some(e => e.entity_id === zahlungId)).toBe(true)
  })

  // ── 12 ─────────────────────────────────────────────────────────────
  it('Schritt 12: notification_delivery_log traegt die Zustellspur', async () => {
    const rechnungId = brauche(kette.rechnungId, 'Schritt 7')

    const { data } = await admin
      .from('notification_delivery_log').select('*').eq('correlation_id', rechnungId)
    expect(data, 'Keine Zustellspur zur Rechnung').toHaveLength(1)

    const zeile = data![0]
    expect(zeile.channel).toBe('email')
    expect(zeile.status).toBe('skipped')
    expect(zeile.provider).toBe('resend')
    expect(zeile.organization_id).toBe(ORG_A)
    expect(zeile.recipient).toBe('kunde@example.org')
    expect(Number(zeile.attempt_count)).toBe(1)
    // 'skipped' ist kein Erfolg: delivered_at bleibt leer, sonst wuerde
    // der Wiederholungslauf den Vorgang liegenlassen.
    expect(zeile.delivered_at).toBeNull()
    expect(String(zeile.sanitized_error ?? '')).not.toMatch(/re_[A-Za-z0-9]{8,}/)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Regression: erste Zahlung auf eine frische Rechnung', () => {
  /**
   * `invoices.paid_amount` ist nullable und ohne Spalten-Default; die
   * Rechnungs-RPC schreibt die Spalte nicht. Die OCC-Sperre in
   * allocatePayment verglich frueher mit `.eq('paid_amount', 0)` — das
   * trifft in Postgres keine NULL-Zeile, und JEDE erste Zahlung auf eine
   * neue Rechnung scheiterte mit „Konkurrierender Zugriff".
   *
   * Die Fake-DB konnte das nicht zeigen: sie legt Rechnungen mit
   * paid_amount = 0 an. Erst auf echtem Postgres faellt es auf.
   */
  it('paid_amount steht direkt nach der Erstellung auf NULL', async () => {
    const KLIENT_OCC = 'c6666666-0000-4000-8000-000000000001'
    await admin.from('clients').insert({
      id: KLIENT_OCC,
      organization_id: ORG_A,
      customer_number: 'K-0005',
      first_name: 'Nina',
      last_name: 'Nullfall',
      zip_code: '60311',
    })
    await admin.from('service_records').insert({
      organization_id: ORG_A,
      client_id: KLIENT_OCC,
      caregiver_id: ENGEL,
      date: '2026-07-10',
      start_time: '09:00:00',
      end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN,
      service_type: 'Betreuung',
      budget_type: 'private',
      caregiver_initials: 'MB',
      status: 'signed',
      proof_status: 'UNTERSCHRIEBEN',
      signature_hash: 'e'.repeat(64),
    })

    const entwurf = await createInvoiceDraft(alsSupabase(admin), {
      clientId: KLIENT_OCC,
      periodMonth: MONAT,
      budgetType: 'private',
      actorId: ADMIN_A,
    })

    const { data } = await admin
      .from('invoices').select('*').eq('id', entwurf.invoiceId).single()
    expect(data?.paid_amount, 'Annahme dieser Regression ist entfallen').toBeNull()

    const zahlung = await createPayment(alsSupabase(admin), {
      organizationId: ORG_A,
      paymentDate: '2026-07-25',
      amountCents: entwurf.totalAmountCents,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      actorId: ADMIN_A,
      autoMatch: false,
    })

    // Ohne den NULL-Zweig in der OCC-Sperre wirft das hier.
    await expect(allocatePayment(alsSupabase(admin), {
      paymentId: zahlung.paymentId,
      allocations: [{ invoiceId: entwurf.invoiceId, amountCents: entwurf.totalAmountCents }],
      actorId: ADMIN_A,
    })).resolves.toBeUndefined()

    const { data: bezahlt } = await admin
      .from('invoices').select('*').eq('id', entwurf.invoiceId).single()
    expect(bezahlt?.status).toBe('bezahlt')
    expect(Math.round(Number(bezahlt?.paid_amount) * 100)).toBe(entwurf.totalAmountCents)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Sammelrechnungslauf: mehrere Nachweise ⇒ eine Rechnung', () => {
  const TAGE = ['2026-07-07', '2026-07-14', '2026-07-21']

  beforeAll(async () => {
    await admin.from('clients').insert({
      id: KLIENT_SAMMEL,
      organization_id: ORG_A,
      customer_number: 'K-0002',
      first_name: 'Hans',
      last_name: 'Sammelfall',
      zip_code: '60311',
      email: 'sammel@example.org',
      care_level: 3,
    })

    for (const [i, tag] of TAGE.entries()) {
      await admin.from('service_records').insert({
        organization_id: ORG_A,
        client_id: KLIENT_SAMMEL,
        caregiver_id: ENGEL,
        date: tag,
        start_time: '09:00:00',
        end_time: '11:00:00',
        duration_minutes: DAUER_MINUTEN,
        service_type: 'Betreuung',
        budget_type: 'private',
        caregiver_initials: 'MB',
        amount: ERWARTETER_BETRAG_EUR,
        // Der letzte Nachweis bleibt 'complete': die RPC nimmt ihn mit,
        // aber mindestens einer muss 'signed' sein, sonst bildet
        // ermittleGruppen() gar keine Gruppe.
        status: i === TAGE.length - 1 ? 'complete' : 'signed',
        proof_status: 'UNTERSCHRIEBEN',
        signature_hash: 'c'.repeat(64),
      })
    }
  }, 60000)

  it('Probelauf meldet die Gruppe, ohne zu schreiben', async () => {
    const vorher = await zaehle('invoices')
    const lauf = await fuehreSammelrechnungslaufAus(alsSupabase(admin), {
      organizationId: ORG_A,
      periodMonth: MONAT,
      actorId: ADMIN_A,
      dryRun: true,
      clientIds: [KLIENT_SAMMEL],
    })

    expect(lauf.dryRun).toBe(true)
    expect(lauf.gruppen).toBe(1)
    expect(lauf.erstellt).toHaveLength(0)
    expect(lauf.vorschau[0].recordIds).toHaveLength(3)
    expect(lauf.vorschau[0].budgetType).toBe('private')
    expect(await zaehle('invoices')).toBe(vorher)
  })

  it('Echtlauf buendelt drei Nachweise in EINE festgeschriebene Rechnung', async () => {
    const lauf = await fuehreSammelrechnungslaufAus(alsSupabase(admin), {
      organizationId: ORG_A,
      periodMonth: MONAT,
      actorId: ADMIN_A,
      clientIds: [KLIENT_SAMMEL],
      festschreiben: true,
    })

    expect(lauf.uebersprungen, JSON.stringify(lauf.uebersprungen)).toHaveLength(0)
    expect(lauf.erstellt).toHaveLength(1)

    const erstellt = lauf.erstellt[0]
    expect(erstellt.lineCount).toBe(3)
    expect(erstellt.recordCount).toBe(3)
    expect(erstellt.alreadyExists).toBe(false)
    expect(erstellt.festgeschrieben).toBe(true)
    expect(erstellt.totalAmountCents).toBe(3 * ERWARTETER_BETRAG_EUR * 100)
    expect(lauf.summeCent).toBe(3 * ERWARTETER_BETRAG_EUR * 100)

    // EINE Rechnung mit DREI Positionen — nicht drei Rechnungen.
    expect(await zaehle('invoices', `client_id = '${KLIENT_SAMMEL}'`)).toBe(1)
    expect(await zaehle('invoice_items', `invoice_id = '${erstellt.invoiceId}'`)).toBe(3)

    const { data } = await admin
      .from('invoices').select('*').eq('id', erstellt.invoiceId).single()
    expect(data?.status).toBe('freigegeben')
    expect(data?.frozen_at).toBeTruthy()
  })

  it('zweiter Lauf erzeugt nichts Neues (Idempotenz der RPC)', async () => {
    const vorher = await zaehle('invoices')
    const lauf = await fuehreSammelrechnungslaufAus(alsSupabase(admin), {
      organizationId: ORG_A,
      periodMonth: MONAT,
      actorId: ADMIN_A,
      clientIds: [KLIENT_SAMMEL],
    })

    // Alle Nachweise stehen auf 'invoiced' — es gibt keine Gruppe mehr.
    expect(lauf.erstellt).toHaveLength(0)
    expect(await zaehle('invoices')).toBe(vorher)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Fail-Closed-Gegenprobe', () => {
  it('§ 45b bleibt gesperrt: ein blockierter Kassentarif erzeugt keine Rechnung', async () => {
    const KLIENT_45B = 'c4444444-0000-4000-8000-000000000001'
    await admin.from('clients').insert({
      id: KLIENT_45B,
      organization_id: ORG_A,
      customer_number: 'K-0003',
      first_name: 'Greta',
      last_name: 'Kassenfall',
      zip_code: '60311',
      care_level: 2,
    })
    await admin.from('client_budgets').insert({
      client_id: KLIENT_45B,
      organization_id: ORG_A,
      year: JAHR,
      annual_amount: ENTLASTUNG_JAEHRLICH_EUR,
      monthly_amount: ENTLASTUNG_MONATLICH_EUR,
    })
    await admin.from('service_records').insert({
      organization_id: ORG_A,
      client_id: KLIENT_45B,
      caregiver_id: ENGEL,
      date: '2026-07-08',
      start_time: '09:00:00',
      end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN,
      service_type: 'Betreuung',
      budget_type: 'entlastung',
      caregiver_initials: 'MB',
      amount: ERWARTETER_BETRAG_EUR,
      status: 'signed',
      proof_status: 'UNTERSCHRIEBEN',
      signature_hash: 'd'.repeat(64),
    })

    await expect(createInvoiceDraft(alsSupabase(admin), {
      clientId: KLIENT_45B,
      periodMonth: MONAT,
      budgetType: 'entlastung',
      actorId: ADMIN_A,
    })).rejects.toThrow(/MISSING_VALID_TARIFF/)

    // Nichts halb Angelegtes: die RPC rollt die Rechnung zurueck.
    expect(await zaehle('invoices', `client_id = '${KLIENT_45B}'`)).toBe(0)
    // Der Nachweis bleibt abrechenbar, sobald der Tarif verifiziert ist.
    expect(await zaehle('service_records',
      `client_id = '${KLIENT_45B}' AND status = 'signed'`)).toBe(1)
  })

  it('ein unsignierter Nachweis blockiert den Lauf und hinterlaesst einen Audit-Eintrag', async () => {
    const KLIENT_OHNE = 'c5555555-0000-4000-8000-000000000001'
    await admin.from('clients').insert({
      id: KLIENT_OHNE,
      organization_id: ORG_A,
      customer_number: 'K-0004',
      first_name: 'Otto',
      last_name: 'Ohnehand',
      zip_code: '60311',
    })
    await admin.from('service_records').insert({
      organization_id: ORG_A,
      client_id: KLIENT_OHNE,
      caregiver_id: ENGEL,
      date: '2026-07-09',
      start_time: '09:00:00',
      end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN,
      service_type: 'Betreuung',
      budget_type: 'private',
      caregiver_initials: 'MB',
      status: 'signed',
      proof_status: 'ENTWURF',
      signature_hash: null,
    })

    await expect(createInvoiceDraft(alsSupabase(admin), {
      clientId: KLIENT_OHNE,
      periodMonth: MONAT,
      budgetType: 'private',
      actorId: ADMIN_A,
    })).rejects.toThrow(/MISSING_SIGNATURE/)

    expect(await zaehle('invoices', `client_id = '${KLIENT_OHNE}'`)).toBe(0)
    // v9 persistiert den abgewiesenen Versuch — bei v8 rollte ihn der
    // RAISE mit zurueck und der forensische Nachweis entstand nie.
    expect(await zaehle('billing_audit_trail',
      `entity_type = 'invoice_draft' AND entity_id = '${KLIENT_OHNE}'`)).toBe(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mandantengrenze: der zweite Mandant sieht nichts', () => {
  let alsAdminA: ReturnType<typeof macheSupabaseClient>
  let alsAdminB: ReturnType<typeof macheSupabaseClient>

  beforeAll(async () => {
    // Bis hierhin lief alles ueber den service-role-Weg (BYPASSRLS) —
    // so arbeitet die Anwendung serverseitig. Erst jetzt wird RLS
    // scharfgeschaltet und mit echten Nutzer-JWTs geprueft.
    await aktiviereMandantengrenze(db)

    await db.exec(`
      INSERT INTO public.organization_members (organization_id, user_id, role) VALUES
        ('${ORG_A}', '${ADMIN_A}', 'owner'),
        ('${ORG_B}', '${ADMIN_B}', 'owner')
      ON CONFLICT DO NOTHING;
    `)

    // Der zweite Mandant hat eigene Daten — sonst waere „sieht nichts"
    // nicht von „hat nichts" unterscheidbar.
    await db.exec(`
      INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code)
        VALUES ('${KLIENT_B}', '${ORG_B}', 'B-0001', 'Bea', 'Betamann', '80331');
    `)

    alsAdminA = macheSupabaseClient(db, { alsNutzer: ADMIN_A })
    alsAdminB = macheSupabaseClient(db, { alsNutzer: ADMIN_B })
  }, 60000)

  it('current_org_id() loest je Nutzer die eigene Organisation auf', async () => {
    const a = await db.transaction(async tx => {
      await tx.exec(`SET LOCAL ROLE authenticated;`
        + `SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: ADMIN_A, role: 'authenticated' })}';`)
      return tx.query<{ org: string }>('SELECT public.current_org_id() AS org')
    })
    expect(a!.rows[0].org).toBe(ORG_A)
  })

  it('Admin des zweiten Mandanten sieht weder Klienten noch Rechnungen von Mandant A', async () => {
    const { data: klienten } = await alsAdminB.from('clients').select('*')
    expect(klienten!.map(k => k.organization_id)).toEqual([ORG_B])
    expect(klienten!.some(k => k.id === KLIENT)).toBe(false)

    const { data: rechnungen } = await alsAdminB.from('invoices').select('*')
    expect(rechnungen, 'Rechnungen von Mandant A sind fuer Mandant B sichtbar').toHaveLength(0)

    const { data: nachweise } = await alsAdminB.from('service_records').select('*')
    expect(nachweise).toHaveLength(0)
  })

  it('Admin des eigenen Mandanten sieht seine Kette weiterhin', async () => {
    const { data: klienten } = await alsAdminA.from('clients').select('*')
    expect(klienten!.some(k => k.id === KLIENT)).toBe(true)
    expect(klienten!.some(k => k.id === KLIENT_B)).toBe(false)

    const { data: rechnungen } = await alsAdminA.from('invoices').select('*')
    expect(rechnungen!.length).toBeGreaterThan(0)
    expect(rechnungen!.every(r => r.organization_id === ORG_A)).toBe(true)
  })

  it('Zustellspur und E-Mail-Protokoll sind ebenfalls mandantengetrennt', async () => {
    const { data: spurB } = await alsAdminB.from('notification_delivery_log').select('*')
    expect(spurB).toHaveLength(0)
    const { data: logB } = await alsAdminB.from('invoice_email_log').select('*')
    expect(logB).toHaveLength(0)

    const { data: spurA } = await alsAdminA.from('notification_delivery_log').select('*')
    expect(spurA!.length).toBeGreaterThan(0)
  })

  it('Mandant B kann keine Zeile in Mandant A schreiben (WITH CHECK)', async () => {
    const { error } = await alsAdminB.from('clients').insert({
      organization_id: ORG_A,
      customer_number: 'B-SCHMUGGEL',
      first_name: 'Ein',
      last_name: 'Schmuggler',
    })
    expect(error, 'Fremder Mandant konnte einen Klienten in Mandant A anlegen').not.toBeNull()
    expect(error!.code).toBe('42501')   // insufficient_privilege / RLS
  })
})
