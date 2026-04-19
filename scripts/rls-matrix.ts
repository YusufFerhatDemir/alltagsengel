#!/usr/bin/env tsx
// ════════════════════════════════════════════════════════════════════
// rls-matrix.ts — P1.3 RLS-Inventur
// ════════════════════════════════════════════════════════════════════
//
// Zieht alle public-Tabellen + ihre RLS-Policies aus Supabase und
// erzeugt zwei Reports:
//   - docs/security/RLS_MATRIX.md   (Markdown-Tabelle, menschenlesbar)
//   - docs/security/rls-matrix.csv  (Excel/Sheets-tauglich)
//
// Wozu?
//   1. Drift-Detektion: Wenn jemand "mal eben" eine neue Tabelle ohne
//      RLS-Policy anlegt, faellt das im naechsten Lauf sofort auf.
//   2. DSGVO Art. 32: Wir koennen Auditoren auf Knopfdruck zeigen,
//      wer Zugriff auf welche Daten hat.
//   3. Code-Review: PRs mit RLS-Aenderungen sind im Diff sichtbar.
//
// Voraussetzung: Migration 20260419_rls_matrix_rpcs.sql muss ausgerollt
//                sein (legt audit_rls_all_status + audit_rls_all_policies an).
//
// Aufruf:    npm run rls:matrix
// CI-Mode:   npm run rls:matrix -- --check  (exit-1 bei Tabellen ohne Policy)
//
// ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (CI-Secret).
//
// Analogie:
//   Wie ein Inventar-Report im Lager. Listet jedes Regal (Tabelle), jede
//   Schloss-Kombination (Policy) und sagt sofort: "Regal X hat kein
//   Schloss" oder "Regal Y hat einen Generalschluessel fuer alle".
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// ── Konfig ──────────────────────────────────────────────────────────
const OUT_MD  = 'docs/security/RLS_MATRIX.md'
const OUT_CSV = 'docs/security/rls-matrix.csv'

/**
 * Tabellen, die KEINE RLS brauchen (z.B. weil sie public/legacy sind).
 * Begruendung MUSS hier stehen — sonst Drift-Schutz floppt.
 */
const RLS_EXEMPT = new Set<string>([
  // Beispiel: 'pricing_tiers' — public-readable Marketing-Daten
])

// ── Types ───────────────────────────────────────────────────────────
interface RlsStatusRow {
  schemaname: string
  tablename: string
  rowsecurity: boolean
  forcerowsecurity: boolean
}

interface PolicyRow {
  schemaname: string
  tablename: string
  policyname: string
  permissive: string | null
  roles: string[] | null
  cmd: string | null
  qual: string | null
  with_check: string | null
}

interface MatrixRow {
  table: string
  rlsEnabled: boolean
  policyName: string
  roles: string
  cmd: string
  using: string
  withCheck: string
}

// ── Output Helper ───────────────────────────────────────────────────
function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
}

/** Markdown-Tabellen-Cell escapen: Pipe + Newline neutralisieren. */
function mdEscape(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .trim()
}

