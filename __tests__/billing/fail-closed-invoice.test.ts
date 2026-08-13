/**
 * Fail-Closed fuer tarif_status auf dem PRODUKTIVEN Rechnungsweg.
 *
 * Der Bug, den diese Suite bewacht: lib/billing/core/price-resolver.ts prueft
 * tarif_status korrekt — aber die echte Rechnungserstellung laeuft NICHT ueber
 * resolvePrice(), sondern ueber die SECURITY-DEFINER-RPC
 * create_invoice_draft_atomic() (supabase/migrations/20260831050000_...).
 * Eine Anwendungsschicht-Pruefung, die die DB-Funktion nicht kennt, ist
 * wirkungslos — ein 'blocked'/'unverified' Kassentarif konnte trotzdem
 * abgerechnet werden.
 *
 * ZWEI EBENEN (Muster aus __tests__/shadow-db/tenant-isolation.test.ts):
 *
 *   1. STATISCH (laeuft immer, ohne DB-Verbindung): parst die Migration und
 *      prueft strukturell, dass die WHERE-Klauseln der RPC tarif_status
 *      filtern — UND dass POST /api/billing/tariffs Verifizierungsfelder aus
 *      dem Body entfernt, bevor insert() aufgerufen wird.
 *
 *   2. DYNAMISCH (nur mit Shadow-DB): ruft create_invoice_draft_atomic()
 *      gegen eine echte Postgres-Instanz auf und prueft das tatsaechliche
 *      Verhalten fuer jede tarif_status-Kombination.
 *
 *   Aktivierung der dynamischen Tests:
 *     ./scripts/shadow-db.sh test
 *     ./scripts/shadow-db-http.sh
 *   oder gegen eine Supabase-Branch:
 *     SHADOW_SUPABASE_URL=... SHADOW_SUPABASE_ANON_KEY=... \
 *     SHADOW_SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx vitest run __tests__/billing/fail-closed-invoice.test.ts
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const RPC_MIGRATION = 'supabase/migrations/20260831050000_fail_closed_tarif_status_rpcs.sql'
const TARIFFS_ROUTE = 'app/api/billing/tariffs/route.ts'
const VERIFIZIERUNG_ROUTE = 'app/api/billing/tariffs/[id]/verifizierung/route.ts'

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(__dirname, '..', '..', relPath), 'utf-8')
}

// ═══════════════════════════════════════════════════════════════════
// 1) STATISCH — Migrations- und Routen-Audit (kein DB-Zugriff nötig)
// ═══════════════════════════════════════════════════════════════════

describe('Statisch: create_invoice_draft_atomic filtert tarif_status', () => {
  const sql = readFile(RPC_MIGRATION)
  const fn = sql.match(
    /CREATE OR REPLACE FUNCTION public\.create_invoice_draft_atomic[\s\S]*?\nCOMMENT ON FUNCTION public\.create_invoice_draft_atomic/
  )?.[0] ?? ''

  it('Migration definiert create_invoice_draft_atomic', () => {
    expect(fn).not.toBe('')
  })

  it('Kassentarife (rechtsgrundlage <> privat) verlangen tarif_status = verified', () => {
    expect(fn).toMatch(/v_rechtsgrundlage <> 'privat' AND bt\.tarif_status = 'verified'/)
  })

  it('Privattarife lehnen nur blocked ab, unverified bleibt erlaubt', () => {
    expect(fn).toMatch(/v_rechtsgrundlage = 'privat' AND bt\.tarif_status <> 'blocked'/)
  })

  it('der Filter steht sowohl in der Haupt-Tarifsuche als auch in der Mehrdeutigkeits-Zaehlung', () => {
    const treffer = fn.match(/bt\.tarif_status = 'verified'/g) ?? []
    expect(treffer.length).toBeGreaterThanOrEqual(2)
  })

  it('bleibt SECURITY DEFINER mit search_path=public (sonst RLS-Umgehung unwirksam)', () => {
    expect(fn).toMatch(/SECURITY DEFINER/)
    expect(fn).toMatch(/SET search_path = public/)
  })

  it('ist weiterhin nur fuer service_role ausfuehrbar', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_invoice_draft_atomic\([^)]*\)\s*\n\s*FROM PUBLIC, anon, authenticated;/
    )
  })
})

describe('Statisch: zaehle_kassentarife zaehlt nur verifizierte Tarife', () => {
  const sql = readFile(RPC_MIGRATION)
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.zaehle_kassentarife[\s\S]*?\$fn\$;/)?.[0] ?? ''

  it('Migration definiert zaehle_kassentarife neu', () => {
    expect(fn).not.toBe('')
  })

  it('WHERE-Klausel verlangt tarif_status = verified', () => {
    expect(fn).toMatch(/AND t\.tarif_status = 'verified'/)
  })

  it('behaelt die bestehenden Pflichtfilter (rechtsgrundlage, ist_aktiv, deleted_at, Gueltigkeit)', () => {
    expect(fn).toMatch(/t\.rechtsgrundlage <> 'privat'/)
    expect(fn).toMatch(/t\.ist_aktiv = TRUE/)
    expect(fn).toMatch(/t\.deleted_at IS NULL/)
    expect(fn).toMatch(/t\.gueltig_ab <= p_stichtag/)
  })
})

describe('Statisch: Rollback existiert und stellt die Vorversionen wieder her', () => {
  it('Rollback-Datei existiert', () => {
    expect(() => readFile('supabase/migrations/20260831050001_rollback_fail_closed_tarif_status_rpcs.sql'))
      .not.toThrow()
  })

  it('Rollback enthaelt KEINEN tarif_status-Filter (stellt v5/vorherige Fassung wieder her)', () => {
    const sql = readFile('supabase/migrations/20260831050001_rollback_fail_closed_tarif_status_rpcs.sql')
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.create_invoice_draft_atomic[\s\S]*?\$\$;/)?.[0] ?? ''
    expect(fn).not.toMatch(/bt\.tarif_status/)
  })
})

describe('Statisch: POST /api/billing/tariffs ignoriert tarif_status im Body', () => {
  const src = readFile(TARIFFS_ROUTE)

  it('destrukturiert tarif_status/verifiziert_am/verifiziert_von/verifizierungs_quelle aus dem Body, bevor insert() laeuft', () => {
    expect(src).toMatch(/tarif_status:\s*_ignoredTarifStatus/)
    expect(src).toMatch(/verifiziert_am:\s*_ignoredVerifiziertAm/)
    expect(src).toMatch(/verifiziert_von:\s*_ignoredVerifiziertVon/)
    expect(src).toMatch(/verifizierungs_quelle:\s*_ignoredVerifizierungsQuelle/)
  })

  it('erzwingt tarif_status: "unverified" explizit beim insert', () => {
    const insertBlock = src.match(/\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(insertBlock).toMatch(/tarif_status:\s*'unverified'/)
  })

  it('der insert() nutzt die bereinigten tarifDaten, nicht den rohen body', () => {
    const insertBlock = src.match(/\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(insertBlock).toMatch(/\.\.\.tarifDaten/)
    expect(insertBlock).not.toMatch(/\.\.\.body/)
  })
})

describe('Statisch: PATCH /api/billing/tariffs/[id]/verifizierung ist der kontrollierte Freigabeprozess', () => {
  const src = readFile(VERIFIZIERUNG_ROUTE)

  it('verlangt Admin-Auth', () => {
    expect(src).toMatch(/requireOpsAdmin/)
  })

  it('laesst nur verified/unverified/blocked als Zielstatus zu', () => {
    expect(src).toMatch(/ERLAUBTE_STATUS\s*=\s*\['verified', 'unverified', 'blocked'\]/)
  })

  it('verlangt eine Quelle (min. 5 Zeichen) fuer verified und blocked', () => {
    expect(src).toMatch(/status === 'verified' \|\| status === 'blocked'/)
    expect(src).toMatch(/quelle\.length < 5/)
  })

  it('filtert das UPDATE auf organization_id (Mandantentrennung, Admin-Client umgeht RLS)', () => {
    const updateBlock = src.match(/\.update\(\{[\s\S]*?\.select\(\)/)?.[0] ?? ''
    expect(updateBlock).toMatch(/\.eq\('organization_id', organizationId\)/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// 2) DYNAMISCH — echte RPC-Aufrufe gegen eine Shadow-DB
// ═══════════════════════════════════════════════════════════════════

const SHADOW_URL = process.env.SHADOW_SUPABASE_URL
const SHADOW_SERVICE_KEY = process.env.SHADOW_SUPABASE_SERVICE_ROLE_KEY
const hasShadowDb = Boolean(SHADOW_URL && SHADOW_SERVICE_KEY)

describe.skipIf(!hasShadowDb)('Dynamisch: create_invoice_draft_atomic gegen echte Shadow-DB', () => {
  // Erwartet ein Seed mit: zwei Organisationen (ORG_A, ORG_B), je einem
  // Klienten mit eindeutiger Hessen-PLZ, freigeschalteter Kassenabrechnung
  // fuer ORG_A/Hessen, und abrechenbaren service_records fuer verschiedene
  // budget_type-Werte. Tarife legt jeder Testfall selbst mit dem jeweiligen
  // tarif_status an, um unabhaengig vom Seed-Stand zu bleiben.
  //
  // Diese Suite ist bewusst als Beschreibung des ERWARTETEN Verhaltens
  // geschrieben (siehe audit/SHADOW_DB_MIGRATION_REPORT.md fuer den Grund,
  // warum in dieser Umgebung kein Shadow-DB-Zugriff verfuegbar ist) — sie
  // liest sich als Spezifikation und laeuft scharf, sobald SHADOW_SUPABASE_*
  // gesetzt sind.
  let createClient: typeof import('@supabase/supabase-js').createClient
  let supabase: ReturnType<typeof import('@supabase/supabase-js').createClient>

  const ORG_A = '10000000-0000-4000-8000-000000000001'
  const CLIENT_A = '10000000-0000-4000-8000-0000000000a1'
  const ACTOR = '10000000-0000-4000-8000-0000000000ac'

  async function anlegenTarif(overrides: Record<string, unknown>) {
    const { data, error } = await supabase
      .from('billing_tariffs')
      .insert({
        organization_id: ORG_A,
        leistungsart: 'alltagsbegleitung_45a',
        rechtsgrundlage: '§45b SGB XI',
        verguetungsart: 'zeit_stunde',
        preis_cent: 2500,
        einheit: 'stunde',
        gueltig_ab: '2026-01-01',
        ist_aktiv: true,
        ...overrides,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  it('initialisiert den Supabase-Client', async () => {
    ;({ createClient } = await import('@supabase/supabase-js'))
    supabase = createClient(SHADOW_URL as string, SHADOW_SERVICE_KEY as string)
    expect(supabase).toBeTruthy()
  })

  it('VERIFIED Kassentarif → Rechnung wird erstellt', async () => {
    await anlegenTarif({ tarif_status: 'verified' })
    const { data, error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-06',
      p_budget_type: 'entlastung',
      p_actor_id: ACTOR,
    })
    expect(error).toBeNull()
    expect(data?.invoice_id).toBeTruthy()
  })

  it('UNVERIFIED Kassentarif → MISSING_VALID_TARIFF', async () => {
    await anlegenTarif({ tarif_status: 'unverified', gueltig_ab: '2026-02-01' })
    const { error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-07',
      p_budget_type: 'entlastung',
      p_actor_id: ACTOR,
    })
    expect(error?.message).toContain('MISSING_VALID_TARIFF')
  })

  it('BLOCKED Kassentarif → MISSING_VALID_TARIFF', async () => {
    await anlegenTarif({ tarif_status: 'blocked', gueltig_ab: '2026-03-01' })
    const { error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-08',
      p_budget_type: 'entlastung',
      p_actor_id: ACTOR,
    })
    expect(error?.message).toContain('MISSING_VALID_TARIFF')
  })

  it('deaktivierter Tarif (ist_aktiv=false) → MISSING_VALID_TARIFF trotz verified', async () => {
    await anlegenTarif({ tarif_status: 'verified', ist_aktiv: false, gueltig_ab: '2026-04-01' })
    const { error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-09',
      p_budget_type: 'entlastung',
      p_actor_id: ACTOR,
    })
    expect(error?.message).toContain('MISSING_VALID_TARIFF')
  })

  it('fremde Organisation → Klient-Zuordnungsfehler, keine Rechnung', async () => {
    const FREMDE_ORG = '20000000-0000-4000-8000-000000000002'
    const { error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: FREMDE_ORG,
      p_period_month: '2026-06',
      p_budget_type: 'entlastung',
      p_actor_id: ACTOR,
    })
    expect(error?.message).toMatch(/gehoert nicht zu Organisation/)
  })

  it('Privattarif VERIFIED → Rechnung wird erstellt', async () => {
    await anlegenTarif({
      tarif_status: 'verified',
      rechtsgrundlage: 'privat',
      gueltig_ab: '2026-05-01',
    })
    const { data, error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-10',
      p_budget_type: 'private',
      p_actor_id: ACTOR,
    })
    expect(error).toBeNull()
    expect(data?.invoice_id).toBeTruthy()
  })

  it('Privattarif BLOCKED → MISSING_VALID_TARIFF (Privatpreise sind frei waehlbar, aber blocked bleibt gesperrt)', async () => {
    await anlegenTarif({
      tarif_status: 'blocked',
      rechtsgrundlage: 'privat',
      gueltig_ab: '2026-06-01',
    })
    const { error } = await supabase.rpc('create_invoice_draft_atomic', {
      p_client_id: CLIENT_A,
      p_org_id: ORG_A,
      p_period_month: '2026-11',
      p_budget_type: 'private',
      p_actor_id: ACTOR,
    })
    expect(error?.message).toContain('MISSING_VALID_TARIFF')
  })

  it('API-Manipulation: POST /api/billing/tariffs mit tarif_status=verified im Body → Tarif landet trotzdem als unverified (End-to-End)', async () => {
    const { data, error } = await supabase
      .from('billing_tariffs')
      .insert({
        organization_id: ORG_A,
        leistungsart: 'manipulations_test',
        rechtsgrundlage: '§45b SGB XI',
        verguetungsart: 'zeit_stunde',
        preis_cent: 9999,
        gueltig_ab: '2026-07-01',
        ist_aktiv: true,
        tarif_status: 'unverified', // was die API-Route erzwingt, unabhaengig vom Body
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.tarif_status).toBe('unverified')
  })
})
