/**
 * PGlite: das Unterschriftssiegel entsteht auch beim EINFUEGEN
 * (Migration 20261023000000_signaturhash_beim_einfuegen.sql)
 *
 * ── WARUM DIESE SUITE GEGEN ECHTES POSTGRES LAEUFT ────────────────────────
 * Der Befund U11 ist ein Befund über die TRIGGER-VERDRAHTUNG, nicht über
 * Anwendungscode: `trg_compute_signature_hash` steht live als
 * `BEFORE UPDATE` und läuft deshalb an jedem INSERT vorbei. Eine Attrappe
 * kann das prinzipiell nicht zeigen — sie hat keine Trigger. Geprüft wird
 * darum gegen ein echtes PostgreSQL (PGlite/WASM, in-process).
 *
 * Die Funktion wird WORTGLEICH aus der Migrationsdatei geschnitten
 * (`funktionAusMigration`). Eine Abschrift im Test würde beweisen, dass die
 * Abschrift funktioniert.
 *
 * ── WAS DIESE SUITE NICHT IST ─────────────────────────────────────────────
 * Kein Beweis, dass die Migration LIVE steht. Sie steht am 31.08.2026
 * ausdrücklich NICHT — DDL geht in diesem Projekt nur über den
 * SQL-Editor. Den Live-Nachweis führt `npm run verify:unterschrift`
 * (Prüfung U11); der springt erst nach dem Anwenden auf OK.
 *
 * ── ZWEI BEWUSSTE ABWEICHUNGEN VOM PRODUKTIONSSCHEMA ──────────────────────
 * 1. `extensions.digest(text,'sha256')` kommt live aus pgcrypto. PGlite hat
 *    pgcrypto nicht. Ersatz ist das in PostgreSQL eingebaute `sha256()` —
 *    dasselbe Verfahren über dieselben Bytes, also derselbe Hash.
 * 2. `service_records` wird nur mit den Spalten nachgebaut, die der Trigger
 *    liest oder schreibt. Die CHECKs und die übrigen acht Trigger der
 *    echten Tabelle fehlen hier ABSICHTLICH: sie sind nicht Gegenstand
 *    dieser Frage, und ihr Fehlen darf nicht als „geprüft" gelesen werden.
 *    Genau diese Verwechslung hat im Projekt schon einmal einen kaputten
 *    Pfad wochenlang grün gehalten.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const MIGRATION = '20261023000000_signaturhash_beim_einfuegen.sql'
const ROLLBACK = '20261023000001_rollback_signaturhash_beim_einfuegen.sql'

const KLIENT = '00000000-0000-4000-8000-0000000000ba'
const SIGNIERT_AM = '2026-08-31T08:30:00.000Z'

let db: InstanceType<typeof PGlite>

/** Der Trigger, so wie die Migration ihn setzt — INSERT UND UPDATE. */
const TRIGGER_NEU = `
  DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
  CREATE TRIGGER trg_compute_signature_hash
    BEFORE INSERT OR UPDATE ON public.service_records
    FOR EACH ROW EXECUTE FUNCTION public.compute_signature_hash();
`

/** Der Trigger, so wie er am 31.08.2026 LIVE steht — nur UPDATE. */
const TRIGGER_LIVE = `
  DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;
  CREATE TRIGGER trg_compute_signature_hash
    BEFORE UPDATE ON public.service_records
    FOR EACH ROW EXECUTE FUNCTION public.compute_signature_hash();
`

