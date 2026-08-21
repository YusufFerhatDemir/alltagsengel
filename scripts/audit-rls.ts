#!/usr/bin/env tsx
/**
 * audit-rls.ts
 * ------------
 * CI-Lint / Prevention-Control für CAPA-2026-001 (RLS-P0 Notfall-PIN).
 *
 * Prüft automatisiert, dass auf sensitiven Tabellen
 *   - RLS aktiviert bleibt,
 *   - keine unsicheren Policies wieder eingeführt werden,
 *   - keine SELECT-Policy mit USING(true) für anon existiert,
 *   - der DB-CHECK-Constraint auf notfall_pin existiert.
 *
 * Die Abfragen laufen über feste, read-only SECURITY DEFINER RPCs
 * (audit_rls_status, audit_rls_policies, audit_check_constraint_exists),
 * aufrufbar nur mit service_role.
 *
 * Ausführung lokal: npx tsx scripts/audit-rls.ts
 * CI:               exit-code ≠ 0 bei Verstößen.
 *
 * Erforderliche ENV:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY   (CI-Secret, nie in Client-Builds)
 */

import { createClient } from '@supabase/supabase-js'

// ---- Konfig ---------------------------------------------------------------

/** Tabellen, für die RLS zwingend aktiv sein muss (DSGVO Art. 9). */
const SENSITIVE_TABLES: string[] = [
  'notfall_info',
  'profiles',
  'medikamentenplan',
  'einnahme_log',
  'notfall_audit_log',
]

/**
 * Policies, die durch CAPA-2026-001 gedroppt wurden und nicht
 * wieder auftauchen dürfen.
 */
const FORBIDDEN_POLICY_NAMES: Array<{ table: string; name: string }> = [
  { table: 'notfall_info', name: 'Öffentliche Notfall-Infos lesbar' },
  { table: 'profiles', name: 'Öffentliches Profil für Notfall' },
  { table: 'medikamentenplan', name: 'Öffentliche Medikamente für Notfall' },
]

/**
 * Rollen, für die keine ungefilterte SELECT-Policy existieren darf.
 *
 * `public` gehört zwingend dazu: eine Policy `TO public` gilt für JEDE
 * DB-Rolle — anon eingeschlossen. Ohne diesen Eintrag lief der Audit an
 * "Herkes profilleri okuyabilir" (profiles, SELECT, TO public, USING(true))
 * vorbei, obwohl damit jeder unangemeldete Aufrufer alle Profilzeilen
 * lesen konnte. Siehe 20260815010000_profiles_rls_rekursion_und_anon_leck.sql.
 */
const FORBIDDEN_ROLES_FOR_SELECT = new Set(['anon', 'public'])

/**
 * USING-Ausdrücke, die auf sensitiven Tabellen keinen echten Filter
 * darstellen. `true` ist der offensichtliche Fall; `deleted_at is null`
 * grenzt nur gelöschte Zeilen aus und lässt jeden Aufrufer den kompletten
 * aktiven Bestand lesen — auf profiles ist das derselbe Vollzugriff.
 */
const NON_RESTRICTING_QUALS = new Set(['true', '(deleted_at is null)', 'deleted_at is null'])

// ---- Types ----------------------------------------------------------------

interface PolicyRow {
  tablename: string
  policyname: string
  cmd: string
  roles: string[] | null
  qual: string | null
  with_check: string | null
}

interface TableRlsRow {
  tablename: string
  rowsecurity: boolean
}

// ---- Output helpers -------------------------------------------------------

function fail(msg: string): void {

  console.error(`❌ ${msg}`)
}

function warn(msg: string): void {

  console.warn(`⚠️  ${msg}`)
}

