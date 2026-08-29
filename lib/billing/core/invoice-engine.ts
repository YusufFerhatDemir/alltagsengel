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
import { billingLogger as log } from '@/lib/logger';
import {
  validateTransition,
  isValidInvoiceStatus,
  INVOICE_NUMBER_PREFIX,
  ABSCHREIBBAR_VON,
  type InvoiceStatus,
} from './status-machine';
import { logBillingAction, computeSnapshotChecksum } from './audit';
// resolvePrice wird nicht mehr als Fallback verwendet — die Tarifaufloesung
// erfolgt vollstaendig innerhalb der atomaren RPC (billing_tariffs = fuehrend).
// import { resolvePrice } from './price-resolver';  // ENTFERNT: kein Fallback
// Der Fail-Closed-Fehlertyp wird dagegen geteilt, damit Korrekturen dieselbe
// Tarif-Statuspruefung wie resolvePrice/RPC verwenden.
import { TarifNichtVerifiziertError, type TarifStatus } from './price-resolver';
// Zahlungsziel + Faelligkeit: invoices.due_date wurde bisher nirgends gesetzt,
// dadurch war jede zahlungszielbasierte Auswertung (OPOS, Mahnwesen,
// workflow_engine) wirkungslos.
import { zahlungszielFelder } from './zahlungsziel';
import { euroZuCent, centRunden, aufCent } from '@/lib/geld'
// Budgetdeckel § 45b / § 42a: die RPC kennt client_budgets nicht und weist
// jeden Nicht-Privat-Betrag ungedeckelt als Kassenanteil aus (Befund A-1).
// Der Deckel sitzt deshalb hier — Lage VOR der RPC lesen (fail-closed),
// Aufteilung danach korrigieren.
import {
  budgetTopfFuer,
  istGedeckelt,
  ermittleBudgetLage,
  deckelAusLage,
  type BudgetLage,
  type BudgetDeckelErgebnis,
} from './budget-cap';
import { assertBelegteNachweise } from '@/lib/billing/nachweis-beleg';

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
  /**
   * Ergebnis der Budgetdeckelung (§ 45b / § 42a). `null` bei Privatrechnungen
   * und bei `alreadyExists` — dort wurde der Deckel bei der Erstanlage
   * angewendet und wird nicht erneut gerechnet.
   */
  budgetDeckel?: BudgetDeckelErgebnis | null;
}

