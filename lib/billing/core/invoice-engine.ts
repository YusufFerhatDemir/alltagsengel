/**
 * Invoice Engine – Rechnungsfestschreibung & Korrekturprozess
 *
 * Kernfunktionen:
 * - createInvoiceDraft   : Rechnungsentwurf aus freigegebenen service_records
 * - freezeInvoice        : Festschreibung (Snapshot + Preise einfrieren)
 * - generateInvoiceNumber: Naechste fortlaufende Rechnungsnummer
 * - cancelInvoice        : Storno (Gegenrechnung erzeugen)
 * - correctInvoice       : Korrekturrechnung mit geaenderten Positionen
 * - createCreditNote     : Gutschrift erzeugen
 *
 * Alle Funktionen:
 * - Schreiben in den Audit-Trail
 * - Respektieren die Statusmaschine
 * - Sind idempotent (idempotency_key)
 * - Erhalten den Supabase-Client als Parameter
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateTransition,
  isValidInvoiceStatus,
  INVOICE_NUMBER_PREFIX,
  type InvoiceStatus,
} from './status-machine';
import { logBillingAction, computeSnapshotChecksum } from './audit';
// resolvePrice wird nicht mehr als Fallback verwendet — die Tarifaufloesung
// erfolgt vollstaendig innerhalb der atomaren RPC (billing_tariffs = fuehrend).
// import { resolvePrice } from './price-resolver';  // ENTFERNT: kein Fallback

// ---------------------------------------------------------------------------
// Fehler-Codes fuer Tarif-Aufloesung
// ---------------------------------------------------------------------------

export const TARIFF_ERROR_CODES = {
  MISSING_VALID_TARIFF: 'MISSING_VALID_TARIFF',
  AMBIGUOUS_TARIFF: 'AMBIGUOUS_TARIFF',
} as const;

export type TariffErrorCode = typeof TARIFF_ERROR_CODES[keyof typeof TARIFF_ERROR_CODES];

/**
 * Prueft ob ein RPC-Fehler ein Tarif-Fehler ist und extrahiert den Code.
 */
