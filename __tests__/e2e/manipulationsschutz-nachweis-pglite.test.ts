/**
 * E2E: Warum der Manipulationsschutz des Leistungsnachweises nie gegriffen hat
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AUSGANGSLAGE (live nachgemessen 28.08.2026, Produktionsdatenbank):
 *
 *   service_records          30 Zeilen
 *   is_locked = true          0
 *   signature_hash gesetzt    0
 *   client_signed_at gesetzt  0
 *   proof_status              ausschliesslich 'ENTWURF'
 *   service_signatures        0 Zeilen
 *   davon bereits abgerechnet 15
 *
 * `prevent_locked_record_change` traegt den HINT „Manipulationsschutz
 * aktiv" und hat in dieser Datenbank noch nie eine Aenderung verhindert.
 * Die naheliegende Lesart waere: der Trigger ist kaputt. Diese Suite
 * prueft, ob das stimmt — und sie prueft es an der Datenbank, nicht am
 * Quelltext, weil ein Grep ueber CREATE TRIGGER nur belegt, dass jemand
 * das Wort geschrieben hat.
 *
 * BEFUND, den die Suite festhaelt: der Trigger ist NICHT kaputt. Er haengt
 * am Ende einer Kette, die in dieser Datenbank nie betreten wurde:
 *
 *   ENTWURF ──confirm──▶ ABGESCHLOSSEN ──sign──▶ UNTERSCHRIEBEN
 *                                                 │
 *                        compute_signature_hash ◀─┘ (nur MIT client_signed_at)
 *                                 │
 *                                 └─▶ signature_hash + is_locked = true
 *                                            │
 *                        prevent_locked_record_change ◀─┘
 *
 * Der einzige Schreiber von proof_status='UNTERSCHRIEBEN' im ganzen Repo
 * ist die Aktion `sign` in app/api/leistungsnachweis/crud/route.ts, und
 * die weist alles ab, was nicht auf 'ABGESCHLOSSEN' steht. Alle 30 Zeilen
 * stehen auf 'ENTWURF'. Niemand hat je bestaetigt, also konnte niemand je
 * unterschreiben, also ist der Schutz nie zustaendig geworden.
 *
 * Das ist eine Aussage ueber den BESTAND, nicht ueber den Riegel — und
 * genau deshalb muss sie belegt werden. Die Suite faehrt die Kette einmal
 * vollstaendig durch und zeigt: sobald sie betreten wird, greift jeder
 * Schritt.
 *
 * Sie faehrt ausserdem die drei Abkuerzungen, die den Schutz aushebeln
 * wuerden, und zeigt, welche die Datenbank abfaengt und welche nicht:
 *
 *   1. proof_status auf UNTERSCHRIEBEN ohne jeden Beleg
 *      → trg_a_unterschrift_beleg wirft (seit 20261017000000)
 *   2. proof_status auf UNTERSCHRIEBEN mit Beleg, aber OHNE
 *      client_signed_at
 *      → laeuft DURCH, Hash bleibt NULL, is_locked bleibt FALSE.
 *        Das ist der Zustand, der live auf allen 30 Zeilen steht, und
 *        der Grund, warum lib/billing/nachweis-beleg.ts auf der lesenden
 *        Seite nach einem BELEG fragt statt nach dem Statuswert.
 *   3. Aenderung an einer gesperrten Zeile
 *      → trg_prevent_locked_record wirft
 *
 * Gegen echtes PostgreSQL (PGlite), mit den Triggern wortgleich aus den
 * Migrationen. Eine Attrappe koennte hier gar nichts zeigen: der ganze
 * Befund besteht daraus, WELCHE Bedingung welchen Trigger ausloest.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueNachweisManipulationsschutz } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const ORG    = 'aaaaaaaa-0000-4000-8000-000000000016'
const ADMIN  = '11111111-0000-4000-8000-000000000016'
const KLIENT = 'c1111111-0000-4000-8000-000000000016'
const ENGEL  = 'e1111111-0000-4000-8000-000000000016'

const TAG = '2026-07-06'

let db: PGlite
let admin: SupabaseClient

/** Liest die Schutz-relevanten Felder direkt aus Postgres. */
async function zustand(id: string) {
  const r = await db.query<{
    proof_status: string; status: string
    signature_hash: string | null; is_locked: boolean
    client_signed_at: Date | null
  }>(
    `SELECT proof_status, status, signature_hash, is_locked, client_signed_at
       FROM public.service_records WHERE id = $1`, [id])
  return r.rows[0]
}