export interface FreezeResult {
  snapshotId: string;
  invoiceNumber: string;
  checksum: string;
  version: number;
  /**
   * Nur gesetzt, wenn freezeInvoice mit `autoVersand: true` gerufen wurde:
   * 'versendet' | 'uebersprungen' | 'fehlgeschlagen'.
   */
  versandStatus?: string;
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
/**
 * Setzt invoices.due_date aus payment_terms_days — aber nur, solange due_date
 * noch NULL ist. Wird nach RPC-Pfaden aufgerufen, die die Spalte nicht kennen.
 *
 * Bewusst best-effort: das Faelligkeitsdatum ist eine Auswertungsgroesse
 * (OPOS/Mahnwesen), keine Rechnungsgroesse. Ein Fehler hier wird protokolliert,
 * aber nicht geworfen — die Rechnung selbst ist zu diesem Zeitpunkt bereits
 * atomar committet.
 */
export async function setzeFaelligkeitFallsLeer(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<string | null> {
  try {
    const { data: invoice, error: loadError } = await supabase
      .from('invoices')
      .select('id, due_date, payment_terms_days, created_at')
      .eq('id', invoiceId)
      .maybeSingle();

    if (loadError || !invoice) {
      log.error('Faelligkeit: Rechnung nicht ladbar', { invoiceId, errorMessage: loadError?.message });
      return null;
    }
    if (invoice.due_date) return invoice.due_date as string;

    const rechnungsdatum = invoice.created_at
      ? String(invoice.created_at).slice(0, 10)
      : null;
    const felder = zahlungszielFelder(rechnungsdatum, invoice.payment_terms_days);

    const { error: updateError } = await supabase
      .from('invoices')
      .update(felder)
      .eq('id', invoiceId)
      .is('due_date', null);

    if (updateError) {
      log.error('Faelligkeit konnte nicht gesetzt werden', { invoiceId, errorMessage: updateError.message });
      return null;
    }

    return felder.due_date;
  } catch (err) {
    // Die Rechnung ist an dieser Stelle bereits atomar committet. Ein Problem
    // beim Nachziehen der Faelligkeit darf sie nicht nachtraeglich zu einem
    // Fehlschlag machen — OPOS haette dann gar keine Rechnung statt einer
    // Rechnung ohne Faelligkeit.
    log.errorWithException('Faelligkeit: unerwarteter Fehler', err, { invoiceId });
    return null;
  }
}

/**
 * Wendet den Budgetdeckel auf eine bereits erstellte Rechnung an.
 *
 * Wird unmittelbar nach `create_invoice_draft_atomic()` aufgerufen. Die
 * Budgetlage wurde bereits **vor** der RPC gelesen (fail-closed) — hier wird
 * nur noch gerechnet und geschrieben.
 *
 * Es wird nichts blockiert: der Ueberschuss wandert von `budget_amount` nach
 * `private_amount`. `total_amount` bleibt unveraendert — die Leistung wurde
 * erbracht, nur der Traeger der Kosten aendert sich.
 *
 * Ein Fehlschlag des Schreibens wirft. Anders als beim Faelligkeitsdatum ist
 * das hier richtig: eine Rechnung mit ungedeckeltem Kassenanteil ist eine
 * unzulaessige Forderung gegen die Pflegekasse, kein Auswertungsmangel. Der
 * Aufrufer sieht den Entwurf dann als fehlgeschlagen und kann ihn stornieren.
 */
export async function wendeBudgetDeckelAn(
  supabase: SupabaseClient,
  params: {
    invoiceId: string;
    organizationId: string;
    actorId: string;
    lage: BudgetLage;
  }
): Promise<BudgetDeckelErgebnis | null> {
  const { invoiceId, organizationId, actorId, lage } = params;

  const { data: invoice, error: loadError } = await supabase
    .from('invoices')
    .select('id, total_amount, budget_amount, private_amount, notes')
    .eq('id', invoiceId)
    .maybeSingle();

  if (loadError || !invoice) {
    throw new Error(
      `Budgetdeckel: Rechnung ${invoiceId} nach der Erstellung nicht lesbar `
      + `(${loadError?.message ?? 'keine Zeile'}). Aufteilung ungeprueft.`
    );
  }

  const kassenBetrag = Number(invoice.budget_amount ?? 0);
  const bisherPrivat = Number(invoice.private_amount ?? 0);

  const ergebnis = deckelAusLage(lage, kassenBetrag);

  if (!ergebnis.gedeckelt) return ergebnis;

  // aufCent() statt Math.round((x + Number.EPSILON) * 100) / 100: der
  // EPSILON-Summand traf bei kleinen Betraegen zufaellig das richtige
  // Ergebnis und verfehlte es bei groesseren (8,575 → 8,57 statt 8,58) —
  // siehe die ausfuehrliche Begruendung in lib/billing/core/budget-cap.ts.
  // Der Ueberschuss wandert hier auf den Privatanteil; ein verlorener Cent
  // ist eine Forderung, die der Kunde nie gestellt bekommt.
  const neuerPrivatAnteil = aufCent(bisherPrivat + ergebnis.ueberschussEuro);

  const notizZusatz = `[Budgetdeckel] ${ergebnis.grund}`;
  const notes = invoice.notes ? `${invoice.notes}\n${notizZusatz}` : notizZusatz;

  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      budget_amount: ergebnis.budgetAnteilEuro,
      private_amount: neuerPrivatAnteil,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  if (updateError) {
    throw new Error(
      `Budgetdeckel konnte nicht angewendet werden (${updateError.message}). `
      + `Rechnung ${invoiceId} traegt weiterhin einen ungedeckelten Kassenanteil `
      + `von ${kassenBetrag.toFixed(2)} EUR.`
    );
  }

  await logBillingAction(supabase, {
    entityType: 'invoice',
    entityId: invoiceId,
    organizationId,
    action: 'budget_capped',
    previousState: {
      budget_amount: kassenBetrag,
      private_amount: bisherPrivat,
    },
    newState: {
      budget_amount: ergebnis.budgetAnteilEuro,
      private_amount: neuerPrivatAnteil,
      ueberschuss_euro: ergebnis.ueberschussEuro,
      greifender_deckel: ergebnis.greifenderDeckel,
      limit_bis_monat_euro: ergebnis.limitBisMonatEuro,
      limit_jahr_euro: ergebnis.limitJahrEuro,
      verfuegbar_euro: ergebnis.verfuegbarEuro,
      budget_topf: lage.topf,
      period_month: lage.periodMonth,
      anspruch_quelle: lage.anspruchQuelle,
      verbraucht_bis_monat_euro: lage.verbrauchtBisMonatEuro,
      verbraucht_jahr_euro: lage.verbrauchtJahrEuro,
    },
    reason: ergebnis.grund ?? undefined,
    actorId,
  });

  return ergebnis;
}

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

  // ── Budgetlage VOR der Rechnungserstellung ───────────────────────────
  // Reihenfolge ist bewusst: die RPC kennt client_budgets nicht und weist
  // jeden Nicht-Privat-Betrag ungedeckelt als Kassenanteil aus. Ist die
  // Budgetlage nicht ermittelbar, wird hier geworfen — bevor eine Rechnung
  // existiert, deren Aufteilung niemand belegen kann.
  // `privat` hat keinen Anspruch zu begrenzen; `sachleistung_36` (§ 36 SGB XI)
  // ist pflegegradabhaengig und hat keine hinterlegten Saetze — beides in
  // UNGEDECKELTE_TOEPFE begruendet, damit die Luecke benannt bleibt.
  const topf = budgetTopfFuer(budgetType);
  const lage = istGedeckelt(topf)
    ? await ermittleBudgetLage(supabase, {
        clientId,
        organizationId: client.organization_id,
        periodMonth,
        topf,
      })
    : null;

  // ── Unterschriftsbeleg VOR der Rechnungserstellung ───────────────────
  // Reihenfolge: nach der Budgetlage, vor der RPC. Beide Vorpruefungen
  // sind fail-closed und schreiben nichts; die Budgetlage steht zuerst,
  // weil sie die aeltere und breitere Aussage ist ("darf ueberhaupt
  // gedeckelt abgerechnet werden"). Entscheidend ist nur, dass beide vor
  // der RPC liegen — danach existiert die Rechnung.
  // Die RPC prueft die Unterschrift ebenfalls, akzeptiert dabei aber
  //
  //     proof_status IS DISTINCT FROM 'UNTERSCHRIEBEN' AND signature_hash IS NULL
  //
  // — also eine ODER-Annahme: der blosse Statuswert 'UNTERSCHRIEBEN'
  // genuegt ihr, auch wenn nie ein Hash gebildet wurde. Der Hash entsteht
  // aber nur, wenn `client_signed_at` gesetzt ist; wer den Status ohne
  // Zeitstempel setzt, kommt an der Sperre vorbei. Und den Status setzen
  // kann live jede Pflegekraft auf ihrer eigenen Zeile: die Policy
  // `sr_engel_own` ist FOR ALL und hebt die Statuseinschraenkung der
  // daneben liegenden Policy `service_records_caregiver_update` durch die
  // ODER-Verknuepfung permissiver Policies auf.
  //
  // Deshalb hier, an der EINEN Stelle, durch die jeder Rechnungsweg laeuft
  // (Einzelrechnung, auto-invoice, Sammelrechnungslauf), noch einmal die
  // strengere Frage: gibt es einen BELEG. Siehe lib/billing/nachweis-beleg.ts.
  // Migration 20261017000000 zieht dieselbe Verschaerfung in der Datenbank
  // nach; bis sie angewendet ist, ist diese Pruefung die einzige.
  await assertBelegteNachweise(supabase, {
    clientId,
    organizationId: client.organization_id,
    periodMonth,
    budgetType,
  });

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
    const tariffError = parseTariffError(rpcError.message);
    if (tariffError) {
      const err = new Error(rpcError.message) as Error & { tariffErrorCode?: string };
      err.tariffErrorCode = tariffError;
      throw err;
    }
    throw new Error(`Atomare Rechnungserstellung fehlgeschlagen: ${rpcError.message}`);
  }

