/**
 * PGlite: DB-Trigger `check_assignment_overlap` (Migration 20260808200000)
 *
 * `lib/einsatzplanung/konflikte.ts` bildet die Semantik dieses Triggers in
 * reinem TypeScript nach, damit der Planende eine verständliche Meldung VOR
 * dem Speichern sieht. Diese Nachbildung ist wertlos, wenn niemand geprüft
 * hat, dass der Trigger selbst noch das tut, wonach er benannt ist — die
 * bisherigen Unit-Tests prüfen nur die TS-Kopie, nie die echte SQL-Funktion
 * gegen eine echte (In-Memory-)Postgres-Instanz.
 *
 * Getestet wird die WORTGLEICHE Funktion aus der Migration:
 *   1. Datierte Einsätze: Überlappung derselben Betreuungskraft blockiert
 *   2. Datierte Einsätze: keine Überlappung / andere Kraft ⇒ erlaubt
 *   3. Serien (weekday): Überlappung nur bei Wochentag- UND Gültigkeits-
 *      fenster-Überschneidung
 *   4. Serie vs. datierter Einsatz: der Trigger prüft NIE über den Zweig
 *      hinweg (das ist die Lücke, die `konflikte.ts` bewusst offen lässt)
 *   5. STORNIERT/cancelled/NO_SHOW zählen nicht mit
 *   6. UPDATE zählt den eigenen Datensatz nicht als Konflikt mit sich selbst
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20260808200000_einsatzplanung_leistungsnachweise.sql'

const CG_A = '00000000-0000-4000-8000-0000000000c1'
const CG_B = '00000000-0000-4000-8000-0000000000c2'

const SCHEMA = `
CREATE TABLE public.assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id    uuid,
  client_id       uuid,
  status          text NOT NULL DEFAULT 'GEPLANT',
  assignment_date date,
  weekday         integer,
  start_time      time,
  end_time        time,
  valid_from      date,
  valid_until     date
);
`

function extrahiereTrigger(sql: string): string {
  const start = sql.indexOf('DROP TRIGGER IF EXISTS trg_check_assignment_overlap')
  if (start === -1) throw new Error('Trigger trg_check_assignment_overlap nicht gefunden')
  const marker = 'EXECUTE FUNCTION public.check_assignment_overlap();'
  const ende = sql.indexOf(marker, start)
  if (ende === -1) throw new Error('Ende des Triggers trg_check_assignment_overlap nicht gefunden')
  return sql.slice(start, ende + marker.length)
}

describe('DB-Trigger check_assignment_overlap', () => {
  let db: InstanceType<typeof PGlite>

  async function fuege(werte: Record<string, unknown>): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    const basis = {
      caregiver_id: CG_A,
      start_time: '09:00',
      end_time: '11:00',
      status: 'GEPLANT',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.assignments (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING id`,
        Object.values(basis) as never[],
      )
      return { ok: true, id: rows[0].id }
    } catch (e: unknown) {
      return { ok: false, message: String((e as { message?: string })?.message ?? e) }
    }
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    const migration = liesMigration(MIGRATION)
    await db.exec(funktionAusMigration(MIGRATION, 'check_assignment_overlap'))
    await db.exec(extrahiereTrigger(migration))
  })

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec('DELETE FROM public.assignments;')
  })

  describe('datierte Einsätze', () => {
    it('blockiert die Überlappung derselben Betreuungskraft am selben Tag', async () => {
      const erste = await fuege({ assignment_date: '2026-09-01' })
      expect(erste.ok).toBe(true)
      const zweite = await fuege({ assignment_date: '2026-09-01', start_time: '10:00', end_time: '12:00' })
      expect(zweite.ok).toBe(false)
      if (!zweite.ok) expect(zweite.message).toContain('DOPPELBELEGUNG')
    })

    it('erlaubt Berührung an den Rändern (keine echte Überlappung)', async () => {
      await fuege({ assignment_date: '2026-09-01', start_time: '09:00', end_time: '10:00' })
      const zweite = await fuege({ assignment_date: '2026-09-01', start_time: '10:00', end_time: '11:00' })
      expect(zweite.ok).toBe(true)
    })

    it('erlaubt dieselbe Zeit an einem anderen Tag', async () => {
      await fuege({ assignment_date: '2026-09-01' })
      const zweite = await fuege({ assignment_date: '2026-09-02' })
      expect(zweite.ok).toBe(true)
    })

    it('erlaubt Überlappung bei unterschiedlichen Betreuungskräften', async () => {
      await fuege({ assignment_date: '2026-09-01', caregiver_id: CG_A })
      const zweite = await fuege({ assignment_date: '2026-09-01', caregiver_id: CG_B })
      expect(zweite.ok).toBe(true)
    })

    it('zählt stornierte Einsätze nicht mit', async () => {
      await fuege({ assignment_date: '2026-09-01', status: 'STORNIERT' })
      const zweite = await fuege({ assignment_date: '2026-09-01' })
      expect(zweite.ok).toBe(true)
    })

    it('blockiert ein UPDATE, das eine Überlappung neu herstellt', async () => {
      await fuege({ assignment_date: '2026-09-01', start_time: '09:00', end_time: '10:00' })
      const zweite = await fuege({ assignment_date: '2026-09-01', start_time: '14:00', end_time: '15:00' })
      expect(zweite.ok).toBe(true)
      if (!zweite.ok) return
      await expect(
        db.query(`UPDATE public.assignments SET start_time = '09:30', end_time = '10:30' WHERE id = $1`, [zweite.id]),
      ).rejects.toThrow(/DOPPELBELEGUNG/)
    })

    it('lässt ein UPDATE ohne Zeitänderung nicht am eigenen Datensatz scheitern', async () => {
      const erste = await fuege({ assignment_date: '2026-09-01' })
      expect(erste.ok).toBe(true)
      if (!erste.ok) return
      await expect(
        db.query(`UPDATE public.assignments SET status = 'BESTAETIGT' WHERE id = $1`, [erste.id]),
      ).resolves.toBeDefined()
    })
  })

  describe('Serien (weekday statt assignment_date)', () => {
    it('blockiert zwei Serien am selben Wochentag mit überlappender Zeit und Gültigkeit', async () => {
      await fuege({ assignment_date: null, weekday: 1, valid_from: '2026-01-01', valid_until: '2026-06-30' })
      const zweite = await fuege({
        assignment_date: null, weekday: 1, start_time: '10:00', end_time: '12:00',
        valid_from: '2026-06-01', valid_until: '2026-12-31',
      })
      expect(zweite.ok).toBe(false)
      if (!zweite.ok) expect(zweite.message).toContain('DOPPELBELEGUNG')
    })

    it('erlaubt zwei Serien am selben Wochentag mit disjunkten Gültigkeitsfenstern', async () => {
      await fuege({ assignment_date: null, weekday: 1, valid_from: '2026-01-01', valid_until: '2026-03-31' })
      const zweite = await fuege({ assignment_date: null, weekday: 1, valid_from: '2026-04-01', valid_until: '2026-06-30' })
      expect(zweite.ok).toBe(true)
    })

    it('erlaubt zwei Serien an unterschiedlichen Wochentagen trotz überlappender Gültigkeit', async () => {
      await fuege({ assignment_date: null, weekday: 1, valid_from: '2026-01-01', valid_until: '2026-12-31' })
      const zweite = await fuege({ assignment_date: null, weekday: 2, valid_from: '2026-01-01', valid_until: '2026-12-31' })
      expect(zweite.ok).toBe(true)
    })

    it('prüft eine Serie NIE gegen einen datierten Einsatz (getrennte Zweige)', async () => {
      // Genau die Lücke, die konflikte.ts bewusst offen lässt: der Trigger
      // selbst verknüpft die beiden Zweige nicht.
      await fuege({ assignment_date: '2026-09-07' }) // ein Montag
      const serie = await fuege({ assignment_date: null, weekday: 1 })
      expect(serie.ok).toBe(true)
    })
  })
})
