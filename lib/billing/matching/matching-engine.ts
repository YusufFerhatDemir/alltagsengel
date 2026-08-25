/**
 * Zahlungs-Matching-Engine
 *
 * Automatische Zuordnung von CAMT-Zahlungseingaengen zu offenen Rechnungen.
 * Nutzt ein Scoring-System mit mehreren Matching-Strategien:
 *
 * 1. Rechnungsnummer im Verwendungszweck (hoechste Prio)
 * 2. EndToEndId aus SEPA-Lastschrift (exakter Match)
 * 3. MandateId → Client → offene Rechnungen
 * 4. Debitor-IBAN → Client → offene Rechnungen
 * 5. Debitor-Name fuzzy → Client → offene Rechnungen
 * 6. Betrag exakt → einzige offene Rechnung mit diesem Betrag
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CamtBuchung } from '../camt/camt-parser';
import { createPayment, allocatePayment, type PaymentMethod } from '../core/payments';
import { logBillingAction } from '../core/audit';
import { euroZuCent } from '@/lib/geld'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  openCents: number;
  confidence: number;
  matchMethode: string;
}

export interface MatchResult {
  zahlungseingangsId: string;
  status: 'automatisch' | 'manuell' | 'klaerfall';
  confidence: number;
  paymentId: string | null;
  kandidaten: MatchCandidate[];
  klaerfallGrund: string | null;
}

export interface MatchingConfig {
  /** Ab diesem Score wird automatisch zugeordnet (Default: 70) */
  autoMatchThreshold: number;
  /** Maximale Anzahl Vorschlaege bei Klaerfall (Default: 5) */
  maxVorschlaege: number;
}

