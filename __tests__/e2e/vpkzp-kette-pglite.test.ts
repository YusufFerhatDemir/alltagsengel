/**
 * E2E: VP/KZP-Kette — TypeScript-Tor und Datenbank-Trigger im Gleichschritt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Ketten 7, 9 und 10 des Phase-4-Auftrags.
 *
 * Die Regeln fuer Verhinderungs- und Kurzzeitpflege stehen ZWEIMAL im
 * System — bewusst, wie bei tarif_leistungsart():
 *
 *   • in TypeScript (lib/billing/vpkzp/pruefprotokoll.ts), damit die
 *     Oberflaeche vor dem Anlegen erklaeren kann, was gedeckt ist;
 *   • in der Datenbank (Trigger und CHECKs aus 20260926000000 /
 *     20260928000000 / 20260929000000), weil nur die Datenbank nicht
 *     umgehbar ist — PostgREST, SQL-Editor und Import kommen an jeder
 *     Route vorbei.
 *
 * Bisher prueft jede Seite fuer sich: __tests__/billing/vpkzp-*.test.ts
 * die Rechnung ohne Datenbank, __tests__/migrations/vpkzp-*-pglite.test.ts
 * die Trigger ohne Anwendungscode. Was fehlte, ist der Abgleich: SAGEN
 * BEIDE SEITEN DASSELBE? Ein Auseinanderdriften faellt sonst erst auf,
 * wenn die Oberflaeche eine Buchung freigibt, die die Datenbank ablehnt
 * (oder schlimmer: umgekehrt).
 *
 * Jeder Fall unten laeuft deshalb zweimal durch:
 *   1. `ladeBestand()` + `pruefeBuchung()` gegen dieselbe Instanz
 *   2. der echte INSERT in vpkzp_buchungen
 * und beide Urteile werden gegeneinander gestellt.
 *
 * ANGEWANDTER RECHTSSTAND (Konstanten kommen aus dem Code, nicht aus
 * dieser Datei): Verhinderungspflege ab 2025 acht Wochen, bis 2024 sechs;
 * Kurzzeitpflege durchgehend acht Wochen; gemeinsamer Jahresbetrag nach
 * § 42a SGB XI aus lib/config/budget-constants.ts.
 *
 * KEIN ANWENDUNGSWEG ZUM BUCHEN: app/api/admin/vpkzp/route.ts prueft nur
 * (POST liefert das Pruefprotokoll und legt nichts an). Die Buchung
 * entsteht direkt in der Tabelle. Genau deshalb ist der Abgleich hier
 * die eigentliche Absicherung — es gibt keine Route, die dazwischen
 * noch etwas geradeziehen koennte.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

import { macheSupabaseClient } from './helpers/pglite-supabase'
import {
  ladeBestand,
  pruefeBuchung,
  VpKzpLageNichtErmittelbarError,
  type PruefCode,
  type PruefErgebnis,
  type TarifAngabe,
  type Zeitraum,
} from '@/lib/billing/vpkzp'
import { budgetVersionFuerJahr } from '@/lib/config/budget-constants'

const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const M_BASIS      = '20260926000000_vpkzp_zeitraum_budget.sql'
const M_VP56       = '20260928000000_vpkzp_vp_56_tage.sql'
const M_INTEGRITAET = '20260929000000_vpkzp_integritaet_haertung.sql'
const M_PAARUNG    = '20261001010000_vpkzp_mandantenpaarung.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'
const KLIENT_B = '00000000-0000-4000-8000-0000000000bb'
const KLIENT_PG1 = '00000000-0000-4000-8000-0000000000bc'

/** Verifizierter Privattarif — Schritt 5 des Pruefprotokolls. */
const TARIF_OK: TarifAngabe = {
  quellTabelle: 'billing_tariffs',
  tarifStatus: 'verified',
  id: '00000000-0000-4000-8000-0000000000f1',
}

let db: PGlite
let admin: SupabaseClient

/**
 * Gemeinsamer Jahresbetrag § 42a fuer 2026 — aus dem Code geholt, nicht
 * hier abgeschrieben. Eine Gesetzesaenderung soll diesen Test anpassen,
 * nicht stillschweigend an ihm vorbeilaufen.
 */
