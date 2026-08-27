/**
 * PGlite: Abgesetzte Medikamente auch DB-seitig sperren (Migration 20261010000000)
 *
 * lib/medikamente/medikamente.ts:aktualisiereMedikament() verweigert seit
 * Commit df0d24e jede Bearbeitung eines abgesetzten Medikaments — aber nur,
 * wenn der Schreibzugriff durch dieses Modul läuft. Die Tabelle medikamente
 * hatte zuvor GAR KEINEN Trigger. Ein direkter PostgREST-/service_role-
 * Zugriff unter Umgehung von lib/medikamente/medikamente.ts konnte Name,
 * Dosierung etc. eines abgesetzten Medikaments bislang unverändert
 * durchschreiben.
 *
 * Bewusst NUR die Tabellenstruktur nachgebaut (Spalten aus
 * 20260820010000_medikamentenmanagement.sql), ohne RLS/Policies — analog
 * __tests__/migrations/pflege-anamnese-abschluss-sperre-pglite.test.ts.
 *
 * Prüft:
 *   1. Klinische Felder lassen sich bei aktivem Medikament ändern
 *   2. Absetzen (status → 'abgesetzt') ist der erlaubte Statuswechsel selbst
 *   3. Danach blockt der Trigger Änderungen an klinischen Feldern
 *   4. Eine reine Korrektur von abgesetzt_grund/-datum bei UNVERÄNDERTEM
 *      Status bleibt erlaubt (setzeMedikamentStatus-Anwendungsfall)
 *   5. Reaktivierung (status → 'aktiv') bleibt möglich, danach wieder frei editierbar
 *   6. Rollback stellt den trigger-losen Ausgangszustand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20261010000000_medikamente_abgesetzt_sperre_db.sql'
const ROLLBACK = '20261010000001_rollback_medikamente_abgesetzt_sperre_db.sql'

const CLIENT = '00000000-0000-4000-8000-0000000000ba'
const MED = '00000000-0000-4000-8000-0000000000d1'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

// Nachgebaute Tabellenstruktur aus 20260820010000_medikamentenmanagement.sql —
// ohne FKs/RLS, nur die für den Sperr-Trigger relevanten Spalten.
const TABELLE = `
  CREATE TABLE public.medikamente (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        uuid NOT NULL,
    organization_id  uuid NOT NULL,
    medikament_name  text NOT NULL,
    wirkstoff        text,
    pzn              text,
    kategorie        text NOT NULL DEFAULT 'sonstige',
    darreichungsform text,
    dosierung        text NOT NULL,
    einheit          text NOT NULL DEFAULT 'mg',
    einnahme_morgens boolean NOT NULL DEFAULT false,
    einnahme_mittags boolean NOT NULL DEFAULT false,
    einnahme_abends  boolean NOT NULL DEFAULT false,
    einnahme_nachts  boolean NOT NULL DEFAULT false,
    einnahme_hinweis text,
    verordnet_von    text,
    beginn_datum     date,
    end_datum        date,
    dauermedikation  boolean NOT NULL DEFAULT true,
    status           text NOT NULL DEFAULT 'aktiv',
    abgesetzt_am     timestamptz,
    abgesetzt_grund  text,
    notizen          text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  );
`

async function neuesMedikament(target: InstanceType<typeof PGlite>, id: string) {
  await target.query(
    `INSERT INTO public.medikamente (id, client_id, organization_id, medikament_name, dosierung, einnahme_morgens)
     VALUES ($1, $2, $2, 'Ramipril', '5mg', true)`,
    [id, CLIENT] as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(TABELLE)
  await db.exec(migration(HAERTUNG))
  await neuesMedikament(db, MED)
})

afterAll(async () => {
  await db?.close()
})

describe('Aktiv — Änderungen sind erlaubt', () => {
  it('klinische Felder lassen sich bei aktivem Medikament ändern', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET dosierung = '10mg' WHERE id = $1`, [MED] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Abgesetzt — direkter DB-Write ohne lib/medikamente wird blockiert', () => {
  it('markiert das Medikament als abgesetzt (der erlaubte Statuswechsel selbst)', async () => {
    await expect(
      db.query(
        `UPDATE public.medikamente SET status = 'abgesetzt', abgesetzt_am = now(), abgesetzt_grund = 'Arzt umgestellt' WHERE id = $1`,
        [MED] as never[],
      ),
    ).resolves.toBeDefined()
  })

  it('blockt eine Änderung der Dosierung, obwohl der Status unverändert bleibt', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET dosierung = '20mg' WHERE id = $1`, [MED] as never[]),
    ).rejects.toThrow(/abgesetztes medikament/i)
  })

  it('blockt eine Änderung der Einnahmezeiten', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET einnahme_abends = true WHERE id = $1`, [MED] as never[]),
    ).rejects.toThrow(/abgesetztes medikament/i)
  })

  it('erlaubt die Korrektur von abgesetzt_grund bei unverändertem Status (setzeMedikamentStatus-Fall)', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET abgesetzt_grund = 'Korrigierter Grund' WHERE id = $1`, [MED] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Reaktivierung bleibt möglich', () => {
  it('status → aktiv ändert den Status selbst', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET status = 'aktiv', abgesetzt_am = null, abgesetzt_grund = null WHERE id = $1`, [MED] as never[]),
    ).resolves.toBeDefined()
  })

  it('danach sind klinische Felder wieder frei editierbar', async () => {
    await expect(
      db.query(`UPDATE public.medikamente SET dosierung = '15mg' WHERE id = $1`, [MED] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Rollback', () => {
  it('stellt den trigger-losen Ausgangszustand wieder her', async () => {
    const eigene = new PGlite()
    try {
      await eigene.exec(TABELLE)
      await eigene.exec(migration(HAERTUNG))
      await eigene.exec(migration(ROLLBACK))

      const id = '00000000-0000-4000-8000-0000000000d9'
      await neuesMedikament(eigene, id)
      await eigene.query(
        `UPDATE public.medikamente SET status = 'abgesetzt', abgesetzt_am = now(), abgesetzt_grund = 'x' WHERE id = $1`,
        [id] as never[],
      )

      // Nach dem Rollback ist die Härtung weg: Direkt-Write auf ein abgesetztes Medikament geht wieder durch.
      await expect(
        eigene.query(`UPDATE public.medikamente SET dosierung = 'nach rollback erlaubt' WHERE id = $1`, [id] as never[]),
      ).resolves.toBeDefined()
    } finally {
      await eigene.close()
    }
  })
})
