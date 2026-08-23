// ═══════════════════════════════════════════════════════════════════════
// Phase 4 / P1 — Sammelrechnungslauf von Ende zu Ende
// ═══════════════════════════════════════════════════════════════════════
//
// Die vorhandenen Suiten pruefen die Teile: sammelrechnungslauf.test.ts
// die fachliche Entscheidung gegen eine Attrappe,
// sammelrechnungslauf-batch-pglite.test.ts die SQL-Mechanik ohne
// Rechnungen, sammelrechnungslauf-betrieb.test.ts die Betriebsschicht
// gegen eine Attrappe. Was fehlte, ist der Durchstich: echte Nachweise,
// echte RPC, echte Sperre, echter Versandweg — auf EINER Instanz.
//
// GEPRUEFT WERDEN DIE SIEBEN BETRIEBSSZENARIEN
//   1. Normale Kette   Nachweise → Entwurf → Batch → Festschreibung → Versand
//   2. Doppelte Rechnungsstellung
//   3. Fehlender Leistungsnachweis
//   4. Providerfehler waehrend des Versands
//   5. Sperre bei zwei gleichzeitigen Laeufen
//   6. Herzschlag und verwaiste Sperre
//   7. Probelauf ohne Seiteneffekte
//
// WAS GEMOCKT IST
// Nur was das Haus verlaesst: die PDF-Erzeugung samt Storage-Upload und
// der Resend-Client. Die Antwort des Resend-Clients ist umschaltbar —
// darauf beruht Szenario 4.
//
// WAS NICHT GEPRUEFT WERDEN KANN
// PGlite hat genau eine Verbindung und serialisiert alles. Zwei ECHT
// gleichzeitige Transaktionen sind nicht herstellbar; Szenario 5 zeigt
// deshalb die tragende Stufe darunter — den partiellen UNIQUE-Index auf
// (Mandant, Monat) WHERE status='laeuft'.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueProtokollTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'

// ── Aussenschnittstellen ─────────────────────────────────────────────

type ResendAntwort = { data: { id: string } | null; error: { message: string; statusCode?: number } | null }

const H = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
  resend: (() => ({ data: { id: 'msg-1' }, error: null })) as () => ResendAntwort,
  gesendet: 0,
}))

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: async (_c: unknown, p: { invoiceId: string }) => ({
    invoiceId: p.invoiceId,
    invoiceNumber: 'RE-TEST',
    belegart: 'rechnung',
    pdfBytes: new Uint8Array([37, 80, 68, 70]),
    checksum: 'a'.repeat(64),
    pageCount: 1,
    storagePath: null,
  }),
  RechnungsPaketError: class extends Error {},
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async () => {
        H.gesendet++
        return H.resend()
      },
    }
  },
}))

vi.mock('web-push', () => ({
  default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) },
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => H.client }))

import { fuehreSammelrechnungslaufAus } from '@/lib/billing/core/sammelrechnung'
import {
  starteSammelrechnungslauf,
  SammelrechnungLaeuftBereitsError,
} from '@/lib/billing/core/sammelrechnung-lauf'
import { fuehreWiederholungslaufAus } from '@/lib/notifications/retry-worker'
import { _setzeSchemaMerkerZurueck } from '@/lib/notifications/delivery-log'

// ── Feste IDs ────────────────────────────────────────────────────────
const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const ADMIN = '11111111-0000-4000-8000-000000000001'
const ENGEL_NUTZER = '44444444-0000-4000-8000-000000000001'
const ENGEL = 'e1111111-0000-4000-8000-000000000001'

const MONAT = '2026-07'
const TARIF_PREIS_CENT = 3000
const DAUER_MINUTEN = 120
const BETRAG_EUR = 60 // 30,00 EUR/h × 2 h

const MIGRATIONEN = [
  '20260925000000_sammelrechnungslauf_haertung.sql',
  '20260927000000_zustellung_retry_worker.sql',
].map(n => path.join(__dirname, '..', '..', 'supabase', 'migrations', n))

let db: PGlite
let admin: ReturnType<typeof macheSupabaseClient>

function alsSupabase(): SupabaseClient {
  return admin as unknown as SupabaseClient
}

let klientZaehler = 0

