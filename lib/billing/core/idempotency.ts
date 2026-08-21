/**
 * Billing Idempotency
 * Stellt sicher, dass fuer dieselbe Kombination aus
 * Klient + Monat + Budget-Typ + Version nur eine Rechnung existiert.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { billingLogger as log } from '@/lib/logger';

/**
 * Erzeugt einen deterministischen Idempotency-Key.
 *
 * Format: inv_{clientId}_{YYYY-MM}_{budgetType}_v{version}
 */
export function generateIdempotencyKey(
  clientId: string,
  periodMonth: string, // Format: YYYY-MM
  budgetType: string,
  version: number = 1
): string {
  return `inv_${clientId}_${periodMonth}_${budgetType}_v${version}`;
}

/**
 * Prueft ob bereits eine Rechnung mit diesem Idempotency-Key existiert.
 * Gibt die bestehende Invoice-ID zurueck, wenn vorhanden.
 */
export async function checkIdempotency(
  supabase: SupabaseClient,
  key: string
): Promise<{ exists: boolean; invoiceId?: string }> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('idempotency_key', key)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    log.error('Fehler bei Idempotenz-Pruefung', { idempotencyKey: key, errorMessage: error.message });
    throw new Error(`Idempotenz-Prüfung fehlgeschlagen: ${error.message}`);
  }

  if (data) {
    return { exists: true, invoiceId: data.id };
  }

  return { exists: false };
}
