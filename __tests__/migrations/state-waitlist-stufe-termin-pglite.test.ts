/**
 * PGlite: state_waitlist lässt die Stufe „termin" zu (Migration 20261104000000)
 *
 * Gegen ein echtes Postgres, nicht gegen eine Attrappe: der CHECK ist die
 * Regel, an der ein Klick auf „→ Termin" live mit 23514 scheiterte
 * (11.09.2026 belegt). Geprüft wird auch der Rückweg — ohne das UPDATE im
 * Rollback bräche das Wiederherstellen des alten CHECK an jeder
 * Termin-Zeile.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { WARTELISTE_STUFEN } from '@/lib/warteliste/katalog'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const lies = (f: string) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
const KUNDENFUNNEL = '20261102000000_state_waitlist_kundenfunnel.sql'
const MIGRATION = '20261104000000_state_waitlist_stufe_termin.sql'
const ROLLBACK = '20261104000001_rollback_state_waitlist_stufe_termin.sql'

let db: InstanceType<typeof PGlite>

beforeEach(async () => {
  db = new PGlite()
  // Grundgerüst wie live (20260808100000, gekürzt auf das hier Nötige),
  // danach die ECHTE Kundenfunnel-Migration, die den heutigen CHECK setzt.
  await db.exec(`
    CREATE TABLE public.state_waitlist (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL,
      bundesland text NOT NULL,
      name text,
      email text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.exec(lies(KUNDENFUNNEL))
})

afterEach(async () => { await db.close() })

async function eintrag(status: string) {
  await db.query(
    `INSERT INTO public.state_waitlist (organization_id, bundesland, email, status)
     VALUES ('00000000-0000-4000-8000-000460629986', 'hessen', $1, $2)`,
    [`${status}-${Math.random()}@example.org`, status],
  )
}

describe('20261104000000 — Stufe termin', () => {
  it('VOR der Migration: termin wird abgewiesen (so war es live)', async () => {
    await expect(eintrag('termin')).rejects.toThrow(/state_waitlist_status_check/)
  })

  it('NACH der Migration: jeder DB-Wert aus WARTELISTE_STUFEN ist erlaubt', async () => {
    await db.exec(lies(MIGRATION))
    for (const s of WARTELISTE_STUFEN) await eintrag(s.dbWert)
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.state_waitlist')
    expect(rows[0].n).toBe(WARTELISTE_STUFEN.length)
  })

  it('NACH der Migration: freie Werte bleiben verboten', async () => {
    await db.exec(lies(MIGRATION))
    await expect(eintrag('kunde')).rejects.toThrow(/state_waitlist_status_check/)
    await expect(eintrag('irgendwas')).rejects.toThrow(/state_waitlist_status_check/)
  })

  it('Migration ist wiederholbar', async () => {
    await db.exec(lies(MIGRATION))
    await db.exec(lies(MIGRATION))
    await eintrag('termin')
  })

  it('Rollback: Termin-Zeilen fallen auf kontaktiert zurück, alter CHECK steht wieder', async () => {
    await db.exec(lies(MIGRATION))
    await eintrag('termin')
    await eintrag('aktiviert')
    await db.exec(lies(ROLLBACK))
    const { rows } = await db.query<{ status: string }>('SELECT status FROM public.state_waitlist ORDER BY status')
    expect(rows.map(r => r.status)).toEqual(['aktiviert', 'kontaktiert'])
    await expect(eintrag('termin')).rejects.toThrow(/state_waitlist_status_check/)
  })
})
