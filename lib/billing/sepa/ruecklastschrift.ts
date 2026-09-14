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
  /**
   * Die neue Mahnstufe — `null`, wenn keine gesetzt wurde. Der Grund dafuer
   * steht dann in `mahnstufeUebersprungen`.
   */
  neueMahnstufe: string | null;
  /** Warum die Mahnstufe NICHT erhoeht wurde. `null`, wenn sie erhoeht wurde. */
  mahnstufeUebersprungen: string | null;
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
// Fehlermeldungen
// ---------------------------------------------------------------------------

/**
 * Haengt einen Fehlschlag an `result.fehler` an, statt ihn zu ersetzen.
 *
 * Der Vorgang hat sieben schreibende Schritte. Faellt einer aus, laufen die
 * uebrigen weiter — abbrechen waere schlimmer, weil die Ruecklastschrift
 * dann halb gebucht liegen bliebe. Der Aufrufer muss aber JEDEN Ausfall
 * sehen, nicht nur den letzten.
 */
function meldeFehler(result: RuecklastschriftResult, text: string): void {
  result.fehler = [result.fehler, text].filter(Boolean).join(' | ');
}

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
 * 6. Mahnstufe setzen — ausser bei gesetzter Mahnsperre (siehe Schritt 7)
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
    neueMahnstufe: null,
    mahnstufeUebersprungen: null,
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

    // BEFUND (Block 77): jeder SCHREIBVORGANG dieser Funktion ist
    // vorbildlich abgesichert — Fehler, getroffene Zeilen, teils ein
    // Vergleich gegen den gelesenen Stand. Die LESEVORGAENGE, die darueber
    // entscheiden, ob er ueberhaupt stattfindet, waren es nicht. Sieben
    // Abfragen verwarfen ihren Fehler; jede davon liess einen ganzen
    // Schritt still ausfallen.
    //
    // Zuerst ueber EndToEndId
    let suchFehler: string | null = null;
    if (buchung.endToEndId) {
      const { data, error } = await supabase
        .from('sepa_batch_items')
        .select('id, invoice_id, mandate_id, batch_id')
        .eq('end_to_end_id', buchung.endToEndId)
        .eq('organization_id', organizationId)
        .maybeSingle();
      // Ein Lesefehler ist kein „nicht gefunden". Faellt er durch, greift
      // unten der schwaechere Rueckfall ueber Mandat und Betrag — und der
      // hat nachweislich schon einmal die Rechnung eines Unbeteiligten
      // getroffen (siehe Delta-Check Phase 4.5 weiter unten).
      if (error) suchFehler = `Suche ueber EndToEndId fehlgeschlagen (${error.message})`;
      else if (data) sepaItem = data;
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
    if (!sepaItem && !suchFehler && buchung.mandateId) {
      const betragCent = Math.abs(buchung.betragCent);

      // (organization_id, mandate_reference) ist UNIQUE — die Auflösung
      // ist damit eindeutig und bleibt innerhalb des Mandanten.
      const { data: mandat, error: mandatFehler } = await supabase
        .from('sepa_mandates')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('mandate_reference', buchung.mandateId)
        .maybeSingle();

      if (mandatFehler) {
        suchFehler = `Mandatsreferenz nicht aufloesbar (${mandatFehler.message})`;
      } else if (mandat) {
        const { data, error: postenFehler } = await supabase
          .from('sepa_batch_items')
          .select('id, invoice_id, mandate_id, batch_id')
          .eq('organization_id', organizationId)
          .eq('mandate_id', mandat.id)
          .eq('amount_cents', betragCent)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (postenFehler) suchFehler = `Lastschriftposten nicht lesbar (${postenFehler.message})`;
        else if (data) sepaItem = data;
      }
    }

    if (!sepaItem) {
      // `erkannt` steuert beim Aufrufer, ob die Buchung als verarbeitet
      // oder als Klaerfall zaehlt (app/api/billing/camt/import/route.ts).
      // Es war auf `true` vorbelegt und wurde hier nie zurueckgesetzt: eine
      // Ruecklastschrift, zu der KEINE Lastschrift gefunden wurde, kam
      // damit als 'ruecklastschrift_verarbeitet' und als „zugeordnet" in
      // der Antwort an — obwohl nichts storniert, nichts wieder geoeffnet
      // und keine Gebuehr gebucht wurde. Das Geld war zurueck, die
      // Rechnung galt weiter als bezahlt, und niemand bekam den Fall auf
      // den Tisch.
      result.erkannt = false;
      // „Nicht gefunden" und „nicht nachsehen koennen" sind verschiedene
      // Aussagen. Beide fuehren hier zum Klaerfall — aber wer ihn bearbeitet,
      // braucht den richtigen Grund.
      result.fehler = suchFehler
        ? `${suchFehler} — es wurde NICHT festgestellt, ob eine zugehoerige Lastschrift existiert.`
        : 'Keine zugehoerige SEPA-Lastschrift gefunden';
      return result;
    }

    result.invoiceId = sepaItem.invoice_id;
    result.mandateId = sepaItem.mandate_id;

    // 2. SEPA-Batch-Item auf Ruecklastschrift setzen
    //
    // Diese Zeile ist nicht nur ein Vermerk: Schritt 6 ZAEHLT die Posten
    // mit status='ruecklastschrift', um zu entscheiden, ob das Mandat
    // gesperrt wird. Bleibt der Vermerk aus, zaehlt der Vorgang nicht mit
    // und ein Mandat, das gesperrt gehoerte, bleibt offen.
    const { data: vermerkt, error: vermerkErr } = await supabase
      .from('sepa_batch_items')
      .update({
        status: 'ruecklastschrift',
        error_reason: `Rücklastschrift vom ${buchung.buchungsdatum}`,
      })
      .eq('id', sepaItem.id)
      .select('id');
    if (vermerkErr || (vermerkt?.length ?? 0) === 0) {
      meldeFehler(result, `Lastschriftposten nicht als Rücklastschrift vermerkt (${vermerkErr?.message ?? 'keine Zeile getroffen'}) — die Mandatszählung übergeht diesen Vorgang.`);
    }

    // 3. Zugehoerige Zahlung finden und stornieren
    const { data: payAllocs, error: payAllocsFehler } = await supabase
      .from('payment_allocations')
      .select('id, payment_id, amount_cents')
      .eq('invoice_id', sepaItem.invoice_id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (payAllocsFehler) {
      // Ohne diese Liste findet der ganze Stornoschritt nicht statt: die
      // Zuordnung bleibt stehen, das Geld gilt weiter als zugeordnet.
      meldeFehler(result, `Zahlungszuordnung nicht lesbar (${payAllocsFehler.message}) — die Originalzahlung wurde NICHT storniert.`);
    }

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
      const { data: payment, error: paymentFehler } = await supabase
        .from('payments')
        .select('id, allocated_cents')
        .eq('id', alloc.payment_id)
        .maybeSingle();

      if (paymentFehler) {
        meldeFehler(result, `Zahlung nicht lesbar (${paymentFehler.message}) — allocated_cents wurde NICHT reduziert.`);
      }

      if (payment) {
        const newAllocated = Math.max(0, (payment.allocated_cents || 0) - alloc.amount_cents);
        // Gelesen wurde oben, geschrieben wird hier — dazwischen kann die
        // Zahlung erneut zugeordnet worden sein. Ohne Vergleichsbedingung
        // wuerde dieser Aufruf den fremden Zwischenstand ueberschreiben und
        // Geld doppelt freigeben.
        const abgleich = supabase
          .from('payments')
          .update({
            allocated_cents: newAllocated,
            matching_status: 'nicht_zugeordnet',
          })
          .eq('id', payment.id);
        const { data: reduziert, error: reduzErr } = await (
          payment.allocated_cents == null
            ? abgleich.is('allocated_cents', null)
            : abgleich.eq('allocated_cents', payment.allocated_cents)
        ).select('id');
        if (reduzErr || (reduziert?.length ?? 0) === 0) {
          meldeFehler(result, `Zahlung nicht zurückgesetzt (${reduzErr?.message ?? 'Zwischenstand verändert'}) — allocated_cents steht weiter auf dem alten Wert.`);
        }
      }
    }

    // 4. Rechnung wieder oeffnen
    const { data: invoice, error: invoiceFehler } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount')
      .eq('id', sepaItem.invoice_id)
      .maybeSingle();

    if (invoiceFehler) {
      // Der teuerste Schritt des Vorgangs faellt damit ganz aus — und zwar
      // genau mit der Folge, die der Kommentar darunter beschreibt.
      meldeFehler(result, `Rechnung nicht lesbar (${invoiceFehler.message}) — sie wurde NICHT wieder geöffnet und gilt weiter als bezahlt, obwohl das Geld zurück ist.`);
    }

    if (invoice) {
      const totalCents = euroZuCent(invoice.total_amount || 0);
      const paidCents = euroZuCent(invoice.paid_amount || 0);
      const betragRueck = Math.abs(buchung.betragCent);
      const newPaidCents = Math.max(0, paidCents - betragRueck);

      // Der teuerste Schritt des Vorgangs. Faellt er aus, ist das Geld
      // zurueckgegangen und die Rechnung behauptet weiter, sie sei bezahlt:
      // keine Mahnung, keine offene Position, kein Klaerfall. Deshalb wird
      // hier sowohl der Fehler gelesen als auch gegen den gelesenen Stand
      // verglichen — eine zwischenzeitliche Zahlung darf nicht verschwinden.
      const oeffnen = supabase
        .from('invoices')
        .update({
          paid_amount: newPaidCents / 100,
          status: newPaidCents > 0 ? 'teilweise_bezahlt' : 'freigegeben',
          bezahlt: false,
          bezahlt_am: null,
        })
        .eq('id', sepaItem.invoice_id);
      const { data: geoeffnet, error: oeffnenErr } = await (
        invoice.paid_amount == null
          ? oeffnen.is('paid_amount', null)
          : oeffnen.eq('paid_amount', invoice.paid_amount)
      ).select('id');
      if (oeffnenErr || (geoeffnet?.length ?? 0) === 0) {
        meldeFehler(result, `Rechnung NICHT wieder geöffnet (${oeffnenErr?.message ?? 'Zahlstand zwischenzeitlich verändert'}) — sie gilt weiter als bezahlt, obwohl das Geld zurück ist.`);
      }
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
    const { count: rlCount, error: rlCountFehler } = await supabase
      .from('sepa_batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('mandate_id', sepaItem.mandate_id)
      .eq('status', 'ruecklastschrift');

    if (rlCountFehler) {
      // `null` wird unten zu 0 und damit zu „weit unter der Schwelle".
      // Ein Mandat, das gesperrt gehoerte, bliebe offen, und der naechste
      // Lastschriftlauf zoege erneut von einem Konto ein, das schon
      // mehrfach zurueckgegangen ist.
      meldeFehler(result, `Rücklastschriften nicht zählbar (${rlCountFehler.message}) — es wurde NICHT geprüft, ob das Mandat zu sperren ist.`);
    }

    if ((rlCount ?? 0) >= MAX_RUECKLASTSCHRIFTEN_BEVOR_SPERRE) {
      const { data: gesperrt, error: sperrErr } = await supabase
        .from('sepa_mandates')
        .update({
          status: 'widerrufen',
          revoked_at: new Date().toISOString(),
          revoke_reason: `Automatisch gesperrt nach ${rlCount} Rücklastschriften`,
        })
        .eq('id', sepaItem.mandate_id)
        .neq('status', 'widerrufen')
        .select('id');
      // `mandatGesperrt` ist eine Tatsachenbehauptung ueber die Datenbank.
      // Sie darf nur stehen, wenn dort wirklich eine Zeile umgestellt wurde
      // — sonst zoege der naechste Lastschriftlauf erneut von einem Konto
      // ein, das zweimal zurueckgegangen ist.
      if (sperrErr) {
        meldeFehler(result, `Mandat NICHT gesperrt (${sperrErr.message}) — der nächste Lastschriftlauf zieht erneut ein.`);
      } else {
        result.mandatGesperrt = (gesperrt?.length ?? 0) > 0;
      }

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
    //
    // BEFUND F-2 (Phase 8): dieser Weg setzt die Mahnstufe direkt, ohne
    // durch `advanceDunning()` und dessen Gate zu laufen. Das ist zum Teil
    // Absicht — eine geplatzte Lastschrift ist ein eigenes Ereignis und soll
    // NICHT auf den regulaeren Stufenabstand warten muessen. Genau diese
    // Punkte des Gates (5 Faelligkeit, 9 Stufenabstand, 10 Doppelmahnung)
    // wuerden hier das Falsche tun.
    //
    // Eine manuelle Mahnsperre ist etwas anderes. Sie wird gesetzt, wenn ein
    // Fall bewusst aus dem automatischen Mahnlauf genommen wurde
    // (Ratenvereinbarung, Klaerung mit der Kasse, Trauerfall). Wird die Stufe
    // trotzdem stillschweigend hochgezaehlt, springt der Kunde beim Aufheben
    // der Sperre ohne Zwischenschritt auf mahnung_1 — ohne dass jemals eine
    // Erinnerung hinausging und ohne dass irgendwo ablesbar ist, warum.
    // Deshalb hier: nicht erhoehen, aber den Grund mitgeben, statt still
    // nichts zu tun.
    //
    // Der Mandanten-Fence auf allen drei Abfragen ist Absicht: der Aufrufer
    // uebergibt einen Admin-Client, der RLS umgeht. `sepaItem` stammt zwar
    // bereits aus einer mandantengefencten Suche — aber eine Sperre, die nur
    // ueber die Herkunft einer Variablen gilt, haelt keine Umbauten aus.
    // `maybeSingle` statt `single`: ohne Mahnvorgang gibt es nichts zu
    // erhoehen, und das ist kein Fehler. Mit `single` war genau dieser
    // Normalfall ein PGRST116 — und damit von einem echten Ausfall nicht
    // zu unterscheiden.
    const { data: dunning, error: dunningFehler } = await supabase
      .from('dunning_entries')
      .select('id, dunning_level, block_dunning, block_reason')
      .eq('invoice_id', sepaItem.invoice_id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (dunningFehler) {
      meldeFehler(result, `Mahnvorgang nicht lesbar (${dunningFehler.message}) — die Mahnstufe wurde NICHT erhöht.`);
    }

    if (dunning?.block_dunning) {
      result.mahnstufeUebersprungen =
        `Mahnsperre gesetzt (${dunning.block_reason || 'kein Grund hinterlegt'}) — `
        + 'Stufe unveraendert. Die Ruecklastschrift ist gebucht, die Gebuehr ebenfalls.';
    } else if (dunning) {
      const ESCALATION_LEVELS = ['offen', 'erinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung'];
      const currentIdx = ESCALATION_LEVELS.indexOf(dunning.dunning_level || 'offen');
      const newIdx = Math.max(currentIdx + 1, 2);
      const newLevel = ESCALATION_LEVELS[Math.min(newIdx, ESCALATION_LEVELS.length - 1)];

      // Die Stufe steht an ZWEI Stellen. Gelingt nur eine, widersprechen
      // sich Mahnvorgang und Rechnung, und welche der beiden der Mahnlauf
      // liest, entscheidet dann ueber den Brief an den Kunden.
      const { data: stufeGesetzt, error: stufeErr } = await supabase
        .from('dunning_entries')
        .update({
          dunning_level: newLevel,
          last_dunning_at: new Date().toISOString(),
        })
        .eq('id', dunning.id)
        .eq('organization_id', organizationId)
        .eq('dunning_level', dunning.dunning_level ?? 'offen')
        .select('id');

      if (stufeErr || (stufeGesetzt?.length ?? 0) === 0) {
        meldeFehler(result, `Mahnstufe nicht erhöht (${stufeErr?.message ?? 'Stufe zwischenzeitlich verändert'}) — Mahnvorgang unverändert.`);
      } else {
        const { error: rechnungStufeErr } = await supabase
          .from('invoices')
          .update({ dunning_level: newLevel })
          .eq('id', sepaItem.invoice_id)
          .eq('organization_id', organizationId)
          .select('id');
        if (rechnungStufeErr) {
          meldeFehler(result, `Mahnstufe an der Rechnung nicht nachgezogen (${rechnungStufeErr.message}) — Mahnvorgang und Rechnung stehen auf verschiedenen Stufen.`);
        }
        result.neueMahnstufe = newLevel;
      }
    } else {
      result.mahnstufeUebersprungen = 'Kein Mahnvorgang zu dieser Rechnung — Stufe nicht gesetzt.';
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
        neueMahnstufe: result.neueMahnstufe,
        mahnstufeUebersprungen: result.mahnstufeUebersprungen,
      },
      actorId,
    });

  } catch (e) {
    // Ein Abbruch mitten im Vorgang ist kein erledigter Vorgang. Auch hier
    // muss der Aufrufer einen Klaerfall sehen, keine Erfolgsmeldung.
    result.erkannt = false;
    result.fehler = e instanceof Error ? e.message : String(e);
  }

  return result;
}
