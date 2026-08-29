/**
 * PGlite: Abschreiben darf die Unveränderlichkeit der Rechnung nicht aufheben
 * (Migration 20260829213000)
 *
 * BEFUND, live am 29.08.2026 aus `pg_get_functiondef` gelesen:
 * `prevent_finalized_invoice_mutation` prüft die fachlichen Felder einer
 * Rechnung nur, wenn ihr Status in einer Aufzählung steht. `abgeschrieben`
 * fehlte darin — und der erste Schritt der Funktion ist
 *
 *     IF OLD.status NOT IN (…) THEN RETURN NEW;
 *
 * also ein sofortiges Durchwinken. Der Endstatus `abgeschrieben` war damit
 * der einzige, der den Schutz nicht bloß nicht hinzufügt, sondern ihn
 * WEGNIMMT: eine als `freigegeben` geschützte Rechnung wurde durch das
 * Abschreiben inhaltlich wieder änderbar.
 *
 * Dieser Lauf fährt beide Fassungen gegen echtes PostgreSQL:
 *   `db`  — mit der Migration: der Schutz hält auch nach dem Abschreiben
 *   `alt` — Fassung davor (aus der Rollback-Datei): er hält nicht
 *
 * Ohne den `alt`-Lauf wäre nicht belegt, dass die Migration überhaupt etwas
 * ändert — ein grüner Test gegen nur eine Fassung beweist die Behebung nicht,
 * sondern nur den Zustand danach.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20260829213000_abgeschrieben_bleibt_festgeschrieben.sql'
const ROLLBACK = '20260829213001_rollback_abgeschrieben_bleibt_festgeschrieben.sql'

const ORG = '00000000-0000-4000-8000-000000000001'
const CLIENT = '00000000-0000-4000-8000-0000000000ba'

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

// Nur die Spalten, die die Trigger-Funktion anfasst. Kein RLS, keine FKs —
// geprüft wird der Trigger, nicht das Rechtemodell.
const TABELLE = `
  CREATE TABLE public.invoices (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          uuid NOT NULL,
    client_id                uuid NOT NULL,
    status                   text NOT NULL DEFAULT 'entwurf',
    total_amount             numeric(10,2) NOT NULL DEFAULT 0,
    budget_amount            numeric(10,2),
    private_amount           numeric(10,2),
    soll_betrag_cent         bigint,
    paid_amount              numeric(10,2) NOT NULL DEFAULT 0,
    period_start             date,
    period_end               date,
    insurance_name           text,
    insurance_number         text,
    invoice_number           text,
    invoice_number_formatted text,
    correction_of            uuid,
    correction_type          text,
    idempotency_key          text,
    created_at               timestamptz NOT NULL DEFAULT now()
  );
`

const TRIGGER = `
  CREATE TRIGGER trg_invoices_no_finalized_edit
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_invoice_mutation();
`

let db: InstanceType<typeof PGlite>
let alt: InstanceType<typeof PGlite>

/** Eine freigegebene Rechnung, die anschliessend abgeschrieben wird. */
async function neueRechnung(target: InstanceType<typeof PGlite>, id: string) {
  await target.query(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, status, total_amount, paid_amount, invoice_number)
     VALUES ($1, $2, $3, 'freigegeben', 120.00, 0, 'RE-2026-0001')`,
    [id, ORG, CLIENT] as never[],
  )
}

async function aufbauen(sql: string) {
  const inst = new PGlite()
  await inst.exec(TABELLE)
  await inst.exec(sql)
  await inst.exec(TRIGGER)
  return inst
}

beforeAll(async () => {
  db = await aufbauen(migration(HAERTUNG))
  alt = await aufbauen(migration(ROLLBACK))
})

afterAll(async () => {
  await db?.close()
  await alt?.close()
})

const R1 = '00000000-0000-4000-8000-0000000000e1'
const R2 = '00000000-0000-4000-8000-0000000000e2'
const R3 = '00000000-0000-4000-8000-0000000000e3'

describe('Vor dem Abschreiben — der Schutz steht (unveraendert)', () => {
  it('weist eine Betragsaenderung an einer freigegebenen Rechnung ab', async () => {
    await neueRechnung(db, R1)
    await expect(
      db.query(`UPDATE public.invoices SET total_amount = 999.00 WHERE id = $1`, [R1] as never[]),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })

  it('laesst den Statuswechsel auf abgeschrieben zu — er aendert keinen Inhalt', async () => {
    await expect(
      db.query(`UPDATE public.invoices SET status = 'abgeschrieben' WHERE id = $1`, [R1] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Nach dem Abschreiben — der Schutz bleibt', () => {
  it('weist eine Betragsaenderung weiterhin ab', async () => {
    await expect(
      db.query(`UPDATE public.invoices SET total_amount = 1.00 WHERE id = $1`, [R1] as never[]),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })

  it('weist eine Aenderung der Rechnungsnummer ab', async () => {
    await expect(
      db.query(`UPDATE public.invoices SET invoice_number = 'RE-2026-9999' WHERE id = $1`, [R1] as never[]),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })

  it('weist einen Wechsel des Kunden ab — sonst haengt die Forderung am Falschen', async () => {
    await expect(
      db.query(
        `UPDATE public.invoices SET client_id = '00000000-0000-4000-8000-0000000000bb' WHERE id = $1`,
        [R1] as never[],
      ),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })

  it('weist einen Wechsel des Mandanten ab', async () => {
    await expect(
      db.query(
        `UPDATE public.invoices SET organization_id = '00000000-0000-4000-8000-000000000002' WHERE id = $1`,
        [R1] as never[],
      ),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })

  it('nennt den Status in der Meldung, damit der Grund ohne Nachschlagen klar ist', async () => {
    await expect(
      db.query(`UPDATE public.invoices SET period_end = '2026-12-31' WHERE id = $1`, [R1] as never[]),
    ).rejects.toThrow(/abgeschrieben/)
  })

  it('laesst nicht geschuetzte Felder in Ruhe — paid_amount bleibt buchbar', async () => {
    // Der Trigger schuetzt Inhalt, nicht Zustand. Eine nachtraeglich doch
    // eingehende Zahlung muss sich verbuchen lassen, ohne dass jemand die
    // Rechnung dafuer aufbrechen muss.
    await expect(
      db.query(`UPDATE public.invoices SET paid_amount = 10.00 WHERE id = $1`, [R1] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Gegenprobe: die Fassung VOR der Migration laesst genau das durch', () => {
  it('gibt den Schutz mit dem Abschreiben auf', async () => {
    await neueRechnung(alt, R2)
    // Vorher greift er noch.
    await expect(
      alt.query(`UPDATE public.invoices SET total_amount = 999.00 WHERE id = $1`, [R2] as never[]),
    ).rejects.toThrow(/nicht veraendert werden/i)

    await alt.query(`UPDATE public.invoices SET status = 'abgeschrieben' WHERE id = $1`, [R2] as never[])

    // Und danach nicht mehr — das ist der Befund, den die Migration behebt.
    await expect(
      alt.query(`UPDATE public.invoices SET total_amount = 999.00 WHERE id = $1`, [R2] as never[]),
    ).resolves.toBeDefined()
    const { rows } = await alt.query<{ total_amount: string }>(
      `SELECT total_amount FROM public.invoices WHERE id = $1`, [R2] as never[],
    )
    expect(Number(rows[0].total_amount)).toBe(999)
  })

  it('haelt bei storniert auch vorher schon — der Befund betraf nur abgeschrieben', async () => {
    await neueRechnung(alt, R3)
    await alt.query(`UPDATE public.invoices SET status = 'storniert' WHERE id = $1`, [R3] as never[])
    await expect(
      alt.query(`UPDATE public.invoices SET total_amount = 5.00 WHERE id = $1`, [R3] as never[]),
    ).rejects.toThrow(/nicht veraendert werden/i)
  })
})
