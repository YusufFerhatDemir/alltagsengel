/**
 * Ruecklastschrift-Handler
 *
 * Erkennt Ruecklastschriften aus CAMT-Buchungen, storniert die
 * zugehoerige Zahlung, oeffnet die Rechnung wieder, bucht
 * Ruecklastschriftgebuehren und sperrt ggf. das SEPA-Mandat.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CamtBuchung } from '../camt/camt-parser';
import { logBillingAction } from '../core/audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuecklastschriftResult {
  zahlungseingangsId: string;
  erkannt: boolean;
  invoiceId: string | null;
  paymentId: string | null;
  mandateId: string | null;
  mandatGesperrt: boolean;
  gebuehrCent: number;
  fehler: string | null;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/** Standard-Ruecklastschriftgebuehr in Cent */
const RUECKLASTSCHRIFT_GEBUEHR_CENT = 500; // 5,00 EUR

/** Ab dieser Anzahl Ruecklastschriften wird das Mandat gesperrt */
const MAX_RUECKLASTSCHRIFTEN_BEVOR_SPERRE = 2;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Verarbeitet eine als Ruecklastschrift identifizierte CAMT-Buchung.
 *
 * Ablauf:
 * 1. Zugehoerige SEPA-Lastschrift finden (ueber EndToEndId oder MandateId)
 * 2. Originalzahlung stornieren
 * 3. Rechnung wieder auf "offen" setzen
 * 4. Ruecklastschriftgebuehr buchen
 * 5. Mandat-Status pruefen (bei Mehrfach-Ruecklastschrift → sperren)
 * 6. Mahnstufe setzen
 */
