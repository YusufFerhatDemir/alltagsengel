/**
 * PGlite: Vitalwerte-Plausibilitätsbereiche als DB-CHECK
 * (Migration 20261007000000_vitalwerte_plausibilitaet_db_check.sql)
 *
 * Prüft gegen ein echtes PostgreSQL (PGlite/WASM, in-process), dass
 * physiologisch unmögliche Werte auch dann nicht in die Tabellen kommen,
 * wenn die API-seitige Validierung (lib/vitals/vitals.ts) umgangen wird —
 * z. B. durch einen künftigen Batch-Import oder ein Backfill-Skript mit
 * service_role. Ebenso: dass ein fehlkonfigurierter Grenzwert außerhalb
 * des plausiblen Bereichs abgelehnt wird (fail-open-Risiko — ein solcher
 * Grenzwert könnte sonst nie ausgelöst werden).
 *
 * Bewusst NUR die Tabellenstruktur nachgebaut (Spalten aus
 * 20260818010100_vitalwerte.sql), nicht RLS/Policies — das prüft
 * supabase/shadow/60_vitalwerte_tests.sql gegen eine echte Shadow-DB.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const HAERTUNG = '20261008000000_vitalwerte_plausibilitaet_db_check.sql'
const ROLLBACK = '20261008000001_rollback_vitalwerte_plausibilitaet_db_check.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'
const USER = '00000000-0000-4000-8000-0000000000ca'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

async function messung(werte: Record<string, unknown> = {}): Promise<void> {
  const basis = {
    organization_id: ORG,
    client_id: KLIENT,
    type: 'puls',
    value: 72,
    unit: 'bpm',
    measured_by: USER,
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.vital_signs (${spalten.join(', ')}) VALUES (${platzhalter})`,
    Object.values(basis) as never[],
  )
}

async function grenzwert(werte: Record<string, unknown> = {}): Promise<void> {
  const basis = {
    organization_id: ORG,
    client_id: KLIENT,
    type: 'puls',
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.vital_sign_thresholds (${spalten.join(', ')}) VALUES (${platzhalter})`,
    Object.values(basis) as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()

  // Nachgebaute Tabellenstruktur aus 20260818010100_vitalwerte.sql —
  // ohne RLS/Policies, nur die für die neuen CHECKs relevanten Spalten.
  await db.exec(`
    CREATE TABLE public.vital_signs (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  uuid NOT NULL,
      client_id        uuid NOT NULL,
      type             text NOT NULL,
      value            numeric(8,2) NOT NULL,
      value_secondary  numeric(8,2),
      unit             text NOT NULL,
      measured_at      timestamptz NOT NULL DEFAULT now(),
      measured_by      uuid NOT NULL,
      measured_by_name text,
      measured_by_role text,
      notes            text,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT vital_signs_type_check CHECK (type IN (
        'blutdruck','puls','temperatur','blutzucker','spo2',
        'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
      )),
      CONSTRAINT vital_signs_value_check CHECK (value >= 0)
    );

    CREATE TABLE public.vital_sign_thresholds (
      id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id  uuid NOT NULL,
      client_id        uuid NOT NULL,
      type             text NOT NULL,
      min_warn              numeric(8,2),
      max_warn              numeric(8,2),
      min_critical          numeric(8,2),
      max_critical          numeric(8,2),
      min_warn_secondary     numeric(8,2),
      max_warn_secondary     numeric(8,2),
      min_critical_secondary numeric(8,2),
      max_critical_secondary numeric(8,2),
      enabled          boolean NOT NULL DEFAULT true,
      notes            text,
      created_by       uuid,
      created_at       timestamptz NOT NULL DEFAULT now(),
      updated_at       timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT vital_sign_thresholds_type_check CHECK (type IN (
        'blutdruck','puls','temperatur','blutzucker','spo2',
        'gewicht','atemfrequenz','schmerz','trinkmenge','ausscheidung'
      )),
      CONSTRAINT vital_sign_thresholds_client_type_unique UNIQUE (client_id, type)
    );
  `)

  await db.exec(migration(HAERTUNG))
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.vital_signs;')
  await db.exec('DELETE FROM public.vital_sign_thresholds;')
})

// ═══════════════════════════════════════════════════════════════════
describe('1. vital_signs: Messwert im plausiblen Bereich', () => {
  it('lehnt einen unmöglichen Puls ab (500 bpm)', async () => {
    await expect(messung({ type: 'puls', value: 500 }))
      .rejects.toThrow(/vital_signs_wert_plausibel_check/)
  })

  it('lehnt eine unmögliche Temperatur ab (200 °C, besteht value>=0 trotzdem)', async () => {
    // Regressionsfall: der alte CHECK (value >= 0) hätte das durchgelassen.
    await expect(messung({ type: 'temperatur', value: 200, unit: '°C' }))
      .rejects.toThrow(/vital_signs_wert_plausibel_check/)
  })

  it('lehnt eine SpO2 über 100 % ab', async () => {
    await expect(messung({ type: 'spo2', value: 150, unit: '%' }))
      .rejects.toThrow(/vital_signs_wert_plausibel_check/)
  })

  it('lässt plausible Werte je Typ durch', async () => {
    await messung({ type: 'puls', value: 72 })
    await messung({ type: 'temperatur', value: 37.2, unit: '°C' })
    await messung({ type: 'spo2', value: 98, unit: '%' })
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.vital_signs`)
    expect(rows[0].n).toBe(3)
  })

  it('greift auch beim UPDATE, nicht nur beim INSERT', async () => {
    await messung({ type: 'puls', value: 72 })
    await expect(db.exec(`UPDATE public.vital_signs SET value = 9999 WHERE type = 'puls';`))
      .rejects.toThrow(/vital_signs_wert_plausibel_check/)
  })
})

describe('2. vital_signs: Blutdruck-Zweitwert (diastolisch)', () => {
  it('lehnt einen diastolischen Wert außerhalb des plausiblen Bereichs ab', async () => {
    await expect(messung({ type: 'blutdruck', value: 120, value_secondary: 5, unit: 'mmHg' }))
      .rejects.toThrow(/vital_signs_sekundaer_plausibel_check/)
  })

  it('lehnt diastolisch >= systolisch ab', async () => {
    await expect(messung({ type: 'blutdruck', value: 120, value_secondary: 130, unit: 'mmHg' }))
      .rejects.toThrow(/vital_signs_sekundaer_kleiner_check/)
  })

  it('diastolisch hat einen engeren plausiblen Bereich (20–200) als systolisch (40–300)', async () => {
    // 250 wäre für systolisch (value) plausibel, für diastolisch (value_secondary) nicht.
    await expect(messung({ type: 'blutdruck', value: 260, value_secondary: 250, unit: 'mmHg' }))
      .rejects.toThrow(/vital_signs_sekundaer_plausibel_check/)
  })

  it('lässt einen plausiblen Blutdruck durch', async () => {
    await messung({ type: 'blutdruck', value: 120, value_secondary: 80, unit: 'mmHg' })
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.vital_signs`)
    expect(rows[0].n).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('3. vital_sign_thresholds: Grenzwerte im plausiblen Bereich (fail-open-Schutz)', () => {
  it('lehnt eine kritische Obergrenze außerhalb des plausiblen Bereichs ab', async () => {
    // Puls-Obergrenze plausibelMax = 250. Ein max_critical von 1000 wäre
    // intern konsistent, aber nie erreichbar — der Alarm liefe faktisch nie.
    await expect(grenzwert({ type: 'puls', max_critical: 1000 }))
      .rejects.toThrow(/vital_sign_thresholds_plausibel_check/)
  })

  it('lehnt eine untere Grenze unterhalb des plausiblen Bereichs ab', async () => {
    await expect(grenzwert({ type: 'spo2', min_critical: -10 }))
      .rejects.toThrow(/vital_sign_thresholds_plausibel_check/)
  })

  it('lehnt einen unplausiblen sekundären (diastolischen) Grenzwert ab', async () => {
    await expect(grenzwert({ type: 'blutdruck', max_critical_secondary: 9999 }))
      .rejects.toThrow(/vital_sign_thresholds_sekundaer_plausibel_check/)
  })

  it('diastolische Grenzwerte nutzen den engeren Bereich (20–200), nicht den systolischen (40–300)', async () => {
    // 250 wäre für die systolische Grenze (max_critical) plausibel, für die
    // diastolische (max_critical_secondary) nicht.
    await expect(grenzwert({ type: 'blutdruck', max_critical: 260, max_critical_secondary: 250 }))
      .rejects.toThrow(/vital_sign_thresholds_sekundaer_plausibel_check/)
  })

  it('lehnt einen Blutzucker-Grenzwert über der neuen Obergrenze (600) ab', async () => {
    await expect(grenzwert({ type: 'blutzucker', max_critical: 700 }))
      .rejects.toThrow(/vital_sign_thresholds_plausibel_check/)
  })

  it('lässt plausible Grenzwerte durch', async () => {
    await grenzwert({ type: 'puls', min_warn: 50, max_warn: 100, min_critical: 40, max_critical: 120 })
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.vital_sign_thresholds`)
    expect(rows[0].n).toBe(1)
  })

  it('greift auch beim UPDATE', async () => {
    await grenzwert({ type: 'puls', max_critical: 120 })
    await expect(db.exec(`UPDATE public.vital_sign_thresholds SET max_critical = 9999 WHERE type = 'puls';`))
      .rejects.toThrow(/vital_sign_thresholds_plausibel_check/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('4. Rollback', () => {
  it('nimmt CHECKs und Hilfsfunktionen zurück', async () => {
    await db.exec(migration(ROLLBACK))

    const { rows: c } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE conname IN (
          'vital_signs_wert_plausibel_check',
          'vital_signs_sekundaer_plausibel_check',
          'vital_signs_sekundaer_kleiner_check',
          'vital_sign_thresholds_plausibel_check',
          'vital_sign_thresholds_sekundaer_plausibel_check'
        )`,
    )
    expect(c[0].n).toBe(0)

    const { rows: f } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('vitals_plausibel_min', 'vitals_plausibel_max')`,
    )
    expect(f[0].n).toBe(0)

    // Ein zuvor unmöglicher Wert geht jetzt wieder durch (Beleg, dass der
    // Rollback tatsächlich wirkt und nicht nur behauptet).
    await messung({ type: 'puls', value: 500 })

    // Für etwaige Folgeläufe wieder herstellen.
    await db.exec(migration(HAERTUNG))
  })
})