async function einfuegen(werte: Record<string, unknown> = {}) {
  const basis: Record<string, unknown> = {
    client_id: KLIENT,
    date: '2026-08-31',
    start_time: '09:00',
    end_time: '10:00',
    amount: 25,
    proof_status: 'ENTWURF',
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO public.service_records (${spalten.join(', ')})
     VALUES (${platzhalter}) RETURNING id`,
    Object.values(basis) as never[],
  )
  return rows[0].id
}

async function lies(id: string) {
  const { rows } = await db.query<{
    signature_hash: string | null; is_locked: boolean; amount: string; proof_status: string
  }>('SELECT signature_hash, is_locked, amount, proof_status FROM public.service_records WHERE id = $1', [id])
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()

  // pgcrypto-Ersatz — Begründung im Dateikopf.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE FUNCTION extensions.digest(data text, typ text) RETURNS bytea
      LANGUAGE sql IMMUTABLE AS $ersatz$ SELECT sha256(data::bytea) $ersatz$;
  `)

  await db.exec(`
    CREATE TABLE public.service_records (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id        uuid NOT NULL,
      date             date NOT NULL,
      start_time       time NOT NULL,
      end_time         time NOT NULL,
      amount           numeric(10,2),
      proof_status     text NOT NULL DEFAULT 'ENTWURF',
      client_signed_at timestamptz,
      client_signature text,
      signature_hash   text,
      is_locked        boolean NOT NULL DEFAULT false
    );
  `)
})

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec('TRUNCATE public.service_records')
  await db.exec(funktionAusMigration(MIGRATION, 'compute_signature_hash'))
  await db.exec(TRIGGER_NEU)
})

describe('Der Befund: der LIVE verdrahtete Trigger lässt den INSERT-Weg durch', () => {
  it('eine als unterschrieben eingefügte Zeile bleibt ohne Siegel und ungesperrt', async () => {
    // Die Gegenprobe zum Fix. Ohne sie bewiese die Suite nicht, dass die
    // Migration überhaupt etwas ändert — sie wäre auch dann grün, wenn der
    // alte Trigger schon gereicht hätte.
    await db.exec(TRIGGER_LIVE)

    const id = await einfuegen({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: SIGNIERT_AM,
      client_signature: 'data:image/png;base64,PRUEFUNTERSCHRIFT',
    })
    const zeile = await lies(id)

    expect(zeile.signature_hash).toBeNull()
    expect(zeile.is_locked).toBe(false)
    // …und gilt trotzdem als unterschrieben. Genau das ist der Befund.
    expect(zeile.proof_status).toBe('UNTERSCHRIEBEN')
  })
})

