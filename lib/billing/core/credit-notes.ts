/**
 * Gutschrift-Lebenszyklus (Block 16)
 *
 * `createCreditNote()` in invoice-engine.ts erzeugt eine Gutschrift immer im
 * Status 'entwurf' — sowohl den invoice_corrections-Eintrag als auch die
 * Gutschrift-Rechnung selbst. Damit war die Gutschrift bisher eine Sackgasse:
 * es gab keinen Weg, sie freizugeben oder wieder zu verwerfen.
 *
 * Dieses Modul schliesst den Workflow:
 *   Entwurf --release--> Freigegeben (festgeschrieben, abrechenbar)
 *   Entwurf --discard--> verworfen (Korrektur soft-deleted, Rechnung storniert)
 *
 * Beide Uebergaenge respektieren die Statusmaschine und schreiben in den
 * revisionssicheren Audit-Trail.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateCorrectionTransition,
  validateTransition,
  isValidInvoiceStatus,
  CORRECTION_STATUS_LABELS,
  type InvoiceStatus,
  type CorrectionStatus,
} from './status-machine';

function asCorrectionStatus(status: string): CorrectionStatus {
  if (!(status in CORRECTION_STATUS_LABELS)) {
    throw new Error(`Unbekannter Korrekturstatus '${status}'.`);
  }
  return status as CorrectionStatus;
}
import { logBillingAction, computeSnapshotChecksum } from './audit';

export interface CreditNoteRow {
  id: string;
  correction_type: string;
  status: string;
  original_invoice_id: string;
  correction_invoice_id: string | null;
  original_amount_cents: number;
  corrected_amount_cents: number;
  difference_cents: number;
  reason: string;
  organization_id: string;
  deleted_at: string | null;
}

export interface ReleaseCreditNoteResult {
  correctionId: string;
  creditInvoiceId: string | null;
  status: 'freigegeben';
  frozenAt: string;
}

export interface DiscardCreditNoteResult {
  correctionId: string;
  creditInvoiceId: string | null;
  status: 'verworfen';
}

/**
 * Laedt eine Korrektur org-gefenced. Der Admin-Client umgeht RLS
 * (BYPASSRLS), die Mandantenzugehoerigkeit muss deshalb explizit geprueft
 * werden — siehe die gleiche Logik in den API-Routen.
 */