const DEFAULT_CONFIG: MatchingConfig = {
  autoMatchThreshold: 70,
  maxVorschlaege: 5,
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Normalisiert einen String fuer Vergleiche:
 * Grossbuchstaben, Umlaute aufloesen, Sonderzeichen entfernen.
 */
function normalize(s: string): string {
  return s
    .toUpperCase()
    .replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy-Name-Match: prueft ob ein Name im anderen enthalten ist
 * oder ob die Wortueberlappung hoch genug ist.
 */
function fuzzyNameMatch(name1: string, name2: string): number {
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (!n1 || !n2) return 0;

  // Exakter Match
  if (n1 === n2) return 100;

  // Einer im anderen enthalten
  if (n1.includes(n2) || n2.includes(n1)) return 80;

  // Wort-Ueberlappung
  const words1 = new Set(n1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(n2.split(' ').filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }
  const ratio = overlap / Math.max(words1.size, words2.size);
  return Math.round(ratio * 70);
}

/**
 * Extrahiert Rechnungsnummern aus einem Verwendungszweck.
 * Erkennt Muster wie: RE-2026-0042, RE2026-042, Rechnung 2026-0042
 *
 * Exportiert, weil der CAMT-Preflight dieselbe Erkennung fuer die
 * Mandantengrenzen-Pruefung braucht. Zwei Erkennungen waeren zwei
 * Wahrheiten: der Trockenlauf saehe eine Rechnungsnummer, die der scharfe
 * Lauf nicht sieht — oder umgekehrt.
 */
export function extrahiereRechnungsnummern(verwendungszweck: string): string[] {
  if (!verwendungszweck) return [];
  const patterns = [
    /RE-?\d{4}-?\d{3,6}/gi,
    /Rechnung\s+\d{4}-?\d{3,6}/gi,
    /RG-?\d{4}-?\d{3,6}/gi,
    /Invoice\s+\d{4}-?\d{3,6}/gi,
  ];
  const results = new Set<string>();
  for (const p of patterns) {
    const matches = verwendungszweck.match(p);
    if (matches) {
      for (const m of matches) {
        results.add(m.toUpperCase().replace(/\s+/g, ''));
      }
    }
  }
  return [...results];
}

// ---------------------------------------------------------------------------
// Hauptlogik
// ---------------------------------------------------------------------------

interface OpenInvoice {
  id: string;
  invoice_number: string;
  invoice_number_formatted: string | null;
  total_amount: number;
  paid_amount: number | null;
  client_id: string;
  client: { first_name: string; last_name: string } | null;
}

interface SepaItemMatch {
  invoice_id: string;
  mandate_id: string;
  mandate: { client_id: string } | null;
}

interface MandateMatch {
  id: string;
  client_id: string;
  debtor_iban: string;
}

/**
 * Ergebnis der reinen BEWERTUNG einer Buchung — ohne jede Buchung.
 *
 * Herausgeloest aus matchBuchung(), damit der Preflight-Lauf
 * (lib/billing/camt/camt-preflight.ts) dieselbe Bewertung benutzt, die der
 * echte Import benutzt. Zwei Bewertungen waeren zwei Wahrheiten: der
 * Trockenlauf saehe eine Zuordnung, die der echte Lauf nicht macht — oder
 * schlimmer, umgekehrt.
 */
export interface BewertungErgebnis {
  /** Alle Rechnungen mit Score > 0, absteigend sortiert. */
  kandidaten: MatchCandidate[];
  /** Gesetzt, wenn schon vor dem Scoring feststeht, dass nichts geht. */
  klaerfallGrund: string | null;
  /** Wie viele offene Rechnungen ueberhaupt betrachtet wurden. */
  geprueft: number;
}

/**
 * Bewertet eine Buchung gegen die offenen Rechnungen einer Organisation.
 *
 * LIEST NUR. Keine Zahlung, keine Zuordnung, kein Audit-Eintrag, kein
 * Klaerfall. Genau deshalb ist sie fuer den Trockenlauf verwendbar.
 */
export async function bewerteBuchung(
  supabase: SupabaseClient,
  buchung: CamtBuchung,
  organizationId: string,
  config: MatchingConfig = DEFAULT_CONFIG,
): Promise<BewertungErgebnis> {
  if (buchung.richtung === 'DBIT') {
    return {
      kandidaten: [],
      klaerfallGrund: 'Soll-Buchung (Ausgang) — kein Zahlungseingang',
      geprueft: 0,
    };
  }

  const betragCent = Math.abs(buchung.betragCent);

  // Lade alle offenen Rechnungen der Organisation
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, client:clients(first_name, last_name)')
    .eq('organization_id', organizationId)
    .not('status', 'in', '("bezahlt","storniert","akzeptiert")')
    .is('deleted_at', null) as { data: OpenInvoice[] | null };

  if (!openInvoices || openInvoices.length === 0) {
    return { kandidaten: [], klaerfallGrund: 'Keine offenen Rechnungen gefunden', geprueft: 0 };
  }

  const kandidaten: MatchCandidate[] = [];

  // ------- Scoring pro Rechnung -------
  for (const inv of openInvoices) {
    const totalCents = euroZuCent(inv.total_amount || 0);
    const paidCents = euroZuCent(inv.paid_amount || 0);
    const openCents = totalCents - paidCents;
    if (openCents <= 0) continue;

    let score = 0;
    const methods: string[] = [];
    const invNum = (inv.invoice_number_formatted || inv.invoice_number || '').toUpperCase();
    const clientName = inv.client
      ? `${inv.client.first_name || ''} ${inv.client.last_name || ''}`.trim()
      : '';

    // 1. Rechnungsnummer im Verwendungszweck
    if (buchung.verwendungszweck && invNum) {
      const vzNorm = buchung.verwendungszweck.toUpperCase();
      if (vzNorm.includes(invNum)) {
        score += 50;
        methods.push('rechnungsnummer_vz');
      } else {
        // Versuche extrahierte Nummern
        const extracted = extrahiereRechnungsnummern(buchung.verwendungszweck);
        for (const ex of extracted) {
          if (invNum.includes(ex) || ex.includes(invNum.replace(/-/g, ''))) {
            score += 45;
            methods.push('rechnungsnummer_regex');
            break;
          }
        }
      }
    }

    // 2. EndToEndId-Match (SEPA)
    if (buchung.endToEndId) {
      const { data: sepaItems } = await supabase
        .from('sepa_batch_items')
        .select('invoice_id, mandate_id, mandate:sepa_mandates(client_id)')
        .eq('end_to_end_id', buchung.endToEndId)
        .eq('organization_id', organizationId) as { data: SepaItemMatch[] | null };

      if (sepaItems && sepaItems.length > 0) {
        for (const item of sepaItems) {
          if (item.invoice_id === inv.id) {
            score += 60;
            methods.push('end_to_end_id');
            break;
          }
        }
      }
    }

    // 3. MandateId → Client → Rechnung
    if (buchung.mandateId) {
      const { data: mandate } = await supabase
        .from('sepa_mandates')
        .select('id, client_id, debtor_iban')
        .eq('mandate_reference', buchung.mandateId)
        .eq('organization_id', organizationId)
        .single() as { data: MandateMatch | null };

      if (mandate && mandate.client_id === inv.client_id) {
        score += 35;
        methods.push('mandate_client');
      }
    }

    // 4. Debitor-IBAN → SEPA-Mandat → Client
    if (buchung.debitorIban) {
      const { data: mandateByIban } = await supabase
        .from('sepa_mandates')
        .select('id, client_id')
        .eq('debtor_iban', buchung.debitorIban.replace(/\s/g, ''))
        .eq('organization_id', organizationId) as { data: MandateMatch[] | null };

      if (mandateByIban && mandateByIban.length > 0) {
        for (const m of mandateByIban) {
          if (m.client_id === inv.client_id) {
            score += 25;
            methods.push('iban_mandat');
            break;
          }
        }
      }
    }

    // 5. Debitor-Name fuzzy → Client
    if (buchung.debitorName && clientName) {
      const nameScore = fuzzyNameMatch(buchung.debitorName, clientName);
      if (nameScore >= 60) {
        score += 15;
        methods.push('name_fuzzy');
      }
    }

    // 6. Betrag exakt
    if (betragCent === openCents) {
      score += 20;
      methods.push('betrag_exakt');
    } else if (Math.abs(betragCent - openCents) <= 5) {
      score += 10;
      methods.push('betrag_fast');
    }

    if (score > 0) {
      kandidaten.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number_formatted || inv.invoice_number,
        clientId: inv.client_id,
        clientName,
        openCents,
        confidence: Math.min(score, 100),
        matchMethode: methods.join(', '),
      });
    }
  }

  // Sortiere nach Confidence absteigend
  kandidaten.sort((a, b) => b.confidence - a.confidence);

  return { kandidaten, klaerfallGrund: null, geprueft: openInvoices.length };
}

/**
 * Fuehrt das Matching fuer eine einzelne CAMT-Buchung durch — und BUCHT
 * bei ausreichender Confidence.
 *
 * Die Bewertung selbst kommt aus bewerteBuchung(); hier steht nur noch,
 * was daraus folgt.
 */
export async function matchBuchung(
  supabase: SupabaseClient,
  buchung: CamtBuchung,
  zahlungseingangsId: string,
  organizationId: string,
  config: MatchingConfig = DEFAULT_CONFIG,
): Promise<MatchResult> {
  const bewertung = await bewerteBuchung(supabase, buchung, organizationId, config);
  const kandidaten = bewertung.kandidaten;
  const betragCent = Math.abs(buchung.betragCent);

  if (bewertung.klaerfallGrund) {
    return {
      zahlungseingangsId,
      status: 'klaerfall',
      confidence: 0,
      paymentId: null,
      kandidaten: [],
      klaerfallGrund: bewertung.klaerfallGrund,
    };
  }

  // ------- Auto-Zuordnung -------
  if (kandidaten.length > 0 && kandidaten[0].confidence >= config.autoMatchThreshold) {
    const best = kandidaten[0];

    try {
      // Zahlung anlegen
      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          organization_id: organizationId,
          payment_date: buchung.buchungsdatum,
          amount_cents: betragCent,
          payment_method: 'ueberweisung' as PaymentMethod,
          payer_type: 'kunde',
          payer_name: buchung.debitorName || null,
          payer_reference: buchung.debitorIban || null,
          bank_reference: buchung.buchungsreferenz || null,
          verwendungszweck: buchung.verwendungszweck || null,
          // `payments.created_by` ist eine UUID-Spalte mit Fremdschluessel
          // auf auth.users. Hier stand 'system' — Postgres antwortete mit
          // `22P02 invalid input syntax for type uuid`, der INSERT schlug
          // fehl, und JEDE automatische Zuordnung eines Zahlungseingangs
          // endete im Klaerfall. NULL ist der vorgesehene Wert fuer einen
          // maschinellen Vorgang; allocatePayment() haelt es bei
          // `allocated_by` genauso.
          created_by: null,
          matching_status: 'automatisch_zugeordnet',
        })
        .select('id')
        .single();

      if (payErr || !payment) {
        throw new Error(`Payment insert failed: ${payErr?.message}`);
      }

      // Zuordnen
      const allocCents = Math.min(betragCent, best.openCents);
      await allocatePayment(supabase, {
        paymentId: payment.id,
        allocations: [{ invoiceId: best.invoiceId, amountCents: allocCents }],
        actorId: 'system',
      });

      // Zahlungseingang verknuepfen
      await supabase
        .from('zahlungseingaenge')
        .update({
          zuordnungs_status: 'automatisch',
          zuordnungs_confidence: best.confidence,
          payment_id: payment.id,
        })
        .eq('id', zahlungseingangsId);

      await logBillingAction(supabase, {
        entityType: 'zahlungseingang',
        entityId: zahlungseingangsId,
        organizationId,
        action: 'auto_matched',
        newState: {
          invoiceId: best.invoiceId,
          confidence: best.confidence,
          methode: best.matchMethode,
        },
        actorId: 'system',
      });

      return {
        zahlungseingangsId,
        status: 'automatisch',
        confidence: best.confidence,
        paymentId: payment.id,
        kandidaten: kandidaten.slice(0, config.maxVorschlaege),
        klaerfallGrund: null,
      };
    } catch (e) {
      // Bei Fehler → Klaerfall
      const msg = e instanceof Error ? e.message : String(e);
      return {
        zahlungseingangsId,
        status: 'klaerfall',
        confidence: kandidaten[0]?.confidence ?? 0,
        paymentId: null,
        kandidaten: kandidaten.slice(0, config.maxVorschlaege),
        klaerfallGrund: `Auto-Zuordnung fehlgeschlagen: ${msg}`,
      };
    }
  }

  // ------- Klaerfall -------
  let grund = 'Keine ausreichende Uebereinstimmung gefunden';
  if (kandidaten.length > 0) {
    grund = `Hoechste Confidence ${kandidaten[0].confidence}% — unter Schwellwert ${config.autoMatchThreshold}%`;
  }

  return {
    zahlungseingangsId,
    status: 'klaerfall',
    confidence: kandidaten[0]?.confidence ?? 0,
    paymentId: null,
    kandidaten: kandidaten.slice(0, config.maxVorschlaege),
    klaerfallGrund: grund,
  };
}

