/**
 * Billing Audit-Trail
 * Revisionssichere Protokollierung aller Abrechnungsaktionen.
 *
 * Jeder Eintrag erhaelt eine SHA-256-Checksumme ueber die
 * relevanten Felder, um Manipulation zu erkennen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogParams {
  entityType: 'invoice' | 'tariff' | 'correction' | 'snapshot' | 'credit_note'
    | 'payment' | 'payment_allocation' | 'dunning' | 'payment_difference' | 'monthly_closing'
    | 'dta_lauf' | 'dta_export' | 'dta_validierung' | 'dta_freigabe'
    | 'dta_uebermittlung' | 'dakota_auftrag' | 'ruecklaeufer' | 'fehlerprotokoll'
    | 'korrekturlauf' | 'dta_abschluss';
  entityId: string;
  action: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
  actorId: string;
  actorRole?: string;
  actorIp?: string;
}

// ---------------------------------------------------------------------------
// Checksumme
// ---------------------------------------------------------------------------

/**
 * SHA-256 ueber einen String, hex-kodiert.
 * Verwendet die Web Crypto API (verfuegbar in Node 18+ und Edge Runtime),
 * mit Rueckfall auf node:crypto.
 */
async function sha256Hex(payload: string): Promise<string> {
  // Versuche Web Crypto API (Edge Runtime + Node 20+)
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const msgBuffer = new TextEncoder().encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: Node.js crypto
  const { createHash } = await import('crypto');
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Berechnet eine SHA-256-Checksumme ueber die relevanten Audit-Felder.
 *
 * ACHTUNG: Diese Funktion hasht ausschliesslich die sieben unten genannten
 * Audit-Felder, in fester Reihenfolge. Sie ist KEIN generischer Hash ueber
 * beliebige Daten — dafuer gibt es `computeContentHash`. Ein Aufruf mit
 * fremden Feldern ergaebe fuer jede Eingabe denselben Hash (alle sieben
 * Felder waeren `undefined`).
 */
export async function computeChecksum(data: {
  entityType: string;
  entityId: string;
  action: string;
  previousState: unknown;
  newState: unknown;
  actorId: string;
  createdAt: string;
}): Promise<string> {
  return sha256Hex(JSON.stringify([
    data.entityType,
    data.entityId,
    data.action,
    data.previousState,
    data.newState,
    data.actorId,
    data.createdAt,
  ]));
}

/**
 * Berechnet eine SHA-256-Checksumme ueber beliebige Nutzdaten.
 *
 * Fuer Inhalts-Hashes ausserhalb des Audit-Trails: DTA-Dateien,
 * Rueckläufer-Quelldateien, Duplikat-Erkennung. Die Eingabe wird per
 * JSON.stringify serialisiert — bei Objekten ist die Schluessel-Reihenfolge
 * relevant, deshalb Objekte immer in stabiler Reihenfolge aufbauen.
 */
export async function computeContentHash(data: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Audit-Log schreiben
// ---------------------------------------------------------------------------

/**
 * Schreibt einen Eintrag in den billing_audit_trail.
 * Berechnet automatisch die Checksumme.
 */
export async function logBillingAction(
  supabase: SupabaseClient,
  params: AuditLogParams
): Promise<void> {
  const createdAt = new Date().toISOString();

  const checksum = await computeChecksum({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    previousState: params.previousState ?? null,
    newState: params.newState ?? null,
    actorId: params.actorId,
    createdAt,
  });

  const { error } = await supabase.from('billing_audit_trail').insert({
    entity_type:    params.entityType,
    entity_id:      params.entityId,
    action:         params.action,
    previous_state: params.previousState ?? null,
    new_state:      params.newState ?? null,
    reason:         params.reason ?? null,
    actor_id:       params.actorId,
    actor_role:     params.actorRole ?? null,
    actor_ip:       params.actorIp ?? null,
    created_at:     createdAt,
    checksum,
  });

  if (error) {
    console.error('[billing-audit] Fehler beim Schreiben des Audit-Trails:', error);
    throw new Error(`Audit-Trail konnte nicht geschrieben werden: ${error.message}`);
  }
}

/**
 * Berechnet eine Snapshot-Checksumme (fuer invoice_snapshots).
 */
export async function computeSnapshotChecksum(
  snapshotJson: unknown
): Promise<string> {
  return computeContentHash(snapshotJson);
}