async function loadCorrection(
  supabase: SupabaseClient,
  correctionId: string,
  expectedOrgId: string
): Promise<CreditNoteRow> {
  const { data, error } = await supabase
    .from('invoice_corrections')
    .select('*')
    .eq('id', correctionId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Korrektur ${correctionId} nicht gefunden.`);
  }
  if (data.organization_id !== expectedOrgId) {
    throw new Error(`Korrektur ${correctionId} gehoert nicht zur angegebenen Organisation.`);
  }
  if (data.deleted_at) {
    throw new Error('Korrektur wurde bereits verworfen.');
  }
  return data as CreditNoteRow;
}

/**
 * Hebt eine Rechnung entlang der Statusmaschine bis 'freigegeben'.
 *
 * Der direkte Sprung entwurf → freigegeben ist nicht erlaubt (siehe
 * INVOICE_TRANSITIONS), deshalb wird der Zwischenschritt 'geprueft'
 * einzeln validiert und geschrieben. So bleibt jeder Uebergang
 * regelkonform statt die Maschine zu umgehen.
 */
async function raiseInvoiceToFreigegeben(
  supabase: SupabaseClient,
  invoiceId: string,
  currentStatus: string
): Promise<void> {
  if (!isValidInvoiceStatus(currentStatus)) {
    throw new Error(`Unbekannter Rechnungsstatus '${currentStatus}'.`);
  }

  const path: InvoiceStatus[] =
    currentStatus === 'entwurf' ? ['geprueft', 'freigegeben']
    : currentStatus === 'geprueft' ? ['freigegeben']
    : [];

  if (path.length === 0) {
    if (currentStatus === 'freigegeben') return; // schon dort — idempotent
    throw new Error(
      `Gutschrift-Rechnung im Status '${currentStatus}' kann nicht freigegeben werden.`
    );
  }

  let from: InvoiceStatus = currentStatus;
  for (const to of path) {
    validateTransition(from, to);
    const { error } = await supabase
      .from('invoices')
      .update({ status: to })
      .eq('id', invoiceId)
      .eq('status', from); // optimistisch: verhindert Race mit parallelem Update
    if (error) {
      throw new Error(`Statuswechsel ${from} → ${to} fehlgeschlagen: ${error.message}`);
    }
    from = to;
  }
}

/**
 * Gibt eine Gutschrift frei:
 * 1. Statusmaschine pruefen (Korrektur: entwurf → freigegeben)
 * 2. Gutschrift-Rechnung auf 'freigegeben' heben und festschreiben
 * 3. Freigabe-Snapshot schreiben
 * 4. Korrektur-Eintrag freigeben (approved_at/by)
 * 5. Audit-Trail
 */
export async function releaseCreditNote(
  supabase: SupabaseClient,
  correctionId: string,
  actorId: string,
  expectedOrgId: string
): Promise<ReleaseCreditNoteResult> {
  const correction = await loadCorrection(supabase, correctionId, expectedOrgId);

  // Storno-Eintraege werden von cancelInvoice() sofort freigegeben — hier ist
  // nur der Entwurfsweg (Gutschrift/Korrektur) vorgesehen.
  validateCorrectionTransition(asCorrectionStatus(correction.status), 'freigegeben');

  const frozenAt = new Date().toISOString();

  if (correction.correction_invoice_id) {
    const { data: creditInvoice, error: invError } = await supabase
      .from('invoices')
      .select('id, status, total_amount, invoice_number, invoice_number_formatted, organization_id')
      .eq('id', correction.correction_invoice_id)
      .maybeSingle();

    if (invError || !creditInvoice) {
      throw new Error('Zugehoerige Gutschrift-Rechnung nicht gefunden.');
    }
    if (creditInvoice.organization_id !== expectedOrgId) {
      throw new Error('Gutschrift-Rechnung gehoert nicht zur angegebenen Organisation.');
    }

    await raiseInvoiceToFreigegeben(supabase, creditInvoice.id, creditInvoice.status as string);

    // Festschreiben: ab jetzt unveraenderlich
    await supabase
      .from('invoices')
      .update({ frozen_at: frozenAt })
      .eq('id', creditInvoice.id)
      .is('frozen_at', null);

    // Freigabe-Snapshot. Version 1 gehoert der Erzeugung (createCreditNote),
    // die Freigabe ist Version 2.
    const snapshotContent = {
      type: 'gutschrift_freigabe',
      correction_id: correctionId,
      credit_invoice_id: creditInvoice.id,
      credit_invoice_number: creditInvoice.invoice_number_formatted || creditInvoice.invoice_number,
      total_amount: creditInvoice.total_amount,
      difference_cents: correction.difference_cents,
      reason: correction.reason,
      released_at: frozenAt,
    };

    const checksum = await computeSnapshotChecksum(snapshotContent);

    await supabase.from('invoice_snapshots').insert({
      invoice_id: creditInvoice.id,
      version: 2,
      snapshot: snapshotContent,
      snapshot_type: 'gutschrift',
      checksum,
      created_by: actorId,
      organization_id: expectedOrgId,
    });
  }

  const { error: updError } = await supabase
    .from('invoice_corrections')
    .update({
      status: 'freigegeben',
      approved_at: frozenAt,
      approved_by: actorId,
    })
    .eq('id', correctionId)
    .eq('status', 'entwurf'); // Race-Schutz: nur aus dem Entwurf heraus

  if (updError) {
    throw new Error(`Freigabe fehlgeschlagen: ${updError.message}`);
  }

  await logBillingAction(supabase, {
    entityType: 'credit_note',
    organizationId: expectedOrgId,
    entityId: correctionId,
    action: 'freigegeben',
    previousState: { status: correction.status },
    newState: {
      status: 'freigegeben',
      credit_invoice_id: correction.correction_invoice_id,
      difference_cents: correction.difference_cents,
    },
    reason: correction.reason,
    actorId,
  });

  return {
    correctionId,
    creditInvoiceId: correction.correction_invoice_id,
    status: 'freigegeben',
    frozenAt,
  };
}

/**
 * Verwirft eine Gutschrift im Entwurf:
 * 1. Korrektur-Eintrag soft-deleten (Historie bleibt lesbar)
 * 2. Gutschrift-Rechnung stornieren + soft-deleten
 * 3. Audit-Trail
 *
 * Freigegebene Gutschriften koennen nicht verworfen werden — dort ist der
 * fachlich korrekte Weg eine erneute Korrektur.
 */
export async function discardCreditNote(
  supabase: SupabaseClient,
  correctionId: string,
  reason: string,
  actorId: string,
  expectedOrgId: string
): Promise<DiscardCreditNoteResult> {
  const correction = await loadCorrection(supabase, correctionId, expectedOrgId);

  if (correction.status !== 'entwurf') {
    throw new Error(
      `Nur Gutschriften im Entwurf koennen verworfen werden (aktuell: '${correction.status}').`
    );
  }

  const now = new Date().toISOString();

  if (correction.correction_invoice_id) {
    const { data: creditInvoice } = await supabase
      .from('invoices')
      .select('id, status, organization_id, frozen_at')
      .eq('id', correction.correction_invoice_id)
      .maybeSingle();

    if (creditInvoice) {
      if (creditInvoice.organization_id !== expectedOrgId) {
        throw new Error('Gutschrift-Rechnung gehoert nicht zur angegebenen Organisation.');
      }
      if (creditInvoice.frozen_at) {
        throw new Error('Gutschrift-Rechnung ist festgeschrieben und kann nicht verworfen werden.');
      }
      const status = creditInvoice.status as string;
      if (isValidInvoiceStatus(status) && status !== 'storniert') {
        validateTransition(status, 'storniert');
      }
      await supabase
        .from('invoices')
        .update({ status: 'storniert', deleted_at: now })
        .eq('id', creditInvoice.id);
    }
  }

  const { error: delError } = await supabase
    .from('invoice_corrections')
    .update({ deleted_at: now })
    .eq('id', correctionId)
    .is('deleted_at', null);

  if (delError) {
    throw new Error(`Verwerfen fehlgeschlagen: ${delError.message}`);
  }

  await logBillingAction(supabase, {
    entityType: 'credit_note',
    organizationId: expectedOrgId,
    entityId: correctionId,
    action: 'verworfen',
    previousState: { status: correction.status, deleted_at: null },
    newState: { deleted_at: now, credit_invoice_id: correction.correction_invoice_id },
    reason,
    actorId,
  });

  return {
    correctionId,
    creditInvoiceId: correction.correction_invoice_id,
    status: 'verworfen',
  };
}

/**
 * Ermittelt, wieviel einer Rechnung noch gutgeschrieben werden kann.
 * Spiegelt die Pruefung in createCreditNote(), damit die UI den Restbetrag
 * anzeigen kann, ohne den Fehlerfall provozieren zu muessen.
 */
export async function getRemainingCreditableCents(
  supabase: SupabaseClient,
  invoiceId: string,
  originalAmountCents: number
): Promise<number> {
  const { data, error } = await supabase
    .from('invoice_corrections')
    .select('corrected_amount_cents')
    .eq('original_invoice_id', invoiceId)
    .eq('correction_type', 'gutschrift')
    .is('deleted_at', null);

  // Der verworfene Fehler machte aus „ich weiss nicht, wieviel schon
  // gutgeschrieben wurde" ein „es wurde noch nichts gutgeschrieben": die
  // Funktion gab den VOLLEN Rechnungsbetrag als noch gutschreibbar zurueck.
  // Der harte Deckel sitzt in createCreditNote und haelt — hier entstand
  // aber die Zahl, die der Bearbeiter vor sich sieht, und die war zu hoch.
  if (error) {
    throw new Error(
      `Bestehende Gutschriften zu Rechnung ${invoiceId} nicht lesbar: ${error.message}. `
      + `Der gutschreibbare Restbetrag ist damit nicht ermittelbar.`
    );
  }

  const alreadyCredited = (data || []).reduce(
    (sum, c) => sum + (originalAmountCents - (c.corrected_amount_cents ?? originalAmountCents)),
    0
  );

  return Math.max(0, originalAmountCents - alreadyCredited);
}