  if (!rpcResult) {
    throw new Error('RPC create_invoice_draft_atomic hat kein Ergebnis zurueckgegeben.');
  }

  // v9: Fehler-JSON erkennen (Audit-Eintrag wurde in der DB persistiert, kein Rollback)
  if (rpcResult.success === false) {
    const errorMsg = rpcResult.message || rpcResult.error || 'Unbekannter Fehler';
    if (rpcResult.error === 'MISSING_SIGNATURE') {
      throw new Error(errorMsg);
    }
    const tariffError = parseTariffError(String(rpcResult.error));
    if (tariffError) {
      const err = new Error(errorMsg) as Error & { tariffErrorCode?: string };
      err.tariffErrorCode = tariffError;
      throw err;
    }
    throw new Error(`Atomare Rechnungserstellung fehlgeschlagen: ${errorMsg}`);
  }

  // ── Zahlungsziel / Faelligkeit nachziehen ────────────────────────────
  // Die RPC schreibt due_date nicht (Spalte kam erst mit 20260808210000).
  // Ohne due_date faellt die gesamte zahlungszielbasierte Auswertung aus:
  // OPOS-Altersklassen, Mahnlauf und die faelligkeits-Workflows finden nichts.
  //
  // NUR setzen, wenn noch leer (.is('due_date', null)):
  //   • bei already_exists=true bleibt das Ziel der Bestandsrechnung stehen
  //   • ein manuell abweichend gesetztes Zahlungsziel wird nicht ueberschrieben
  // Der Faelligkeitswert ist eine Auswertungsgroesse, keine Preisangabe —
  // ein Fehlschlag hier darf die bereits committete Rechnung nicht kippen.
  await setzeFaelligkeitFallsLeer(supabase, rpcResult.invoice_id);