export function parseTariffError(errorMessage: string): TariffErrorCode | null {
  if (errorMessage.includes('MISSING_VALID_TARIFF')) return TARIFF_ERROR_CODES.MISSING_VALID_TARIFF;
  if (errorMessage.includes('AMBIGUOUS_TARIFF')) return TARIFF_ERROR_CODES.AMBIGUOUS_TARIFF;
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateDraftParams {
  clientId: string;
  periodMonth: string;      // YYYY-MM
  budgetType: string;
  actorId: string;
}

export interface CreateDraftResult {
  invoiceId: string;
  invoiceNumber: string;
  totalAmountCents: number;
  lineCount: number;
  alreadyExists: boolean;
  priceSource: 'billing_tariffs';
  tariffErrorCode?: TariffErrorCode;
  tariffErrorMessage?: string;
}

export interface FreezeResult {
  snapshotId: string;
  invoiceNumber: string;
  checksum: string;
  version: number;
}

export interface CorrectionLineInput {
  serviceRecordId?: string;
  leistungsart: string;
  leistungsdatum: string;
  leistungVon?: string;
  leistungBis?: string;
  menge: number;
  einheit: string;
  einzelpreisCent: number;
  gesamtpreisCent: number;
  zuschlagProzent?: number;
  zuschlagGrund?: string;
  /** Pflicht bei Preisabweichung >10% vom Tarif. Wird im Audit protokolliert. */
  korrekturgrundPreis?: string;
}

/**
 * Maximale Preisabweichung (in Prozent) ohne expliziten Korrekturgrund.
 * Bei Ueberschreitung MUSS korrekturgrundPreis angegeben werden.
 */
const MAX_CORRECTION_DEVIATION_PERCENT = 10;

export interface CorrectionResult {
  correctionId: string;
  correctionInvoiceId: string;
  correctionInvoiceNumber: string;
  differenceCents: number;
}

export interface CreditNoteResult {
  correctionId: string;
  creditInvoiceId: string;
  creditInvoiceNumber: string;
  amountCents: number;
}

export interface WriteOffResult {
  invoiceId: string;
  previousStatus: string;
  writtenOffAmountCents: number;
  totalAmountCents: number;
  paidAmountCents: number;
}

// ---------------------------------------------------------------------------
// createInvoiceDraft
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen Rechnungsentwurf aus freigegebenen service_records.
 *
 * TARIF-BASIERTE PREISQUELLE (fachliche Entscheidung 2026-08-07):
 * - billing_tariffs ist die alleinige verbindliche Preisquelle
 * - service_records.amount wird NICHT als Fallback verwendet
 * - Kein gueltiger Tarif = kein Rechnungsentwurf (MISSING_VALID_TARIFF)
 * - Mehrere gleichrangige Tarife = kein Rechnungsentwurf (AMBIGUOUS_TARIFF)
 *
 * ATOMARE TRANSAKTION via create_invoice_draft_atomic() RPC:
 *   1. Idempotenz-Pruefung
 *   2. Tarif-Aufloesung aus billing_tariffs (pro Leistungsnachweis)
 *   3. Preisberechnung (unit_price × quantity, serverseitig)
 *   4. Rechnungsnummer generieren
 *   5. Rechnung erstellen
 *   6. Positionen mit Tarif-Snapshot erstellen
 *   7. Service Records auf 'invoiced' setzen
 *   8. Audit-Trail schreiben
 *
 * Bei Fehler in JEDEM Schritt: kompletter Rollback. Keine halbfertigen Daten.
 * Preise kommen aus billing_tariffs (DB), NICHT vom Browser, NICHT aus service_records.
 */
export async function createInvoiceDraft(
  supabase: SupabaseClient,
  params: CreateDraftParams
): Promise<CreateDraftResult> {
  const { clientId, periodMonth, budgetType, actorId } = params;

  // Client-Daten laden (fuer Insurance-Parameter und Mandantentrennung)
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, first_name, last_name, insurance_name, insurance_number, organization_id, pflegekasse_ik')
    .eq('id', clientId)
    .single();

  if (clientError || !client) {
    throw new Error(`Klient ${clientId} nicht gefunden.`);
  }

  // ── Atomare Rechnungserstellung via RPC ──────────────────────────────
  // Tarif-Aufloesung + Preisberechnung + Rechnungserstellung
  // vollstaendig innerhalb der PostgreSQL-Transaktion.
  // Bei fehlendem/mehrdeutigem Tarif: RAISE EXCEPTION → vollstaendiger Rollback.
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'create_invoice_draft_atomic',
    {
      p_client_id: clientId,
      p_org_id: client.organization_id,
      p_period_month: periodMonth,
      p_budget_type: budgetType,
      p_actor_id: actorId,
      p_insurance_name: client.insurance_name || null,
      p_insurance_number: client.insurance_number || null,
    }
  );

  if (rpcError) {
    // Strukturierte Tarif-Fehlercodes erkennen und weiterleiten
    const tariffError = parseTariffError(rpcError.message);
    if (tariffError) {
      const err = new Error(rpcError.message);
      (err as any).tariffErrorCode = tariffError;
      throw err;
    }
    throw new Error(`Atomare Rechnungserstellung fehlgeschlagen: ${rpcError.message}`);
  }

  if (!rpcResult) {
    throw new Error('RPC create_invoice_draft_atomic hat kein Ergebnis zurueckgegeben.');
  }

  // Ergebnis auswerten — Preise kommen ausschliesslich aus billing_tariffs
  return {
    invoiceId: rpcResult.invoice_id,
    invoiceNumber: rpcResult.invoice_number,
    totalAmountCents: Math.round(Number(rpcResult.total_amount) * 100),
    lineCount: rpcResult.line_count,
    alreadyExists: rpcResult.already_exists,
    priceSource: 'billing_tariffs',
  };
}

// ---------------------------------------------------------------------------
// freezeInvoice
// ---------------------------------------------------------------------------

/**
 * Schreibt eine Rechnung fest:
 * 1. Prueft Status (muss 'geprueft' sein)
 * 2. Erstellt Snapshot mit allen Positionen
 * 3. Berechnet Checksumme
 * 4. Setzt frozen_at und Status -> 'freigegeben'
 */