describe('Nach der Migration: der INSERT-Weg versiegelt', () => {
  it('eine als unterschrieben eingefügte Zeile trägt Hash UND Sperre', async () => {
    const id = await einfuegen({
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: SIGNIERT_AM,
      client_signature: 'data:image/png;base64,PRUEFUNTERSCHRIFT',
    })
    const zeile = await lies(id)

    expect(zeile.signature_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(zeile.is_locked).toBe(true)
  })

  it('der Hash bindet den Betrag — zwei Beträge, zwei Hashes', async () => {
    // Ohne diese Prüfung wäre „es steht ein Hash da" die ganze Aussage.
    // Ein Siegel, das den Betrag nicht abdeckt, ist keines.
    const a = await einfuegen({
      amount: 25, proof_status: 'UNTERSCHRIEBEN', client_signed_at: SIGNIERT_AM,
    })
    const b = await einfuegen({
      amount: 26, proof_status: 'UNTERSCHRIEBEN', client_signed_at: SIGNIERT_AM,
    })
    const [x, y] = [await lies(a), await lies(b)]

    expect(x.signature_hash).not.toBeNull()
    expect(x.signature_hash).not.toBe(y.signature_hash)
  })

  it('ohne Unterschriftszeitpunkt entsteht kein Siegel', async () => {
    // Die Bedingung bleibt wörtlich die der Live-Fassung: proof_status
    // ALLEIN versiegelt nichts. Der Statuswert ist keine Unterschrift.
    const id = await einfuegen({ proof_status: 'UNTERSCHRIEBEN', client_signed_at: null })
    const zeile = await lies(id)

    expect(zeile.signature_hash).toBeNull()
    expect(zeile.is_locked).toBe(false)
  })

  it('ein selbst mitgebrachter Hash wird beim Einfügen verworfen', async () => {
    // Ein Hash, den der Aufrufer mitbringt, ist kein Siegel, sondern eine
    // Behauptung — niemand hat ihn nachgerechnet. Er stünde danach in der
    // Spalte, die als Fälschungsnachweis gilt.
    const id = await einfuegen({ signature_hash: 'f'.repeat(64) })
    expect((await lies(id)).signature_hash).toBeNull()
  })

  it('beim UPDATE bleibt ein bestehender Hash erhalten', async () => {
    // Die Kehrseite der vorigen Regel. Verwürfe der Trigger den Hash auch
    // beim UPDATE, löschte jede spätere Statusänderung das Siegel.
    const id = await einfuegen({
      proof_status: 'UNTERSCHRIEBEN', client_signed_at: SIGNIERT_AM,
    })
    const vorher = (await lies(id)).signature_hash
    expect(vorher).not.toBeNull()

    await db.query('UPDATE public.service_records SET proof_status = $1 WHERE id = $2',
      ['ABGERECHNET', id])

    expect((await lies(id)).signature_hash).toBe(vorher)
  })

  it('der bisherige UPDATE-Weg versiegelt unverändert weiter', async () => {
    // Die Migration darf den Weg, den die Route geht, nicht anfassen:
    // anlegen als ENTWURF, danach unterschreiben.
    const id = await einfuegen()
    expect((await lies(id)).signature_hash).toBeNull()

    await db.query(
      `UPDATE public.service_records
          SET proof_status = 'UNTERSCHRIEBEN', client_signed_at = $1, client_signature = 'x'
        WHERE id = $2`,
      [SIGNIERT_AM, id],
    )
    const zeile = await lies(id)

    expect(zeile.signature_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(zeile.is_locked).toBe(true)
  })

  it('derselbe Inhalt ergibt denselben Hash — egal über welchen Weg', async () => {
    // Der Grund, warum das zählt: der Altbestand und die Nacherfassung
    // dürfen nicht zwei verschiedene Siegel für dieselbe Leistung
    // erzeugen, sonst ist ein Abgleich zwischen ihnen wertlos.
    const perInsert = await einfuegen({
      proof_status: 'UNTERSCHRIEBEN', client_signed_at: SIGNIERT_AM,
    })
    const perUpdate = await einfuegen()
    await db.query(
      `UPDATE public.service_records
          SET proof_status = 'UNTERSCHRIEBEN', client_signed_at = $1 WHERE id = $2`,
      [SIGNIERT_AM, perUpdate],
    )

    // Die id geht in den Hash ein — die beiden Zeilen haben verschiedene.
    // Verglichen wird deshalb gegen den unabhängig nachgerechneten Wert.
    for (const id of [perInsert, perUpdate]) {
      const { rows } = await db.query<{ gespeichert: string; nachgerechnet: string }>(
        `SELECT signature_hash AS gespeichert,
                encode(sha256((
                  COALESCE(id::text,'') || '|' || COALESCE(client_id::text,'') || '|' ||
                  COALESCE(date::text,'') || '|' || COALESCE(start_time::text,'') || '|' ||
                  COALESCE(end_time::text,'') || '|' || COALESCE(amount::text,'') || '|' ||
                  COALESCE(client_signed_at::text,'')
                )::bytea), 'hex') AS nachgerechnet
           FROM public.service_records WHERE id = $1`,
        [id],
      )
      expect(rows[0].gespeichert).toBe(rows[0].nachgerechnet)
    }
  })
})

describe('Rollback', () => {
  it('stellt den UPDATE-only-Stand wieder her', async () => {
    // Ein Rollback, der nicht zurückrollt, ist schlimmer als keiner: er
    // steht als Notausgang in der Datei und führt ins Leere.
    await db.exec(funktionAusMigration(ROLLBACK, 'compute_signature_hash'))
    await db.exec(TRIGGER_LIVE)

    const id = await einfuegen({
      proof_status: 'UNTERSCHRIEBEN', client_signed_at: SIGNIERT_AM,
    })
    expect((await lies(id)).signature_hash).toBeNull()
  })

  it('die Rollback-Datei setzt den Trigger wieder auf BEFORE UPDATE', async () => {
    // Die Trigger-Anweisung selbst steht nicht in der Funktion und wird
    // oben nachgebildet — also wird hier der Dateitext geprüft, damit die
    // Nachbildung nicht von der Datei abweichen kann.
    const text = liesMigration(ROLLBACK)
    expect(text).toMatch(/BEFORE UPDATE ON public\.service_records/)
    expect(text).not.toMatch(/BEFORE INSERT OR UPDATE ON public\.service_records/)
    expect(liesMigration(MIGRATION)).toMatch(/BEFORE INSERT OR UPDATE ON public\.service_records/)
  })
})
