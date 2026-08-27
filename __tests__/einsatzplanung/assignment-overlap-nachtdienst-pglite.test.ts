/**
 * PGlite: DB-Trigger `check_assignment_overlap` auf assignments
 *
 * Getestet wird die WORTGLEICHE Funktion aus der Migration
 * 20261012000000_assignment_overlap_nachtdienst.sql gegen ein echtes
 * (In-Memory-)Postgres.
 *
 * Der Vorgaenger (20260808200000) verglich nur Uhrzeiten desselben Tages:
 *
 *     start_time < NEW.end_time AND end_time > NEW.start_time
 *
 * Fuer einen Nachteinsatz (end_time <= start_time) ist dieses Intervall leer.
 * Die Nachtdienst-Faelle unten sind genau die, die damit durchliefen — und
 * weil Tourenplanung und Kalender ihre Konfliktzusage an diesen Trigger
 * delegieren, war die Luecke dort dieselbe.
 *
 * Die Tagdienst- und Serien-Faelle stehen daneben, weil eine Umrechnung auf
 * Minuten leicht das bisherige Verhalten mit verbiegt.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20261012000000_assignment_overlap_nachtdienst.sql'
const ALT = '20261012000001_rollback_assignment_overlap_nachtdienst.sql'

const CG_A = '00000000-0000-4000-8000-0000000000c1'
const CG_B = '00000000-0000-4000-8000-0000000000c2'
const CL_A = '00000000-0000-4000-8000-0000000000d1'

const SCHEMA = `
CREATE TABLE public.assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  client_id       uuid,
  caregiver_id    uuid NOT NULL,
  assignment_date date,
  weekday         integer,
  valid_from      date,
  valid_until     date,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  status          text NOT NULL DEFAULT 'GEPLANT'
);
`

describe('DB-Trigger check_assignment_overlap (Nachteinsatz)', () => {
  let db: InstanceType<typeof PGlite>

  async function fuege(werte: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
    const basis: Record<string, unknown> = {
      client_id: CL_A,
      caregiver_id: CG_A,
      assignment_date: '2026-09-10',
      start_time: '08:00',
      end_time: '12:00',
      status: 'GEPLANT',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platz = spalten.map((_, i) => `$${i + 1}`).join(', ')
    try {
      await db.query(
        `INSERT INTO public.assignments (${spalten.join(', ')}) VALUES (${platz})`,
        spalten.map(s => basis[s]),
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Serie: kein Einzeldatum, dafuer Wochentag. */
  function serie(werte: Record<string, unknown>) {
    return fuege({ assignment_date: null, weekday: 1, ...werte })
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    await db.exec(liesMigration(MIGRATION))
  })

  afterAll(async () => { await db.close() })

  beforeEach(async () => {
    await db.exec('DELETE FROM public.assignments;')
  })

  // ── Tageinsaetze: bisheriges Verhalten bleibt ────────────────────

  it('blockiert zwei überlappende Tageinsätze derselben Kraft', async () => {
    expect((await fuege({ start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    const zweiter = await fuege({ start_time: '11:00', end_time: '14:00' })
    expect(zweiter.ok).toBe(false)
    expect(zweiter.ok === false && zweiter.message).toMatch(/DOPPELBELEGUNG/)
  })

  it('lässt lückenlos anschließende Einsätze zu (Berührung ist kein Konflikt)', async () => {
    expect((await fuege({ start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    expect((await fuege({ start_time: '12:00', end_time: '16:00' })).ok).toBe(true)
  })

  it('lässt denselben Zeitraum für eine ANDERE Kraft zu', async () => {
    expect((await fuege({ caregiver_id: CG_A })).ok).toBe(true)
    expect((await fuege({ caregiver_id: CG_B })).ok).toBe(true)
  })

  it('zählt stornierte Einsätze nicht mit', async () => {
    expect((await fuege({ status: 'STORNIERT' })).ok).toBe(true)
    expect((await fuege({ start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
  })

  it('lässt einen stornierten Einsatz selbst durch, auch wenn die Zeit belegt ist', async () => {
    expect((await fuege({ start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    expect((await fuege({ start_time: '09:00', end_time: '10:00', status: 'STORNIERT' })).ok).toBe(true)
  })

  it('meldet einen Einsatz beim UPDATE nicht als Konflikt mit sich selbst', async () => {
    await fuege({ start_time: '08:00', end_time: '12:00' })
    await expect(
      db.query(`UPDATE public.assignments SET status = 'BESTAETIGT'`),
    ).resolves.toBeDefined()
  })

  it('lässt denselben Zeitraum an einem anderen Tag zu', async () => {
    expect((await fuege({ assignment_date: '2026-09-10' })).ok).toBe(true)
    expect((await fuege({ assignment_date: '2026-09-12' })).ok).toBe(true)
  })

  // ── Nachteinsaetze: das war die Luecke ───────────────────────────

  it('blockiert zwei überlappende NACHTeinsätze am selben Tag', async () => {
    expect((await fuege({ start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    const zweiter = await fuege({ start_time: '23:00', end_time: '05:00' })
    expect(zweiter.ok).toBe(false)
    expect(zweiter.ok === false && zweiter.message).toMatch(/DOPPELBELEGUNG/)
  })

  it('blockiert einen Frühdienst am Folgetag, in den der Nachteinsatz hineinragt', async () => {
    expect((await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    const frueh = await fuege({ assignment_date: '2026-09-11', start_time: '05:00', end_time: '09:00' })
    expect(frueh.ok).toBe(false)
    expect(frueh.ok === false && frueh.message).toMatch(/DOPPELBELEGUNG/)
  })

  it('lässt einen Frühdienst am Folgetag zu, der erst nach dem Nachteinsatz beginnt', async () => {
    expect((await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    expect((await fuege({ assignment_date: '2026-09-11', start_time: '06:00', end_time: '10:00' })).ok).toBe(true)
  })

  it('blockiert einen Nachteinsatz, wenn der Einsatz des Folgetages noch mitten drin liegt', async () => {
    expect((await fuege({ assignment_date: '2026-09-11', start_time: '02:00', end_time: '07:00' })).ok).toBe(true)
    const nacht = await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })
    expect(nacht.ok).toBe(false)
  })

  it('lässt einen Tageinsatz am selben Tag NEBEN einem Nachteinsatz zu', async () => {
    expect((await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    expect((await fuege({ assignment_date: '2026-09-10', start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
  })

  it('behandelt Beginn = Ende als Null-Einsatz und blockiert damit nichts', async () => {
    expect((await fuege({ start_time: '10:00', end_time: '10:00' })).ok).toBe(true)
    expect((await fuege({ start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
  })

  it('greift nicht über zwei Tage hinweg (Nachteinsatz reicht höchstens in den Folgetag)', async () => {
    expect((await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    expect((await fuege({ assignment_date: '2026-09-12', start_time: '05:00', end_time: '09:00' })).ok).toBe(true)
  })

  // ── Serien (weekday statt Datum) ─────────────────────────────────

  it('blockiert zwei überlappende Serien desselben Wochentags', async () => {
    expect((await serie({ weekday: 1, start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    const zweite = await serie({ weekday: 1, start_time: '11:00', end_time: '14:00' })
    expect(zweite.ok).toBe(false)
  })

  it('lässt Serien verschiedener Wochentage zu', async () => {
    expect((await serie({ weekday: 1, start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    expect((await serie({ weekday: 3, start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
  })

  it('blockiert die Frühserie des Folgetages, in die eine Nachtserie hineinragt', async () => {
    expect((await serie({ weekday: 1, start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    const frueh = await serie({ weekday: 2, start_time: '05:00', end_time: '09:00' })
    expect(frueh.ok).toBe(false)
  })

  it('behandelt Sonntag als 0 und als 7 gleich (Nachtserie Sonntag → Montag früh)', async () => {
    expect((await serie({ weekday: 0, start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    const montag = await serie({ weekday: 1, start_time: '05:00', end_time: '09:00' })
    expect(montag.ok).toBe(false)
  })

  it('blockiert die Samstagsnacht gegen die Sonntagsfrühserie über den Wochenwechsel', async () => {
    expect((await serie({ weekday: 6, start_time: '22:00', end_time: '06:00' })).ok).toBe(true)
    const sonntag = await serie({ weekday: 7, start_time: '05:00', end_time: '09:00' })
    expect(sonntag.ok).toBe(false)
  })

  it('lässt Serien mit getrennten Gültigkeitsfenstern zu', async () => {
    expect((await serie({ weekday: 1, valid_from: '2026-01-01', valid_until: '2026-03-31' })).ok).toBe(true)
    expect((await serie({ weekday: 1, valid_from: '2026-04-01', valid_until: '2026-06-30' })).ok).toBe(true)
  })

  it('prüft eine Serie nicht gegen einen datierten Einsatz', async () => {
    expect((await fuege({ assignment_date: '2026-09-14', start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
    expect((await serie({ weekday: 1, start_time: '08:00', end_time: '12:00' })).ok).toBe(true)
  })
})

// ── Gegenprobe: der alte Stand liess die Nachtfaelle durch ─────────
// Ohne diesen Block waere nicht belegt, dass die Tests oben ueberhaupt
// etwas Neues pruefen — sie koennten auch schon vorher gruen gewesen sein.

describe('Alter Trigger-Stand (Rollback-Migration) — Beleg der Lücke', () => {
  let db: InstanceType<typeof PGlite>

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    await db.exec(liesMigration(ALT))
  })

  afterAll(async () => { await db.close() })

  async function fuege(werte: Record<string, unknown>): Promise<boolean> {
    const basis: Record<string, unknown> = {
      caregiver_id: CG_A,
      assignment_date: '2026-09-10',
      start_time: '08:00',
      end_time: '12:00',
      status: 'GEPLANT',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platz = spalten.map((_, i) => `$${i + 1}`).join(', ')
    try {
      await db.query(
        `INSERT INTO public.assignments (${spalten.join(', ')}) VALUES (${platz})`,
        spalten.map(s => basis[s]),
      )
      return true
    } catch {
      return false
    }
  }

  it('liess zwei überlappende Nachteinsätze desselben Tages durch', async () => {
    expect(await fuege({ start_time: '22:00', end_time: '06:00' })).toBe(true)
    expect(await fuege({ start_time: '23:00', end_time: '05:00' })).toBe(true)
  })

  it('liess den Frühdienst am Folgetag durch', async () => {
    await db.exec('DELETE FROM public.assignments;')
    expect(await fuege({ assignment_date: '2026-09-10', start_time: '22:00', end_time: '06:00' })).toBe(true)
    expect(await fuege({ assignment_date: '2026-09-11', start_time: '05:00', end_time: '09:00' })).toBe(true)
  })
})
