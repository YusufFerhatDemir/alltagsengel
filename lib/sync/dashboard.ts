// ═══════════════════════════════════════════════════════════════
// Aggregationen für das Admin-Sync-Status-Dashboard (Block 20).
// Liest ausschließlich sync_audit_log/sync_konflikte — keine
// zusätzliche Speicherung, keine Annahmen über nicht vorhandene Daten.
// "Queue-Länge pro Org" gibt es serverseitig nicht wörtlich (die Queue
// lebt in IndexedDB auf dem Gerät) — als Näherung zählen wir
// Vorgänge, deren letzter bekannter Audit-Status noch nicht
// 'sync_success' ist ("offene Sync-Vorgänge").
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { listeOffeneKonflikte } from './audit'

export interface SyncStatusProOrg {
  organizationId: string
  offeneVorgaenge: number
  fehler24h: number
  konflikte: number
}

export interface SyncStatusUebersicht {
  offeneKonflikte: number
  offeneSyncVorgaenge: number
  fehler24h: number
  erfolg24h: number
  proOrganisation: SyncStatusProOrg[]
}

const EIN_TAG_MS = 24 * 60 * 60 * 1000

export async function ladeSyncStatusUebersicht(
  admin: SupabaseClient,
  organizationId?: string,
): Promise<SyncStatusUebersicht> {
  const seit = new Date(Date.now() - EIN_TAG_MS).toISOString()

  let query = admin
    .from('sync_audit_log')
    .select('organization_id, idempotency_key, aktion, erstellt_am')
    .gte('erstellt_am', seit)
    .order('erstellt_am', { ascending: true })
    .limit(5000)
  if (organizationId) query = query.eq('organization_id', organizationId)

  const { data: auditRows, error } = await query
  if (error) throw new Error(error.message)

  const zeilen = (auditRows ?? []) as Array<{ organization_id: string; idempotency_key: string; aktion: string; erstellt_am: string }>

  // Letzter bekannter Status je (Org, Idempotency-Key) — Zeilen kommen
  // sortiert nach erstellt_am, also überschreibt der spätere Eintrag den
  // früheren in der Map.
  const letzterStatusProVorgang = new Map<string, { organizationId: string; aktion: string }>()
  for (const zeile of zeilen) {
    letzterStatusProVorgang.set(`${zeile.organization_id}:${zeile.idempotency_key}`, {
      organizationId: zeile.organization_id,
      aktion: zeile.aktion,
    })
  }

  const proOrgMap = new Map<string, SyncStatusProOrg>()
  const holeBucket = (orgId: string): SyncStatusProOrg => {
    let bucket = proOrgMap.get(orgId)
    if (!bucket) {
      bucket = { organizationId: orgId, offeneVorgaenge: 0, fehler24h: 0, konflikte: 0 }
      proOrgMap.set(orgId, bucket)
    }
    return bucket
  }

  let offeneSyncVorgaenge = 0
  for (const { organizationId: orgId, aktion } of letzterStatusProVorgang.values()) {
    if (aktion === 'sync_error' || aktion === 'retry' || aktion === 'sync_start') {
      offeneSyncVorgaenge++
      holeBucket(orgId).offeneVorgaenge++
    }
  }

  let fehler24h = 0
  let erfolg24h = 0
  for (const zeile of zeilen) {
    if (zeile.aktion === 'sync_error') {
      fehler24h++
      holeBucket(zeile.organization_id).fehler24h++
    }
    if (zeile.aktion === 'sync_success') erfolg24h++
  }

  const konflikte = await listeOffeneKonflikte(admin, organizationId)
  for (const k of konflikte) {
    holeBucket(k.organization_id).konflikte++
  }

  return {
    offeneKonflikte: konflikte.length,
    offeneSyncVorgaenge,
    fehler24h,
    erfolg24h,
    proOrganisation: Array.from(proOrgMap.values()).sort((a, b) => b.offeneVorgaenge - a.offeneVorgaenge),
  }
}
