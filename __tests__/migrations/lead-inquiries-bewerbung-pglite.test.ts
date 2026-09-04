/**
 * PGlite: lead_inquiries nimmt Bewerbungen auf (Migration 20261027000000)
 *
 * Der Kern ist der Teil-Unique-Index: er ist die einzige Sperre, die auch
 * bei zwei GLEICHZEITIGEN Aufrufen hält. Ein Doppelklick auf
 * „Abschließen" darf keine zweite Bewerbung derselben Person erzeugen —
 * sonst führt die Verwaltung zwei Gespräche zu einem Menschen.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20261027000000_lead_inquiries_bewerbung.sql'
const ROLLBACK = '20261027000001_rollback_lead_inquiries_bewerbung.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ABLAUF = '00000000-0000-4000-8000-0000000000cc'
const ABLAUF_B = '00000000-0000-4000-8000-0000000000cd'

let db: InstanceType<typeof PGlite>

async function grundgeruest(ziel: InstanceType<typeof PGlite>) {
  await ziel.exec(`
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.onboarding_progress (id uuid PRIMARY KEY);
    CREATE TABLE public.lead_inquiries (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid REFERENCES public.organizations(id),
      name text NOT NULL,
      phone text NOT NULL,
      plz text NOT NULL,
      message text,
      source text DEFAULT 'website',
      status text DEFAULT 'new',
      created_at timestamptz DEFAULT now()
    );
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm');
    INSERT INTO public.onboarding_progress (id) VALUES ('${ABLAUF}'), ('${ABLAUF_B}');
  `)
}

async function bewerbung(werte: Record<string, unknown> = {}) {
  const basis = {
    organization_id: ORG,
    name: 'Erika Müller',
    phone: '069 1234567',
    plz: '60313',
    art: 'bewerbung',
    onboarding_progress_id: ABLAUF,
    eingereicht_am: new Date().toISOString(),
    ...werte,
  }
  const spalten = Object.keys(basis)
  await db.query(
    `INSERT INTO public.lead_inquiries (${spalten.join(', ')})
     VALUES (${spalten.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(basis) as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()
  await grundgeruest(db)
  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => { await db?.close() })
beforeEach(async () => { await db.exec('DELETE FROM public.lead_inquiries;') })

describe('1. Neue Spalten', () => {
  it('legt E-Mail, Art, Daten, Bezug und Zeitpunkt an', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'lead_inquiries'
          AND column_name IN ('email','art','bewerbung_daten','onboarding_progress_id','eingereicht_am')
        ORDER BY column_name`,
    )
    expect(rows.map(r => r.column_name)).toEqual([
      'art', 'bewerbung_daten', 'eingereicht_am', 'email', 'onboarding_progress_id',
    ])
  })

  it('lässt bestehende Anfragen unberührt', async () => {
    // Die Migration darf den laufenden Betrieb der Website nicht ändern:
    // eine Anfrage ohne die neuen Felder muss weiter durchgehen.
    await db.exec(`
      INSERT INTO public.lead_inquiries (organization_id, name, phone, plz)
      VALUES ('${ORG}', 'Anfrage Person', '069', '60313');
    `)
    const { rows } = await db.query<{ art: string; eingereicht_am: string | null }>(
      'SELECT art, eingereicht_am FROM public.lead_inquiries',
    )
    expect(rows[0].art).toBe('anfrage')
    expect(rows[0].eingereicht_am).toBeNull()
  })
})

describe('2. Art', () => {
  it('nimmt anfrage und bewerbung', async () => {
    await bewerbung({ art: 'bewerbung' })
    await bewerbung({ art: 'anfrage', onboarding_progress_id: null })
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.lead_inquiries',
    )
    expect(rows[0].n).toBe(2)
  })

  it('lehnt eine erfundene Art ab', async () => {
    await expect(bewerbung({ art: 'praktikum' })).rejects.toThrow(/lead_inquiries_art_check/)
  })
})

describe('3. Riegel gegen doppelte Bewerbungen', () => {
  it('lässt genau eine Bewerbung je Ablauf zu', async () => {
    // Doppelklick, zweiter Tab, wiederholter Request.
    await bewerbung()
    await expect(bewerbung()).rejects.toThrow(/uq_lead_inquiries_bewerbung_je_ablauf/)
  })

  it('meldet den Konflikt als 23505 — darauf reagiert die Route', async () => {
    await bewerbung()
    await expect(bewerbung()).rejects.toMatchObject({ code: '23505' })
  })

  it('behindert verschiedene Abläufe nicht', async () => {
    await bewerbung({ onboarding_progress_id: ABLAUF })
    await bewerbung({ onboarding_progress_id: ABLAUF_B })
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.lead_inquiries',
    )
    expect(rows[0].n).toBe(2)
  })

  it('behindert Anfragen ohne Ablaufbezug nicht', async () => {
    // Der Index ist ein TEIL-Index: NULL-Werte fallen nicht darunter,
    // sonst könnte es nur EINE Website-Anfrage insgesamt geben.
    for (let i = 0; i < 3; i++) {
      await bewerbung({ art: 'anfrage', onboarding_progress_id: null })
    }
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.lead_inquiries',
    )
    expect(rows[0].n).toBe(3)
  })
})

describe('4. Bezug zum Ablauf', () => {
  it('hält die Bewerbung, wenn der Ablauf gelöscht wird', async () => {
    // ON DELETE SET NULL, nicht CASCADE: die eingegangene Bewerbung ist
    // ein eigener Vorgang, kein Anhängsel des Ablaufs.
    await bewerbung()
    await db.exec(`DELETE FROM public.onboarding_progress WHERE id = '${ABLAUF}';`)
    const { rows } = await db.query<{ n: number; onboarding_progress_id: string | null }>(
      'SELECT count(*)::int AS n, max(onboarding_progress_id::text) AS onboarding_progress_id FROM public.lead_inquiries',
    )
    expect(rows[0].n).toBe(1)
    expect(rows[0].onboarding_progress_id).toBeNull()
    await db.exec(`INSERT INTO public.onboarding_progress (id) VALUES ('${ABLAUF}');`)
  })
})

describe('5. Rollback', () => {
  it('räumt Spalten, Index und Bedingungen vollständig ab', async () => {
    const zurueck = new PGlite()
    await grundgeruest(zurueck)
    await zurueck.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
    await zurueck.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const { rows: spalten } = await zurueck.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'lead_inquiries'
          AND column_name IN ('email','art','bewerbung_daten','onboarding_progress_id','eingereicht_am')`,
    )
    expect(spalten[0].n).toBe(0)

    const { rows: indizes } = await zurueck.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_indexes
        WHERE indexname = 'uq_lead_inquiries_bewerbung_je_ablauf'`,
    )
    expect(indizes[0].n).toBe(0)

    // Die Tabelle selbst muss stehenbleiben — sie gehoerte nie dieser Migration.
    const { rows: tabelle } = await zurueck.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_name = 'lead_inquiries'`,
    )
    expect(tabelle[0].n).toBe(1)
    await zurueck.close()
  })
})