export async function verarbeiteRuecklastschrift(
  supabase: SupabaseClient,
  buchung: CamtBuchung,
  zahlungseingangsId: string,
  organizationId: string,
  actorId: string,
): Promise<RuecklastschriftResult> {
  const result: RuecklastschriftResult = {
    zahlungseingangsId,
    erkannt: true,
    invoiceId: null,
    paymentId: null,
    mandateId: null,
    mandatGesperrt: false,
    gebuehrCent: 0,
    fehler: null,
  };

  try {
    // 1. Zugehoerige SEPA-Buchung finden
    let sepaItem: {
      id: string;
      invoice_id: string;
      mandate_id: string;
      batch_id: string;
    } | null = null;

    // Zuerst ueber EndToEndId
    if (buchung.endToEndId) {
      const { data } = await supabase
        .from('sepa_batch_items')
        .select('id, invoice_id, mandate_id, batch_id')
        .eq('end_to_end_id', buchung.endToEndId)
        .eq('organization_id', organizationId)
        .single();
      if (data) sepaItem = data;
    }

    // Fallback: MandateId + Betrag
    if (!sepaItem && buchung.mandateId) {
      const betragCent = Math.abs(buchung.betragCent);
      const { data } = await supabase
        .from('sepa_batch_items')
        .select('id, invoice_id, mandate_id, batch_id')
        .eq('organization_id', organizationId)
        .eq('amount_cents', betragCent)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) sepaItem = data;
    }

    if (!sepaItem) {
      result.fehler = 'Keine zugehoerige SEPA-Lastschrift gefunden';
      return result;
    }

    result.invoiceId = sepaItem.invoice_id;
    result.mandateId = sepaItem.mandate_id;

    // 2. SEPA-Batch-Item auf Ruecklastschrift setzen
    await supabase
      .from('sepa_batch_items')
      .update({
        status: 'ruecklastschrift',
        error_reason: `Rücklastschrift vom ${buchung.buchungsdatum}`,
      })
      .eq('id', sepaItem.id);

    // 3. Zugehoerige Zahlung finden und stornieren
    const { data: payAllocs } = await supabase
      .from('payment_allocations')
      .select('id, payment_id, amount_cents')
      .eq('invoice_id', sepaItem.invoice_id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payAllocs && payAllocs.length > 0) {
      const alloc = payAllocs[0];
      result.paymentId = alloc.payment_id;

      // Allocation loeschen (soft: status setzen)
      await supabase
        .from('payment_allocations')
        .update({ allocation_type: 'rueckzahlung' as any })
        .eq('id', alloc.id);

      // Payment-allocated_cents reduzieren
      const { data: payment } = await supabase
        .from('payments')
        .select('id, allocated_cents')
        .eq('id', alloc.payment_id)
        .single();

      if (payment) {
        const newAllocated = Math.max(0, (payment.allocated_cents || 0) - alloc.amount_cents);
        await supabase
          .from('payments')
          .update({
            allocated_cents: newAllocated,
            matching_status: 'nicht_zugeordnet',
          })
          .eq('id', payment.id);
      }
    }

    // 4. Rechnung wieder oeffnen
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount')
      .eq('id', sepaItem.invoice_id)
      .single();

    if (invoice) {
      const totalCents = Math.round(Number(invoice.total_amount || 0) * 100);
      const paidCents = Math.round(Number(invoice.paid_amount || 0) * 100);
      const betragRueck = Math.abs(buchung.betragCent);
      const newPaidCents = Math.max(0, paidCents - betragRueck);

      await supabase
        .from('invoices')
        .update({
          paid_amount: newPaidCents / 100,
          status: newPaidCents > 0 ? 'teilweise_bezahlt' : 'freigegeben',
          bezahlt: false,
          bezahlt_am: null,
        })
        .eq('id', sepaItem.invoice_id);
    }

    // 5. Ruecklastschriftgebuehr — als payment_difference buchen
    result.gebuehrCent = RUECKLASTSCHRIFT_GEBUEHR_CENT;
    await supabase
      .from('payment_differences')
      .insert({
        organization_id: organizationId,
        invoice_id: sepaItem.invoice_id,
        soll_cents: RUECKLASTSCHRIFT_GEBUEHR_CENT,
        ist_cents: 0,
        kuerzung_grund: 'Rücklastschriftgebühr',
        kuerzung_kategorie: 'ruecklastschrift',
        status: 'offen',
        created_by: actorId,
      });

    // 6. Mandat pruefen — bei Mehrfach-Ruecklastschrift sperren
    const { count: rlCount } = await supabase
      .from('sepa_batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('mandate_id', sepaItem.mandate_id)
      .eq('status', 'ruecklastschrift');

    if ((rlCount ?? 0) >= MAX_RUECKLASTSCHRIFTEN_BEVOR_SPERRE) {
      await supabase
        .from('sepa_mandates')
        .update({
          status: 'widerrufen',
          revoked_at: new Date().toISOString(),
          revoke_reason: `Automatisch gesperrt nach ${rlCount} Rücklastschriften`,
        })
        .eq('id', sepaItem.mandate_id);
      result.mandatGesperrt = true;

      await logBillingAction(supabase, {
        entityType: 'sepa_mandate',
        entityId: sepaItem.mandate_id,
        organizationId,
        action: 'auto_revoked_ruecklastschrift',
        newState: { rlCount, reason: 'Mehrfache Rücklastschriften' },
        actorId,
      });
    }

    // 7. Mahnstufe hochsetzen
    const { data: dunning } = await supabase
      .from('dunning_entries')
      .select('id, dunning_level')
      .eq('invoice_id', sepaItem.invoice_id)
      .single();

    if (dunning) {
      const ESCALATION_LEVELS = ['offen', 'erinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung'];
      const currentIdx = ESCALATION_LEVELS.indexOf(dunning.dunning_level || 'offen');
      const newIdx = Math.max(currentIdx + 1, 2);
      const newLevel = ESCALATION_LEVELS[Math.min(newIdx, ESCALATION_LEVELS.length - 1)];

      await supabase
        .from('dunning_entries')
        .update({
          dunning_level: newLevel,
          last_dunning_at: new Date().toISOString(),
        })
        .eq('id', dunning.id);

      await supabase
        .from('invoices')
        .update({ dunning_level: newLevel })
        .eq('id', sepaItem.invoice_id);
    }

    // Audit
    await logBillingAction(supabase, {
      entityType: 'ruecklastschrift',
      entityId: zahlungseingangsId,
      organizationId,
      action: 'verarbeitet',
      newState: {
        invoiceId: sepaItem.invoice_id,
        mandateId: sepaItem.mandate_id,
        mandatGesperrt: result.mandatGesperrt,
        gebuehrCent: result.gebuehrCent,
      },
      actorId,
    });

  } catch (e) {
    result.fehler = e instanceof Error ? e.message : String(e);
  }

  return result;
}
