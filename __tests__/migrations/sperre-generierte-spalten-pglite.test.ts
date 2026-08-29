/**
 * PGlite: die Sperre und die generierte Spalte (Migration 20260829200000)
 *
 * HINTERGRUND
 * ───────────
 * `prevent_locked_record_change` laesst seit 20260829011500 genau einen Weg
 * durch die Sperre: den Statuswechsel `signed`/`complete` -> `invoiced` bei
 * sonst unveraenderter Zeile. Geprueft wird das ueber
 * `to_jsonb(OLD) - 'status' - 'updated_at' = to_jsonb(NEW) - …`.
 *
 * Der Weg war trotzdem zu. `service_records.duration_minutes` ist eine
 * GENERIERTE Spalte, und PostgreSQL berechnet generierte Spalten erst NACH
 * den BEFORE-Triggern: in OLD steht der gespeicherte Wert, in NEW steht
 * NULL. Der Vergleich findet damit IMMER einen Unterschied — unabhaengig
 * davon, was die UPDATE-Anweisung wirklich setzt.
 *
 * Genau diese Stelle ist mit blossem Lesen nicht zu finden: der Quelltext
 * der Funktion ist richtig, das Schema ist richtig, und erst ihr
 * ZUSAMMENSPIEL ergibt einen Riegel, der nie oeffnet. Deshalb faehrt dieser
 * Test die Kette, statt sie zu behaupten — auf echtem Postgres (PGlite/WASM),
 * weil eine nachgebaute Fake-DB generierte Spalten und BEFORE-Trigger gar
 * nicht in dieser Reihenfolge kennt und den Fehler folglich nicht zeigen
 * koennte.
 *
 * Geprueft wird:
 *   1. ALTER STAND: der Abrechnungspfad ist zu (der Befund selbst)
 *   2. NEUER STAND: derselbe Pfad geht auf
 *   3. der Riegel bleibt scharf: Status + zusaetzliche Feldaenderung faellt
 *   4. der Riegel bleibt scharf: reine Aenderung an gesperrter Zeile faellt
 *   5. die Stornoausnahme gilt weiterhin
 *   6. eine zweite generierte Spalte macht den Vergleich NICHT wieder blind
 *      (die Liste kommt aus dem Katalog, nicht aus einer festen Aufzaehlung)
 *   7. die Ruecknahme stellt den alten — kaputten — Stand wieder her
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const FIX = '20260829200000_sperre_generierte_spalten.sql'
const RUECKNAHME = '20260829200001_rollback_sperre_generierte_spalten.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const CLIENT = '00000000-0000-4000-8000-0000000000ba'

let db: InstanceType<typeof PGlite>

function migration(datei: string) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf8')
}

/**
 * Nachbau nur der Spalten, auf die der Trigger zugreift — plus der
 * generierten Spalte, um die es geht. `duration_minutes` wird hier
 * genauso abgeleitet wie in der Produktion: aus Anfang und Ende.
 */