function ok(msg: string): void {

  console.log(`✅ ${msg}`)
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !serviceKey) {
    fail('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.')
    return 2
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let violations = 0

  // 1) RLS muss auf allen sensitiven Tabellen aktiv sein --------------------
  const { data: rlsData, error: rlsErr } = await supabase.rpc('audit_rls_status', {
    p_tables: SENSITIVE_TABLES,
  })

  if (rlsErr) {
    fail(`audit_rls_status fehlgeschlagen: ${rlsErr.message}`)
    violations++
  } else {
    const rlsRows = (rlsData ?? []) as TableRlsRow[]
    for (const t of SENSITIVE_TABLES) {
      const row = rlsRows.find((r) => r.tablename === t)
      if (!row) {
        warn(`Tabelle ${t} nicht gefunden – übersprungen.`)
        continue
      }
      if (!row.rowsecurity) {
        fail(`RLS nicht aktiv auf ${t}`)
        violations++
      } else {
        ok(`RLS aktiv auf ${t}`)
      }
    }
  }

  // 2) Verbotene Policy-Namen dürfen nicht existieren -----------------------
  const { data: polData, error: polErr } = await supabase.rpc('audit_rls_policies', {
    p_tables: SENSITIVE_TABLES,
  })

  if (polErr) {
    fail(`audit_rls_policies fehlgeschlagen: ${polErr.message}`)
    violations++
  } else {
    const policies = (polData ?? []) as PolicyRow[]

    for (const forbidden of FORBIDDEN_POLICY_NAMES) {
      const found = policies.find(
        (p) => p.tablename === forbidden.table && p.policyname === forbidden.name,
      )
      if (found) {
        fail(
          `Verbotene Policy "${forbidden.name}" auf ${forbidden.table} existiert wieder (gedroppt in CAPA-2026-001).`,
        )
        violations++
      } else {
        ok(`Policy "${forbidden.name}" auf ${forbidden.table} nicht vorhanden (erwartet).`)
      }
    }

    // 2b) Keine selbstreferenzielle Policy (42P17-Prävention) ---------------
    // Eine Policy auf Tabelle T, die in ihrem USING/WITH CHECK erneut aus T
    // liest, ruft die Policies von T rekursiv auf. Postgres bricht das mit
    // 42P17 ab — die Tabelle ist dann für JEDEN Nicht-service_role-Zugriff
    // tot, unabhängig vom JWT. Der zulässige Weg ist eine SECURITY-DEFINER-
    // Hilfsfunktion (is_admin()), die die Policies gerade NICHT erneut auslöst.
    for (const pol of policies) {
      const ausdruck = `${pol.qual ?? ''} ${(pol as { with_check?: string }).with_check ?? ''}`
      const selbstBezug = new RegExp(
        `\\bfrom\\s+(?:public\\.)?${pol.tablename}\\b`,
        'i',
      ).test(ausdruck)
      if (selbstBezug) {
        fail(
          `Rekursive Policy "${pol.policyname}" auf ${pol.tablename}: liest im USING/CHECK erneut aus ${pol.tablename} → 42P17. SECURITY-DEFINER-Helper (is_admin()) verwenden.`,
        )
        violations++
      }
    }

    // 3) Keine SELECT-Policy mit USING(true) für anon -----------------------
    for (const pol of policies) {
      if (pol.cmd !== 'SELECT') continue
      const qual = (pol.qual ?? '').trim().toLowerCase()
      const qualOffen = NON_RESTRICTING_QUALS.has(qual)
      const hasForbiddenRole = (pol.roles ?? []).some((r) => FORBIDDEN_ROLES_FOR_SELECT.has(r))
      if (qualOffen && hasForbiddenRole) {
        fail(
          `Unsichere SELECT-Policy "${pol.policyname}" auf ${pol.tablename}: USING(${pol.qual}) für Rolle(n) [${pol.roles?.join(', ')}]`,
        )
        violations++
      }
    }
  }

  // 4) CHECK-Constraint auf notfall_pin muss existieren ---------------------
  const { data: conData, error: conErr } = await supabase.rpc('audit_check_constraint_exists', {
    p_table: 'notfall_info',
    p_constraint: 'notfall_info_pin_format_check',
  })

  if (conErr) {
    fail(`audit_check_constraint_exists fehlgeschlagen: ${conErr.message}`)
    violations++
  } else if (!conData) {
    fail('CHECK-Constraint notfall_info_pin_format_check fehlt (CAPA-2026-001).')
    violations++
  } else {
    ok('CHECK-Constraint notfall_info_pin_format_check vorhanden.')
  }

  // ---- Ergebnis ----------------------------------------------------------
  if (violations > 0) {
    fail(`RLS-Audit fehlgeschlagen: ${violations} Verstoß/Verstöße.`)
    return 1
  }
  ok('RLS-Audit bestanden.')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {

    console.error('audit-rls: Unerwarteter Fehler', err)
    process.exit(2)
  })