const KOMBI_BUDGET = budgetVersionFuerJahr(2026).vpKzpKombiniert

// ─────────────────────────────────────────────────────────────────────
// Beide Seiten desselben Falls
// ─────────────────────────────────────────────────────────────────────

interface Fall {
  art: 'verhinderungspflege' | 'kurzzeitpflege'
  zeitraum: Zeitraum
  betragEuro: number
  clientId?: string
  organizationId?: string
  /** Tage, die in die Tabelle geschrieben werden. Default: aus dem Tor. */
  tage?: number
}

interface Abgleich {
  tor: PruefErgebnis
  /** Fehlercode des INSERT, null bei Erfolg. */
  dbFehler: { code?: string; message: string } | null
}

/** Fuehrt den Fall durch BEIDE Seiten und liefert beide Urteile. */
async function beideSeiten(fall: Fall): Promise<Abgleich> {
  const clientId = fall.clientId ?? KLIENT
  const organizationId = fall.organizationId ?? ORG

  const bestand = await ladeBestand(admin, { clientId, organizationId, zeitraum: fall.zeitraum })
  const tor = pruefeBuchung({
    organizationId,
    clientId,
    art: fall.art,
    zeitraum: fall.zeitraum,
    betragEuro: fall.betragEuro,
    pflegegrad: bestand.pflegegrad,
    tarif: TARIF_OK,
    staende: bestand.staende,
    bestand: bestand.bestand,
  })

  const jahr = Number(fall.zeitraum.von.slice(0, 4))
  const { error } = await admin.from('vpkzp_buchungen').insert({
    organization_id: organizationId,
    client_id: clientId,
    art: fall.art,
    calendar_year: jahr,
    zeitraum_von: fall.zeitraum.von,
    zeitraum_bis: fall.zeitraum.bis,
    tage: fall.tage ?? Math.max(1, tor.tageGesamt),
    betrag_euro: fall.betragEuro,
    budget_betrag_euro: tor.budgetBetragEuro,
    privat_betrag_euro: tor.privatBetragEuro,
    tarif_status: 'verified',
  }).select('id')

  return { tor, dbFehler: error ? { code: error.code, message: error.message } : null }
}

/** Codes der sperrenden Befunde. */
function sperren(e: PruefErgebnis): PruefCode[] {
  return e.befunde.filter(b => b.schwere === 'sperrend').map(b => b.code)
}

/** Vorverbrauch direkt setzen — schneller als N echte Buchungen. */
async function setzeVorverbrauch(werte: {
  jahr: number
  vpTage?: number
  kzpTage?: number
  betragEuro?: number
  klient?: string
}): Promise<void> {
  const klient = werte.klient ?? KLIENT
  const von = `${werte.jahr}-01-01`
  const tage = (werte.vpTage ?? 0) + (werte.kzpTage ?? 0)
  if (tage === 0) return

  // Ueber ECHTE Buchungen, damit der Fortschreibungs-Trigger den
  // Jahresstand schreibt — von Hand ist client_vpkzp_usage gesperrt
  // (trg_vpkzp_usage_abgeleitet).
  if (werte.vpTage) {
    const bis = new Date(Date.UTC(werte.jahr, 0, werte.vpTage))
    await db.query(
      `INSERT INTO public.vpkzp_buchungen
         (organization_id, client_id, art, calendar_year, zeitraum_von, zeitraum_bis,
          tage, betrag_euro, budget_betrag_euro)
       VALUES ($1, $2, 'verhinderungspflege', $3, $4, $5, $6, $7, $7)`,
      [ORG, klient, werte.jahr, von, bis.toISOString().slice(0, 10),
       werte.vpTage, werte.betragEuro ?? 0] as never[],
    )
  }
  if (werte.kzpTage) {
    const start = new Date(Date.UTC(werte.jahr, 5, 1))
    const ende = new Date(Date.UTC(werte.jahr, 5, werte.kzpTage))
    await db.query(
      `INSERT INTO public.vpkzp_buchungen
         (organization_id, client_id, art, calendar_year, zeitraum_von, zeitraum_bis,
          tage, betrag_euro, budget_betrag_euro)
       VALUES ($1, $2, 'kurzzeitpflege', $3, $4, $5, $6, 0, 0)`,
      [ORG, klient, werte.jahr, start.toISOString().slice(0, 10),
       ende.toISOString().slice(0, 10), werte.kzpTage] as never[],
    )
  }
}