async function grundgeruest(target: InstanceType<typeof PGlite>) {
  await target.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);

    CREATE TABLE public.service_records (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  uuid NOT NULL,
      client_id        uuid NOT NULL,
      date             date NOT NULL,
      start_time       time NOT NULL,
      end_time         time NOT NULL,
      service_type     text NOT NULL,
      amount           numeric(10,2),
      status           text NOT NULL DEFAULT 'draft',
      proof_status     text NOT NULL DEFAULT 'ENTWURF',
      is_locked        boolean NOT NULL DEFAULT false,
      signature_hash   text,
      updated_at       timestamptz NOT NULL DEFAULT now(),
      duration_minutes integer GENERATED ALWAYS AS
        (EXTRACT(EPOCH FROM (end_time - start_time))::int / 60) STORED
    );
  `)

  // Der Stand VOR dem Fix — wortgleich der, den die Ruecknahme
  // wiederherstellt. Damit prueft Schritt 1 den echten Altstand und nicht
  // eine Nacherzaehlung davon.
  await target.exec(migration(RUECKNAHME))
  await target.exec(`
    CREATE TRIGGER trg_prevent_locked_record
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_record_change();
  `)
}

/** Legt einen gesperrten, unterschriebenen Nachweis an. */
async function gesperrterNachweis(): Promise<string> {
  const res = await db.query<{ id: string }>(`
    INSERT INTO public.service_records
      (organization_id, client_id, date, start_time, end_time, service_type,
       amount, status, proof_status, is_locked, signature_hash)
    VALUES
      ('${ORG}', '${CLIENT}', DATE '2026-08-19', '10:00', '12:00', 'Alltagsbegleitung',
       80.00, 'signed', 'UNTERSCHRIEBEN', true, repeat('a', 64))
    RETURNING id
  `)
  return res.rows[0].id
}

/** Fuehrt eine Anweisung aus und gibt die Fehlermeldung zurueck — oder null. */
async function fehlerBei(sql: string): Promise<string | null> {
  try {
    await db.exec(sql)
    return null
  } catch (fehler) {
    return (fehler as Error).message
  }
}

beforeAll(async () => {
  db = new PGlite()
  await grundgeruest(db)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('Sperre vs. generierte Spalte', () => {
  it('ALTER STAND: der Abrechnungspfad ist zu — obwohl nur status gesetzt wird', async () => {
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET status = 'invoiced', updated_at = now() WHERE id = '${id}'`,
    )
    expect(fehler).toContain('NUR den Status erhalten')
  })

  it('ALTER STAND: die Ursache ist nachweisbar die generierte Spalte', async () => {
    // Ohne generierte Spalte laeuft derselbe Vergleich sauber durch. Das
    // schliesst aus, dass der Befund oben an etwas anderem haengt.
    const probe = new PGlite()
    try {
      await probe.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
        CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
        CREATE TABLE public.service_records (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          status text NOT NULL DEFAULT 'draft',
          proof_status text NOT NULL DEFAULT 'ENTWURF',
          is_locked boolean NOT NULL DEFAULT false,
          amount numeric(10,2),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `)
      await probe.exec(migration(RUECKNAHME))
      await probe.exec(`
        CREATE TRIGGER trg_prevent_locked_record
          BEFORE UPDATE ON public.service_records
          FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_record_change();
      `)
      const res = await probe.query<{ id: string }>(
        `INSERT INTO public.service_records (status, proof_status, is_locked, amount)
         VALUES ('signed', 'UNTERSCHRIEBEN', true, 80.00) RETURNING id`,
      )
      await expect(
        probe.exec(
          `UPDATE public.service_records SET status = 'invoiced', updated_at = now() WHERE id = '${res.rows[0].id}'`,
        ),
      ).resolves.toBeDefined()
    } finally {
      await probe.close()
    }
  })

  it('NEUER STAND: derselbe Pfad geht auf', async () => {
    await db.exec(migration(FIX))
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET status = 'invoiced', updated_at = now() WHERE id = '${id}'`,
    )
    expect(fehler).toBeNull()

    const nach = await db.query<{ status: string; is_locked: boolean; signature_hash: string }>(
      `SELECT status, is_locked, signature_hash FROM public.service_records WHERE id = '${id}'`,
    )
    // Der Beleg muss den Wechsel ueberleben: ein Abrechnen, das die
    // Unterschrift abraeumt, waere schlimmer als eines, das blockiert.
    expect(nach.rows[0].status).toBe('invoiced')
    expect(nach.rows[0].is_locked).toBe(true)
    expect(nach.rows[0].signature_hash).toBe('a'.repeat(64))
  })

  it('NEUER STAND: Status PLUS Betragsaenderung faellt weiterhin', async () => {
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET status = 'invoiced', amount = 99.00 WHERE id = '${id}'`,
    )
    expect(fehler).toContain('NUR den Status erhalten')
  })

  it('NEUER STAND: reine Aenderung an der gesperrten Zeile faellt weiterhin', async () => {
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET amount = 99.00 WHERE id = '${id}'`,
    )
    expect(fehler).toContain('gesperrt')
  })

  it('NEUER STAND: die Stornoausnahme gilt weiterhin', async () => {
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET proof_status = 'STORNIERT' WHERE id = '${id}'`,
    )
    expect(fehler).toBeNull()
  })

  it('NEUER STAND: eine ZWEITE generierte Spalte macht den Vergleich nicht wieder blind', async () => {
    // Die Ausschlussliste kommt aus dem Katalog. Waere sie fest
    // eingetragen, faende genau diese Erweiterung den Riegel wieder zu —
    // und zwar lautlos.
    await db.exec(`
      ALTER TABLE public.service_records
        ADD COLUMN dauer_stunden numeric
        GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) STORED
    `)
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET status = 'invoiced', updated_at = now() WHERE id = '${id}'`,
    )
    expect(fehler).toBeNull()
  })

  it('RUECKNAHME stellt den alten — kaputten — Stand wieder her', async () => {
    await db.exec(migration(RUECKNAHME))
    const id = await gesperrterNachweis()
    const fehler = await fehlerBei(
      `UPDATE public.service_records SET status = 'invoiced', updated_at = now() WHERE id = '${id}'`,
    )
    expect(fehler).toContain('NUR den Status erhalten')
  })
})