/** Legt einen frischen Nachweis im Ausgangszustand ENTWURF an. */
async function neuerNachweis(): Promise<string> {
  const r = await db.query<{ id: string }>(`
    INSERT INTO public.service_records
      (organization_id, client_id, caregiver_id, date, start_time, end_time,
       duration_minutes, service_type, budget_type, caregiver_initials,
       status, proof_status)
    VALUES ($1, $2, $3, $4, '09:00:00', '11:00:00', 120, 'Betreuung',
            'private', 'MB', 'complete', 'ENTWURF')
    RETURNING id`, [ORG, KLIENT, ENGEL, TAG])
  return String(r.rows[0].id)
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
      VALUES ('${ORG}', 'Mandant Manipulationsschutz', 'hessen', 'active');
  `)

  await admin.from('clients').insert({
    id: KLIENT, organization_id: ORG, customer_number: 'K-0016',
    first_name: 'Erika', last_name: 'Testfall', status: 'active',
  }).select('id')

  await admin.from('caregivers').insert({
    id: ENGEL, organization_id: ORG, first_name: 'Marek', last_name: 'Beispiel',
    status: 'active',
  }).select('id')
})

describe('Manipulationsschutz Leistungsnachweis — sind die Trigger ueberhaupt da?', () => {
  it('alle vier Trigger haengen an service_records und sind aktiv', async () => {
    const r = await db.query<{ tgname: string; proname: string; tgenabled: string }>(`
      SELECT t.tgname, p.proname, t.tgenabled::text AS tgenabled
        FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = 'public.service_records'::regclass
         AND NOT t.tgisinternal
       ORDER BY t.tgname`)

    const namen = r.rows.map(z => z.tgname)
    expect(namen).toContain('trg_sync_record_status')
    expect(namen).toContain('trg_a_unterschrift_beleg')
    expect(namen).toContain('trg_compute_signature_hash')
    expect(namen).toContain('trg_prevent_locked_record')

    // 'O' = origin, also im normalen Betrieb aktiv. Genau dieser Wert
    // steht am 28.08.2026 auch live auf allen neun Triggern der Tabelle.
    for (const z of r.rows) expect(z.tgenabled).toBe('O')
  })
})

describe('Die vollstaendige Kette — sie greift, sobald sie betreten wird', () => {
  let id: string
  beforeEach(async () => { id = await neuerNachweis() })

  it('ENTWURF → ABGESCHLOSSEN → UNTERSCHRIEBEN setzt Hash und Sperre', async () => {
    // Ausgangslage: exakt der Zustand, in dem live alle 30 Zeilen stehen.
    let z = await zustand(id)
    expect(z.proof_status).toBe('ENTWURF')
    expect(z.signature_hash).toBeNull()
    expect(z.is_locked).toBe(false)

    // Schritt 1 — bestaetigen (Aktion 'confirm'). Live ist dieser Schritt
    // auf KEINER Zeile je gelaufen; das ist der Grund fuer alles Weitere.
    await db.query(
      `UPDATE public.service_records
          SET proof_status = 'ABGESCHLOSSEN', caregiver_confirmed_at = now()
        WHERE id = $1`, [id])
    z = await zustand(id)
    expect(z.proof_status).toBe('ABGESCHLOSSEN')
    expect(z.is_locked).toBe(false)

    // Schritt 2 — unterschreiben (Aktion 'sign'). Die Route setzt
    // client_signed_at IM SELBEN UPDATE wie proof_status; genau darauf
    // haengt compute_signature_hash.
    await db.query(
      `UPDATE public.service_records
          SET proof_status = 'UNTERSCHRIEBEN',
              client_signed_at = now(),
              client_signature = 'data:image/png;base64,AAAA',
              client_signer_name = 'Erika Testfall'
        WHERE id = $1`, [id])

    z = await zustand(id)
    expect(z.proof_status).toBe('UNTERSCHRIEBEN')
    // DAS ist der Nachweis: der Trigger hat gefeuert.
    expect(z.signature_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(z.is_locked).toBe(true)
    // Und der Status-Sync hat den Nachweis abrechenbar gemacht.
    expect(z.status).toBe('signed')
  })

  it('die gesperrte Zeile ist danach wirklich gesperrt', async () => {
    await db.query(
      `UPDATE public.service_records SET proof_status = 'ABGESCHLOSSEN' WHERE id = $1`, [id])
    await db.query(
      `UPDATE public.service_records
          SET proof_status = 'UNTERSCHRIEBEN', client_signed_at = now(),
              client_signature = 'data:image/png;base64,AAAA'
        WHERE id = $1`, [id])
    expect((await zustand(id)).is_locked).toBe(true)

    await expect(
      db.query(`UPDATE public.service_records SET amount = 999 WHERE id = $1`, [id]),
    ).rejects.toThrow(/gesperrt/i)

    // Gegenprobe zur Sperre: Stornierung bleibt ausdruecklich erlaubt.
    // Ohne diese Zeile waere „alles blockiert" ebenfalls gruen — und ein
    // Riegel, der auch den vorgesehenen Weg zumacht, ist kein Beweis.
    await expect(
      db.query(
        `UPDATE public.service_records SET proof_status = 'STORNIERT' WHERE id = $1`, [id]),
    ).resolves.toBeDefined()
  })
})

describe('Die Abkuerzungen — was die Datenbank abfaengt und was nicht', () => {
  let id: string
  beforeEach(async () => { id = await neuerNachweis() })

  it('UNTERSCHRIEBEN ohne jeden Beleg wird abgewiesen', async () => {
    await expect(
      db.query(
        `UPDATE public.service_records SET proof_status = 'UNTERSCHRIEBEN' WHERE id = $1`, [id]),
    ).rejects.toThrow(/Unterschriftsbeleg/i)

    // Die Zeile darf davon nichts abbekommen haben.
    const z = await zustand(id)
    expect(z.proof_status).toBe('ENTWURF')
    expect(z.is_locked).toBe(false)
  })

  it('BEFUND: mit Beleg, aber ohne client_signed_at bleibt der Nachweis OFFEN', async () => {
    // Der Beleg kommt hier ueber service_signatures — den Weg, den die
    // Native-App benutzt. trg_a_unterschrift_beleg ist damit zufrieden.
    await admin.from('service_signatures').insert({
      organization_id: ORG, service_record_id: id,
      signer_role: 'client', signer_name: 'Erika Testfall',
      signature_image: 'data:image/png;base64,AAAA',
    }).select('id')

    await db.query(
      `UPDATE public.service_records SET proof_status = 'UNTERSCHRIEBEN' WHERE id = $1`, [id])

    const z = await zustand(id)
    // Der Status steht auf „unterschrieben" …
    expect(z.proof_status).toBe('UNTERSCHRIEBEN')
    expect(z.status).toBe('signed')
    // … und der Manipulationsschutz ist trotzdem NICHT scharf.
    expect(z.signature_hash).toBeNull()
    expect(z.is_locked).toBe(false)

    // Folge: die Zeile bleibt beliebig aenderbar, obwohl sie abrechenbar ist.
    await expect(
      db.query(`UPDATE public.service_records SET amount = 999 WHERE id = $1`, [id]),
    ).resolves.toBeDefined()

    // GENAU DESHALB fragt lib/billing/nachweis-beleg.ts auf der lesenden
    // Seite nach einem Beleg (Hash ZUSAMMEN MIT Zeitstempel, Bild, oder
    // eine Zeile in service_signatures) und nicht nach proof_status. Wer
    // hier den Statuswert als Unterschrift nimmt, rechnet einen Nachweis
    // ab, der weiterhin veraendert werden kann.
  })

  it('client_signed_at allein, ohne Statuswechsel, sperrt nichts', async () => {
    // Gegenprobe zur WHEN-Bedingung des Triggers: er haengt am WECHSEL
    // von proof_status, nicht am Zeitstempel. Ohne diesen Test koennte
    // man den vorigen Befund fuer ein Zeitstempel-Problem halten.
    await db.query(
      `UPDATE public.service_records SET client_signed_at = now() WHERE id = $1`, [id])
    const z = await zustand(id)
    expect(z.signature_hash).toBeNull()
    expect(z.is_locked).toBe(false)
  })
})

describe('Der Bestand — warum die Kette nie betreten wurde', () => {
  it('ein Nachweis in ENTWURF traegt keinerlei Unterschriftsspur', async () => {
    // Bildet die Live-Zaehlung nach: 30 Zeilen, alle ENTWURF, keine mit
    // Hash, Zeitstempel oder Sperre. Der Test haelt fest, dass dieser
    // Zustand aus der Kette HERAUSFAELLT und nicht in sie hinein — er ist
    // der Ausgangspunkt, nicht ein halb durchlaufener Schutz.
    const id = await neuerNachweis()
    const z = await zustand(id)
    expect(z.proof_status).toBe('ENTWURF')
    expect(z.status).toBe('complete')
    expect(z.signature_hash).toBeNull()
    expect(z.client_signed_at).toBeNull()
    expect(z.is_locked).toBe(false)
  })
})
