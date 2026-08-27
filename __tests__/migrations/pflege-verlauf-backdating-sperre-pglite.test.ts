/**
 * PGlite: Rückwirkendes Anlegen von Verlaufseinträgen auch DB-seitig sperren
 * (Migration 20261010000004)
 *
 * lib/pflege/verlauf.ts:createVerlauf() prüft seit Commit c9d403e beim
 * INSERT, ob für Klient+Monat des Eintragsdatums bereits eine abgeschlossene
 * pflege_doku_periode existiert — aber nur, wenn der Schreibzugriff durch
 * dieses Modul läuft. trg_locked_verlauf (Basis-Migration) blockt nur
 * UPDATEs auf bereits gesperrte Zeilen, nicht das rückwirkende Einfügen
 * neuer, unversperrter Zeilen.
 *
 * Bewusst NUR die Tabellenstruktur nachgebaut (Spalten aus
 * 20260810010000_pflegedokumentation.sql), ohne RLS/Policies — analog
 * __tests__/migrations/pflege-anamnese-abschluss-sperre-pglite.test.ts.
 *
 * Prüft:
 *   1. Ohne passende Periode ist das Einfügen erlaubt
 *   2. Mit einer OFFENEN Periode für Klient+Monat ist das Einfügen erlaubt
 *   3. Mit einer ABGESCHLOSSENEN Periode für Klient+Monat wird das Einfügen blockiert
 *   4. Ein Eintrag in einem ANDEREN Monat bleibt von der abgeschlossenen Periode unberührt
 *   5. Rollback stellt den ursprünglichen (nur UPDATE-blockenden) Zustand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20261010000004_pflege_verlauf_backdating_sperre_db.sql'
const ROLLBACK = '20261010000005_rollback_pflege_verlauf_backdating_sperre_db.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const CLIENT = '00000000-0000-4000-8000-0000000000ba'
const AUTOR = '00000000-0000-4000-8000-0000000000ca'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

// Nachgebaute Tabellenstruktur aus 20260810010000_pflegedokumentation.sql —
// ohne RLS, nur die für den Sperr-Trigger relevanten Spalten.
const TABELLEN = `
  CREATE TABLE public.pflege_doku_perioden (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    client_id       uuid NOT NULL,
    jahr            int NOT NULL,
    monat           int NOT NULL,
    status          text NOT NULL DEFAULT 'offen'
  );

  CREATE TABLE public.pflege_verlauf (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    client_id       uuid NOT NULL,
    eintrag_datum   timestamptz NOT NULL DEFAULT now(),
    inhalt          text NOT NULL,
    autor_id        uuid NOT NULL,
    gesperrt        boolean NOT NULL DEFAULT false
  );
`

async function eintragen(target: InstanceType<typeof PGlite>, datum: string) {
  return target.query(
    `INSERT INTO public.pflege_verlauf (organization_id, client_id, eintrag_datum, inhalt, autor_id) VALUES ($1, $2, $3, 'Test', $4)`,
    [ORG, CLIENT, datum, AUTOR] as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(TABELLEN)
  await db.exec(migration(HAERTUNG))
})

afterAll(async () => {
  await db?.close()
})

describe('Ohne passende Periode', () => {
  it('Einfügen ist erlaubt', async () => {
    await expect(eintragen(db, '2026-05-15T10:00:00.000Z')).resolves.toBeDefined()
  })
})

describe('Mit offener Periode', () => {
  it('Einfügen bleibt erlaubt', async () => {
    await db.query(
      `INSERT INTO public.pflege_doku_perioden (organization_id, client_id, jahr, monat, status) VALUES ($1, $2, 2026, 6, 'offen')`,
      [ORG, CLIENT] as never[],
    )
    await expect(eintragen(db, '2026-06-15T10:00:00.000Z')).resolves.toBeDefined()
  })
})

describe('Mit abgeschlossener Periode', () => {
  it('blockt das rückwirkende Einfügen für denselben Monat', async () => {
    await db.query(
      `INSERT INTO public.pflege_doku_perioden (organization_id, client_id, jahr, monat, status) VALUES ($1, $2, 2026, 7, 'abgeschlossen')`,
      [ORG, CLIENT] as never[],
    )
    await expect(eintragen(db, '2026-07-15T10:00:00.000Z')).rejects.toThrow(/abgeschlossen/i)
  })

  it('lässt einen Eintrag im NÄCHSTEN Monat unberührt', async () => {
    await expect(eintragen(db, '2026-08-01T00:00:00.000Z')).resolves.toBeDefined()
  })

  it('lässt einen Eintrag für einen ANDEREN Klienten unberührt', async () => {
    const andererClient = '00000000-0000-4000-8000-0000000000bb'
    await expect(
      db.query(
        `INSERT INTO public.pflege_verlauf (organization_id, client_id, eintrag_datum, inhalt, autor_id) VALUES ($1, $2, '2026-07-15T10:00:00.000Z', 'Test', $3)`,
        [ORG, andererClient, AUTOR] as never[],
      ),
    ).resolves.toBeDefined()
  })
})

describe('Rollback', () => {
  it('stellt den ursprünglichen Zustand wieder her (Backdating wieder möglich)', async () => {
    const eigene = new PGlite()
    try {
      await eigene.exec(TABELLEN)
      await eigene.exec(migration(HAERTUNG))
      await eigene.exec(migration(ROLLBACK))

      await eigene.query(
        `INSERT INTO public.pflege_doku_perioden (organization_id, client_id, jahr, monat, status) VALUES ($1, $2, 2026, 3, 'abgeschlossen')`,
        [ORG, CLIENT] as never[],
      )
      await expect(
        eigene.query(
          `INSERT INTO public.pflege_verlauf (organization_id, client_id, eintrag_datum, inhalt, autor_id) VALUES ($1, $2, '2026-03-15T10:00:00.000Z', 'nach rollback erlaubt', $3)`,
          [ORG, CLIENT, AUTOR] as never[],
        ),
      ).resolves.toBeDefined()
    } finally {
      await eigene.close()
    }
  })
})
