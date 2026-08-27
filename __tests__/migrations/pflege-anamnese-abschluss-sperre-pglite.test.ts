/**
 * PGlite: Anamnese-Abschluss-Sperre haerten (Migration 20261009000004)
 *
 * lib/pflege/anamnesen.ts:updateAnamnese() verweigert seit Commit a111471
 * jede Bearbeitung ab `status = 'abgeschlossen'` — aber nur, wenn der
 * Schreibzugriff durch dieses Modul laeuft. Der urspruengliche DB-Trigger
 * (prevent_locked_anamnese_edit, 20260810010000) blockte ausschliesslich
 * `gesperrt = true`. Ein direkter PostgREST-/service_role-Zugriff unter
 * Umgehung von lib/pflege/anamnesen.ts konnte eine abgeschlossene, aber noch
 * nicht gesperrte Anamnese bislang unveraendert durchschreiben.
 *
 * Bewusst NUR die Tabellenstruktur nachgebaut (Spalten aus
 * 20260810010000_pflegedokumentation.sql), ohne RLS/Policies — analog
 * __tests__/migrations/vitalwerte-plausibilitaet-pglite.test.ts.
 *
 * Prueft:
 *   1. Im Entwurf sind Feldaenderungen erlaubt
 *   2. Der Uebergang entwurf → abgeschlossen (der Statuswechsel selbst) ist erlaubt
 *   3. Danach blockt der Trigger jede weitere Aenderung, obwohl gesperrt=false ist
 *   4. Der vorgesehene Uebergang abgeschlossen → gesperrt bleibt moeglich
 *   5. gesperrt bleibt weiterhin die staerkste Sperre (Regressionsschutz)
 *   6. Rollback stellt den alten (schwaecheren) Triggerstand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20261009000004_pflege_anamnese_abschluss_sperre_haertung.sql'
const ROLLBACK = '20261009000005_rollback_pflege_anamnese_abschluss_sperre_haertung.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const CLIENT = '00000000-0000-4000-8000-0000000000ba'
const USER = '00000000-0000-4000-8000-0000000000ca'
const ANAMNESE = '00000000-0000-4000-8000-0000000000d1'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

// Nachgebaute Tabellenstruktur aus 20260810010000_pflegedokumentation.sql —
// ohne FKs/RLS, nur die für den Sperr-Trigger relevanten Spalten.
const TABELLE = `
  CREATE TABLE public.pflege_anamnesen (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL,
    client_id        uuid NOT NULL,
    anamnese_typ     text NOT NULL DEFAULT 'erstanamnese',
    erhoben_von      uuid NOT NULL,
    zusammenfassung  text,
    status           text NOT NULL DEFAULT 'entwurf',
    abgeschlossen_am timestamptz,
    gesperrt         boolean NOT NULL DEFAULT false,
    erstellt_von     uuid NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pflege_anamnesen_status_check CHECK (status IN ('entwurf','abgeschlossen','gesperrt'))
  );

  -- Urspruenglicher (schwächerer) Trigger aus 20260810010000 — die
  -- Härtungsmigration ersetzt die Funktion per CREATE OR REPLACE.
  CREATE OR REPLACE FUNCTION prevent_locked_anamnese_edit()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
      RAISE EXCEPTION 'Gesperrte Anamnese kann nicht bearbeitet werden.';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER trg_locked_anamnese BEFORE UPDATE ON public.pflege_anamnesen
    FOR EACH ROW EXECUTE FUNCTION prevent_locked_anamnese_edit();
`

async function neueAnamnese(target: InstanceType<typeof PGlite>, id: string) {
  await target.query(
    `INSERT INTO public.pflege_anamnesen (id, organization_id, client_id, erhoben_von, erstellt_von)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, ORG, CLIENT, USER] as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(TABELLE)
  await db.exec(migration(HAERTUNG))
  await neueAnamnese(db, ANAMNESE)
})

afterAll(async () => {
  await db?.close()
})

describe('Entwurf — Änderungen sind erlaubt', () => {
  it('Feldänderungen im Entwurf gehen durch', async () => {
    await expect(
      db.query(`UPDATE public.pflege_anamnesen SET zusammenfassung = 'Entwurfsnotiz' WHERE id = $1`, [ANAMNESE] as never[]),
    ).resolves.toBeDefined()
  })
})

describe('Abschluss — direkter DB-Write ohne lib/pflege wird blockiert', () => {
  it('markiert die Anamnese als abgeschlossen (der erlaubte Statuswechsel selbst)', async () => {
    await expect(
      db.query(
        `UPDATE public.pflege_anamnesen SET status = 'abgeschlossen', abgeschlossen_am = now() WHERE id = $1`,
        [ANAMNESE] as never[],
      ),
    ).resolves.toBeDefined()
  })

  it('blockt ein weiteres Update, obwohl gesperrt = false ist', async () => {
    await expect(
      db.query(`UPDATE public.pflege_anamnesen SET zusammenfassung = 'nachträglich' WHERE id = $1`, [ANAMNESE] as never[]),
    ).rejects.toThrow(/abgeschlossene anamnese/i)
  })
})

describe('Vorgesehener Statuswechsel bleibt möglich', () => {
  it('abgeschlossen → gesperrt ändert Status UND gesperrt in einem Schritt', async () => {
    await expect(
      db.query(
        `UPDATE public.pflege_anamnesen SET status = 'gesperrt', gesperrt = true WHERE id = $1`,
        [ANAMNESE] as never[],
      ),
    ).resolves.toBeDefined()
  })

  it('gesperrt bleibt weiterhin die stärkste Sperre (Regressionsschutz)', async () => {
    await expect(
      db.query(`UPDATE public.pflege_anamnesen SET zusammenfassung = 'x' WHERE id = $1`, [ANAMNESE] as never[]),
    ).rejects.toThrow(/gesperrt/i)
  })
})

describe('Rollback', () => {
  it('stellt den schwächeren Vorzustand wieder her (nur gesperrt blockt, abgeschlossen nicht mehr)', async () => {
    const eigene = new PGlite()
    try {
      await eigene.exec(TABELLE)
      await eigene.exec(migration(HAERTUNG))
      await eigene.exec(migration(ROLLBACK))

      const id = '00000000-0000-4000-8000-0000000000d9'
      await neueAnamnese(eigene, id)
      await eigene.query(
        `UPDATE public.pflege_anamnesen SET status = 'abgeschlossen', abgeschlossen_am = now() WHERE id = $1`,
        [id] as never[],
      )

      // Nach dem Rollback ist die Härtung weg: Direkt-Write auf 'abgeschlossen' geht wieder durch.
      await expect(
        eigene.query(`UPDATE public.pflege_anamnesen SET zusammenfassung = 'nach rollback erlaubt' WHERE id = $1`, [id] as never[]),
      ).resolves.toBeDefined()

      // gesperrt blockt weiterhin (unverändert seit der Basis-Migration).
      await eigene.query(`UPDATE public.pflege_anamnesen SET status = 'gesperrt', gesperrt = true WHERE id = $1`, [id] as never[])
      await expect(
        eigene.query(`UPDATE public.pflege_anamnesen SET zusammenfassung = 'x' WHERE id = $1`, [id] as never[]),
      ).rejects.toThrow(/gesperrt/i)
    } finally {
      await eigene.close()
    }
  })
})