/** CSV-Cell escapen: Quotes verdoppeln + alles in Anfuehrungszeichen. */
function csvEscape(s: string | null | undefined): string {
  if (s == null) return ''
  const v = String(s).replace(/"/g, '""')
  return `"${v}"`
}

// ── Hauptlogik ──────────────────────────────────────────────────────
async function main(): Promise<void> {
  const checkMode = process.argv.includes('--check')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt')
    process.exit(2)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 1) Tabellen-RLS-Status
  const { data: statusData, error: statusErr } = await supabase.rpc('audit_rls_all_status')
  if (statusErr) {
    console.error('❌ audit_rls_all_status fehlgeschlagen:', statusErr.message)
    console.error('   Hinweis: Migration 20260419_rls_matrix_rpcs.sql noetig.')
    process.exit(2)
  }
  const tables = (statusData ?? []) as RlsStatusRow[]

  // 2) Alle Policies
  const { data: polData, error: polErr } = await supabase.rpc('audit_rls_all_policies')
  if (polErr) {
    console.error('❌ audit_rls_all_policies fehlgeschlagen:', polErr.message)
    process.exit(2)
  }
  const policies = (polData ?? []) as PolicyRow[]

  // 3) Joinen + Matrix bauen (eine Zeile pro Policy, oder Platzhalter wenn keine)
  const rows: MatrixRow[] = []
  const tablesWithoutPolicy: string[] = []
  const tablesWithoutRls: string[] = []

  const sortedTables = [...tables].sort((a, b) => a.tablename.localeCompare(b.tablename))

  for (const t of sortedTables) {
    const tableName = t.tablename
    if (!t.rowsecurity && !RLS_EXEMPT.has(tableName)) {
      tablesWithoutRls.push(tableName)
    }
    const tablePolicies = policies.filter(p => p.tablename === tableName)

    if (tablePolicies.length === 0) {
      if (!RLS_EXEMPT.has(tableName)) tablesWithoutPolicy.push(tableName)
      rows.push({
        table: tableName,
        rlsEnabled: t.rowsecurity,
        policyName: '— (keine Policy)',
        roles: '',
        cmd: '',
        using: '',
        withCheck: '',
      })
      continue
    }

    for (const p of tablePolicies) {
      rows.push({
        table: tableName,
        rlsEnabled: t.rowsecurity,
        policyName: p.policyname,
        roles: (p.roles ?? []).join(', '),
        cmd: p.cmd ?? '',
        using: p.qual ?? '',
        withCheck: p.with_check ?? '',
      })
    }
  }

  // 4) Markdown schreiben
  const generatedAt = new Date().toISOString()
  const mdLines: string[] = []
  mdLines.push('# RLS-Policy-Matrix')
  mdLines.push('')
  mdLines.push(`> Auto-generiert von \`scripts/rls-matrix.ts\` am ${generatedAt}.`)
  mdLines.push('> NICHT manuell bearbeiten — Aenderungen werden ueberschrieben.')
  mdLines.push('')
  mdLines.push(`Status: ${tables.length} Tabellen, ${policies.length} Policies.`)
  mdLines.push('')

  if (tablesWithoutRls.length > 0) {
    mdLines.push('## ⚠️ Tabellen ohne RLS (rowsecurity=false)')
    mdLines.push('')
    for (const name of tablesWithoutRls) {
      mdLines.push(`- \`${name}\``)
    }
    mdLines.push('')
  } else {
    mdLines.push('## ✅ Alle Tabellen haben RLS aktiviert')
    mdLines.push('')
  }

  if (tablesWithoutPolicy.length > 0) {
    mdLines.push('## ⚠️ Tabellen ohne jegliche Policy')
    mdLines.push('')
    mdLines.push('Diese Tabellen haben RLS-Status, aber KEINE Policy — d.h. niemand')
    mdLines.push('ausser service_role darf zugreifen. Pruefen, ob beabsichtigt:')
    mdLines.push('')
    for (const name of tablesWithoutPolicy) {
      mdLines.push(`- \`${name}\``)
    }
    mdLines.push('')
  }

  mdLines.push('## Vollstaendige Policy-Liste')
  mdLines.push('')
  mdLines.push('| Tabelle | RLS | Policy | Rolle(n) | CMD | USING | WITH CHECK |')
  mdLines.push('|---------|-----|--------|----------|-----|-------|------------|')
  for (const r of rows) {
    mdLines.push(
      `| ${mdEscape(r.table)} | ${r.rlsEnabled ? '✅' : '❌'} | ${mdEscape(r.policyName)} | ${mdEscape(r.roles)} | ${mdEscape(r.cmd)} | \`${mdEscape(r.using).slice(0, 200)}\` | \`${mdEscape(r.withCheck).slice(0, 200)}\` |`
    )
  }
  mdLines.push('')

  ensureDir(OUT_MD)
  writeFileSync(OUT_MD, mdLines.join('\n'), 'utf8')
  console.log(`📝 ${OUT_MD} (${rows.length} Zeilen)`)

  // 5) CSV schreiben (volle USING/WITH CHECK ohne Truncation)
  const csvLines: string[] = []
  csvLines.push(['table', 'rls_enabled', 'policy', 'roles', 'cmd', 'using', 'with_check']
    .map(csvEscape).join(','))
  for (const r of rows) {
    csvLines.push([
      r.table,
      r.rlsEnabled ? 'true' : 'false',
      r.policyName,
      r.roles,
      r.cmd,
      r.using,
      r.withCheck,
    ].map(csvEscape).join(','))
  }
  ensureDir(OUT_CSV)
  writeFileSync(OUT_CSV, csvLines.join('\n'), 'utf8')
  console.log(`📊 ${OUT_CSV}`)

  // 6) CI-Check-Mode: bei Drift exit 1
  if (checkMode) {
    let exit = 0
    if (tablesWithoutRls.length > 0) {
      console.error(`❌ ${tablesWithoutRls.length} Tabelle(n) ohne RLS:`, tablesWithoutRls.join(', '))
      exit = 1
    }
    if (tablesWithoutPolicy.length > 0) {
      console.error(`⚠️  ${tablesWithoutPolicy.length} Tabelle(n) ohne Policy:`, tablesWithoutPolicy.join(', '))
      // Policy-Less zaehlt nicht als Hard-Fail, nur Warning. Service-Role-only
      // ist legitim fuer System-Tabellen wie account_deletion_tokens.
    }
    process.exit(exit)
  }

  console.log('✅ RLS-Matrix erfolgreich erzeugt.')
}

main().catch((err) => {
  console.error('❌ Unerwarteter Fehler:', err?.message ?? err)
  process.exit(2)
})
