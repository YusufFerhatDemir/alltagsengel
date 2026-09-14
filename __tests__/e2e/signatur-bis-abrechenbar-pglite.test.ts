/**
 * E2E: von der Unterschrift bis „abrechenbar" — auf echtem Postgres
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ── DIE FRAGE, DIE HIER BEANTWORTET WIRD ──────────────────────────────
 * Am 14.09.2026 meldete `npm run verify:sammelrechnung` live: dreizehn
 * Leistungsnachweise aus vier Monaten stehen auf `status='signed'`, tragen
 * aber keinen Unterschriftsbeleg. Der Sammelrechnungslauf überspringt jeden
 * davon mit `UNTERSCHRIFT_FEHLT` — die Leistung ist erbracht, eine Rechnung
 * entsteht nicht.
 *
 * Die Ursache lag zwischen zwei fertigen Hälften: `signatur_dokumente` trug
 * `referenz_tabelle`/`referenz_id`, und niemand wertete sie aus
 * (`lib/signaturen/nachweis-uebernahme.ts` schließt das seit Block 13).
 *
 * Diese Suite prüft die Kette als GANZES — und zwar an der Stelle, die
 * zählt: **wird aus einem nicht abrechenbaren Nachweis durch die
 * Unterschrift ein abrechenbarer?**
 *
 *   Nachweis ABGESCHLOSSEN
 *        │  Trockenlauf  ──▶ UNTERSCHRIFT_FEHLT      (Ausgangslage)
 *        │
 *        ├─ uebernimmSignaturInNachweis()
 *        │       └─ proof_status + client_signed_at in EINEM Update
 *        │              └─ compute_signature_hash  ─▶ Hash + is_locked
 *        │              └─ sync_service_record_status ─▶ status='signed'
 *        │
 *        └─ Trockenlauf  ──▶ abrechenbar             (Beweis)
 *
 * ── WARUM ECHTES POSTGRES ─────────────────────────────────────────────
 * Der entscheidende Teil sind die TRIGGER. Ein Doppelgänger würde die
 * Felder brav speichern und nie zeigen, dass `compute_signature_hash` ohne
 * `client_signed_at` gar nicht rechnet — genau der halbe Zustand, gegen den
 * die Übernahme gebaut ist.
 *
 * ── WAS HIER NICHT PASSIERT ───────────────────────────────────────────
 * Es entsteht KEINE Rechnung. Der Sammelrechnungslauf läuft ausschließlich
 * mit `dryRun: true`; `FIRST_REAL_INVOICE_APPROVED` bleibt unberührt. Der
 * Beweis ist die Entscheidung des Laufs, nicht sein Schreibvorgang.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueNachweisManipulationsschutz } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'
import { uebernimmSignaturInNachweis, NACHWEIS_TABELLE } from '@/lib/signaturen/nachweis-uebernahme'
import { fuehreSammelrechnungslaufAus } from '@/lib/billing/core/sammelrechnung'

const ORG    = 'aaaaaaaa-0000-4000-8000-000000000031'
const ADMIN  = '11111111-0000-4000-8000-000000000031'
const KLIENT = 'c1111111-0000-4000-8000-000000000031'
const ENGEL  = 'e1111111-0000-4000-8000-000000000031'

const MONAT = '2026-07'
const TAG   = `${MONAT}-06`
const TARIF_PREIS_CENT = 4000

let db: PGlite
let admin: SupabaseClient

async function zustand(id: string) {
  const r = await db.query<{
    proof_status: string; status: string
    signature_hash: string | null; is_locked: boolean
    client_signed_at: Date | null; client_signature: string | null
  }>(
    `SELECT proof_status, status, signature_hash, is_locked, client_signed_at, client_signature
       FROM public.service_records WHERE id = $1`, [id])
  return r.rows[0]
}

/**
 * Nachweis in GENAU der Form, die live liegt: `status='signed'`, aber
 * `proof_status='ENTWURF'` und kein Hash.
 *
 * Das Statuswort allein sagt „unterschrieben"; der BELEG fehlt. Genau so
 * sehen die dreizehn Zeilen aus, die `verify:sammelrechnung` am 14.09.2026
 * gemeldet hat — sie stammen aus der Zeit vor
 * `enforce_unterschrift_beleg` (Migration 20261017000000).
 *
 * Ein Nachweis auf `complete`/`ABGESCHLOSSEN` taugt dafuer NICHT: aus dem
 * bildet der Lauf gar keine Gruppe (`signiert === 0`), und der Test haette
 * dann „nicht abrechenbar" gemessen, ohne die Unterschrift zu pruefen.
 * Beim ersten Anlauf genau so passiert.
 */
async function neuerNachweis(): Promise<string> {
  const r = await db.query<{ id: string }>(`
    INSERT INTO public.service_records
      (organization_id, client_id, caregiver_id, date, start_time, end_time,
       duration_minutes, service_type, budget_type, caregiver_initials,
       amount, status, proof_status)
    VALUES ($1, $2, $3, $4, '09:00:00', '11:00:00', 120, 'betreuung_45a',
            'private', 'MB', 80.00, 'signed', 'ENTWURF')
    RETURNING id`, [ORG, KLIENT, ENGEL, TAG])
  return String(r.rows[0].id)
}