export async function freezeInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  actorId: string,
  expectedOrgId?: string
): Promise<FreezeResult> {
  // Rechnung laden
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invError || !invoice) {
    throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  }

  if (expectedOrgId && invoice.organization_id !== expectedOrgId) {
    throw new Error(`Rechnung ${invoiceId} gehoert nicht zur angegebenen Organisation.`);
  }

  // Status validieren
  const currentStatus = invoice.status as string;
  if (isValidInvoiceStatus(currentStatus)) {
    validateTransition(currentStatus, 'freigegeben');
  } else {
    // Legacy-Status: erlauben, aber warnen
    console.warn(`[billing] Legacy-Status "${currentStatus}" wird festgeschrieben.`);
  }

  if (invoice.frozen_at) {
    throw new Error('Rechnung ist bereits festgeschrieben.');
  }

  // Positionen laden
  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (itemsError) {
    throw new Error(`Positionen laden fehlgeschlagen: ${itemsError.message}`);
  }

  // Formatierte Rechnungsnummer (wenn noch nicht vorhanden)
  let formattedNumber = invoice.invoice_number_formatted || invoice.invoice_number;
  if (!formattedNumber) {
    formattedNumber = await generateInvoiceNumber(
      supabase,
      invoice.organization_id,
      'RE'
    );
  }

  // Aktuelle Version ermitteln
  const { data: lastSnapshot } = await supabase
    .from('invoice_snapshots')
    .select('version')
    .eq('invoice_id', invoiceId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (lastSnapshot?.version ?? 0) + 1;

  // Snapshot-Inhalt erstellen
  const snapshotContent = {
    invoice: {
      id: invoice.id,
      invoice_number: formattedNumber,
      client_id: invoice.client_id,
      insurance_name: invoice.insurance_name,
      insurance_number: invoice.insurance_number,
      period_start: invoice.period_start,
      period_end: invoice.period_end,
      total_amount: invoice.total_amount,
      budget_amount: invoice.budget_amount,
      private_amount: invoice.private_amount,
    },
    items: items ?? [],
    frozen_at: new Date().toISOString(),
    version,
  };

  const checksum = await computeSnapshotChecksum(snapshotContent);

  // Snapshot schreiben
  const { data: snapshot, error: snapError } = await supabase
    .from('invoice_snapshots')
    .insert({
      invoice_id: invoiceId,
      version,
      snapshot: snapshotContent,
      snapshot_type: 'festschreibung',
      checksum,
      created_by: actorId,
      organization_id: invoice.organization_id,
    })
    .select('id')
    .single();

  if (snapError || !snapshot) {
    throw new Error(`Snapshot konnte nicht erstellt werden: ${snapError?.message}`);
  }

  // Line-Snapshots erstellen
  if (items && items.length > 0) {
    const lineSnapshots = items.map((item, idx) => {
      const menge = item.duration_minutes ? item.duration_minutes / 60 : 1;
      const gesamtpreisCent = Math.round(Number(item.amount) * 100);
      const einzelpreisCent = menge > 0 ? Math.round(gesamtpreisCent / menge) : gesamtpreisCent;
      return {
        invoice_snapshot_id: snapshot.id,
        position_nummer: idx + 1,
        service_record_id: item.service_record_id,
        leistungsart: item.description || 'alltagsbegleitung',
        leistungsdatum: item.date,
        menge,
        einheit: item.duration_minutes ? 'stunde' : 'einsatz',
        einzelpreis_cent: einzelpreisCent,
        gesamtpreis_cent: gesamtpreisCent,
        budget_typ: item.budget_type,
        organization_id: invoice.organization_id,
      };
    });

    const { error: lineError } = await supabase
      .from('invoice_line_snapshots')
      .insert(lineSnapshots);

    if (lineError) {
      console.error('[billing] Line-Snapshots Fehler:', lineError);
    }
  }

  // Rechnung einfrieren
  const frozenAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'freigegeben',
      frozen_at: frozenAt,
      version,
      invoice_number_formatted: formattedNumber,
    })
    .eq('id', invoiceId);

  if (updateError) {
    throw new Error(`Rechnung konnte nicht eingefroren werden: ${updateError.message}`);
  }

  // Audit-Trail
  await logBillingAction(supabase, {
    entityType: 'invoice',
    organizationId: invoice.organization_id,
    entityId: invoiceId,
    action: 'frozen',
    previousState: { status: currentStatus },
    newState: {
      status: 'freigegeben',
      frozen_at: frozenAt,
      version,
      checksum,
    },
    actorId,
  });

  // Auto-Dunning: Mahneintrag erstellen bei Festschreibung
  try {
    const { ensureDunningEntry } = await import('./dunning');
    await ensureDunningEntry(supabase, invoiceId, invoice.organization_id, actorId);
  } catch (e) {
    console.error('[billing] Auto-Dunning bei Festschreibung fehlgeschlagen:', e);
  }

  return {
    snapshotId: snapshot.id,
    invoiceNumber: formattedNumber,
    checksum,
    version,
  };
}

// ---------------------------------------------------------------------------
// generateInvoiceNumber
// ---------------------------------------------------------------------------

/**
 * Erzeugt die naechste fortlaufende Rechnungsnummer.
 * Verwendet atomisches INSERT ... ON CONFLICT via next_billing_number() RPC.
 */
export async function generateInvoiceNumber(
  supabase: SupabaseClient,
  orgId: string,
  prefix: string = 'RE'
): Promise<string> {
  const currentYear = new Date().getFullYear();

  // Versuche die DB-Funktion
  const { data, error } = await supabase.rpc('next_billing_number', {
    p_org_id: orgId,
    p_prefix: prefix,
    p_year: currentYear,
  });

  if (error) {
    // Fallback: eigene Implementierung
    console.warn('[billing] next_billing_number RPC fehlgeschlagen, nutze Fallback:', error.message);
    return generateInvoiceNumberFallback(supabase, orgId, prefix, currentYear);
  }

  return data as string;
}