  // ── Budgetdeckel § 45b / § 42a anwenden ──────────────────────────────
  // Nur bei frisch erstellten Rechnungen: bei already_exists=true wurde der
  // Deckel bei der Erstanlage angewendet, und der bereits fakturierte
  // Verbrauch enthaelt diese Rechnung schon — ein zweiter Lauf wuerde sie
  // gegen sich selbst rechnen.
  let budgetDeckel: BudgetDeckelErgebnis | null = null;
  if (lage && !rpcResult.already_exists) {
    budgetDeckel = await wendeBudgetDeckelAn(supabase, {
      invoiceId: rpcResult.invoice_id,
      organizationId: client.organization_id,
      actorId,
      lage,
    });
  }

  // Ergebnis auswerten — Preise kommen ausschliesslich aus billing_tariffs
  return {
    invoiceId: rpcResult.invoice_id,
    invoiceNumber: rpcResult.invoice_number,
    totalAmountCents: euroZuCent(rpcResult.total_amount),
    lineCount: rpcResult.line_count,
    alreadyExists: rpcResult.already_exists,
    priceSource: 'billing_tariffs',
    budgetDeckel,
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
export interface FreezeOptions {
  /**
   * Nach der Festschreibung Belegpaket erzeugen und per E-Mail an den
   * Klienten schicken.
   *
   * Bewusst OPT-IN und nicht Standard: der Versand ist der einzige Schritt
   * der Kette, der nach draussen geht und sich nicht zurueckholen laesst.
   * Die Route setzt das Flag nur, wenn RECHNUNGSVERSAND_AUTOMATISCH='1'
   * gesetzt ist. Ein Fehlschlag beim Versand kippt die Festschreibung
   * NICHT — die Rechnung bleibt festgeschrieben und laesst sich manuell
   * ueber POST /api/billing/invoices/[id]/versenden nachsenden.
   */
  autoVersand?: boolean;
}

export async function freezeInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  actorId: string,
  expectedOrgId?: string,
  options: FreezeOptions = {}
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
    log.warn('Legacy-Status wird festgeschrieben', { invoiceId, status: currentStatus });
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
      const gesamtpreisCent = euroZuCent(item.amount);
      const einzelpreisCent = menge > 0 ? centRunden(gesamtpreisCent / menge) : gesamtpreisCent;
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
      log.error('Line-Snapshots Fehler', { invoiceId, errorMessage: lineError?.message });
    }
  }

  // Rechnung einfrieren.
  //
  // CAS-Guard `.is('frozen_at', null)`: die Pruefung ganz oben ist ein
  // Lesen-dann-Schreiben. Zwei gleichzeitige Laeufe sehen beide frozen_at
  // = NULL. In der Praxis stolpert der Zweite schon am Snapshot
  // (unique_invoice_version auf invoice_snapshots, Migration
  // 20260806200000) — aber das ist ein Nebeneffekt einer fremden
  // Bedingung, kein Vorsatz. Steht die Bedingung hier, kann die
  // Festschreibung selbst nicht mehr doppelt schreiben, und der zweite
  // Lauf bekommt die fachliche Meldung statt eines Datenbankfehlers.
  // Dasselbe Muster steht in createCreditNote/releaseCreditNote.
  const frozenAt = new Date().toISOString();
  const { data: eingefroren, error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'freigegeben',
      frozen_at: frozenAt,
      version,
      invoice_number_formatted: formattedNumber,
    })
    .eq('id', invoiceId)
    .is('frozen_at', null)
    .select('id');

  if (updateError) {
    throw new Error(`Rechnung konnte nicht eingefroren werden: ${updateError.message}`);
  }

  if (Array.isArray(eingefroren) && eingefroren.length === 0) {
    throw new Error(
      'Rechnung wurde zwischenzeitlich festgeschrieben (paralleler Zugriff). '
      + 'Es wurde nichts geaendert.'
    );
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
    log.errorWithException('Auto-Dunning bei Festschreibung fehlgeschlagen', e, { invoiceId });
  }

  // Auto-Versand: Belegpaket erzeugen + per E-Mail an den Klienten.
  // Fehler werden geschluckt — die Rechnung ist festgeschrieben, und der
  // Versand ist ueber die Versenden-Route jederzeit nachholbar.
  let versandStatus: string | undefined;
  if (options.autoVersand) {
    try {
      const { versendeRechnungPerEmail } = await import('@/lib/billing/versand/rechnung-versand');
      const ergebnis = await versendeRechnungPerEmail(supabase, {
        invoiceId,
        organizationId: invoice.organization_id,
        actorId,
        // Automat: es steht niemand davor, der einen Zweifelsfall
        // verantworten koennte. Nur READY_FOR_SEND geht raus; alles mit
        // offenen Pruefpunkten wartet auf den Versand von Hand.
        preflight: 'automatisch',
      });
      versandStatus = ergebnis.status;
      if (ergebnis.status !== 'versendet') {
        log.warn('Auto-Versand nach Festschreibung nicht durchgefuehrt', {
          invoiceId, status: ergebnis.status, grund: ergebnis.grund,
        });
      }
    } catch (e) {
      versandStatus = 'fehlgeschlagen';
      log.errorWithException('Auto-Versand nach Festschreibung fehlgeschlagen', e, { invoiceId });
    }
  }

  return {
    snapshotId: snapshot.id,
    invoiceNumber: formattedNumber,
    checksum,
    version,
    versandStatus,
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
    log.warn('next_billing_number RPC fehlgeschlagen, nutze Fallback', { errorMessage: error.message });
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
      ...zahlungszielFelder(null, original.payment_terms_days),
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
      original_amount_cents: euroZuCent(original.total_amount),
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
    differenceCents: -euroZuCent(original.total_amount),
  };
}