/** Legt einen Klienten mit `tage` unterschriebenen Nachweisen an. */
async function klientMitNachweisen(ueber: {
  tage?: string[]
  unterschrieben?: boolean
  budgetType?: string
} = {}): Promise<string> {
  klientZaehler++
  const id = `c0000000-0000-4000-8000-${String(klientZaehler).padStart(12, '0')}`
  await admin.from('clients').insert({
    id,
    organization_id: ORG,
    customer_number: `K-${String(klientZaehler).padStart(4, '0')}`,
    first_name: 'Test',
    last_name: `Fall${klientZaehler}`,
    zip_code: '60311',
    email: `fall${klientZaehler}@example.org`,
    care_level: 3,
  })

  const tage = ueber.tage ?? ['2026-07-07', '2026-07-14']
  const unterschrieben = ueber.unterschrieben !== false
  for (const tag of tage) {
    await admin.from('service_records').insert({
      organization_id: ORG,
      client_id: id,
      caregiver_id: ENGEL,
      date: tag,
      start_time: '09:00:00',
      end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN,
      service_type: 'Betreuung',
      budget_type: ueber.budgetType ?? 'private',
      caregiver_initials: 'MB',
      amount: BETRAG_EUR,
      status: unterschrieben ? 'signed' : 'complete',
      proof_status: unterschrieben ? 'UNTERSCHRIEBEN' : 'OFFEN',
      signature_hash: unterschrieben ? 'c'.repeat(64) : null,
    })
  }
  return id
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`,
  )
  return r.rows[0]?.n ?? 0
}

async function rechnung(clientId: string) {
  const r = await db.query<{
    id: string; status: string; frozen_at: string | null; sent_at: string | null; total_amount: string
  }>(
    `SELECT id, status, frozen_at, sent_at, total_amount FROM public.invoices WHERE client_id = $1`,
    [clientId] as never[],
  )
  return r.rows
}

async function laeufe() {
  const r = await db.query<{
    id: string; status: string; versuch: number; gruppen_gesamt: number
    gruppen_erstellt: number; gruppen_offen: number; summe_cent: string
  }>(`SELECT id, status, versuch, gruppen_gesamt, gruppen_erstellt, gruppen_offen, summe_cent
        FROM public.sammelrechnungslaeufe ORDER BY gestartet_am`)
  return r.rows
}

function lauf(ueber: Record<string, unknown> = {}) {
  return starteSammelrechnungslauf(alsSupabase(), {
    organizationId: ORG,
    periodMonth: MONAT,
    actorId: ADMIN,
    ...ueber,
  })
}

beforeAll(async () => {
  process.env.RESEND_API_KEY = 'test-schluessel-ohne-netzverkehr'

  db = await baueKettenSchema()
  await baueProtokollTabellen(db)

  // Fachrollen-Attrappe: die Batch-Migration legt Policies mit darf() an.
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.darf(p_berechtigung text) RETURNS boolean
      LANGUAGE sql STABLE AS $$ SELECT true $$;
  `)
  for (const datei of MIGRATIONEN) {
    await db.exec(fs.readFileSync(datei, 'utf-8'))
  }

  admin = macheSupabaseClient(db)
  H.client = alsSupabase()

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.org'),
      ('${ENGEL_NUTZER}', 'engel@example.org');

    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org'),
      ('${ENGEL_NUTZER}', 'engel', 'Marek', 'Beispiel', 'engel@example.org');

    INSERT INTO public.angels (id, hourly_rate) VALUES ('${ENGEL_NUTZER}', 20);

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG}', 'Mandant Alpha', 'hessen', 'active');

    INSERT INTO public.caregivers (id, organization_id, user_id, first_name, last_name, initials)
      VALUES ('${ENGEL}', '${ORG}', '${ENGEL_NUTZER}', 'Marek', 'Beispiel', 'MB');

    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES
      ('${ORG}', 'betreuung_45a', 'privat', 'zeit_stunde',
       ${TARIF_PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture');
  `)
}, 180000)

afterAll(async () => {
  await db?.close()
})

beforeEach(() => {
  _setzeSchemaMerkerZurueck()
  H.gesendet = 0
  H.resend = () => ({ data: { id: 'msg-1' }, error: null })
})

// ═══════════════════════════════════════════════════════════════════════
// 1) Normale Kette
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 1: Nachweise → Entwurf → Batch → Festschreibung → Versand', () => {
  it('faehrt die Kette in einem Lauf durch', async () => {
    const klient = await klientMitNachweisen({ tage: ['2026-07-07', '2026-07-14', '2026-07-21'] })

    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })

    // ── Batch ──
    expect(e.batchId).toBeTruthy()
    expect(e.wiederaufnahme).toBe(false)
    expect(e.kopf.status).toBe('abgeschlossen')
    expect(e.kopf.gruppenGesamt).toBe(1)
    expect(e.kopf.gruppenErstellt).toBe(1)
    expect(e.kopf.gruppenOffen).toBe(0)

    // ── Rechnung ──
    expect(e.uebersprungen, JSON.stringify(e.uebersprungen)).toHaveLength(0)
    expect(e.erstellt).toHaveLength(1)
    const treffer = e.erstellt[0]
    expect(treffer.lineCount).toBe(3)
    expect(treffer.totalAmountCents).toBe(3 * BETRAG_EUR * 100)
    expect(treffer.festgeschrieben).toBe(true)
    expect(e.summeCent).toBe(3 * BETRAG_EUR * 100)
    expect(e.kopf.summeCent).toBe(3 * BETRAG_EUR * 100)

    // ── Festschreibung und Versand ──
    expect(treffer.versandStatus).toBe('versendet')
    const [inv] = await rechnung(klient)
    expect(inv.status).toBe('freigegeben')
    expect(inv.frozen_at).toBeTruthy()
    expect(inv.sent_at).toBeTruthy()
    expect(H.gesendet).toBe(1)

    // ── Spuren ──
    expect(await zaehle('invoice_snapshots', `invoice_id = '${treffer.invoiceId}'`)).toBe(1)
    expect(await zaehle('sammelrechnungslauf_gruppen', `lauf_id = '${e.batchId}'`)).toBe(1)
    expect(
      await zaehle('notification_delivery_log', `correlation_id = '${treffer.invoiceId}' AND status = 'sent'`),
    ).toBe(1)
  })

  it('haengt die Batch-ID an jeden Audit-Eintrag des Laufs', async () => {
    const klient = await klientMitNachweisen()
    const e = await lauf({ clientIds: [klient], festschreiben: true })

    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.billing_audit_trail
        WHERE batch_id = $1 AND entity_type = 'sammelrechnungslauf'`,
      [e.batchId] as never[],
    )
    expect(r.rows[0].n).toBeGreaterThanOrEqual(2) // gestartet + abgeschlossen
  })

  it('lehnt autoVersand ohne Festschreibung ab, statt still nichts zu senden', async () => {
    const klient = await klientMitNachweisen()
    await expect(lauf({ clientIds: [klient], autoVersand: true })).rejects.toThrow(/autoVersand/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2) Doppelte Rechnungsstellung
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 2: derselbe Nachweis darf nicht zweimal abgerechnet werden', () => {
  it('erzeugt beim zweiten Lauf keine zweite Rechnung und keinen zweiten Umsatz', async () => {
    const klient = await klientMitNachweisen()

    const erster = await lauf({ clientIds: [klient], festschreiben: true })
    expect(erster.erstellt).toHaveLength(1)
    const rechnungen = await zaehle('invoices', `client_id = '${klient}'`)

    const zweiter = await lauf({ clientIds: [klient], festschreiben: true })

    expect(zweiter.erstellt).toHaveLength(0)
    expect(zweiter.summeCent).toBe(0)
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(rechnungen)
  })

  it('haengt jede Position an genau eine Rechnung', async () => {
    const klient = await klientMitNachweisen({ tage: ['2026-07-02', '2026-07-09'] })
    await lauf({ clientIds: [klient], festschreiben: true })
    await lauf({ clientIds: [klient], festschreiben: true })

    const r = await db.query<{ service_record_id: string; n: number }>(
      `SELECT ii.service_record_id, count(*)::int AS n
         FROM public.invoice_items ii
         JOIN public.invoices i ON i.id = ii.invoice_id
        WHERE i.client_id = $1
        GROUP BY ii.service_record_id`,
      [klient] as never[],
    )
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.rows.every(z => z.n === 1)).toBe(true)
  })

  it('merkt erledigte Gruppen im Lauf vor — Grundlage der Wiederaufnahme', async () => {
    const klient = await klientMitNachweisen()
    const e = await lauf({ clientIds: [klient], festschreiben: true })

    const r = await db.query<{ status: string; client_id: string; betrag_cent: number }>(
      `SELECT status, client_id, betrag_cent FROM public.sammelrechnungslauf_gruppen WHERE lauf_id = $1`,
      [e.batchId] as never[],
    )
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].status).toBe('erstellt')
    expect(r.rows[0].client_id).toBe(klient)
  })

  it('nimmt eine bereits erledigte Gruppe bei der Wiederaufnahme nicht erneut', async () => {
    const klient = await klientMitNachweisen()
    const e = await lauf({ clientIds: [klient], festschreiben: true })

    // Der Lauf wird kuenstlich auf 'abgebrochen' zurueckgesetzt, seine
    // Gruppenzeile bleibt stehen — genau der Zustand nach einem Absturz
    // zwischen letzter Gruppe und Abschluss.
    await db.query(
      `UPDATE public.sammelrechnungslaeufe SET status = 'abgebrochen', beendet_am = NULL WHERE id = $1`,
      [e.batchId] as never[],
    )

    const zweiter = await lauf({ clientIds: [klient], festschreiben: true })

    expect(zweiter.batchId).toBe(e.batchId)
    expect(zweiter.wiederaufnahme).toBe(true)
    expect(zweiter.erstellt).toHaveLength(0)
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3) Fehlender Leistungsnachweis
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 3: keine Rechnung ohne Leistungsnachweis', () => {
  it('bildet fuer einen Klienten ohne Nachweise gar keine Gruppe', async () => {
    klientZaehler++
    const id = `c0000000-0000-4000-8000-${String(klientZaehler).padStart(12, '0')}`
    await admin.from('clients').insert({
      id, organization_id: ORG, customer_number: `K-${klientZaehler}`,
      first_name: 'Ohne', last_name: 'Nachweis', zip_code: '60311',
      email: 'ohne@example.org', care_level: 2,
    })

    const e = await lauf({ clientIds: [id], festschreiben: true })

    expect(e.gruppen).toBe(0)
    expect(e.erstellt).toHaveLength(0)
    expect(await zaehle('invoices', `client_id = '${id}'`)).toBe(0)
  })

  it('rechnet einen unsignierten Nachweis nicht ab', async () => {
    const klient = await klientMitNachweisen({ unterschrieben: false })

    const e = await lauf({ clientIds: [klient], festschreiben: true })

    // Ohne einen einzigen 'signed'-Nachweis entsteht keine Gruppe; steht
    // einer daneben, greift UNTERSCHRIFT_FEHLT. Beides endet ohne Rechnung.
    expect(e.erstellt).toHaveLength(0)
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(0)
  })

  it('sperrt die GANZE Gruppe, wenn ein Nachweis darin keine Unterschrift traegt', async () => {
    const klient = await klientMitNachweisen({ tage: ['2026-07-03'] })
    // Zweiter Nachweis desselben Monats — vollstaendig, aber unsigniert.
    await admin.from('service_records').insert({
      organization_id: ORG, client_id: klient, caregiver_id: ENGEL,
      date: '2026-07-10', start_time: '09:00:00', end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN, service_type: 'Betreuung', budget_type: 'private',
      caregiver_initials: 'MB', amount: BETRAG_EUR, status: 'complete',
      proof_status: 'OFFEN', signature_hash: null,
    })

    const e = await lauf({ clientIds: [klient], festschreiben: true })

    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen).toHaveLength(1)
    expect(e.uebersprungen[0].code).toBe('UNTERSCHRIFT_FEHLT')
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(0)

    // Der forensisch interessante Fall wird protokolliert.
    const audit = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.billing_audit_trail
        WHERE entity_type = 'invoice_draft' AND entity_id = $1
          AND action = 'sammelrechnung_uebersprungen'`,
      [klient] as never[],
    )
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4) Providerfehler waehrend des Versands
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 4: der Provider faellt waehrend des Versands aus', () => {
  it('laesst die Rechnung festgeschrieben, aber NICHT versendet', async () => {
    const klient = await klientMitNachweisen()
    H.resend = () => ({ data: null, error: { message: 'Service Unavailable', statusCode: 503 } })

    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })

    expect(e.erstellt).toHaveLength(1)
    expect(e.erstellt[0].festgeschrieben).toBe(true)
    expect(e.erstellt[0].versandStatus).toBe('fehlgeschlagen')

    const [inv] = await rechnung(klient)
    // Festgeschrieben bleibt festgeschrieben: der Beleg ist erzeugt, nur
    // die Zustellung fehlt. 'entwurf' waere hier die gefaehrlichere
    // Unwahrheit — die Rechnungsnummer ist bereits vergeben.
    expect(inv.status).toBe('freigegeben')
    expect(inv.frozen_at).toBeTruthy()
    expect(inv.sent_at).toBeNull()
  })

  it('kippt den Lauf nicht — der Kopfsatz meldet die Gruppe als erstellt', async () => {
    const klient = await klientMitNachweisen()
    H.resend = () => ({ data: null, error: { message: 'Service Unavailable', statusCode: 503 } })

    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })

    expect(e.kopf.status).toBe('abgeschlossen')
    expect(e.kopf.gruppenErstellt).toBe(1)
    expect(e.kopf.gruppenFehlgeschlagen).toBe(0)
  })

  it('hinterlaesst einen wiederholbaren Vorgang in der Zustellspur', async () => {
    const klient = await klientMitNachweisen()
    H.resend = () => ({ data: null, error: { message: 'Service Unavailable', statusCode: 503 } })
    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })
    const invoiceId = e.erstellt[0].invoiceId

    const spur = await db.query<{ status: string; vorgang_art: string | null; vorgang_ref: string | null }>(
      `SELECT status, vorgang_art, vorgang_ref FROM public.notification_delivery_log
        WHERE correlation_id = $1`,
      [invoiceId] as never[],
    )
    expect(spur.rows).toHaveLength(1)
    expect(spur.rows[0].status).toBe('failed')
    // Ohne Vorgangsbezug koennte der Wiederholungslauf diese Mail nie
    // erneut ausloesen — das Protokoll traegt keinen Inhalt.
    expect(spur.rows[0].vorgang_art).toBe('rechnung-versand')
    expect(spur.rows[0].vorgang_ref).toBe(invoiceId)
  })

  it('holt der Wiederholungslauf die Mail nach, sobald der Provider wieder da ist', async () => {
    const klient = await klientMitNachweisen()
    H.resend = () => ({ data: null, error: { message: 'Service Unavailable', statusCode: 503 } })
    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })
    const invoiceId = e.erstellt[0].invoiceId
    expect((await rechnung(klient))[0].sent_at).toBeNull()

    // Wartezeit nach dem ersten Fehlversuch verstreichen lassen.
    await db.query(
      `UPDATE public.notification_delivery_log
          SET created_at = created_at - interval '30 minutes',
              attempted_at = attempted_at - interval '30 minutes',
              failed_at = failed_at - interval '30 minutes'
        WHERE correlation_id = $1`,
      [invoiceId] as never[],
    )

    H.resend = () => ({ data: { id: 'msg-nachgeholt' }, error: null })
    H.gesendet = 0
    const wieder = await fuehreWiederholungslaufAus({
      admin: alsSupabase(), organisationen: [ORG], zeitbudgetMs: 60_000,
    })

    expect(wieder.status).toBe('fertig')
    expect(wieder.metriken.erfolgreich).toBe(1)
    expect(H.gesendet).toBe(1)
    expect((await rechnung(klient))[0].sent_at).toBeTruthy()
  })

  it('versendet dieselbe Rechnung nicht zweimal', async () => {
    const klient = await klientMitNachweisen()
    const e = await lauf({ clientIds: [klient], festschreiben: true, autoVersand: true })
    expect(H.gesendet).toBe(1)
    const invoiceId = e.erstellt[0].invoiceId

    await db.query(
      `UPDATE public.notification_delivery_log
          SET created_at = created_at - interval '6 hours',
              attempted_at = attempted_at - interval '6 hours'
        WHERE correlation_id = $1`,
      [invoiceId] as never[],
    )
    H.gesendet = 0

    const wieder = await fuehreWiederholungslaufAus({
      admin: alsSupabase(), organisationen: [ORG], zeitbudgetMs: 60_000,
    })

    expect(H.gesendet).toBe(0)
    expect(wieder.metriken.verarbeitet).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5) Sperre
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 5: zwei Laeufe fuer denselben Monat', () => {
  it('weist den zweiten Start ab, solange der erste laeuft', async () => {
    const klient = await klientMitNachweisen()
    // Sperre von Hand halten — so, wie sie ein laufender Job haelt.
    await db.query(
      `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month, actor_id, status)
       VALUES ($1, $2, $3, 'laeuft')`,
      [ORG, MONAT, ADMIN] as never[],
    )

    await expect(lauf({ clientIds: [klient], festschreiben: true }))
      .rejects.toBeInstanceOf(SammelrechnungLaeuftBereitsError)

    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(0)
    expect(await zaehle('sammelrechnungslaeufe', `status = 'laeuft'`)).toBe(1)

    await db.query(`DELETE FROM public.sammelrechnungslaeufe WHERE status = 'laeuft'`)
  })

  it('laesst der UNIQUE-Index keine zweite laufende Zeile zu', async () => {
    await db.query(
      `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month, actor_id, status)
       VALUES ($1, $2, $3, 'laeuft')`,
      [ORG, MONAT, ADMIN] as never[],
    )
    await expect(
      db.query(
        `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month, actor_id, status)
         VALUES ($1, $2, $3, 'laeuft')`,
        [ORG, MONAT, ADMIN] as never[],
      ),
    ).rejects.toThrow()
    await db.query(`DELETE FROM public.sammelrechnungslaeufe WHERE status = 'laeuft'`)
  })

  it('startet zwei Laeufe gleichzeitig — genau einer rechnet ab', async () => {
    const klient = await klientMitNachweisen()

    const ergebnisse = await Promise.allSettled([
      lauf({ clientIds: [klient], festschreiben: true }),
      lauf({ clientIds: [klient], festschreiben: true }),
    ])

    const erfuellt = ergebnisse.filter(r => r.status === 'fulfilled')
    const abgelehnt = ergebnisse.filter(r => r.status === 'rejected')
    expect(erfuellt).toHaveLength(1)
    expect(abgelehnt).toHaveLength(1)
    expect((abgelehnt[0] as PromiseRejectedResult).reason)
      .toBeInstanceOf(SammelrechnungLaeuftBereitsError)
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(1)
  })

  it('gibt einen anderen Monat frei', async () => {
    await db.query(
      `INSERT INTO public.sammelrechnungslaeufe (organization_id, period_month, actor_id, status)
       VALUES ($1, '2026-06', $2, 'laeuft')`,
      [ORG, ADMIN] as never[],
    )
    const klient = await klientMitNachweisen()

    const e = await lauf({ clientIds: [klient], festschreiben: true })
    expect(e.kopf.status).toBe('abgeschlossen')

    await db.query(`DELETE FROM public.sammelrechnungslaeufe WHERE period_month = '2026-06'`)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6) Herzschlag und verwaiste Sperre
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 6: verwaiste Sperre', () => {
  it('bleibt bestehen, solange der Herzschlag frisch ist', async () => {
    const klient = await klientMitNachweisen()
    await db.query(
      `INSERT INTO public.sammelrechnungslaeufe
         (organization_id, period_month, actor_id, status, heartbeat_am)
       VALUES ($1, $2, $3, 'laeuft', now() - interval '2 minutes')`,
      [ORG, MONAT, ADMIN] as never[],
    )

    await expect(lauf({ clientIds: [klient], festschreiben: true, staleMinuten: 15 }))
      .rejects.toBeInstanceOf(SammelrechnungLaeuftBereitsError)

    await db.query(`DELETE FROM public.sammelrechnungslaeufe WHERE status = 'laeuft'`)
  })

  it('wird nach Ablauf der Frist uebernommen statt verdoppelt', async () => {
    const klient = await klientMitNachweisen()
    const eingesetzt = await db.query<{ id: string }>(
      `INSERT INTO public.sammelrechnungslaeufe
         (organization_id, period_month, actor_id, status, heartbeat_am, gestartet_am)
       VALUES ($1, $2, $3, 'laeuft', now() - interval '60 minutes', now() - interval '60 minutes')
       RETURNING id`,
      [ORG, MONAT, ADMIN] as never[],
    )
    const verwaist = eingesetzt.rows[0].id
    const vorher = (await laeufe()).length

    const e = await lauf({ clientIds: [klient], festschreiben: true, staleMinuten: 15 })

    expect(e.batchId).toBe(verwaist)
    expect(e.kopf.versuch).toBe(2)
    expect(e.erstellt).toHaveLength(1)
    expect((await laeufe()).length).toBe(vorher)
  })

  it('schlaegt waehrend des Laufs Herz', async () => {
    const klienten: string[] = []
    for (let i = 0; i < 3; i++) klienten.push(await klientMitNachweisen({ tage: ['2026-07-06'] }))

    const e = await lauf({ clientIds: klienten, festschreiben: true, heartbeatAlle: 1 })

    const r = await db.query<{ frisch: boolean }>(
      `SELECT heartbeat_am > gestartet_am AS frisch FROM public.sammelrechnungslaeufe WHERE id = $1`,
      [e.batchId] as never[],
    )
    expect(r.rows[0].frisch).toBe(true)
    expect(e.erstellt).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7) Probelauf
// ═══════════════════════════════════════════════════════════════════════

describe('Szenario 7: Probelauf ohne Seiteneffekte', () => {
  it('legt weder Kopfsatz noch Sperre noch Rechnung an', async () => {
    const klient = await klientMitNachweisen()
    const laeufeVorher = (await laeufe()).length
    const auditVorher = await zaehle('billing_audit_trail')

    const e = await fuehreSammelrechnungslaufAus(alsSupabase(), {
      organizationId: ORG,
      periodMonth: MONAT,
      actorId: ADMIN,
      clientIds: [klient],
      dryRun: true,
    })

    expect(e.dryRun).toBe(true)
    expect(e.gruppen).toBe(1)
    expect(e.vorschau).toHaveLength(1)
    expect(e.erstellt).toHaveLength(0)
    expect(await zaehle('invoices', `client_id = '${klient}'`)).toBe(0)
    expect((await laeufe()).length).toBe(laeufeVorher)
    expect(await zaehle('billing_audit_trail')).toBe(auditVorher)
    expect(H.gesendet).toBe(0)
  })

  it('meldet auch im Probelauf, was gesperrt waere', async () => {
    const klient = await klientMitNachweisen({ unterschrieben: false })
    // Ein signierter Nachweis daneben, damit ueberhaupt eine Gruppe entsteht.
    await admin.from('service_records').insert({
      organization_id: ORG, client_id: klient, caregiver_id: ENGEL,
      date: '2026-07-20', start_time: '09:00:00', end_time: '11:00:00',
      duration_minutes: DAUER_MINUTEN, service_type: 'Betreuung', budget_type: 'private',
      caregiver_initials: 'MB', amount: BETRAG_EUR, status: 'signed',
      proof_status: 'UNTERSCHRIEBEN', signature_hash: 'd'.repeat(64),
    })
    const auditVorher = await zaehle('billing_audit_trail')

    const e = await fuehreSammelrechnungslaufAus(alsSupabase(), {
      organizationId: ORG, periodMonth: MONAT, actorId: ADMIN,
      clientIds: [klient], dryRun: true,
    })

    expect(e.uebersprungen).toHaveLength(1)
    expect(e.uebersprungen[0].code).toBe('UNTERSCHRIFT_FEHLT')
    // Ein Probelauf schreibt auch keine Audit-Zeile.
    expect(await zaehle('billing_audit_trail')).toBe(auditVorher)
  })

  it('laesst die Nachweise unangetastet — der Echtlauf danach rechnet sie ab', async () => {
    const klient = await klientMitNachweisen()

    await fuehreSammelrechnungslaufAus(alsSupabase(), {
      organizationId: ORG, periodMonth: MONAT, actorId: ADMIN,
      clientIds: [klient], dryRun: true,
    })
    const e = await lauf({ clientIds: [klient], festschreiben: true })

    expect(e.erstellt).toHaveLength(1)
    expect(e.erstellt[0].lineCount).toBe(2)
  })
})
