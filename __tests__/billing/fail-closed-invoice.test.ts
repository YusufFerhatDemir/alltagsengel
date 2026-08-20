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
const VERIFIZIERUNG_SERVICE = 'lib/billing/tarif-verifizierung-service.ts'
const VERIFIZIERUNG_REGELN = 'lib/billing/core/tarif-verifizierung.ts'

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
  // Die Route delegiert seit 20260904000000 an den geteilten Service, damit
  // billing_tariffs und leistungspreise nicht auseinanderdriften koennen.
  const route = readFile(VERIFIZIERUNG_ROUTE)
  const service = readFile(VERIFIZIERUNG_SERVICE)
  const regeln = readFile(VERIFIZIERUNG_REGELN)

  it('die Route benutzt den geteilten Freigabe-Service', () => {
    expect(route).toMatch(/handleVerifizierungPatch/)
    expect(route).toMatch(/'billing_tariffs'/)
  })

  it('verlangt Admin-Auth', () => {
    expect(service).toMatch(/requireOpsAdmin/)
  })

  it('laesst nur verified/unverified/blocked als Zielstatus zu', () => {
    expect(regeln).toMatch(/TARIF_STATUS\s*=\s*\['verified', 'unverified', 'blocked'\]/)
    expect(service).toMatch(/pruefeStatusaenderung/)
  })

  it('verlangt eine Quelle (min. 5 Zeichen) fuer verified und blocked', () => {
    expect(regeln).toMatch(/QUELLE_MIN_LAENGE\s*=\s*5/)
    expect(regeln).toMatch(/quelle\.length < QUELLE_MIN_LAENGE/)
  })

  it('filtert das UPDATE auf organization_id (Mandantentrennung, Admin-Client umgeht RLS)', () => {
    const updateBlock = service.match(/const \{ data: aktualisiert[\s\S]*?\n\n/)?.[0] ?? ''
    expect(service).toMatch(/update\.eq\('organization_id', ctx\.organizationId\)/)
    expect(updateBlock.length).toBeGreaterThan(0)
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
    const desiredStatus = (overrides.tarif_status as string) || 'unverified'
    const rechtsgrundlage = (overrides.rechtsgrundlage as string) || '§45b SGB XI'
    const istKasse = rechtsgrundlage !== 'privat'

    // Immer als unverified einfügen — der DB-Trigger
    // trg_verifizierung_belegpflicht blockiert INSERT mit
    // tarif_status=verified ohne beleg_id + verifizierungs_quelle.
    const { tarif_status: _ts, ...restOverrides } = overrides
    const { data, error } = await supabase
      .from('billing_tariffs')
      .insert({
        organization_id: ORG_A,
        leistungsart: 'alltagsbegleitung_45a',
        rechtsgrundlage,
        verguetungsart: 'zeit_stunde',
        preis_cent: 2500,
        einheit: 'stunde',
        gueltig_ab: '2026-01-01',
        ist_aktiv: true,
        ...restOverrides,
        tarif_status: 'unverified',
      })
      .select()
      .single()
    if (error) throw error

    if (desiredStatus === 'unverified') return data

    if (desiredStatus === 'verified') {
      const updateFields: Record<string, unknown> = {
        tarif_status: 'verified',
        verifizierungs_quelle: 'CI-Shadow-DB-Test (automatisch)',
        verifiziert_von: ACTOR,
        verifiziert_am: new Date().toISOString(),
      }

      if (istKasse) {
        // Beleg anlegen (Trigger prüft beleg_id bei Kassensatz)
        const { data: beleg, error: bErr } = await supabase
          .from('billing_tarif_belege')
          .insert({
            organization_id: ORG_A,
            quell_tabelle: 'billing_tariffs',
            tariff_id: data.id,
            dateiname: 'shadow-test.pdf',
            dateipfad: `shadow-ci/${data.id}.pdf`,
            mime_type: 'application/pdf',
            groesse_bytes: 1024,
            sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            hochgeladen_von: ACTOR,
          })
          .select('id')
          .single()
        if (bErr) throw bErr
        updateFields.beleg_id = beleg.id
      }

      const { error: updErr } = await supabase
        .from('billing_tariffs')
        .update(updateFields)
        .eq('id', data.id)
      if (updErr) throw updErr
      return { ...data, ...updateFields }
    }

    // blocked oder anderer Status
    const { error: updErr } = await supabase
      .from('billing_tariffs')
      .update({ tarif_status: desiredStatus })
      .eq('id', data.id)
    if (updErr) throw updErr
    return { ...data, tarif_status: desiredStatus }
  }

  it('initialisiert den Supabase-Client und raeumt alte Testdaten auf', async () => {
    ;({ createClient } = await import('@supabase/supabase-js'))
    supabase = createClient(SHADOW_URL as string, SHADOW_SERVICE_KEY as string)
    expect(supabase).toBeTruthy()

    // Aufräumen: Tarife + Belege + Invoices aus vorherigen Runs entfernen
    await supabase.from('billing_tariffs').update({ beleg_id: null }).eq('organization_id', ORG_A)
    await supabase.rpc('raw_sql', { query: `DELETE FROM billing_tariff_audit WHERE tariff_id IN (SELECT id FROM billing_tariffs WHERE organization_id = '${ORG_A}')` }).then(() => {}, () => {})
    await supabase.from('billing_tarif_belege').delete().eq('organization_id', ORG_A)
    await supabase.from('billing_tariffs').delete().eq('organization_id', ORG_A)
    await supabase.from('invoices').delete().eq('organization_id', ORG_A)
  })

  it('VERIFIED Kassentarif → Rechnung wird erstellt', async () => {
    await anlegenTarif({ tarif_status: 'verified', gueltig_ab: '2026-06-01', gueltig_bis: '2026-06-30' })
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
    await anlegenTarif({ tarif_status: 'unverified', gueltig_ab: '2026-07-01', gueltig_bis: '2026-07-31' })
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
    await anlegenTarif({ tarif_status: 'blocked', gueltig_ab: '2026-08-01', gueltig_bis: '2026-08-31' })
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
    await anlegenTarif({ tarif_status: 'verified', ist_aktiv: false, gueltig_ab: '2026-09-01', gueltig_bis: '2026-09-30' })
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
      gueltig_ab: '2026-10-01',
      gueltig_bis: '2026-10-31',
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
      gueltig_ab: '2026-11-01',
      gueltig_bis: '2026-11-30',
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
