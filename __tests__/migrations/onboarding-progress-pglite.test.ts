/**
 * PGlite: onboarding_progress (Migration 20261026000000)
 *
 * Die Migration wird auf einer echten PostgreSQL-Instanz (PGlite/WASM)
 * angewendet und ihr VERHALTEN geprueft — nicht nur, dass die Tabelle da
 * ist. Geprueft wird vor allem, was den Ablauf still kaputtmachen wuerde:
 * ein Schritt ausserhalb der Folge, ein zweiter Ablauf derselben Art, ein
 * permissiver org_fence.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20261026000000_onboarding_progress.sql'
const ROLLBACK = '20261026000001_rollback_onboarding_progress.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const USER = '00000000-0000-4000-8000-0000000000ba'
const USER_B = '00000000-0000-4000-8000-0000000000bb'

let db: InstanceType<typeof PGlite>

async function anlegen(werte: Record<string, unknown> = {}): Promise<void> {
  const basis = {
    user_id: USER,
    organization_id: ORG,
    typ: 'kunde',
    gesamt_schritte: 5,
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.onboarding_progress (${spalten.join(', ')}) VALUES (${platzhalter})`,
    Object.values(basis) as never[],
  )
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
  `)

  // Bestandsvoraussetzungen — minimal, aber mit denselben Schluesseln wie
  // live, damit die Fremdschluessel echt greifen. auth.uid() gibt es in
  // PGlite nicht; hier als Stub, damit die Policy uebersetzt werden kann.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm'), ('${ORG_B}', 'Zweiter');
    INSERT INTO public.profiles (id, role) VALUES ('${USER}', 'kunde'), ('${USER_B}', 'engel');
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => { await db?.close() })

beforeEach(async () => { await db.exec('DELETE FROM public.onboarding_progress;') })

describe('1. Struktur und RLS', () => {
  it('legt die Tabelle mit aktivierter RLS an', async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'onboarding_progress'`,
    )
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('setzt die Mandantengrenze als RESTRICTIVE Policy', async () => {
    // permissive wird geprueft und nicht geraten: eine permissive
    // org_fence-Policy waere wirkungslos, weil die Admin-Policy sie
    // per ODER wieder aufmacht.
    const { rows } = await db.query<{ policyname: string; permissive: string }>(
      `SELECT policyname, permissive FROM pg_policies
        WHERE tablename = 'onboarding_progress' ORDER BY policyname`,
    )
    expect(rows.map(r => r.policyname)).toEqual([
      'onboarding_progress_admin', 'onboarding_progress_eigene', 'org_fence_onboarding_progress',
    ])
    const fence = rows.find(r => r.policyname === 'org_fence_onboarding_progress')
    expect(fence?.permissive).toBe('RESTRICTIVE')
    // Die beiden anderen muessen permissiv sein — waeren sie restriktiv,
    // koennte eine Administratorin die eigene Zeile nicht mehr sehen.
    expect(rows.filter(r => r.policyname !== 'org_fence_onboarding_progress')
      .every(r => r.permissive === 'PERMISSIVE')).toBe(true)
  })

  it('entzieht anon jeden Zugriff', async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE grantee = 'anon' AND table_name = 'onboarding_progress'`,
    )
    expect(rows[0].n).toBe(0)
  })
})

describe('2. Schrittfolge', () => {
  it('setzt Standardwerte fuer einen frischen Ablauf', async () => {
    await anlegen()
    const { rows } = await db.query<Record<string, unknown>>(
      'SELECT * FROM public.onboarding_progress',
    )
    expect(rows[0].aktueller_schritt).toBe(1)
    expect(rows[0].schritte_daten).toEqual({})
    expect(rows[0].fehlende_angaben).toEqual([])
    expect(rows[0].dokument_status).toEqual({})
    expect(rows[0].letzte_auto_nachricht).toBeNull()
    expect(rows[0].abgeschlossen_am).toBeNull()
  })

  it('lehnt einen Schritt jenseits der Folge ab', async () => {
    // Ohne diesen CHECK zeigt der Fortschrittsbalken „7 von 5".
    await expect(anlegen({ aktueller_schritt: 7, gesamt_schritte: 5 }))
      .rejects.toThrow(/onboarding_progress_schritt_in_folge/)
  })

  it('lehnt Schritt 0 und negative Schritte ab', async () => {
    await expect(anlegen({ aktueller_schritt: 0 })).rejects.toThrow(/aktueller_schritt/)
  })

  it('lehnt eine leere Schrittfolge ab', async () => {
    await expect(anlegen({ gesamt_schritte: 0 })).rejects.toThrow(/gesamt_schritte/)
  })

  it('erlaubt den letzten Schritt', async () => {
    await anlegen({ aktueller_schritt: 5, gesamt_schritte: 5 })
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.onboarding_progress',
    )
    expect(rows[0].n).toBe(1)
  })
})

describe('3. Ablaufart', () => {
  it('nimmt genau die drei vorgesehenen Arten', async () => {
    for (const typ of ['bewerber', 'kunde', 'angehoerige']) {
      await db.exec('DELETE FROM public.onboarding_progress;')
      await anlegen({ typ })
    }
    await db.exec('DELETE FROM public.onboarding_progress;')
    await expect(anlegen({ typ: 'engel' })).rejects.toThrow(/typ/)
  })

  it('erlaubt einer Person zwei VERSCHIEDENE Ablaeufe', async () => {
    // Jemand kann Kundin sein und spaeter als angehoerige Person
    // hinzukommen — das sind zwei Ablaeufe, kein Fehler.
    await anlegen({ typ: 'kunde' })
    await anlegen({ typ: 'angehoerige' })
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.onboarding_progress',
    )
    expect(rows[0].n).toBe(2)
  })

  it('lehnt denselben Ablauf zweimal ab', async () => {
    // Der zweite wuesste nichts vom ersten, und die Erinnerung liefe doppelt.
    await anlegen({ typ: 'kunde' })
    await expect(anlegen({ typ: 'kunde' })).rejects.toThrow(/uq_onboarding_progress_user_typ/)
  })
})

describe('4. jsonb-Felder', () => {
  it('nimmt Schrittdaten je Schritt auf', async () => {
    await anlegen({
      schritte_daten: JSON.stringify({
        '1': { status: 'fertig', daten: { plz: '60313' }, zeitpunkt: '2026-09-04T10:00:00Z' },
      }),
    })
    const { rows } = await db.query<{ schritte_daten: Record<string, { status: string }> }>(
      'SELECT schritte_daten FROM public.onboarding_progress',
    )
    expect(rows[0].schritte_daten['1'].status).toBe('fertig')
  })

  it('lehnt ein Array statt eines Objekts ab', async () => {
    // Ein Array kaeme durch jsonb durch und braeche erst beim Lesen —
    // dann steht der Ablauf, und niemand weiss warum.
    await expect(anlegen({ schritte_daten: JSON.stringify([1, 2]) }))
      .rejects.toThrow(/onboarding_progress_schritte_objekt/)
    await expect(anlegen({ dokument_status: JSON.stringify(['a']) }))
      .rejects.toThrow(/onboarding_progress_dokumente_objekt/)
  })

  it('nimmt fehlende Angaben als Textliste', async () => {
    await anlegen({ fehlende_angaben: ['pflegegrad', 'fuehrungszeugnis'] })
    const { rows } = await db.query<{ fehlende_angaben: string[] }>(
      'SELECT fehlende_angaben FROM public.onboarding_progress',
    )
    expect(rows[0].fehlende_angaben).toEqual(['pflegegrad', 'fuehrungszeugnis'])
  })
})

describe('5. Mandant', () => {
  it('verlangt einen Mandanten an jeder Zeile', async () => {
    await expect(anlegen({ organization_id: null })).rejects.toThrow(/organization_id/)
  })

  it('haelt gleiche Ablaufart in zwei Mandanten getrennt', async () => {
    await anlegen({ typ: 'kunde', organization_id: ORG })
    await anlegen({ user_id: USER_B, typ: 'kunde', organization_id: ORG_B })
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.onboarding_progress',
    )
    expect(rows[0].n).toBe(2)
  })

  it('loescht den Ablauf mit dem Konto (DSGVO-Kaskade)', async () => {
    await anlegen()
    await db.exec(`DELETE FROM public.profiles WHERE id = '${USER}';`)
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.onboarding_progress',
    )
    expect(rows[0].n).toBe(0)
    await db.exec(`INSERT INTO public.profiles (id, role) VALUES ('${USER}', 'kunde');`)
  })
})

describe('6. updated_at', () => {
  it('wird bei jeder Aenderung nachgezogen', async () => {
    await anlegen()
    const { rows: vorher } = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM public.onboarding_progress',
    )
    await db.exec(`UPDATE public.onboarding_progress SET aktueller_schritt = 2;`)
    const { rows: nachher } = await db.query<{ updated_at: string }>(
      'SELECT updated_at FROM public.onboarding_progress',
    )
    expect(new Date(nachher[0].updated_at).getTime())
      .toBeGreaterThanOrEqual(new Date(vorher[0].updated_at).getTime())
  })
})

describe('7. Rollback', () => {
  it('raeumt Tabelle, Trigger und Funktion vollstaendig ab', async () => {
    const zurueck = new PGlite()
    await zurueck.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    `)
    await zurueck.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
    await zurueck.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const { rows } = await zurueck.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'onboarding_progress'`,
    )
    expect(rows[0].n).toBe(0)

    const { rows: fn } = await zurueck.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'trg_onboarding_progress_updated_at'`,
    )
    expect(fn[0].n).toBe(0)
    await zurueck.close()
  })
})
