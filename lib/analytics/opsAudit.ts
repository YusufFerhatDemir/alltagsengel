// ═══════════════════════════════════════════════════════════════
// Block 19 — Ops-Audit
// Vereinheitlichte Sicht auf die vorhandenen Audit-Tabellen, org-gefenced,
// mit Filterung nach Zeitraum, Akteur und Aktion.
//
// Bereich 14 der Lückenanalyse (P2): „Vier getrennte Audit-Spuren ohne
// gemeinsame Sicht — mis_audit_log, billing_audit_trail, wf_audit_log und die
// Modul-Logs lassen sich nirgends zusammen auswerten." Diese Datei führte
// bisher nur zwei davon zusammen (ops_aktivitaetslog + billing_audit_trail);
// die beiden fehlenden — das Administrations-Audit `mis_audit_log` mit seinen
// 436 Aufrufstellen und das Workflow-Audit `wf_audit_log` — sind ergänzt.
//
// Ebenfalls Bereich 14 (P2): „Kein Export der Audit-Spur für eine Prüfung."
// `alsCsv()` liefert genau das; die Aufbewahrungsfrist steht im Löschkonzept
// (docs/LOESCHKONZEPT.md), sie wird hier nicht neu erfunden.
//
// KEINE Sammelabfrage über alle Organisationen: jede Quelle wird einzeln auf
// `organization_id` gefenced. Zeilen ohne organization_id (Altbestand in
// mis_audit_log vor Migration 20260822010000) fallen dabei heraus — das ist
// gewollt, ein mandantenloser Eintrag gehört in keine Mandantensicht.
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type OpsAuditQuelle = 'aufgaben' | 'abrechnung' | 'administration' | 'workflow'

export const OPS_AUDIT_QUELLEN: readonly OpsAuditQuelle[] =
  ['aufgaben', 'abrechnung', 'administration', 'workflow'] as const

export const QUELLE_LABELS: Record<OpsAuditQuelle, string> = {
  aufgaben: 'Aufgaben/Kommunikation',
  abrechnung: 'Abrechnung',
  administration: 'Administration',
  workflow: 'Workflow',
}

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

/**
 * `mis_audit_log` — das Administrations-Audit aus lib/audit-log.ts.
 *
 * Es kennt kein Vorher/Nachher, sondern nur `details` (bewusst: dort stehen
 * geänderte FELDNAMEN, keine Werte — Gesundheitsdaten gehören nicht als
 * Klartext in den Audit-Log). `details` landet deshalb in `nachher`, damit die
 * gemeinsame Sicht nichts erfindet, was die Quelle nicht hergibt.
 */
export function normalizeMisAudit(
  row: {
    id: string; entity_type: string; entity_id: string | null; action: string
    actor_id: string | null; actor_name: string | null; created_at: string
    details: Record<string, unknown> | null
  },
  akteurName: string | null,
): UnifiedAuditEntry {
  return {
    id: row.id,
    quelle: 'administration',
    entitaetTyp: row.entity_type,
    entitaetId: row.entity_id ?? '',
    aktion: row.action,
    akteurId: row.actor_id,
    akteurName: akteurName ?? row.actor_name ?? null,
    zeitpunkt: row.created_at,
    vorher: null,
    nachher: row.details && Object.keys(row.details).length > 0 ? row.details : null,
  }
}