// ---------------------------------------------------------------------------
// correctInvoice (Korrekturrechnung)
// ---------------------------------------------------------------------------

/**
 * Fail-Closed-Statuspruefung fuer die Tarif-Gegenpruefung bei Korrekturen.
 *
 * Gleiche Regel wie resolvePrice():
 *  - 'blocked'                      → nie verwendbar (auch privat nicht)
 *  - Kassentarif (!== 'privat')     → nur 'verified'
 *  - Privattarif  (=== 'privat')    → alles ausser 'blocked'
 *
 * Fehlender Status wird als 'unverified' behandelt (fail-closed).
 */
export function isTarifFuerKorrekturVerwendbar(
  tarif: { tarif_status?: string | null; rechtsgrundlage?: string | null }
): boolean {
  const status = tarif.tarif_status ?? 'unverified';
  if (status === 'blocked') return false;
  const istKasse = (tarif.rechtsgrundlage ?? '') !== 'privat';
  if (istKasse) return status === 'verified';
  return true;
}

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
  // ═══ Betragsplausibilitaet JEDER Position ═══
  // Der Rechnungsbetrag entsteht ausschliesslich aus gesamtpreisCent. Die
  // Tarif-Gegenpruefung weiter unten vergleicht aber nur einzelpreisCent.
  // Ohne die folgende Kopplung ist die Gegenpruefung wirkungslos: mit
  // einzelpreisCent = Tarifpreis (besteht die Abweichungspruefung) und einem
  // beliebigen gesamtpreisCent laesst sich jeder Rechnungsbetrag erzeugen.
  for (const c of corrections) {
    for (const [feld, wert] of [
      ['menge', c.menge],
      ['einzelpreisCent', c.einzelpreisCent],
      ['gesamtpreisCent', c.gesamtpreisCent],
    ] as const) {
      if (typeof wert !== 'number' || !Number.isFinite(wert)) {
        throw new Error(
          `Korrekturposition "${c.leistungsart}": ${feld} muss eine Zahl sein.`
        );
      }
    }
    if (c.gesamtpreisCent < 0) {
      throw new Error(`Negativer Betrag fuer "${c.leistungsart}" nicht erlaubt.`);
    }
    if (c.menge <= 0) {
      throw new Error(`Menge fuer "${c.leistungsart}" muss groesser als 0 sein.`);
    }
    if (!Number.isInteger(c.einzelpreisCent) || !Number.isInteger(c.gesamtpreisCent)) {
      throw new Error(
        `Korrekturposition "${c.leistungsart}": Betraege muessen ganzzahlige Cent sein.`
      );
    }

    // centRunden statt Math.round: eine Korrekturposition traegt einen
    // NEGATIVEN Cent-Betrag, und Math.round(-100.5) ergibt -100 statt -101 —
    // die Gutschrift waere um einen Cent kleiner als die Position, die sie
    // ausgleicht, und die Plausibilitaetspruefung unten wuerde das als
    // Betragsabweichung melden.
    const erwartet = centRunden(c.einzelpreisCent * c.menge);
    const zuschlag = c.zuschlagProzent
      ? centRunden(erwartet * (c.zuschlagProzent / 100))
      : 0;
    // 1 Cent Toleranz fuer Rundung bei gebrochenen Mengen (z.B. 1,5 Stunden).
    if (Math.abs(c.gesamtpreisCent - (erwartet + zuschlag)) > 1) {
      throw new Error(
        `Korrekturposition "${c.leistungsart}" am ${c.leistungsdatum}: ` +
        `Gesamtpreis ${c.gesamtpreisCent} Cent passt nicht zu Einzelpreis ` +
        `${c.einzelpreisCent} Cent x Menge ${c.menge}` +
        (zuschlag ? ` + ${c.zuschlagProzent}% Zuschlag` : '') +
        ` (erwartet ${erwartet + zuschlag} Cent).`
      );
    }
  }

  const correctedTotal = corrections.reduce((sum, c) => sum + c.gesamtpreisCent, 0);
  if (correctedTotal <= 0) {
    throw new Error('Korrigierter Gesamtbetrag muss positiv sein.');
  }

  // ═══ Tarif-Gegenprüfung für jede Korrekturposition ═══
  // Admin darf nicht beliebige Preise setzen — bei >10% Abweichung vom
  // aktuellen Tarif muss ein expliziter Korrekturgrund angegeben werden.
  //
  // FAIL-CLOSED (identisch zu resolvePrice und create_invoice_draft_atomic):
  // Nicht verwendbare Tarife (Kasse ohne 'verified', oder 'blocked') werden
  // aus dem Cross-Check entfernt. Sonst koennte eine Korrektur den Preis eines
  // gesperrten/unverifizierten Tarifs verwenden und die Abweichungspruefung
  // wuerde ihn als "passend" durchwinken. Gibt es zu einer Leistungsart nur
  // unbrauchbare Tarife, wird die Korrektur abgelehnt.
  for (const c of corrections) {
    const { data: matchingTariffs, error: tariffError } = await supabase
      .from('billing_tariffs')
      .select('preis_cent, verguetungsart, id, tarif_status, rechtsgrundlage, verifizierungs_quelle')
      .eq('leistungsart', c.leistungsart)
      .eq('organization_id', original.organization_id)
      .lte('gueltig_ab', c.leistungsdatum)
      .is('deleted_at', null)
      .order('gueltig_ab', { ascending: false })
      .limit(5);

    if (tariffError) {
      // Kein stiller Fallback: ohne Tarifdaten ist keine Gegenpruefung moeglich.
      throw new Error(
        `Tarif-Gegenpruefung fuer "${c.leistungsart}" fehlgeschlagen: ${tariffError.message}`
      );
    }

    // FAIL-CLOSED bei fehlendem Tarif: ohne Tarif gibt es keinen Massstab fuer
    // den Preis. Frueher wurde die Position dann ungeprueft uebernommen — damit
    // liess sich die gesamte Gegenpruefung umgehen, indem man eine Leistungsart
    // angab, zu der kein Tarif existiert.
    if (!matchingTariffs || matchingTariffs.length === 0) {
      throw new Error(
        `Kein Tarif fuer "${c.leistungsart}" zum ${c.leistungsdatum} hinterlegt — ` +
        `Korrektur nicht moeglich. Erst einen verifizierten Tarif anlegen.`
      );
    }

    {
      const verwendbare = matchingTariffs.filter(isTarifFuerKorrekturVerwendbar);

      if (verwendbare.length === 0) {
        const gesperrt = matchingTariffs.find(t => t.tarif_status === 'blocked') ?? matchingTariffs[0];
        throw new TarifNichtVerifiziertError(
          c.leistungsart,
          (gesperrt.tarif_status ?? 'unverified') as TarifStatus,
          gesperrt.verifizierungs_quelle ?? null
        );
      }

      // Besten verwendbaren Tarif nehmen (neuester gueltig_ab)
      const bestTariff = verwendbare[0];
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
  }

  // ── Budget-Topf der Korrektur = Budget-Topf des Originals ────────────
  // Die Positionen der Korrekturrechnung trugen bisher `budget_type: null`.
  // Damit konnte `ermittleBudgetLage()` sie keinem Topf zuordnen und zaehlte
  // sie — ueber den konservativen Fallback fuer unbekannte Werte — gegen
  // JEDEN geprueften Topf: dieselbe Korrektur verbrauchte einmal § 45b und
  // einmal § 42a. Der Topf ist bekannt, er steht an den Positionen des
  // Originals; er wird deshalb uebernommen. Nur wenn das Original selbst
  // keinen eindeutigen Topf hat, bleibt es bei null.
  const { data: originalPosten, error: originalPostenError } = await supabase
    .from('invoice_items')
    .select('budget_type')
    .eq('invoice_id', invoiceId);

  if (originalPostenError) {
    throw new Error(
      `Positionen der Originalrechnung nicht lesbar (${originalPostenError.message}) — `
      + `der Budget-Topf der Korrektur waere unbelegt.`
    );
  }

  const topfWerte = new Set(
    (originalPosten ?? [])
      .map(p => String(p.budget_type ?? '').trim())
      .filter(w => w !== '')
  );
  const korrekturBudgetType = topfWerte.size === 1 ? [...topfWerte][0] : null;

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
      ...zahlungszielFelder(null, original.payment_terms_days),
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
    budget_type: korrekturBudgetType,
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
  const originalAmountCents = euroZuCent(original.total_amount);
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

  const originalAmountCents = euroZuCent(original.total_amount);

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
      ...zahlungszielFelder(null, original.payment_terms_days),
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

// Die Liste stand hier bis 29.08.2026 ein zweites Mal woertlich, neben der
// Uebergangstabelle der Statusmaschine. Sie kommt jetzt aus genau dieser
// Tabelle — siehe `ABSCHREIBBAR_VON` in `status-machine.ts`.
const WRITE_OFF_ALLOWED_FROM: ReadonlySet<string> = ABSCHREIBBAR_VON;

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

  const totalAmountCents = euroZuCent(original.total_amount);
  const paidAmountCents = euroZuCent(original.paid_amount || 0);
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