/**
 * Manuelle Zuordnung eines Klaerfalls.
 */
export async function manuellZuordnen(
  supabase: SupabaseClient,
  klaerfallId: string,
  invoiceId: string,
  organizationId: string,
  actorId: string,
): Promise<{ paymentId: string }> {
  // Klaerfall laden
  const { data: kf, error: kfErr } = await supabase
    .from('klaerfaelle')
    .select('id, zahlungseingang_id, status')
    .eq('id', klaerfallId)
    .eq('organization_id', organizationId)
    .single();

  if (kfErr || !kf) throw new Error('Klärfall nicht gefunden.');
  if (kf.status !== 'offen') throw new Error('Klärfall ist bereits bearbeitet.');

  // Zahlungseingang laden
  const { data: ze } = await supabase
    .from('zahlungseingaenge')
    .select('id, betrag_cent, debitor_name, debitor_iban, verwendungszweck, buchungsdatum, buchungsreferenz')
    .eq('id', kf.zahlungseingang_id)
    .single();

  if (!ze) throw new Error('Zahlungseingang nicht gefunden.');

  // Zahlung erstellen
  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      organization_id: organizationId,
      payment_date: ze.buchungsdatum,
      amount_cents: ze.betrag_cent,
      payment_method: 'ueberweisung',
      payer_type: 'kunde',
      payer_name: ze.debitor_name || null,
      payer_reference: ze.debitor_iban || null,
      bank_reference: ze.buchungsreferenz || null,
      verwendungszweck: ze.verwendungszweck || null,
      created_by: actorId,
      matching_status: 'manuell_zugeordnet',
    })
    .select('id')
    .single();

  if (payErr || !payment) throw new Error(`Zahlung konnte nicht erstellt werden: ${payErr?.message}`);

  // Rechnung laden fuer offenen Betrag (Org-Fence: Rechnung muss zur selben Organisation gehoeren)
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, total_amount, paid_amount')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (!inv) throw new Error('Rechnung nicht gefunden.');

  const totalCents = euroZuCent(inv.total_amount || 0);
  const paidCents = euroZuCent(inv.paid_amount || 0);
  const openCents = totalCents - paidCents;
  const allocCents = Math.min(Number(ze.betrag_cent), openCents);

  // Zuordnen
  await allocatePayment(supabase, {
    paymentId: payment.id,
    allocations: [{ invoiceId, amountCents: allocCents }],
    actorId,
  });

  // Klaerfall + Zahlungseingang aktualisieren
  await supabase
    .from('klaerfaelle')
    .update({
      status: 'zugeordnet',
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', klaerfallId);

  await supabase
    .from('zahlungseingaenge')
    .update({
      zuordnungs_status: 'zugeordnet',
      zuordnungs_confidence: 100,
      payment_id: payment.id,
    })
    .eq('id', ze.id);

  await logBillingAction(supabase, {
    entityType: 'klaerfall',
    entityId: klaerfallId,
    organizationId,
    action: 'manuell_zugeordnet',
    newState: { invoiceId, paymentId: payment.id, allocCents },
    actorId,
  });

  return { paymentId: payment.id };
}
