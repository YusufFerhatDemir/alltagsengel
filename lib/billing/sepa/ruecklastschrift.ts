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
import { euroZuCent } from '@/lib/geld'

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
        .maybeSingle();
      if (data) sepaItem = data;
    }

    // Fallback: MandateId + Betrag
    //
    // ACHTUNG (Delta-Check Phase 4.5): der Filter auf mandate_id fehlte
    // hier, obwohl der Kommentar ihn nennt. Gesucht wurde also nur nach
    // dem BETRAG — die Abfrage lieferte damit die neueste Lastschrift
    // IRGENDEINES Kunden mit demselben Betrag. Folge: Rechnung eines
    // Unbeteiligten wieder geoeffnet, 5,00 EUR Ruecklastschriftgebuehr
    // gebucht, Mahnstufe erhoeht und ggf. dessen SEPA-Mandat widerrufen.
    // Bei runden Betraegen (gleicher Tarif, gleiche Stundenzahl) ist eine
    // Betragsgleichheit der Normalfall, nicht die Ausnahme.
    //
    // Zu beachten: `buchung.mandateId` ist die CAMT-<MndtId>, also die
    // TEXT-Mandatsreferenz. sepa_batch_items.mandate_id ist dagegen ein
    // UUID-Fremdschluessel auf sepa_mandates(id). Die Referenz muss
    // deshalb erst aufgeloest werden — ein direkter Vergleich der beiden
    // Werte trifft nie zu (und laeuft auf einer UUID-Spalte in 22P02).
    if (!sepaItem && buchung.mandateId) {
      const betragCent = Math.abs(buchung.betragCent);

      // (organization_id, mandate_reference) ist UNIQUE — die Auflösung
      // ist damit eindeutig und bleibt innerhalb des Mandanten.
      const { data: mandat } = await supabase
        .from('sepa_mandates')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('mandate_reference', buchung.mandateId)
        .maybeSingle();

      if (mandat) {
        const { data } = await supabase
          .from('sepa_batch_items')
          .select('id, invoice_id, mandate_id, batch_id')
          .eq('organization_id', organizationId)
          .eq('mandate_id', mandat.id)
          .eq('amount_cents', betragCent)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) sepaItem = data;
      }
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

      // Zuordnung zuruecknehmen.
      //
      // ── EIN SCHEMAFEHLER, DER HIER STILL VERSCHLUCKT WURDE ───────────
      // 'rueckzahlung' stand nicht im CHECK-Constraint von
      // payment_allocations (20260808210000). Das UPDATE scheiterte mit
      // 23514, der Rueckgabewert wurde nicht gelesen — die Zuordnung blieb
      // als 'vollzahlung' stehen und behauptete weiter, die Rechnung sei
      // bezahlt, waehrend payments.allocated_cents zwei Zeilen weiter
      // bereits reduziert wurde. Zusaetzlich blockierte
      // UNIQUE(payment_id, invoice_id) danach jede erneute Zuordnung
      // derselben Zahlung auf dieselbe Rechnung.
      //
      // Migration 20261004000000 nimmt den Wert auf. Solange sie nicht
      // angewendet ist, wird die Zeile stattdessen ENTFERNT: die Historie
      // fehlt dann, aber die Buecher widersprechen sich nicht — und der
      // Rueckfall steht im Ergebnis, statt unsichtbar zu bleiben.
      const { error: markErr } = await supabase
        .from('payment_allocations')
        .update({ allocation_type: 'rueckzahlung' as string })
        .eq('id', alloc.id);

      if (markErr) {
        await supabase.from('payment_allocations').delete().eq('id', alloc.id);
        result.fehler = [
          result.fehler,
          `Zuordnung konnte nicht als Rücknahme markiert werden (${markErr.message}) — ` +
          `Zeile wurde entfernt. Migration 20261004000000 fehlt.`,
        ].filter(Boolean).join(' | ');
      }

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
      const totalCents = euroZuCent(invoice.total_amount || 0);
      const paidCents = euroZuCent(invoice.paid_amount || 0);
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
    //
    // ── ZWEI SCHEMAFEHLER, DIE HIER STILL VERSCHLUCKT WURDEN ───────────
    // Der INSERT nannte eine Spalte `status`, die es auf
    // payment_differences nicht gibt (der Zustand heisst dort
    // `widerspruch_status`, Migration 20260808210000), und setzte
    // `kuerzung_kategorie = 'ruecklastschrift'` — ein Wert, den der
    // CHECK-Constraint der Spalte nicht kennt. Beides scheiterte in
    // Postgres mit 42703 bzw. 23514.
    //
    // Aufgefallen ist es nie, weil der Rueckgabewert nicht geprueft wurde:
    // `verarbeiteRuecklastschrift()` meldete `gebuehrCent: 500`, die Route
    // zaehlte den Vorgang als „verarbeitet", und die Gebuehr existierte
    // trotzdem nirgends. Der Fehler wird jetzt gelesen und im Ergebnis
    // benannt.
    //
    // 'sonstiges' ist die Kategorie, die der Constraint fuer diesen Fall
    // hergibt; der konkrete Anlass steht im Klartext in `kuerzung_grund`.
    const { error: gebuehrErr } = await supabase
      .from('payment_differences')
      .insert({
        organization_id: organizationId,
        invoice_id: sepaItem.invoice_id,
        soll_cents: RUECKLASTSCHRIFT_GEBUEHR_CENT,
        ist_cents: 0,
        kuerzung_grund: 'Rücklastschriftgebühr',
        kuerzung_kategorie: 'sonstiges',
        widerspruch_status: 'offen',
        created_by: actorId,
      });

    if (gebuehrErr) {
      result.gebuehrCent = 0;
      result.fehler = `Rücklastschriftgebühr nicht gebucht: ${gebuehrErr.message}`;
    } else {
      result.gebuehrCent = RUECKLASTSCHRIFT_GEBUEHR_CENT;
    }

    // 6. Mandat pruefen — bei Mehrfach-Ruecklastschrift sperren
    const { count: rlCount } = await supabase
      .from('sepa_batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
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
