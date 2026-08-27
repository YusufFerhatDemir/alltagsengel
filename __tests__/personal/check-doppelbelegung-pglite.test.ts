/**
 * PGlite: DB-Trigger `check_doppelbelegung` (Migration 20260811010000,
 * TEIL 7 — dienstplan_eintraege).
 *
 * `lib/personal/dienstplan.ts` übersetzt nur die rohe Fehlermeldung dieses
 * Triggers in einen UserFacingError (String-Match auf "Doppelbelegung"/
 * "Konflikt") — die eigentliche Prüflogik (Zeitüberlappung, Abwesenheits-
 * Join) steckt ausschließlich im Trigger und war bisher durch keinen Test
 * gegen eine echte Postgres-Instanz abgesichert. Ein kaputter Trigger hätte
 * sich erst live gezeigt.
 *
 * Getestet wird die WORTGLEICHE Funktion aus der Migration:
 *   1. Doppelbelegung derselben Betreuungskraft am selben Tag blockiert
 *   2. Keine Überlappung / andere Kraft / anderer Tag ⇒ erlaubt
 *   3. status='ausgefallen' nimmt sich selbst aus der Prüfung
 *   4. Genehmigte/beantragte Abwesenheit blockiert einen neuen Diensteintrag
 *   5. status IN ('ausgefallen','vertretung') übersteuert die Abwesenheits-
 *      prüfung bewusst (Vertretung IST die Reaktion auf die Abwesenheit)
 *   6. Andere Abwesenheits-Status (storniert/abgelehnt) blockieren nicht
 *   7. Die Prüfung ist mandantenscharf (organization_id)
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20260811010000_personalmanagement.sql'

const ORG_A = '00000000-0000-4000-8000-0000000000a1'
const ORG_B = '00000000-0000-4000-8000-0000000000a2'
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
  status          text NOT NULL DEFAULT 'geplant'
);

CREATE TABLE public.absences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  caregiver_id    uuid,
  start_date      date NOT NULL,
  end_date        date,
  status          text
);
`

function extrahiereFunktionOhneSchema(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}()`)
  if (start === -1) throw new Error(`Funktion ${name} nicht in der Migration gefunden`)
  const marker = '$$ LANGUAGE plpgsql;'
  const ende = sql.indexOf(marker, start)
  if (ende === -1) throw new Error(`Funktionsende fuer ${name} nicht gefunden`)
  return sql.slice(start, ende + marker.length)
}

function extrahiereTrigger(sql: string, triggerName: string, funktionsName: string): string {
  const start = sql.indexOf(`DROP TRIGGER IF EXISTS ${triggerName}`)
  if (start === -1) throw new Error(`Trigger ${triggerName} nicht gefunden`)
  const marker = `EXECUTE FUNCTION ${funktionsName}();`
  const ende = sql.indexOf(marker, start)
  if (ende === -1) throw new Error(`Ende des Triggers ${triggerName} nicht gefunden`)
  return sql.slice(start, ende + marker.length)
}

describe('DB-Trigger check_doppelbelegung', () => {
  let db: InstanceType<typeof PGlite>

  async function eintrag(werte: Record<string, unknown>): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    const basis = {
      organization_id: ORG_A,
      datum: '2026-09-01',
      caregiver_id: CG_A,
      start_zeit: '09:00',
      end_zeit: '11:00',
      status: 'geplant',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO public.dienstplan_eintraege (${spalten.join(', ')}) VALUES (${platzhalter}) RETURNING id`,
        Object.values(basis) as never[],
      )
      return { ok: true, id: rows[0].id }
    } catch (e: unknown) {
      return { ok: false, message: String((e as { message?: string })?.message ?? e) }
    }
  }

  async function abwesenheit(werte: Record<string, unknown>) {
    const basis = {
      organization_id: ORG_A,
      caregiver_id: CG_A,
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'genehmigt',
      ...werte,
    }
    const spalten = Object.keys(basis)
    const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
    await db.query(
      `INSERT INTO public.absences (${spalten.join(', ')}) VALUES (${platzhalter})`,
      Object.values(basis) as never[],
    )
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
    const migration = liesMigration(MIGRATION)
    await db.exec(extrahiereFunktionOhneSchema(migration, 'check_doppelbelegung'))
    await db.exec(extrahiereTrigger(migration, 'trg_check_doppelbelegung', 'check_doppelbelegung'))
  })

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec('DELETE FROM public.dienstplan_eintraege;')
    await db.exec('DELETE FROM public.absences;')
  })

  describe('Zeitüberlappung', () => {
    it('blockiert die Überlappung derselben Betreuungskraft am selben Tag', async () => {
      await eintrag({})
      const zweiter = await eintrag({ start_zeit: '10:00', end_zeit: '12:00' })
      expect(zweiter.ok).toBe(false)
      if (!zweiter.ok) expect(zweiter.message).toContain('Doppelbelegung')
    })

    it('erlaubt Berührung an den Rändern', async () => {
      await eintrag({ start_zeit: '09:00', end_zeit: '10:00' })
      const zweiter = await eintrag({ start_zeit: '10:00', end_zeit: '11:00' })
      expect(zweiter.ok).toBe(true)
    })

    it('erlaubt Überlappung bei unterschiedlichen Betreuungskräften', async () => {
      await eintrag({ caregiver_id: CG_A })
      const zweiter = await eintrag({ caregiver_id: CG_B })
      expect(zweiter.ok).toBe(true)
    })

    it('erlaubt dieselbe Zeit an einem anderen Tag', async () => {
      await eintrag({ datum: '2026-09-01' })
      const zweiter = await eintrag({ datum: '2026-09-02' })
      expect(zweiter.ok).toBe(true)
    })

    it('nimmt einen ausgefallenen Diensteintrag von der Prüfung aus', async () => {
      await eintrag({ status: 'ausgefallen' })
      const zweiter = await eintrag({})
      expect(zweiter.ok).toBe(true)
    })

    it('ist mandantenscharf: gleiche Kraft/Zeit, andere Organisation blockiert nicht', async () => {
      await eintrag({ organization_id: ORG_A })
      const zweiter = await eintrag({ organization_id: ORG_B })
      expect(zweiter.ok).toBe(true)
    })
  })

  describe('Abwesenheitskonflikt', () => {
    it('blockiert einen neuen Diensteintrag bei genehmigter Abwesenheit', async () => {
      await abwesenheit({ status: 'genehmigt' })
      const eintrag1 = await eintrag({})
      expect(eintrag1.ok).toBe(false)
      if (!eintrag1.ok) expect(eintrag1.message).toContain('Konflikt')
    })

    it('blockiert auch bei nur beantragter Abwesenheit', async () => {
      await abwesenheit({ status: 'beantragt' })
      const eintrag1 = await eintrag({})
      expect(eintrag1.ok).toBe(false)
    })

    it('lässt eine Vertretung trotz Abwesenheit zu', async () => {
      await abwesenheit({ status: 'genehmigt' })
      const eintrag1 = await eintrag({ status: 'vertretung' })
      expect(eintrag1.ok).toBe(true)
    })

    it('lässt einen als ausgefallen markierten Eintrag trotz Abwesenheit zu', async () => {
      await abwesenheit({ status: 'genehmigt' })
      const eintrag1 = await eintrag({ status: 'ausgefallen' })
      expect(eintrag1.ok).toBe(true)
    })

    it('blockiert nicht bei stornierter/abgelehnter Abwesenheit', async () => {
      await abwesenheit({ status: 'storniert' })
      const eintrag1 = await eintrag({})
      expect(eintrag1.ok).toBe(true)
    })

    it('ist mandantenscharf: Abwesenheit in anderer Organisation blockiert nicht', async () => {
      await abwesenheit({ organization_id: ORG_B })
      const eintrag1 = await eintrag({ organization_id: ORG_A })
      expect(eintrag1.ok).toBe(true)
    })
  })
})
