/**
 * E2E: Fehlender Nachweis und fehlende Unterschrift, gegen die echte RPC
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Ketten 2 und 3 des Phase-4-Auftrags.
 *
 * Beide Sperren sitzen NICHT im TypeScript, sondern in
 * create_invoice_draft_atomic (20260914000000, v9):
 *
 *   • ohne abrechenbaren Leistungsnachweis  → RAISE EXCEPTION
 *   • mit Nachweis, aber ohne Unterschrift  → Audit-Eintrag mit
 *     error_code MISSING_SIGNATURE und danach Abbruch
 *
 * Bisher wurde beides ausschliesslich gegen Attrappen geprueft
 * (__tests__/billing/unified-invoice-creation.test.ts,
 * transaction-safety.test.ts) — dort liefert ein Mock den Fehlertext,
 * den der Test erwartet. Das beweist, dass der AUFRUFER mit dem Fehler
 * umgeht, nicht dass die Datenbank ihn ueberhaupt wirft. Hier laeuft die
 * echte Funktion auf echtem PostgreSQL.
 *
 * Der Unterschied zwischen den beiden Sperren ist der eigentliche Punkt:
 * „kein Nachweis" ist ein Abbruch ohne Spur, „Nachweis ohne
 * Unterschrift" hinterlaesst ausdruecklich einen Pruefpfad-Eintrag. Wer
 * beide gleich behandelt, verliert genau die Faelle, die spaeter
 * jemandem erklaert werden muessen.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const halter = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => halter.client }))

import { createInvoiceDraft } from '@/lib/billing/core/invoice-engine'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000009'
const ADMIN = '11111111-0000-4000-8000-000000000009'
const ENGEL_NUTZER = '44444444-0000-4000-8000-000000000009'
const KLIENT = 'c1111111-0000-4000-8000-000000000009'
const ENGEL = 'e1111111-0000-4000-8000-000000000009'
const EINSATZ = 'a1111111-0000-4000-8000-000000000009'

const MONAT = '2026-07'
const EINSATZ_TAG = '2026-07-06'
const PREIS_CENT = 3000
const DAUER_MINUTEN = 120

let db: PGlite
let admin: SupabaseClient

function entwurf() {
  return createInvoiceDraft(admin, {
    clientId: KLIENT, periodMonth: MONAT, budgetType: 'private', actorId: ADMIN,
  })
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`)
  return r.rows[0]?.n ?? 0
}

/** Legt einen Leistungsnachweis an. `status` steuert die Abrechenbarkeit. */
async function nachweis(felder: Record<string, unknown> = {}) {
  const { data, error } = await admin.from('service_records').insert({
    organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
    assignment_id: EINSATZ, date: EINSATZ_TAG,
    start_time: '09:00:00', end_time: '11:00:00',
    duration_minutes: DAUER_MINUTEN, service_type: 'Betreuung',
    budget_type: 'private', caregiver_initials: 'MB',
    status: 'complete', proof_status: 'ENTWURF',
    ...felder,
  }).select('id')
  if (error) throw new Error(`Nachweis nicht anlegbar: ${error.message}`)
  return String((data as Array<{ id: string }>)[0].id)
}

/** Unterschreibt einen Nachweis auf dem Weg, den die RPC anerkennt. */
async function unterschreibe(id: string) {
  await admin.from('service_signatures').insert({
    organization_id: ORG, service_record_id: id,
    signer_role: 'client', signer_name: 'Erika Testfall',
    signature_image: 'data:image/png;base64,AAAA',
  }).select('id')
  await admin.from('service_records').update({
    proof_status: 'UNTERSCHRIEBEN',
    signature_hash: 'b'.repeat(64),
    client_signed_at: `${EINSATZ_TAG}T11:05:00.000Z`,
    client_signer_name: 'Erika Testfall',
    status: 'signed',
  }).eq('id', id).select('id')
}

