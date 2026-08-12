// ═══════════════════════════════════════════════════════════════
// Block 19 — Ops-Audit
// Vereinheitlichte Sicht auf die vorhandenen Audit-Tabellen
// (ops_aktivitaetslog, billing_audit_trail), org-gefenced, mit
// Filterung nach Zeitraum, Akteur und Aktion.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsAuditQuelle = 'aufgaben' | 'abrechnung'

export interface UnifiedAuditEntry {
  id: string
  quelle: OpsAuditQuelle
  entitaetTyp: string
  entitaetId: string
  aktion: string
  akteurId: string | null
  akteurName: string | null
  zeitpunkt: string // ISO-Timestamp
  vorher: Record<string, unknown> | null
  nachher: Record<string, unknown> | null
}

export interface OpsAuditFilter {
  von?: string // ISO-Datum, inklusive
  bis?: string // ISO-Datum, inklusive
  aktion?: string
  akteur?: string // Freitext-Teilstring auf akteurName
  quelle?: OpsAuditQuelle
}

export interface LadeOpsAuditParams extends OpsAuditFilter {
  organizationId: string
  limit?: number
}

// ── Normalisierung (pure) ─────────────────────────────────────────

export function normalizeAktivitaet(
  row: {
    id: string; entitaet_typ: string; entitaet_id: string; aktion: string
    akteur_id: string | null; erstellt_am: string
    vorher: Record<string, unknown> | null; nachher: Record<string, unknown> | null
  },
  akteurName: string | null,
): UnifiedAuditEntry {
  return {
    id: row.id,
    quelle: 'aufgaben',
    entitaetTyp: row.entitaet_typ,
    entitaetId: row.entitaet_id,
    aktion: row.aktion,
    akteurId: row.akteur_id,
    akteurName,
    zeitpunkt: row.erstellt_am,
    vorher: row.vorher,
    nachher: row.nachher,
  }
}

export function normalizeBillingAudit(
  row: {
    id: string; entity_type: string; entity_id: string; action: string
    actor_id: string; created_at: string
    previous_state: Record<string, unknown> | null; new_state: Record<string, unknown> | null
  },
  akteurName: string | null,
): UnifiedAuditEntry {
  return {
    id: row.id,
    quelle: 'abrechnung',
    entitaetTyp: row.entity_type,
    entitaetId: row.entity_id,
    aktion: row.action,
    akteurId: row.actor_id,
    akteurName,
    zeitpunkt: row.created_at,
    vorher: row.previous_state,
    nachher: row.new_state,
  }
}

// ── Filter (pure) ──────────────────────────────────────────────────

export function filterAuditEntries(entries: UnifiedAuditEntry[], filter: OpsAuditFilter): UnifiedAuditEntry[] {
  return entries.filter(e => {
    if (filter.quelle && e.quelle !== filter.quelle) return false
    if (filter.aktion && e.aktion !== filter.aktion) return false
    if (filter.von && e.zeitpunkt.slice(0, 10) < filter.von) return false
    if (filter.bis && e.zeitpunkt.slice(0, 10) > filter.bis) return false
    if (filter.akteur) {
      const needle = filter.akteur.trim().toLowerCase()
      if (needle && !(e.akteurName || '').toLowerCase().includes(needle)) return false
    }
    return true
  })
}

export function sortAuditEntriesDesc(entries: UnifiedAuditEntry[]): UnifiedAuditEntry[] {
  return [...entries].sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))
}

// ── DB-Beschaffung ───────────────────────────────────────────────

export async function ladeOpsAudit(
  supabase: SupabaseClient,
  params: LadeOpsAuditParams,
): Promise<UnifiedAuditEntry[]> {
  const holLimit = 500
  const [aktivitaetenRes, billingRes] = await Promise.all([
    supabase
      .from('ops_aktivitaetslog')
      .select('id, entitaet_typ, entitaet_id, aktion, akteur_id, erstellt_am, vorher, nachher')
      .eq('organization_id', params.organizationId)
      .order('erstellt_am', { ascending: false })
      .limit(holLimit),
    supabase
      .from('billing_audit_trail')
      .select('id, entity_type, entity_id, action, actor_id, created_at, previous_state, new_state')
      .eq('organization_id', params.organizationId)
      .order('created_at', { ascending: false })
      .limit(holLimit),
  ])

  if (aktivitaetenRes.error) throw new Error(`Aktivitätslog konnte nicht geladen werden: ${aktivitaetenRes.error.message}`)
  if (billingRes.error) throw new Error(`Abrechnungs-Audit konnte nicht geladen werden: ${billingRes.error.message}`)

  const akteurIds = new Set<string>()
  for (const r of aktivitaetenRes.data || []) if (r.akteur_id) akteurIds.add(r.akteur_id)
  for (const r of billingRes.data || []) if (r.actor_id) akteurIds.add(r.actor_id)

  const akteurNamen = new Map<string, string>()
  if (akteurIds.size > 0) {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', Array.from(akteurIds))
    if (profileErr) throw new Error(`Akteure konnten nicht geladen werden: ${profileErr.message}`)
    for (const p of profile || []) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      akteurNamen.set(p.id, name || 'Unbekannt')
    }
  }

  const vereinheitlicht: UnifiedAuditEntry[] = [
    ...(aktivitaetenRes.data || []).map((r: any) => normalizeAktivitaet(r, r.akteur_id ? akteurNamen.get(r.akteur_id) || null : null)),
    ...(billingRes.data || []).map((r: any) => normalizeBillingAudit(r, r.actor_id ? akteurNamen.get(r.actor_id) || null : null)),
  ]

  const gefiltert = filterAuditEntries(vereinheitlicht, params)
  const sortiert = sortAuditEntriesDesc(gefiltert)
  return params.limit ? sortiert.slice(0, params.limit) : sortiert
}