/** Trockenlauf über den Monat — schreibt nichts. */
function trockenlauf() {
  return fuehreSammelrechnungslaufAus(admin, {
    organizationId: ORG,
    periodMonth: MONAT,
    actorId: ADMIN,
    dryRun: true,
  })
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueNachweisManipulationsschutz(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.org');
    INSERT INTO public.profiles (id, role, first_name, last_name, email)
      VALUES ('${ADMIN}', 'admin', 'Admin', 'Alpha', 'admin@example.org');
    INSERT INTO public.organizations (id, name, bundesland, status)
      VALUES ('${ORG}', 'Mandant Signaturbruecke', 'hessen', 'active');
    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, status)
      VALUES ('${KLIENT}', '${ORG}', 'K-0031', 'Erika', 'Testfall', 'active');
    INSERT INTO public.caregivers
      (id, organization_id, first_name, last_name, initials, status)
      VALUES ('${ENGEL}', '${ORG}', 'Marek', 'Beispiel', 'MB', 'active');

    -- Ohne gueltigen, verifizierten Tarif waere die Gruppe aus einem
    -- ANDEREN Grund nicht abrechenbar (TARIF_FEHLT) — und der Test wuerde
    -- die Unterschrift pruefen, ohne sie zu messen.
    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES
      ('${ORG}', 'betreuung_45a', 'privat', 'zeit_stunde',
       ${TARIF_PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture');
  `)
}, 180000)

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await db.exec(`DELETE FROM public.service_records WHERE organization_id = '${ORG}'`)
})

// ═══════════════════════════════════════════════════════════════════════
describe('Ausgangslage: ohne Beleg ist nichts abrechenbar', () => {
  it('der Trockenlauf ueberspringt den Nachweis mit UNTERSCHRIFT_FEHLT', async () => {
    await neuerNachweis()
    const e = await trockenlauf()

    expect(e.vorschau ?? []).toHaveLength(0)
    expect(e.uebersprungen).toHaveLength(1)
    expect(e.uebersprungen[0].code).toBe('UNTERSCHRIFT_FEHLT')
    // Der Grund nennt die Zahl — sonst muesste jemand raten, wie viele.
    expect(e.uebersprungen[0].grund).toMatch(/1 von 1/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Die Bruecke: aus der Unterschrift wird ein Beleg', () => {
  it('stempelt proof_status UND client_signed_at — und die Trigger tun den Rest', async () => {
    const id = await neuerNachweis()
    const signiertAm = new Date('2026-07-07T10:00:00.000Z').toISOString()

    const r = await uebernimmSignaturInNachweis(admin, {
      referenzTabelle: NACHWEIS_TABELLE,
      referenzId: id,
      signiertAm,
      signatarName: 'Erika Testfall',
      organizationId: ORG,
    })
    expect(r).toEqual({ art: 'uebernommen', nachweisId: id })

    const z = await zustand(id)
    expect(z.proof_status).toBe('UNTERSCHRIEBEN')
    expect(z.client_signature).toBe('Erika Testfall')
    // Das ist der Teil, den nur echtes Postgres zeigt: der Hash entsteht im
    // Trigger, nicht im Anwendungscode.
    expect(z.signature_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(z.is_locked).toBe(true)
    // Und der Status-Sync macht den Nachweis abrechenbar.
    expect(z.status).toBe('signed')
  })

  it('ein zweiter Stempel aendert den Beleg NICHT', async () => {
    // Idempotenz mit Folgen: ein erneuter Durchlauf liefe durch den
    // Hash-Trigger mit einem neuen Zeitstempel und schriebe einen anderen
    // Hash — der Beleg waere dann ein anderer als der unterschriebene.
    const id = await neuerNachweis()
    const eingabe = {
      referenzTabelle: NACHWEIS_TABELLE,
      referenzId: id,
      signiertAm: new Date('2026-07-07T10:00:00.000Z').toISOString(),
      signatarName: 'Erika Testfall',
      organizationId: ORG,
    }
    await uebernimmSignaturInNachweis(admin, eingabe)
    const erster = (await zustand(id)).signature_hash

    const zweiter = await uebernimmSignaturInNachweis(admin, {
      ...eingabe,
      signiertAm: new Date('2026-07-08T12:00:00.000Z').toISOString(),
    })
    expect(zweiter).toEqual({ art: 'bereits_belegt' })
    expect((await zustand(id)).signature_hash).toBe(erster)
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('Der Beweis: derselbe Nachweis ist danach abrechenbar', () => {
  it('aus UNTERSCHRIFT_FEHLT wird eine abrechenbare Gruppe', async () => {
    const id = await neuerNachweis()

    const vorher = await trockenlauf()
    expect(vorher.uebersprungen[0]?.code).toBe('UNTERSCHRIFT_FEHLT')
    expect(vorher.vorschau ?? []).toHaveLength(0)

    await uebernimmSignaturInNachweis(admin, {
      referenzTabelle: NACHWEIS_TABELLE,
      referenzId: id,
      signiertAm: new Date('2026-07-07T10:00:00.000Z').toISOString(),
      signatarName: 'Erika Testfall',
      organizationId: ORG,
    })

    const nachher = await trockenlauf()
    expect(nachher.uebersprungen).toHaveLength(0)
    expect(nachher.vorschau ?? []).toHaveLength(1)
    expect(nachher.vorschau[0].recordIds).toContain(id)
    expect(nachher.vorschau[0].signiert).toBe(1)
  })

  it('und es entsteht dabei keine Rechnung', async () => {
    // Der Trockenlauf ist die ganze Aussage. Waere hier eine Rechnung
    // entstanden, haette dieser Lauf eine Nummer aus dem Kreis verbraucht.
    const id = await neuerNachweis()
    await uebernimmSignaturInNachweis(admin, {
      referenzTabelle: NACHWEIS_TABELLE,
      referenzId: id,
      signiertAm: new Date('2026-07-07T10:00:00.000Z').toISOString(),
      signatarName: 'Erika Testfall',
      organizationId: ORG,
    })
    await trockenlauf()

    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.invoices WHERE organization_id = $1`, [ORG])
    expect(r.rows[0].n).toBe(0)
  })
})