beforeAll(async () => {
  db = new PGlite()

  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
      END IF;
    END $$;

    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    -- clients traegt BEIDE Pflegegradspalten: care_level ist fuehrend,
    -- pflegegrad ist bei Bestandskunden NULL (lib/clients/pflegegrad.ts).
    CREATE TABLE public.clients (
      id uuid PRIMARY KEY,
      organization_id uuid REFERENCES public.organizations(id),
      first_name text, last_name text,
      care_level integer, pflegegrad integer
    );
    CREATE TABLE public.client_budgets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid REFERENCES public.organizations(id),
      client_id uuid REFERENCES public.clients(id),
      year integer NOT NULL,
      combined_annual_amount numeric(12,2)
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

    INSERT INTO public.organizations (id, name) VALUES
      ('${ORG}', 'Mandant Alpha'), ('${ORG_B}', 'Mandant Beta');
    INSERT INTO public.clients (id, organization_id, first_name, last_name, care_level) VALUES
      ('${KLIENT}',     '${ORG}',   'Erika', 'Muster',  3),
      ('${KLIENT_PG1}', '${ORG}',   'Paul',  'Grad1',   1),
      ('${KLIENT_B}',   '${ORG_B}', 'Fremd', 'Mandant', 3);
  `)

  for (const datei of [M_BASIS, M_VP56, M_INTEGRITAET, M_PAARUNG]) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, datei), 'utf-8'))
  }

  admin = macheSupabaseClient(db) as unknown as SupabaseClient
}, 120_000)

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.vpkzp_buchungen;')
  await db.exec('ALTER TABLE public.vpkzp_audit_log DISABLE TRIGGER trg_vpkzp_audit_unveraenderlich;')
  await db.exec('DELETE FROM public.vpkzp_audit_log;')
  await db.exec('ALTER TABLE public.vpkzp_audit_log ENABLE TRIGGER trg_vpkzp_audit_unveraenderlich;')
  await db.exec('DELETE FROM public.client_vpkzp_usage;')
  await db.exec('DELETE FROM public.client_budgets;')
})

// ═════════════════════════════════════════════════════════════════════
describe('1. Der gedeckte Fall — beide Seiten geben frei', () => {
  it('eine Woche Verhinderungspflege im laufenden Jahr geht durch', async () => {
    const { tor, dbFehler } = await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-03-02', bis: '2026-03-08' },
      betragEuro: 490,
    })

    expect(tor.entscheidung).toBe('freigegeben')
    expect(tor.tageGesamt).toBe(7)
    expect(tor.budgetBetragEuro).toBe(490)
    expect(tor.privatBetragEuro).toBe(0)
    expect(dbFehler, 'die Datenbank muss dieselbe Buchung annehmen').toBeNull()
  })

  it('der Jahresstand traegt die Buchung fort', async () => {
    await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-03-02', bis: '2026-03-08' },
      betragEuro: 490,
    })

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT vp_days_used, kzp_days_used, vp_amount_used, combined_budget_remaining
         FROM public.client_vpkzp_usage
        WHERE client_id = $1 AND calendar_year = 2026`, [KLIENT] as never[],
    )
    expect(rows.length).toBe(1)
    expect(Number(rows[0].vp_days_used)).toBe(7)
    expect(Number(rows[0].kzp_days_used)).toBe(0)
    expect(Number(rows[0].vp_amount_used)).toBe(490)
    expect(Number(rows[0].combined_budget_remaining)).toBe(KOMBI_BUDGET - 490)
  })

  it('ein zweiter Blick des Tors sieht den Vorverbrauch', async () => {
    await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-03-02', bis: '2026-03-08' },
      betragEuro: 490,
    })

    const bestand = await ladeBestand(admin, {
      clientId: KLIENT, organizationId: ORG,
      zeitraum: { von: '2026-05-04', bis: '2026-05-10' },
    })
    expect(bestand.staende[0].vpTageVerbraucht).toBe(7)
    expect(bestand.bestand.length).toBe(1)
    expect(bestand.pflegegrad).toBe(3)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('2. Tagekontingent — 56 Tage ab 2025, 42 bis 2024', () => {
  it('der 57. VP-Tag 2026 wird von BEIDEN Seiten abgelehnt', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 56 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-07-01', bis: '2026-07-01' },
      betragEuro: 70,
    })

    expect(sperren(tor)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
    expect(tor.buchbar).toBe(false)
    expect(dbFehler, 'der Trigger muss dieselbe Grenze halten').not.toBeNull()
    expect(String(dbFehler?.message)).toMatch(/kontingent|tage/i)
  })

  it('der 56. VP-Tag 2026 geht auf beiden Seiten noch durch', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 55 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-07-01', bis: '2026-07-01' },
      betragEuro: 70,
    })

    expect(tor.entscheidung).toBe('freigegeben')
    expect(dbFehler).toBeNull()
  })

  it('fuer den Rechtsstand 2024 gelten 42 Tage — der 43. faellt bei beiden', async () => {
    await setzeVorverbrauch({ jahr: 2024, vpTage: 42 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2024-07-01', bis: '2024-07-01' },
      betragEuro: 70,
    })

    expect(sperren(tor)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
    expect(dbFehler).not.toBeNull()
  })

  it('42 VP-Tage sind 2026 KEINE Grenze mehr — beide Seiten lassen weiter buchen', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 42 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-07-01', bis: '2026-07-01' },
      betragEuro: 70,
    })

    expect(tor.entscheidung).toBe('freigegeben')
    expect(dbFehler).toBeNull()
  })

  it('Kurzzeitpflege hat ihr eigenes Kontingent — volle VP-Tage sperren sie nicht', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 56 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'kurzzeitpflege',
      zeitraum: { von: '2026-09-01', bis: '2026-09-07' },
      betragEuro: 490,
    })

    expect(tor.entscheidung).toBe('freigegeben')
    expect(dbFehler).toBeNull()
  })

  it('der 57. KZP-Tag faellt ebenfalls bei beiden', async () => {
    await setzeVorverbrauch({ jahr: 2026, kzpTage: 56 })

    const { tor, dbFehler } = await beideSeiten({
      art: 'kurzzeitpflege',
      zeitraum: { von: '2026-09-01', bis: '2026-09-01' },
      betragEuro: 70,
    })

    expect(sperren(tor)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
    expect(dbFehler).not.toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('3. Jahreswechsel', () => {
  const UEBER_DEN_WECHSEL: Zeitraum = { von: '2026-12-28', bis: '2027-01-04' }

  it('das Tor zerlegt den Zeitraum in zwei Jahressegmente', async () => {
    const bestand = await ladeBestand(admin, {
      clientId: KLIENT, organizationId: ORG, zeitraum: UEBER_DEN_WECHSEL,
    })
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum: UEBER_DEN_WECHSEL, betragEuro: 800,
      pflegegrad: bestand.pflegegrad, tarif: TARIF_OK,
      staende: bestand.staende, bestand: bestand.bestand,
    })

    expect(tor.jahre.map(j => j.jahr)).toEqual([2026, 2027])
    expect(tor.jahre[0].segment.tage).toBe(4)  // 28.–31.12.
    expect(tor.jahre[1].segment.tage).toBe(4)  // 01.–04.01.
    expect(tor.tageGesamt).toBe(8)
    // Der Betrag wird tageproportional verteilt, nicht einem Jahr
    // zugeschlagen.
    expect(tor.jahre[0].buchung?.betragEuro).toBe(400)
    expect(tor.jahre[1].buchung?.betragEuro).toBe(400)
  })

  it('die Datenbank lehnt eine NICHT zerlegte Buchung ab', async () => {
    const { error } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026,
      zeitraum_von: UEBER_DEN_WECHSEL.von, zeitraum_bis: UEBER_DEN_WECHSEL.bis,
      tage: 8, betrag_euro: 800, budget_betrag_euro: 800,
    }).select('id')

    expect(error?.code, 'vpkzp_buchungen_im_kalenderjahr').toBe('23514')
  })

  it('die zerlegten Segmente nimmt sie an und fuehrt zwei Jahresstaende', async () => {
    const eins = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-12-28', zeitraum_bis: '2026-12-31',
      tage: 4, betrag_euro: 400, budget_betrag_euro: 400,
    }).select('id')
    const zwei = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2027, zeitraum_von: '2027-01-01', zeitraum_bis: '2027-01-04',
      tage: 4, betrag_euro: 400, budget_betrag_euro: 400,
    }).select('id')

    expect(eins.error).toBeNull()
    expect(zwei.error).toBeNull()

    const { rows } = await db.query<{ calendar_year: number; vp_days_used: number }>(
      `SELECT calendar_year, vp_days_used FROM public.client_vpkzp_usage
        WHERE client_id = $1 ORDER BY calendar_year`, [KLIENT] as never[],
    )
    expect(rows.map(r => Number(r.calendar_year))).toEqual([2026, 2027])
    expect(rows.map(r => Number(r.vp_days_used))).toEqual([4, 4])
  })

  it('jedes Jahr bekommt sein eigenes Kontingent zurueck', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 56 })

    const bestand = await ladeBestand(admin, {
      clientId: KLIENT, organizationId: ORG,
      zeitraum: { von: '2027-01-05', bis: '2027-01-11' },
    })
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum: { von: '2027-01-05', bis: '2027-01-11' }, betragEuro: 490,
      pflegegrad: bestand.pflegegrad, tarif: TARIF_OK,
      staende: bestand.staende, bestand: bestand.bestand,
    })

    expect(tor.entscheidung, '2026 ausgeschoepft heisst nicht 2027 gesperrt').toBe('freigegeben')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('4. Gemeinsamer Jahresbetrag § 42a', () => {
  it('VP und KZP mindern DENSELBEN Topf', async () => {
    await beideSeiten({
      art: 'verhinderungspflege',
      zeitraum: { von: '2026-02-02', bis: '2026-02-08' },
      betragEuro: 1000,
    })
    await beideSeiten({
      art: 'kurzzeitpflege',
      zeitraum: { von: '2026-04-06', bis: '2026-04-12' },
      betragEuro: 1000,
    })

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT combined_budget_total, combined_budget_remaining
         FROM public.client_vpkzp_usage WHERE client_id = $1 AND calendar_year = 2026`,
      [KLIENT] as never[],
    )
    expect(Number(rows[0].combined_budget_total)).toBe(KOMBI_BUDGET)
    expect(Number(rows[0].combined_budget_remaining)).toBe(KOMBI_BUDGET - 2000)
  })

  it('ueber dem Budget teilt das Tor in Kassen- und Privatanteil', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 10, betragEuro: KOMBI_BUDGET - 100 })

    const bestand = await ladeBestand(admin, {
      clientId: KLIENT, organizationId: ORG,
      zeitraum: { von: '2026-06-01', bis: '2026-06-03' },
    })
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum: { von: '2026-06-01', bis: '2026-06-03' }, betragEuro: 300,
      pflegegrad: bestand.pflegegrad, tarif: TARIF_OK,
      staende: bestand.staende, bestand: bestand.bestand,
    })

    expect(tor.entscheidung).toBe('teilweise')
    expect(tor.budgetBetragEuro).toBe(100)
    expect(tor.privatBetragEuro).toBe(200)
    expect(sperren(tor)).toContain('BUDGET_ERSCHOEPFT')
  })

  it('der Restbetrag der Datenbank wird nie negativ', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 10, betragEuro: KOMBI_BUDGET - 100 })

    await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-06-01', zeitraum_bis: '2026-06-03',
      tage: 3, betrag_euro: 300, budget_betrag_euro: 300, privat_betrag_euro: 0,
    }).select('id')

    const { rows } = await db.query<{ combined_budget_remaining: string }>(
      `SELECT combined_budget_remaining FROM public.client_vpkzp_usage
        WHERE client_id = $1 AND calendar_year = 2026`, [KLIENT] as never[],
    )
    expect(Number(rows[0].combined_budget_remaining)).toBe(0)
  })

  it('eine abweichende Bewilligung der Kasse schlaegt den gesetzlichen Wert', async () => {
    await admin.from('client_budgets').insert({
      organization_id: ORG, client_id: KLIENT, year: 2026, combined_annual_amount: 1200,
    }).select('id')

    const bestand = await ladeBestand(admin, {
      clientId: KLIENT, organizationId: ORG,
      zeitraum: { von: '2026-06-01', bis: '2026-06-03' },
    })
    expect(bestand.staende[0].kombiniertesBudgetEuro).toBe(1200)

    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum: { von: '2026-06-01', bis: '2026-06-03' }, betragEuro: 1500,
      pflegegrad: bestand.pflegegrad, tarif: TARIF_OK,
      staende: bestand.staende, bestand: bestand.bestand,
    })
    expect(tor.budgetBetragEuro).toBe(1200)
    expect(tor.privatBetragEuro).toBe(300)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('5. Anspruchsvoraussetzung und Tarif', () => {
  it('Pflegegrad 1 wird abgelehnt — die Kette bricht vor dem INSERT', async () => {
    const zeitraum: Zeitraum = { von: '2026-03-02', bis: '2026-03-08' }
    const bestand = await ladeBestand(admin, {
      clientId: KLIENT_PG1, organizationId: ORG, zeitraum,
    })
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT_PG1, art: 'verhinderungspflege',
      zeitraum, betragEuro: 490, pflegegrad: bestand.pflegegrad,
      tarif: TARIF_OK, staende: bestand.staende, bestand: bestand.bestand,
    })

    expect(bestand.pflegegrad).toBe(1)
    expect(sperren(tor)).toContain('PFLEGEGRAD_ZU_NIEDRIG')
    expect(tor.buchbar).toBe(false)
  })

  it('ein gesperrter Tarif blockt, auch wenn Tage und Budget reichen', async () => {
    const zeitraum: Zeitraum = { von: '2026-03-02', bis: '2026-03-08' }
    const bestand = await ladeBestand(admin, { clientId: KLIENT, organizationId: ORG, zeitraum })
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum, betragEuro: 490, pflegegrad: bestand.pflegegrad,
      tarif: { quellTabelle: 'billing_tariffs', tarifStatus: 'blocked' },
      staende: bestand.staende, bestand: bestand.bestand,
    })

    expect(sperren(tor)).toContain('TARIF_NICHT_VERIFIZIERT')
  })

  it('ein fehlender Pflegegrad ist keine stille Freigabe', async () => {
    const zeitraum: Zeitraum = { von: '2026-03-02', bis: '2026-03-08' }
    const tor = pruefeBuchung({
      organizationId: ORG, clientId: KLIENT, art: 'verhinderungspflege',
      zeitraum, betragEuro: 490, pflegegrad: null, tarif: TARIF_OK,
      staende: [], bestand: [],
    })

    expect(tor.buchbar).toBe(false)
    expect(sperren(tor)).toContain('FACHAUSKUNFT_ERFORDERLICH')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('6. Negative Betraege (Kette 9)', () => {
  const NEGATIV = [
    ['betrag_euro', { betrag_euro: -1 }],
    ['budget_betrag_euro', { budget_betrag_euro: -1 }],
    ['privat_betrag_euro', { privat_betrag_euro: -0.01 }],
  ] as const

  for (const [name, felder] of NEGATIV) {
    it(`${name} unter null wird von der Datenbank abgewiesen`, async () => {
      const { error } = await admin.from('vpkzp_buchungen').insert({
        organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
        calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-02',
        tage: 1, betrag_euro: 0, budget_betrag_euro: 0, privat_betrag_euro: 0,
        ...felder,
      }).select('id')

      expect(error?.code).toBe('23514')
    })
  }

  it('ein negativer Betrag laesst sich auch nachtraeglich nicht hineinschreiben', async () => {
    const { data } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-02',
      tage: 1, betrag_euro: 70, budget_betrag_euro: 70,
    }).select('id')

    const id = (data as Array<{ id: string }>)[0].id
    const { error } = await admin
      .from('vpkzp_buchungen').update({ budget_betrag_euro: -70 }).eq('id', id).select('id')

    expect(error?.code).toBe('23514')
  })

  it('null Euro bleibt erlaubt — eine unentgeltliche Leistung ist kein Fehler', async () => {
    const { error } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-02',
      tage: 1, betrag_euro: 0, budget_betrag_euro: 0, privat_betrag_euro: 0,
    }).select('id')

    expect(error).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('7. Aenderungsspur (Kette 10)', () => {
  it('Anlage, Aenderung und Storno stehen im Protokoll', async () => {
    const { data } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-08',
      tage: 7, betrag_euro: 490, budget_betrag_euro: 490,
    }).select('id')
    const id = (data as Array<{ id: string }>)[0].id

    await admin.from('vpkzp_buchungen').update({ notiz: 'Nachtrag' }).eq('id', id).select('id')
    await admin.from('vpkzp_buchungen').update({ status: 'storniert' }).eq('id', id).select('id')

    const { rows } = await db.query<{ aktion: string }>(
      `SELECT aktion FROM public.vpkzp_audit_log WHERE buchung_id = $1 ORDER BY created_at`,
      [id] as never[],
    )
    // Die Tabelle hat keine Folgenummer; bei gleichem created_at waere
    // die Reihenfolge nicht bestimmt. Geprueft wird deshalb der Bestand
    // — und getrennt davon, dass die Anlage zeitlich zuerst kommt.
    expect([...rows.map(r => r.aktion)].sort())
      .toEqual(['aenderung', 'anlage', 'storno'])
    expect(rows[0].aktion).toBe('anlage')
  })

  it('ein Storno gibt Tage und Betrag wieder frei', async () => {
    const { data } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-08',
      tage: 7, betrag_euro: 490, budget_betrag_euro: 490,
    }).select('id')
    const id = (data as Array<{ id: string }>)[0].id

    await admin.from('vpkzp_buchungen').update({ status: 'storniert' }).eq('id', id).select('id')

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT vp_days_used, vp_amount_used FROM public.client_vpkzp_usage
        WHERE client_id = $1 AND calendar_year = 2026`, [KLIENT] as never[],
    )
    expect(Number(rows[0].vp_days_used)).toBe(0)
    expect(Number(rows[0].vp_amount_used)).toBe(0)
  })

  it('ein von Hand geschriebener Protokolleintrag wird abgewiesen', async () => {
    const { error } = await admin.from('vpkzp_audit_log').insert({
      organization_id: ORG, client_id: KLIENT, aktion: 'anlage',
      nachher: { erfunden: true },
    }).select('id')

    expect(error).not.toBeNull()
    expect(String(error?.message)).toContain('VPKZP_AUDIT_NUR_AUS_TRIGGER')
  })

  it('bestehende Protokollzeilen sind unveraenderlich', async () => {
    await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-02',
      tage: 1, betrag_euro: 70, budget_betrag_euro: 70,
    }).select('id')

    const geaendert = await admin
      .from('vpkzp_audit_log').update({ aktion: 'storno' }).eq('aktion', 'anlage').select('id')
    expect(geaendert.error).not.toBeNull()

    const geloescht = await admin
      .from('vpkzp_audit_log').delete().eq('aktion', 'anlage').select('id')
    expect(geloescht.error).not.toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('8. Mandantentrennung (Kette 8)', () => {
  it('ladeBestand findet einen fremden Klienten nicht', async () => {
    await expect(
      ladeBestand(admin, {
        clientId: KLIENT_B, organizationId: ORG,
        zeitraum: { von: '2026-03-02', bis: '2026-03-08' },
      }),
    ).rejects.toBeInstanceOf(VpKzpLageNichtErmittelbarError)
  })

  it('der Fehler sagt "nicht ermittelbar", nicht "nichts verbraucht"', async () => {
    const fehler = await ladeBestand(admin, {
      clientId: KLIENT_B, organizationId: ORG,
      zeitraum: { von: '2026-03-02', bis: '2026-03-08' },
    }).catch(e => e as Error)

    expect(fehler.message).toContain('anderen Mandanten')
    expect(fehler.message).toContain('NICHTS gebucht')
  })

  it('Jahresstaende bleiben je Mandant getrennt, auch im selben Jahr', async () => {
    await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-08',
      tage: 7, betrag_euro: 490, budget_betrag_euro: 490,
    }).select('id')
    await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG_B, client_id: KLIENT_B, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-04',
      tage: 3, betrag_euro: 210, budget_betrag_euro: 210,
    }).select('id')

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT organization_id, vp_days_used FROM public.client_vpkzp_usage
        WHERE calendar_year = 2026 ORDER BY vp_days_used`,
    )
    expect(rows.length).toBe(2)
    expect(rows.map(r => Number(r.vp_days_used))).toEqual([3, 7])
  })

  it('eine Buchung mit fremdem Klienten unter eigener Organisation faellt am Trigger', async () => {
    // Die beiden Fremdschluessel allein reichen nicht: jeder fuer sich
    // ist erfuellt, die PAARUNG prueft keiner. Ohne
    // 20261001010000_vpkzp_mandantenpaarung.sql wuerde der
    // Fortschreibungs-Trigger daraufhin unter Mandant A einen
    // Jahresstand fuer einen Klienten von B anlegen.
    const { error } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT_B, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-04',
      tage: 3, betrag_euro: 210, budget_betrag_euro: 210,
    }).select('id')

    expect(error).not.toBeNull()
    expect(String(error?.message)).toContain('VPKZP_MANDANT_PASST_NICHT')

    const { rows } = await db.query(
      `SELECT 1 FROM public.client_vpkzp_usage
        WHERE organization_id = $1 AND client_id = $2`, [ORG, KLIENT_B] as never[],
    )
    expect(rows.length, 'kein Jahresstand ueber die Mandantengrenze hinweg').toBe(0)
  })

  it('auch nachtraeglich laesst sich eine Buchung nicht in einen fremden Mandanten schieben', async () => {
    const { data } = await admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-04',
      tage: 3, betrag_euro: 210, budget_betrag_euro: 210,
    }).select('id')
    const id = (data as Array<{ id: string }>)[0].id

    const { error } = await admin
      .from('vpkzp_buchungen').update({ organization_id: ORG_B }).eq('id', id).select('id')

    expect(String(error?.message)).toContain('VPKZP_MANDANT_PASST_NICHT')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('9. Parallele Buchungen (Wettlauf)', () => {
  it('zwei gleichzeitige Buchungen auf den letzten Tag lassen nur EINE durch', async () => {
    await setzeVorverbrauch({ jahr: 2026, vpTage: 55 })

    const eine = (tag: string) => admin.from('vpkzp_buchungen').insert({
      organization_id: ORG, client_id: KLIENT, art: 'verhinderungspflege',
      calendar_year: 2026, zeitraum_von: tag, zeitraum_bis: tag,
      tage: 1, betrag_euro: 70, budget_betrag_euro: 70,
    }).select('id')

    const [a, b] = await Promise.all([eine('2026-07-01'), eine('2026-07-02')])
    const durch = [a, b].filter(r => !r.error).length

    expect(durch, 'das 56-Tage-Kontingent laesst genau einen der beiden zu').toBe(1)

    const { rows } = await db.query<{ vp_days_used: number }>(
      `SELECT vp_days_used FROM public.client_vpkzp_usage
        WHERE client_id = $1 AND calendar_year = 2026`, [KLIENT] as never[],
    )
    expect(Number(rows[0].vp_days_used)).toBe(56)
  })

  it('die Sperre steht im Funktionsrumpf VOR dem Zaehlen', async () => {
    const { rows } = await db.query<{ prosrc: string }>(
      `SELECT prosrc FROM pg_proc WHERE proname = 'vpkzp_fortschreiben'`,
    )
    const rumpf = rows[0].prosrc
    const sperre = rumpf.indexOf('pg_advisory_xact_lock')
    const zaehlung = rumpf.indexOf('count(')

    expect(sperre, 'ohne Sperre waere die Zaehlung ein Wettlauf').toBeGreaterThan(-1)
    expect(sperre).toBeLessThan(zaehlung)
  })
})