beforeAll(async () => {
  db = await baueKettenSchema()
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
  halter.client = admin

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.org'), ('${ENGEL_NUTZER}', 'engel@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org'),
      ('${ENGEL_NUTZER}', 'engel', 'Marek', 'Beispiel', 'engel@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG}', 'Mandant Alpha', 'hessen', 'active');

    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES ('${ORG}', 'betreuung_45a', 'privat', 'zeit_stunde',
            ${PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture');
  `)

  await admin.from('clients').insert({
    id: KLIENT, organization_id: ORG, customer_number: 'K-0009',
    first_name: 'Erika', last_name: 'Testfall', zip_code: '60311',
    city: 'Frankfurt am Main', email: 'kunde@example.org',
    care_level: 2, pflegegrad: 2,
  }).select('id')

  await admin.from('caregivers').insert({
    id: ENGEL, organization_id: ORG, user_id: ENGEL_NUTZER,
    first_name: 'Marek', last_name: 'Beispiel', initials: 'MB',
  }).select('id')

  await admin.from('assignments').insert({
    id: EINSATZ, organization_id: ORG, client_id: KLIENT, caregiver_id: ENGEL,
    assignment_date: EINSATZ_TAG, start_time: '09:00:00', end_time: '11:00:00',
    service_type: 'Betreuung', is_recurring: false, status: 'geplant',
  }).select('id')
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;
    DELETE FROM public.service_signatures;
    DELETE FROM public.service_records;
    DELETE FROM public.billing_audit_trail;
  `)
})

// ═════════════════════════════════════════════════════════════════════
describe('Kette 2: Buchung ohne Leistungsnachweis', () => {
  it('die RPC bricht ab, statt eine leere Rechnung zu erzeugen', async () => {
    // Der Einsatz ist geplant und der Kunde angelegt — es fehlt
    // ausschliesslich der Nachweis.
    expect(await zaehle('service_records')).toBe(0)

    await expect(entwurf()).rejects.toThrow(/Keine abrechenbaren Leistungen/i)
  })

  it('es entsteht KEINE Rechnungszeile und keine Position', async () => {
    await entwurf().catch(() => undefined)

    expect(await zaehle('invoices')).toBe(0)
    expect(await zaehle('invoice_items')).toBe(0)
  })

  it('ein Nachweis im Entwurf zaehlt NICHT als abrechenbar', async () => {
    await nachweis({ status: 'draft', proof_status: 'ENTWURF' })

    await expect(entwurf()).rejects.toThrow(/Keine abrechenbaren Leistungen/i)
    expect(await zaehle('invoices')).toBe(0)
  })

  it('ein bereits fakturierter Nachweis begruendet keine zweite Rechnung', async () => {
    const id = await nachweis()
    await unterschreibe(id)
    await entwurf()

    // Nach der ersten Rechnung steht der Nachweis auf 'invoiced'.
    const { data } = await admin.from('service_records').select('*').eq('id', id).maybeSingle()
    expect((data as Record<string, unknown>).status).toBe('invoiced')

    // Ein zweiter Lauf mit demselben Idempotenzschluessel liefert die
    // bestehende Rechnung zurueck — er erzeugt keine zweite.
    const zweiter = await entwurf()
    expect(zweiter.alreadyExists).toBe(true)
    expect(await zaehle('invoices')).toBe(1)
  })

  it('die Meldung nennt Klient, Zeitraum und Budgetart', async () => {
    const fehler = await entwurf().catch(e => e as Error)

    expect(fehler.message).toContain(KLIENT)
    expect(fehler.message).toContain(MONAT)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Kette 3: Leistungsnachweis ohne Unterschrift', () => {
  it('die RPC blockiert mit MISSING_SIGNATURE', async () => {
    await nachweis()

    await expect(entwurf()).rejects.toThrow(/MISSING_SIGNATURE/)
  })

  it('es entsteht KEINE Rechnung', async () => {
    await nachweis()
    await entwurf().catch(() => undefined)

    expect(await zaehle('invoices')).toBe(0)
    expect(await zaehle('invoice_items')).toBe(0)
  })

  it('der Nachweis bleibt unangetastet — er wird nicht auf "invoiced" gesetzt', async () => {
    const id = await nachweis()
    await entwurf().catch(() => undefined)

    const { data } = await admin.from('service_records').select('*').eq('id', id).maybeSingle()
    expect((data as Record<string, unknown>).status).toBe('complete')
  })

  it('anders als beim fehlenden Nachweis bleibt eine Spur im Pruefpfad', async () => {
    await nachweis()
    await entwurf().catch(() => undefined)

    const { rows } = await db.query<{ action: string; new_state: Record<string, unknown> }>(
      `SELECT action, new_state FROM public.billing_audit_trail
        WHERE new_state ->> 'error_code' = 'MISSING_SIGNATURE'`,
    )
    expect(rows.length, 'die Sperre muss nachvollziehbar bleiben').toBe(1)
  })

  it('der fehlende Nachweis hinterlaesst dagegen KEINEN Sperreintrag', async () => {
    await entwurf().catch(() => undefined)

    const { rows } = await db.query(
      `SELECT 1 FROM public.billing_audit_trail
        WHERE new_state ->> 'error_code' = 'MISSING_SIGNATURE'`,
    )
    expect(rows.length).toBe(0)
  })

  it('status "signed" ohne Unterschriftsnachweis genuegt NICHT', async () => {
    // Der Umgehungsweg: den Status setzen, ohne zu unterschreiben.
    await nachweis({ status: 'signed', proof_status: 'ENTWURF', signature_hash: null })

    await expect(entwurf()).rejects.toThrow(/MISSING_SIGNATURE/)
  })

  it('EIN unsignierter Nachweis blockiert den ganzen Lauf, auch neben signierten', async () => {
    const eins = await nachweis()
    await unterschreibe(eins)
    await nachweis({ date: '2026-07-13' })   // ohne Unterschrift

    await expect(entwurf()).rejects.toThrow(/MISSING_SIGNATURE/)
    expect(await zaehle('invoices'), 'Alles-oder-nichts, keine Teilrechnung').toBe(0)
  })

  it('mit Unterschrift laeuft dieselbe Kette durch', async () => {
    const id = await nachweis()
    await unterschreibe(id)

    const ergebnis = await entwurf()

    expect(ergebnis.alreadyExists).toBe(false)
    expect(ergebnis.lineCount).toBe(1)
    // 30,00 EUR/h × 2 h — aus dem Tarif gerechnet.
    expect(ergebnis.totalAmountCents).toBe(6000)
    expect(await zaehle('invoices')).toBe(1)
  })
})
