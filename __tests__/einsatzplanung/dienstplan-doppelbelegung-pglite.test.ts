/**
 * PGlite: DB-Trigger `check_doppelbelegung` auf dienstplan_eintraege
 *
 * Getestet wird die WORTGLEICHE Funktion aus der Migration
 * 20261011000000_dienstplan_nachtdienst_doppelbelegung.sql gegen ein echtes
 * (In-Memory-)Postgres.
 *
 * Der Vorgaenger (20260811010000) verglich nur Uhrzeiten desselben Tages:
 *
 *     NEW.start_zeit < end_zeit AND NEW.end_zeit > start_zeit
 *
 * Fuer einen Nachtdienst (end_zeit <= start_zeit) ist dieses Intervall leer.
 * Die Faelle 3–6 unten sind genau die, die damit durchliefen bzw. falsch
 * blockiert wurden — sie sind der Grund fuer die neue Migration.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20261011000000_dienstplan_nachtdienst_doppelbelegung.sql'

const ORG_A = '00000000-0000-4000-8000-00000000a001'
const ORG_B = '00000000-0000-4000-8000-00000000a002'
const CG_A = '00000000-0000-4000-8000-0000000000c1'
const CG_B = '00000000-0000-4000-8000-0000000000c2'

const SCHEMA = `
CREATE TABLE public.dienstplan_eintraege (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  datum           date NOT NULL,
  caregiver_id    uuid,
  start_zeit      time NOT NULL,
  end_zeit        time NOT NULL,
  pause_minuten   int DEFAULT 0,
  status          text NOT NULL DEFAULT 'geplant'
);
CREATE TABLE public.absences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  caregiver_id    uuid NOT NULL,
  absence_type    text NOT NULL DEFAULT 'vacation',
  status          text DEFAULT 'genehmigt',
  start_date      date NOT NULL,
  end_date        date NOT NULL
);
`

describe('DB-Trigger check_doppelbelegung (Nachtdienst)', () => {
  let db: InstanceType<typeof PGlite>

  async function fuege(werte: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
    const basis = {
      organization_id: ORG_A,
      caregiver_id: CG_A,
      datum: '2026-09-10',
      start_zeit: '08:00',
      end_zeit: '12:00',
      status: 'geplant',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platz = spalten.map((_, i) => `$${i + 1}`).join(', ')
    try {
      await db.query(
        `INSERT INTO public.dienstplan_eintraege (${spalten.join(', ')}) VALUES (${platz})`,
        spalten.map(s => (basis as Record<string, unknown>)[s]),
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    await db.exec(liesMigration(MIGRATION))
  })

  afterAll(async () => { await db.close() })

  beforeEach(async () => {
    await db.exec('DELETE FROM public.dienstplan_eintraege; DELETE FROM public.absences;')
  })

  // ── Tagdienste: das bisherige Verhalten bleibt ───────────────────

  it('blockiert zwei überlappende Tagdienste derselben Kraft', async () => {
    expect((await fuege({ start_zeit: '08:00', end_zeit: '12:00' })).ok).toBe(true)
    const zweiter = await fuege({ start_zeit: '11:00', end_zeit: '14:00' })
    expect(zweiter.ok).toBe(false)
    expect(zweiter.ok === false && zweiter.message).toMatch(/Doppelbelegung/)
  })

  it('lässt lückenlos anschließende Dienste zu (Berührung ist kein Konflikt)', async () => {
    expect((await fuege({ start_zeit: '08:00', end_zeit: '12:00' })).ok).toBe(true)
    expect((await fuege({ start_zeit: '12:00', end_zeit: '16:00' })).ok).toBe(true)
  })

  it('lässt denselben Zeitraum für eine ANDERE Kraft zu', async () => {
    expect((await fuege({ caregiver_id: CG_A })).ok).toBe(true)
    expect((await fuege({ caregiver_id: CG_B })).ok).toBe(true)
  })

  it('lässt denselben Zeitraum in einem anderen Mandanten zu', async () => {
    expect((await fuege({ organization_id: ORG_A })).ok).toBe(true)
    expect((await fuege({ organization_id: ORG_B })).ok).toBe(true)
  })

  it('zählt ausgefallene Dienste nicht mit', async () => {
    expect((await fuege({ status: 'ausgefallen' })).ok).toBe(true)
    expect((await fuege({ start_zeit: '08:00', end_zeit: '12:00' })).ok).toBe(true)
  })

  it('meldet einen Dienst beim UPDATE nicht als Konflikt mit sich selbst', async () => {
    await fuege({ start_zeit: '08:00', end_zeit: '12:00' })
    await expect(
      db.query(`UPDATE public.dienstplan_eintraege SET pause_minuten = 30`),
    ).resolves.toBeDefined()
  })

  // ── Nachtdienste: das war die Lücke ──────────────────────────────

  it('blockiert zwei überlappende NACHTdienste am selben Tag', async () => {
    expect((await fuege({ start_zeit: '22:00', end_zeit: '06:00' })).ok).toBe(true)
    const zweiter = await fuege({ start_zeit: '23:00', end_zeit: '05:00' })
    expect(zweiter.ok).toBe(false)
    expect(zweiter.ok === false && zweiter.message).toMatch(/Doppelbelegung/)
  })

  it('blockiert einen Frühdienst am Folgetag, in den der Nachtdienst hineinragt', async () => {
    expect((await fuege({ datum: '2026-09-10', start_zeit: '22:00', end_zeit: '06:00' })).ok).toBe(true)
    const frueh = await fuege({ datum: '2026-09-11', start_zeit: '05:00', end_zeit: '09:00' })
    expect(frueh.ok).toBe(false)
    expect(frueh.ok === false && frueh.message).toMatch(/Doppelbelegung/)
  })

  it('lässt einen Frühdienst am Folgetag zu, der erst nach dem Nachtdienst beginnt', async () => {
    expect((await fuege({ datum: '2026-09-10', start_zeit: '22:00', end_zeit: '06:00' })).ok).toBe(true)
    expect((await fuege({ datum: '2026-09-11', start_zeit: '06:00', end_zeit: '10:00' })).ok).toBe(true)
  })

  it('blockiert einen Nachtdienst, wenn der Spätdienst des Vortages noch läuft', async () => {
    expect((await fuege({ datum: '2026-09-11', start_zeit: '02:00', end_zeit: '07:00' })).ok).toBe(true)
    const nacht = await fuege({ datum: '2026-09-10', start_zeit: '22:00', end_zeit: '06:00' })
    expect(nacht.ok).toBe(false)
  })

  it('lässt einen Tagdienst am selben Tag NEBEN einem Nachtdienst zu', async () => {
    expect((await fuege({ datum: '2026-09-10', start_zeit: '22:00', end_zeit: '06:00' })).ok).toBe(true)
    // 08:00–12:00 am 10.9. liegt vor dem Nachtdienst-Beginn und nach dessen
    // Ende am Vortag — kein Konflikt.
    expect((await fuege({ datum: '2026-09-10', start_zeit: '08:00', end_zeit: '12:00' })).ok).toBe(true)
  })

  it('behandelt Beginn = Ende als Null-Dienst und blockiert damit nichts', async () => {
    expect((await fuege({ start_zeit: '10:00', end_zeit: '10:00' })).ok).toBe(true)
    expect((await fuege({ start_zeit: '08:00', end_zeit: '12:00' })).ok).toBe(true)
  })

  it('greift über den Mandanten hinweg NICHT (Nachtdienst fremder Org)', async () => {
    expect((await fuege({ organization_id: ORG_B, datum: '2026-09-10', start_zeit: '22:00', end_zeit: '06:00' })).ok).toBe(true)
    expect((await fuege({ organization_id: ORG_A, datum: '2026-09-11', start_zeit: '05:00', end_zeit: '09:00' })).ok).toBe(true)
  })

  // ── Abwesenheit: unverändert ─────────────────────────────────────

  it('blockiert einen Dienst an einem genehmigten Abwesenheitstag', async () => {
    await db.query(
      `INSERT INTO public.absences (organization_id, caregiver_id, status, start_date, end_date)
       VALUES ($1, $2, 'genehmigt', '2026-09-09', '2026-09-12')`,
      [ORG_A, CG_A],
    )
    const res = await fuege({ datum: '2026-09-10' })
    expect(res.ok).toBe(false)
    expect(res.ok === false && res.message).toMatch(/abwesend/)
  })

  it('lässt einen Dienst trotz ABGELEHNTER Abwesenheit zu', async () => {
    await db.query(
      `INSERT INTO public.absences (organization_id, caregiver_id, status, start_date, end_date)
       VALUES ($1, $2, 'abgelehnt', '2026-09-09', '2026-09-12')`,
      [ORG_A, CG_A],
    )
    expect((await fuege({ datum: '2026-09-10' })).ok).toBe(true)
  })
})
