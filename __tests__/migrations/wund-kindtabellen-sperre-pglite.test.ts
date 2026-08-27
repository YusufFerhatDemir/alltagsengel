/**
 * PGlite: Wund-Kindtabellen bei abgeheilter Wunde auch DB-seitig sperren
 * (Migration 20261010000002)
 *
 * lib/wunden/{assessments,behandlungen,fotos}.ts verweigern seit Commit
 * 2a3ebb2 das Anlegen neuer Verlaufsdaten für eine abgeheilte Wunde — aber
 * nur, wenn der Schreibzugriff durch diese Module läuft. Die Tabellen
 * wound_assessments/wound_treatments/wound_photos hatten zuvor KEINEN
 * Trigger. Ein direkter PostgREST-/service_role-Zugriff unter Umgehung
 * dieser Module konnte bislang unverändert neue Verlaufsdaten für eine
 * abgeheilte Wunde anlegen.
 *
 * Bewusst NUR die Tabellenstruktur nachgebaut (Spalten aus
 * 20260818030000_wunddokumentation.sql), ohne RLS/Policies — analog
 * __tests__/migrations/pflege-anamnese-abschluss-sperre-pglite.test.ts.
 *
 * Prüft:
 *   1. Bei aktiver Wunde lassen sich Assessment/Behandlung/Foto anlegen
 *   2. Sobald die Wunde 'abgeheilt' ist, blockt der Trigger INSERT auf allen drei Kindtabellen
 *   3. UPDATE/DELETE auf bestehende Kindzeilen werden bei abgeheilter Wunde ebenfalls geblockt
 *   4. Reaktivierung der Wunde (status zurück auf 'aktiv') macht die Kindtabellen wieder beschreibbar
 *   5. Rollback stellt den trigger-losen Ausgangszustand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20261010000002_wund_kindtabellen_sperre_db.sql'
const ROLLBACK = '20261010000003_rollback_wund_kindtabellen_sperre_db.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const USER = '00000000-0000-4000-8000-0000000000ca'
const WUNDE = '00000000-0000-4000-8000-0000000000e1'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

// Nachgebaute Tabellenstruktur aus 20260818030000_wunddokumentation.sql —
// ohne RLS, nur die für den Sperr-Trigger relevanten Spalten.
const TABELLEN = `
  CREATE TABLE public.wounds (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    client_id       uuid NOT NULL,
    status          text NOT NULL DEFAULT 'aktiv'
  );

  CREATE TABLE public.wound_assessments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    wound_id        uuid NOT NULL REFERENCES public.wounds(id),
    erhoben_am      timestamptz NOT NULL DEFAULT now(),
    erhoben_von     uuid NOT NULL
  );

  CREATE TABLE public.wound_treatments (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    uuid NOT NULL,
    wound_id           uuid NOT NULL REFERENCES public.wounds(id),
    durchgefuehrt_am   timestamptz NOT NULL DEFAULT now(),
    durchgefuehrt_von  uuid NOT NULL,
    massnahme          text NOT NULL
  );

  CREATE TABLE public.wound_photos (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    wound_id        uuid NOT NULL REFERENCES public.wounds(id),
    dateipfad       text NOT NULL,
    aufgenommen_von uuid NOT NULL
  );
`

beforeAll(async () => {
  db = new PGlite()
  await db.exec(TABELLEN)
  await db.exec(migration(HAERTUNG))
  await db.query(
    `INSERT INTO public.wounds (id, organization_id, client_id, status) VALUES ($1, $2, $2, 'aktiv')`,
    [WUNDE, ORG] as never[],
  )
})

afterAll(async () => {
  await db?.close()
})

describe('Aktive Wunde — Anlegen ist erlaubt', () => {
  it('Assessment/Behandlung/Foto lassen sich bei aktiver Wunde anlegen', async () => {
    await expect(
      db.query(`INSERT INTO public.wound_assessments (organization_id, wound_id, erhoben_von) VALUES ($1, $2, $3)`,
        [ORG, WUNDE, USER] as never[]),
    ).resolves.toBeDefined()
    await expect(
      db.query(`INSERT INTO public.wound_treatments (organization_id, wound_id, durchgefuehrt_von, massnahme) VALUES ($1, $2, $3, 'Verbandwechsel')`,
        [ORG, WUNDE, USER] as never[]),
    ).resolves.toBeDefined()
    await expect(
      db.query(`INSERT INTO public.wound_photos (organization_id, wound_id, dateipfad, aufgenommen_von) VALUES ($1, $2, 'foto.jpg', $3)`,
        [ORG, WUNDE, USER] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Abgeheilte Wunde — direkter DB-Write ohne lib/wunden wird blockiert', () => {
  it('markiert die Wunde als abgeheilt', async () => {
    await expect(
      db.query(`UPDATE public.wounds SET status = 'abgeheilt' WHERE id = $1`, [WUNDE] as never[]),
    ).resolves.toBeDefined()
  })

  it('blockt ein neues Assessment', async () => {
    await expect(
      db.query(`INSERT INTO public.wound_assessments (organization_id, wound_id, erhoben_von) VALUES ($1, $2, $3)`,
        [ORG, WUNDE, USER] as never[]),
    ).rejects.toThrow(/abgeheilt/i)
  })

  it('blockt einen neuen Verbandwechsel', async () => {
    await expect(
      db.query(`INSERT INTO public.wound_treatments (organization_id, wound_id, durchgefuehrt_von, massnahme) VALUES ($1, $2, $3, 'x')`,
        [ORG, WUNDE, USER] as never[]),
    ).rejects.toThrow(/abgeheilt/i)
  })

  it('blockt ein neues Foto', async () => {
    await expect(
      db.query(`INSERT INTO public.wound_photos (organization_id, wound_id, dateipfad, aufgenommen_von) VALUES ($1, $2, 'x.jpg', $3)`,
        [ORG, WUNDE, USER] as never[]),
    ).rejects.toThrow(/abgeheilt/i)
  })

  it('blockt UPDATE und DELETE auf bestehenden Kindzeilen', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM public.wound_treatments WHERE wound_id = $1 LIMIT 1`, [WUNDE] as never[])
    const id = rows[0].id
    await expect(
      db.query(`UPDATE public.wound_treatments SET massnahme = 'geändert' WHERE id = $1`, [id] as never[]),
    ).rejects.toThrow(/abgeheilt/i)
    await expect(
      db.query(`DELETE FROM public.wound_treatments WHERE id = $1`, [id] as never[]),
    ).rejects.toThrow(/abgeheilt/i)
  })
})

describe('Reaktivierung macht die Kindtabellen wieder beschreibbar', () => {
  it('status zurück auf aktiv erlaubt wieder neue Verlaufsdaten', async () => {
    await db.query(`UPDATE public.wounds SET status = 'aktiv' WHERE id = $1`, [WUNDE] as never[])
    await expect(
      db.query(`INSERT INTO public.wound_assessments (organization_id, wound_id, erhoben_von) VALUES ($1, $2, $3)`,
        [ORG, WUNDE, USER] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Rollback', () => {
  it('stellt den trigger-losen Ausgangszustand wieder her', async () => {
    const eigene = new PGlite()
    try {
      await eigene.exec(TABELLEN)
      await eigene.exec(migration(HAERTUNG))
      await eigene.exec(migration(ROLLBACK))

      const id = '00000000-0000-4000-8000-0000000000e9'
      await eigene.query(`INSERT INTO public.wounds (id, organization_id, client_id, status) VALUES ($1, $2, $2, 'abgeheilt')`, [id, ORG] as never[])

      // Nach dem Rollback ist die Härtung weg: neue Kindzeilen für eine abgeheilte Wunde gehen wieder durch.
      await expect(
        eigene.query(`INSERT INTO public.wound_assessments (organization_id, wound_id, erhoben_von) VALUES ($1, $2, $3)`,
          [ORG, id, USER] as never[]),
      ).resolves.toBeDefined()
    } finally {
      await eigene.close()
    }
  })
})