/** `wf_audit_log` — die Workflow-Engine. `typ` ist die Ereignisklasse. */
export function normalizeWfAudit(
  row: {
    id: string; entitaet_typ: string; entitaet_id: string | null
    typ: string; aktion: string; akteur_id: string | null; created_at: string
    details: Record<string, unknown> | null
  },
  akteurName: string | null,
): UnifiedAuditEntry {
  return {
    id: row.id,
    quelle: 'workflow',
    entitaetTyp: row.entitaet_typ,
    entitaetId: row.entitaet_id ?? '',
    aktion: row.aktion,
    akteurId: row.akteur_id,
    akteurName,
    zeitpunkt: row.created_at,
    vorher: null,
    nachher: {
      typ: row.typ,
      ...(row.details && Object.keys(row.details).length > 0 ? row.details : {}),
    },
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
  const [aktivitaetenRes, billingRes, misRes, wfRes] = await Promise.all([
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
    supabase
      .from('mis_audit_log')
      .select('id, entity_type, entity_id, action, actor_id, actor_name, created_at, details')
      .eq('organization_id', params.organizationId)
      .order('created_at', { ascending: false })
      .limit(holLimit),
    supabase
      .from('wf_audit_log')
      .select('id, entitaet_typ, entitaet_id, typ, aktion, akteur_id, created_at, details')
      .eq('organization_id', params.organizationId)
      .order('created_at', { ascending: false })
      .limit(holLimit),
  ])

  if (aktivitaetenRes.error) throw new Error(`Aktivitätslog konnte nicht geladen werden: ${aktivitaetenRes.error.message}`)
  if (billingRes.error) throw new Error(`Abrechnungs-Audit konnte nicht geladen werden: ${billingRes.error.message}`)
  if (misRes.error) throw new Error(`Administrations-Audit konnte nicht geladen werden: ${misRes.error.message}`)
  if (wfRes.error) throw new Error(`Workflow-Audit konnte nicht geladen werden: ${wfRes.error.message}`)

  const akteurIds = new Set<string>()
  for (const r of aktivitaetenRes.data || []) if (r.akteur_id) akteurIds.add(r.akteur_id)
  for (const r of billingRes.data || []) if (r.actor_id) akteurIds.add(r.actor_id)
  for (const r of misRes.data || []) if (r.actor_id) akteurIds.add(r.actor_id)
  for (const r of wfRes.data || []) if (r.akteur_id) akteurIds.add(r.akteur_id)

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
    ...(misRes.data || []).map((r: any) => normalizeMisAudit(r, r.actor_id ? akteurNamen.get(r.actor_id) || null : null)),
    ...(wfRes.data || []).map((r: any) => normalizeWfAudit(r, r.akteur_id ? akteurNamen.get(r.akteur_id) || null : null)),
  ]

  const gefiltert = filterAuditEntries(vereinheitlicht, params)
  const sortiert = sortAuditEntriesDesc(gefiltert)
  return params.limit ? sortiert.slice(0, params.limit) : sortiert
}

// ── Export (pure) ──────────────────────────────────────────────────

const CSV_SPALTEN = [
  'Zeitpunkt', 'Quelle', 'Entitaetstyp', 'Entitaets-ID',
  'Aktion', 'Akteur', 'Akteur-ID', 'Vorher', 'Nachher',
] as const

/**
 * Eine CSV-Zelle. Trennzeichen ist das Semikolon, weil Excel in deutscher
 * Locale genau das erwartet — ein Komma-CSV landet dort in einer einzigen
 * Spalte und ist für eine Prüfung wertlos.
 *
 * Der führende Apostroph bei =, +, -, @ ist kein Schönheitsfehler: ohne ihn
 * interpretiert Excel den Inhalt als Formel (CSV-Injection). Audit-Daten
 * stammen teils aus Freitextfeldern, also ist das ein echter Pfad.
 */
export function csvZelle(wert: unknown): string {
  if (wert === null || wert === undefined) return ''
  const roh = typeof wert === 'object' ? JSON.stringify(wert) : String(wert)
  const entschaerft = /^[=+\-@]/.test(roh) ? `'${roh}` : roh
  return `"${entschaerft.replace(/"/g, '""')}"`
}

/**
 * Audit-Einträge als CSV — für die Vorlage bei einer Prüfung (SGB XI).
 * Reihenfolge und Filterung bestimmt der Aufrufer; hier wird nur formatiert.
 */
export function alsCsv(entries: UnifiedAuditEntry[]): string {
  const zeilen = [CSV_SPALTEN.join(';')]
  for (const e of entries) {
    zeilen.push([
      csvZelle(e.zeitpunkt),
      csvZelle(QUELLE_LABELS[e.quelle] ?? e.quelle),
      csvZelle(e.entitaetTyp),
      csvZelle(e.entitaetId),
      csvZelle(e.aktion),
      csvZelle(e.akteurName),
      csvZelle(e.akteurId),
      csvZelle(e.vorher),
      csvZelle(e.nachher),
    ].join(';'))
  }
  // BOM voran: sonst zerlegt Excel die Umlaute in den Entitätsnamen.
  return '﻿' + zeilen.join('\r\n') + '\r\n'
}