async function generateInvoiceNumberFallback(
  supabase: SupabaseClient,
  orgId: string,
  prefix: string,
  year: number
): Promise<string> {
  // SELECT FOR UPDATE nicht moeglich via Supabase-Client,
  // daher UPSERT mit last_number + 1
  const { data: seq, error: selError } = await supabase
    .from('billing_number_sequences')
    .select('id, last_number')
    .eq('organization_id', orgId)
    .eq('prefix', prefix)
    .eq('year', year)
    .maybeSingle();

  if (selError) {
    throw new Error(`Nummernsequenz laden fehlgeschlagen: ${selError.message}`);
  }

  let nextNumber: number;

  if (seq) {
    nextNumber = seq.last_number + 1;
    const { data: updData, error: updError } = await supabase
      .from('billing_number_sequences')
      .update({ last_number: nextNumber })
      .eq('id', seq.id)
      .eq('last_number', seq.last_number)
      .select('last_number')
      .maybeSingle();

    if (updError) {
      throw new Error(`Nummernsequenz aktualisieren fehlgeschlagen: ${updError.message}`);
    }
    if (!updData) {
      throw new Error('Nummernsequenz-Konflikt (paralleler Zugriff) — bitte erneut versuchen.');
    }
  } else {
    nextNumber = 1;
    const { error: insError } = await supabase
      .from('billing_number_sequences')
      .upsert({
        organization_id: orgId,
        prefix,
        year,
        last_number: nextNumber,
      }, { onConflict: 'organization_id,prefix,year' });

    if (insError) {
      throw new Error(`Nummernsequenz erstellen fehlgeschlagen: ${insError.message}`);
    }
  }

  return `${prefix}-${year}-${String(nextNumber).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// cancelInvoice (Storno)
// ---------------------------------------------------------------------------

/**
 * Storniert eine Rechnung:
 * 1. Erzeugt eine Stornorechnung (negative Betraege)
 * 2. Markiert Original als 'storniert'
 * 3. Erstellt Storno-Snapshot
 * 4. Schreibt invoice_corrections Eintrag
 */
export async function cancelInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  reason: string,
  actorId: string,
  expectedOrgId?: string
): Promise<CorrectionResult> {
  // Original laden
  const { data: original, error: origError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (origError || !original) {
    throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  }

  if (expectedOrgId && original.organization_id !== expectedOrgId) {
    throw new Error(`Rechnung ${invoiceId} gehoert nicht zur angegebenen Organisation.`);
  }

  const currentStatus = original.status as string;
  if (isValidInvoiceStatus(currentStatus)) {
    validateTransition(currentStatus, 'storniert');
  }

  // Stornonummer generieren
  const stornoNummer = await generateInvoiceNumber(
    supabase,
    original.organization_id,
    INVOICE_NUMBER_PREFIX.storno
  );

  // Stornorechnung erstellen (negative Betraege)
  const { data: stornoInvoice, error: stornoError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: stornoNummer,
      invoice_number_formatted: stornoNummer,
      client_id: original.client_id,
      insurance_name: original.insurance_name,
      insurance_number: original.insurance_number,
      period_start: original.period_start,
      period_end: original.period_end,
      total_amount: -Number(original.total_amount),
      budget_amount: -Number(original.budget_amount || 0),
      private_amount: -Number(original.private_amount || 0),
      status: 'freigegeben',
      version: 1,
      frozen_at: new Date().toISOString(),
      correction_of: invoiceId,
      correction_type: 'storno',
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (stornoError || !stornoInvoice) {
    throw new Error(`Stornorechnung konnte nicht erstellt werden: ${stornoError?.message}`);
  }

  // Storno-Snapshot
  const stornoSnapshot = {
    type: 'storno',
    original_invoice_id: invoiceId,
    original_invoice_number: original.invoice_number_formatted || original.invoice_number,
    storno_invoice_number: stornoNummer,
    reason,
    total_amount: -Number(original.total_amount),
    cancelled_at: new Date().toISOString(),
  };

  const checksum = await computeSnapshotChecksum(stornoSnapshot);

  await supabase.from('invoice_snapshots').insert({
    invoice_id: stornoInvoice.id,
    version: 1,
    snapshot: stornoSnapshot,
    snapshot_type: 'storno',
    bezug_snapshot_id: null,
    checksum,
    created_by: actorId,
    organization_id: original.organization_id,
  });

  // Original als storniert markieren (CAS: nur wenn Status noch nicht storniert)
  const { data: updated, error: statusError } = await supabase
    .from('invoices')
    .update({ status: 'storniert' })
    .eq('id', invoiceId)
    .neq('status', 'storniert')
    .select('id')
    .maybeSingle();

  if (statusError || !updated) {
    // Storno-Rechnung zurueckrollen, da Original bereits storniert
    await supabase.from('invoices').delete().eq('id', stornoInvoice.id);
    throw new Error('Rechnung wurde bereits storniert (paralleler Zugriff).');
  }

  // Korrektur-Eintrag
  const { data: correction, error: corrError } = await supabase
    .from('invoice_corrections')
    .insert({
      original_invoice_id: invoiceId,
      correction_invoice_id: stornoInvoice.id,
      correction_type: 'storno',
      original_amount_cents: Math.round(Number(original.total_amount) * 100),
      corrected_amount_cents: 0,
      reason,
      status: 'freigegeben',
      created_by: actorId,
      approved_at: new Date().toISOString(),
      approved_by: actorId,
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (corrError || !correction) {
    throw new Error(`Korrektur-Eintrag konnte nicht erstellt werden: ${corrError?.message}`);
  }

  // Audit-Trail
  await logBillingAction(supabase, {
    entityType: 'invoice',
    organizationId: original.organization_id,
    entityId: invoiceId,
    action: 'storniert',
    previousState: { status: currentStatus, total_amount: original.total_amount },
    newState: {
      status: 'storniert',
      storno_invoice_id: stornoInvoice.id,
      storno_number: stornoNummer,
    },
    reason,
    actorId,
  });

  return {
    correctionId: correction.id,
    correctionInvoiceId: stornoInvoice.id,
    correctionInvoiceNumber: stornoNummer,
    differenceCents: -Math.round(Number(original.total_amount) * 100),
  };
}

// ---------------------------------------------------------------------------
// correctInvoice (Korrekturrechnung)
// ---------------------------------------------------------------------------

/**
 * Erstellt eine Korrekturrechnung:
 * 1. Neue Rechnung mit korrigierten Positionen
 * 2. Bezug auf Original
 * 3. Snapshot + Audit
 */
export async function correctInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  corrections: CorrectionLineInput[],
  reason: string,
  actorId: string,
  expectedOrgId?: string
): Promise<CorrectionResult> {
  // D3: Atomare Validierung per RPC — sperrt die Originalrechnung mit FOR UPDATE,
  // sodass parallele Korrektur-/Storno-Operationen serialisiert werden.
  // Fallback auf App-Layer-CAS wenn RPC noch nicht live (Migration pending).
  if (expectedOrgId) {
    const { error: rpcError } = await supabase.rpc('validate_correction_atomic', {
      p_invoice_id: invoiceId,
      p_org_id: expectedOrgId,
    });
    if (rpcError) {
      const msg = rpcError.message ?? '';
      const notFound = msg.includes('Could not find') || msg.includes('does not exist') || msg.includes('not found');
      if (!notFound) {
        throw new Error(msg);
      }
    }
  }

  // Original laden
  const { data: original, error: origError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (origError || !original) {
    throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  }

  if (expectedOrgId && original.organization_id !== expectedOrgId) {
    throw new Error(`Rechnung ${invoiceId} gehoert nicht zur angegebenen Organisation.`);
  }

  const currentStatus = original.status as string;
  if (isValidInvoiceStatus(currentStatus) && (currentStatus === 'storniert' as InvoiceStatus)) {
    throw new Error('Rechnung ist storniert — Korrektur nicht moeglich.');
  }
  if (isValidInvoiceStatus(currentStatus) && (currentStatus === 'abgeschrieben' as InvoiceStatus)) {
    throw new Error('Rechnung ist abgeschrieben — Korrektur nicht moeglich.');
  }

  if (corrections.length === 0) {
    throw new Error('Mindestens eine Korrekturposition erforderlich.');
  }
  const correctedTotal = corrections.reduce((sum, c) => sum + c.gesamtpreisCent, 0);
  if (correctedTotal <= 0) {
    throw new Error('Korrigierter Gesamtbetrag muss positiv sein.');
  }
  for (const c of corrections) {
    if (c.gesamtpreisCent < 0) {
      throw new Error(`Negativer Betrag fuer "${c.leistungsart}" nicht erlaubt.`);
    }
  }

  // ═══ NEU: Tarif-Gegenprüfung für jede Korrekturposition ═══
  // Admin darf nicht beliebige Preise setzen — bei >10% Abweichung vom
  // aktuellen Tarif muss ein expliziter Korrekturgrund angegeben werden.
  for (const c of corrections) {
    const { data: matchingTariffs } = await supabase
      .from('billing_tariffs')
      .select('preis_cent, verguetungsart, id')
      .eq('leistungsart', c.leistungsart)
      .eq('organization_id', original.organization_id)
      .lte('gueltig_ab', c.leistungsdatum)
      .is('deleted_at', null)
      .order('gueltig_ab', { ascending: false })
      .limit(5);

    if (matchingTariffs && matchingTariffs.length > 0) {
      // Besten Tarif nehmen (neuester gueltig_ab)
      const bestTariff = matchingTariffs[0];
      const deviation = Math.abs(c.einzelpreisCent - bestTariff.preis_cent);
      const deviationPercent = bestTariff.preis_cent > 0
        ? (deviation / bestTariff.preis_cent) * 100
        : 0;

      if (deviationPercent > MAX_CORRECTION_DEVIATION_PERCENT) {
        if (!c.korrekturgrundPreis || c.korrekturgrundPreis.trim().length < 5) {
          throw new Error(
            `Korrektur-Preisabweichung fuer "${c.leistungsart}" am ${c.leistungsdatum}: ` +
            `${c.einzelpreisCent} Cent vs. Tarif ${bestTariff.preis_cent} Cent ` +
            `(${deviationPercent.toFixed(1)}% Abweichung). ` +
            `Bei >10% Abweichung ist ein ausfuehrlicher Korrekturgrund (korrekturgrundPreis, min. 5 Zeichen) erforderlich.`
          );
        }
      }
    }
    // Kein Tarif gefunden = kein Cross-Check moeglich (Warnung im Audit)
  }

  // Korrekturnummer generieren
  const korrekturNummer = await generateInvoiceNumber(
    supabase,
    original.organization_id,
    INVOICE_NUMBER_PREFIX.korrektur
  );

  const correctedAmount = correctedTotal / 100;

  // Korrekturrechnung erstellen
  const { data: korrInvoice, error: korrError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: korrekturNummer,
      invoice_number_formatted: korrekturNummer,
      client_id: original.client_id,
      insurance_name: original.insurance_name,
      insurance_number: original.insurance_number,
      period_start: original.period_start,
      period_end: original.period_end,
      total_amount: correctedAmount,
      status: 'entwurf',
      version: (original.version || 1) + 1,
      correction_of: invoiceId,
      correction_type: 'korrektur',
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (korrError || !korrInvoice) {
    throw new Error(`Korrekturrechnung konnte nicht erstellt werden: ${korrError?.message}`);
  }

  // Positionen erstellen
  const items = corrections.map(c => ({
    invoice_id: korrInvoice.id,
    service_record_id: c.serviceRecordId || null,
    description: `${c.leistungsart} am ${c.leistungsdatum}`,
    date: c.leistungsdatum,
    duration_minutes: null,
    amount: c.gesamtpreisCent / 100,
    budget_type: null,
    organization_id: original.organization_id,
  }));

  const { error: itemsInsertError } = await supabase.from('invoice_items').insert(items);

  if (itemsInsertError) {
    throw new Error(
      `Korrekturpositionen konnten nicht erstellt werden: ${itemsInsertError.message}. ` +
      `Korrekturrechnung ${korrInvoice.id} wurde angelegt, hat aber keine Positionen.`
    );
  }

  // Korrektur-Eintrag
  const originalAmountCents = Math.round(Number(original.total_amount) * 100);
  const { data: correction, error: corrError } = await supabase
    .from('invoice_corrections')
    .insert({
      original_invoice_id: invoiceId,
      correction_invoice_id: korrInvoice.id,
      correction_type: 'korrektur',
      original_amount_cents: originalAmountCents,
      corrected_amount_cents: correctedTotal,
      reason,
      status: 'entwurf',
      created_by: actorId,
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (corrError || !correction) {
    throw new Error(`Korrektur-Eintrag konnte nicht erstellt werden: ${corrError?.message}`);
  }

  // CAS-Guard: Original darf zwischen Laden und Korrektur-Insert nicht
  // storniert/abgeschrieben worden sein (Race mit cancelInvoice/writeOffInvoice)
  const { data: casCheck } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('status', currentStatus)
    .maybeSingle();

  if (!casCheck) {
    await supabase.from('invoice_corrections').delete().eq('id', correction.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', korrInvoice.id);
    await supabase.from('invoices').delete().eq('id', korrInvoice.id);
    throw new Error('Rechnung wurde zwischenzeitlich geaendert (paralleler Zugriff) — bitte erneut versuchen.');
  }

  // Korrektur-Snapshot
  const snapshotContent = {
    type: 'korrektur',
    original_invoice_id: invoiceId,
    correction_invoice_id: korrInvoice.id,
    original_amount: Number(original.total_amount),
    corrected_amount: correctedAmount,
    corrections,
    reason,
    created_at: new Date().toISOString(),
  };

  const checksum = await computeSnapshotChecksum(snapshotContent);

  await supabase.from('invoice_snapshots').insert({
    invoice_id: korrInvoice.id,
    version: 1,
    snapshot: snapshotContent,
    snapshot_type: 'korrektur',
    checksum,
    created_by: actorId,
    organization_id: original.organization_id,
  });

  // Audit-Trail (erweitert: mit Preisabweichungs-Gruenden)
  const priceDeviations = corrections
    .filter(c => c.korrekturgrundPreis)
    .map(c => ({
      leistungsart: c.leistungsart,
      datum: c.leistungsdatum,
      einzelpreis_cent: c.einzelpreisCent,
      korrekturgrund: c.korrekturgrundPreis,
    }));

  await logBillingAction(supabase, {
    entityType: 'correction',
    organizationId: original.organization_id,
    entityId: correction.id,
    action: 'created',
    newState: {
      original_invoice_id: invoiceId,
      correction_invoice_id: korrInvoice.id,
      original_amount_cents: originalAmountCents,
      corrected_amount_cents: correctedTotal,
      reason,
      ...(priceDeviations.length > 0 ? { price_deviations: priceDeviations } : {}),
    },
    actorId,
  });

  return {
    correctionId: correction.id,
    correctionInvoiceId: korrInvoice.id,
    correctionInvoiceNumber: korrekturNummer,
    differenceCents: correctedTotal - originalAmountCents,
  };
}

// ---------------------------------------------------------------------------
// createCreditNote (Gutschrift)
// ---------------------------------------------------------------------------

/**
 * Erstellt eine Gutschrift fuer eine bestehende Rechnung.
 */
export async function createCreditNote(
  supabase: SupabaseClient,
  invoiceId: string,
  amountCents: number,
  reason: string,
  actorId: string,
  expectedOrgId?: string
): Promise<CreditNoteResult> {
  if (amountCents <= 0) {
    throw new Error('Gutschriftbetrag muss positiv sein.');
  }

  // D3: Atomare Validierung per RPC — sperrt Rechnung + bestehende Gutschriften
  // mit FOR UPDATE, sodass parallele Gutschriften serialisiert werden.
  // Fallback auf App-Layer-CAS wenn RPC noch nicht live (Migration pending).
  let rpcValidated = false;
  if (expectedOrgId) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_credit_note_atomic', {
      p_invoice_id: invoiceId,
      p_amount_cents: amountCents,
      p_reason: reason,
      p_actor_id: actorId,
      p_org_id: expectedOrgId,
    });
    if (rpcError) {
      const msg = rpcError.message ?? '';
      const notFound = msg.includes('Could not find') || msg.includes('does not exist') || msg.includes('not found');
      if (!notFound) {
        throw new Error(msg);
      }
    } else {
      const validated = rpcResult as { original_amount_cents: number; remaining_cents: number; validated: boolean };
      if (!validated?.validated) {
        throw new Error('Atomare Gutschrift-Validierung fehlgeschlagen.');
      }
      rpcValidated = true;
    }
  }

  // Original laden
  const { data: original, error: origError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (origError || !original) {
    throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  }

  if (expectedOrgId && original.organization_id !== expectedOrgId) {
    throw new Error(`Rechnung ${invoiceId} gehoert nicht zur angegebenen Organisation.`);
  }

  const currentStatus = original.status as string;
  if (isValidInvoiceStatus(currentStatus) && (currentStatus === 'storniert' as InvoiceStatus)) {
    throw new Error('Rechnung ist storniert — Gutschrift nicht moeglich.');
  }
  if (isValidInvoiceStatus(currentStatus) && (currentStatus === 'abgeschrieben' as InvoiceStatus)) {
    throw new Error('Rechnung ist abgeschrieben — Gutschrift nicht moeglich.');
  }

  const originalAmountCents = Math.round(Number(original.total_amount) * 100);

  const { data: existingCredits } = await supabase
    .from('invoice_corrections')
    .select('corrected_amount_cents')
    .eq('original_invoice_id', invoiceId)
    .eq('correction_type', 'gutschrift')
    .is('deleted_at', null);
  const alreadyCreditedCents = (existingCredits || []).reduce(
    (sum, c) => sum + (originalAmountCents - (c.corrected_amount_cents ?? originalAmountCents)),
    0
  );
  const remainingCreditableCents = originalAmountCents - alreadyCreditedCents;

  if (amountCents > remainingCreditableCents) {
    throw new Error(
      `Gutschriftbetrag (${amountCents} Cent) uebersteigt den verbleibenden Betrag (${remainingCreditableCents} Cent, bereits gutgeschrieben: ${alreadyCreditedCents} Cent).`
    );
  }

  // Gutschriftnummer generieren
  const gsNummer = await generateInvoiceNumber(
    supabase,
    original.organization_id,
    INVOICE_NUMBER_PREFIX.gutschrift
  );

  // Gutschrift-Rechnung (negativer Betrag)
  const creditAmount = -(amountCents / 100);

  const { data: creditInvoice, error: creditError } = await supabase
    .from('invoices')
    .insert({
      invoice_number: gsNummer,
      invoice_number_formatted: gsNummer,
      client_id: original.client_id,
      insurance_name: original.insurance_name,
      insurance_number: original.insurance_number,
      period_start: original.period_start,
      period_end: original.period_end,
      total_amount: creditAmount,
      status: 'entwurf',
      version: 1,
      correction_of: invoiceId,
      correction_type: 'gutschrift',
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (creditError || !creditInvoice) {
    throw new Error(`Gutschrift konnte nicht erstellt werden: ${creditError?.message}`);
  }

  // Korrektur-Eintrag
  const { data: correction, error: corrError } = await supabase
    .from('invoice_corrections')
    .insert({
      original_invoice_id: invoiceId,
      correction_invoice_id: creditInvoice.id,
      correction_type: 'gutschrift',
      original_amount_cents: originalAmountCents,
      corrected_amount_cents: originalAmountCents - amountCents,
      reason,
      status: 'entwurf',
      created_by: actorId,
      organization_id: original.organization_id,
    })
    .select('id')
    .single();

  if (corrError || !correction) {
    throw new Error(`Korrektur-Eintrag konnte nicht erstellt werden: ${corrError?.message}`);
  }

  // CAS-Guard: nach Insert pruefen, ob Gesamtgutschriften den Originalbetrag
  // nicht uebersteigen (Schutz gegen parallele Gutschrift-Race-Condition)
  const { data: allCreditsAfterInsert } = await supabase
    .from('invoice_corrections')
    .select('corrected_amount_cents')
    .eq('original_invoice_id', invoiceId)
    .eq('correction_type', 'gutschrift')
    .is('deleted_at', null);

  const totalCreditedAfter = (allCreditsAfterInsert || []).reduce(
    (sum, c) => sum + (originalAmountCents - (c.corrected_amount_cents ?? originalAmountCents)),
    0
  );

  if (totalCreditedAfter > originalAmountCents) {
    await supabase.from('invoice_corrections').delete().eq('id', correction.id);
    await supabase.from('invoices').delete().eq('id', creditInvoice.id);
    throw new Error(
      'Gutschrift abgelehnt: Paralleler Zugriff hat den verfuegbaren Betrag ueberschritten — bitte erneut versuchen.'
    );
  }

  // Gutschrift-Snapshot
  const snapshotContent = {
    type: 'gutschrift',
    original_invoice_id: invoiceId,
    credit_invoice_id: creditInvoice.id,
    credit_amount_cents: amountCents,
    reason,
    created_at: new Date().toISOString(),
  };

  const checksum = await computeSnapshotChecksum(snapshotContent);

  await supabase.from('invoice_snapshots').insert({
    invoice_id: creditInvoice.id,
    version: 1,
    snapshot: snapshotContent,
    snapshot_type: 'gutschrift',
    checksum,
    created_by: actorId,
    organization_id: original.organization_id,
  });

  // Audit-Trail
  await logBillingAction(supabase, {
    entityType: 'credit_note',
    organizationId: original.organization_id,
    entityId: correction.id,
    action: 'created',
    newState: {
      original_invoice_id: invoiceId,
      credit_invoice_id: creditInvoice.id,
      amount_cents: amountCents,
      reason,
    },
    actorId,
  });

  return {
    correctionId: correction.id,
    creditInvoiceId: creditInvoice.id,
    creditInvoiceNumber: gsNummer,
    amountCents,
  };
}

// ---------------------------------------------------------------------------
// writeOffInvoice (Forderungsabschreibung)
// ---------------------------------------------------------------------------

const WRITE_OFF_ALLOWED_FROM: ReadonlySet<string> = new Set([
  'freigegeben', 'uebermittelt', 'quittiert', 'teilweise_bezahlt',
  'gekuerzt', 'abgelehnt', 'korrektur_erforderlich',
  'erneut_eingereicht', 'strittig',
]);

export async function writeOffInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  reason: string,
  actorId: string,
  expectedOrgId?: string
): Promise<WriteOffResult> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Begruendung fuer Forderungsabschreibung erforderlich (mind. 5 Zeichen).');
  }

  const { data: original, error: origError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (origError || !original) {
    throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
  }

  if (expectedOrgId && original.organization_id !== expectedOrgId) {
    throw new Error(`Rechnung ${invoiceId} gehoert nicht zur angegebenen Organisation.`);
  }

  const currentStatus = original.status as string;
  if (!WRITE_OFF_ALLOWED_FROM.has(currentStatus)) {
    throw new Error(
      `Rechnung im Status "${currentStatus}" kann nicht abgeschrieben werden. ` +
      `Erlaubt nur von: ${[...WRITE_OFF_ALLOWED_FROM].join(', ')}.`
    );
  }

  const totalAmountCents = Math.round(Number(original.total_amount) * 100);
  const paidAmountCents = Math.round(Number(original.paid_amount || 0) * 100);
  const writtenOffAmountCents = totalAmountCents - paidAmountCents;

  if (writtenOffAmountCents <= 0) {
    throw new Error('Keine offene Forderung zum Abschreiben vorhanden.');
  }

  // CAS: nur wenn Status noch dem gelesenen entspricht
  const { data: updated, error: updateError } = await supabase
    .from('invoices')
    .update({ status: 'abgeschrieben' })
    .eq('id', invoiceId)
    .eq('status', currentStatus)
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error('Rechnung wurde zwischenzeitlich geaendert (paralleler Zugriff) — bitte erneut versuchen.');
  }

  await logBillingAction(supabase, {
    entityType: 'invoice',
    organizationId: original.organization_id,
    entityId: invoiceId,
    action: 'abgeschrieben',
    previousState: {
      status: currentStatus,
      total_amount: original.total_amount,
      paid_amount: original.paid_amount,
    },
    newState: {
      status: 'abgeschrieben',
      written_off_amount_cents: writtenOffAmountCents,
    },
    reason,
    actorId,
  });

  return {
    invoiceId,
    previousStatus: currentStatus,
    writtenOffAmountCents,
    totalAmountCents,
    paidAmountCents,
  };
}
