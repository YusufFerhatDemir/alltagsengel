// ═══════════════════════════════════════════════════════════════════════════
// ABONNENT REGISTRIEREN — die Einwilligung ist die ERLAUBNIS, nicht der
// KONTAKT
//
// ── DER BEFUND VOM 31.08.2026 ──────────────────────────────────────────────
// Die Doppel-Opt-in-Kette war vollstaendig gebaut: Formular → Anmeldung →
// Bestaetigungsmail → Token → `/api/marketing/bestaetigung` →
// `marketing_consents`. Und sie haette trotzdem NIE eine Mail zugestellt.
//
// Der Grund liegt in der Trennung, die dieses Modul respektiert und die
// sonst nirgends aufgeschrieben stand:
//
//   marketing_consents      beantwortet „DARF diese Adresse Post bekommen?"
//   der Verteiler           beantwortet „WER steht ueberhaupt zur Auswahl?"
//
// `ladeMarketingKontakte()` (lib/marketing/empfaenger.ts) baut die Auswahl
// aus profiles, caregivers, newsletter_subscribers und mis_applicants —
// NICHT aus marketing_consents. Eine Person, die sich ueber das oeffentliche
// Formular anmeldet und bestaetigt, ohne Konto und ohne Mitarbeiterakte,
// haette danach eine gueltige Einwilligung gehabt und waere in KEINEM
// Segment aufgetaucht. Ergebnis: „0 versandfaehig", und zwar dauerhaft und
// ohne Fehlermeldung.
//
// Die Trennung ist richtig und bleibt (sie ist der Grund, warum die
// Segmentregeln ohne Einwilligungslogik auskommen). Was fehlte, ist der
// eine Schritt, der beide Seiten zusammenbringt: mit der bestaetigten
// Einwilligung entsteht auch der Eintrag im Verteiler.
//
// ── WARUM newsletter_subscribers UND NICHT EINE NEUE TABELLE ───────────────
// Es ist die dafuer vorgesehene Tabelle, `empfaenger.ts` liest sie bereits
// als Quelle der Rolle 'abonnent', und sie traegt eine organization_id.
// Eine zweite Tabelle daneben haette nur eine zweite Wahrheit erzeugt.
//
// ── DIE EINWILLIGUNG BLEIBT DIE SCHRANKE ───────────────────────────────────
// Ein Eintrag hier macht NIEMANDEN versandfaehig. Der Verteiler ist die
// Vorauswahl; ob tatsaechlich Post rausgeht, entscheidet weiterhin allein
// `pruefeEmpfaenger()` gegen `marketing_consents` und die Sperrliste. Wer
// widerruft, bleibt im Verteiler stehen und bekommt trotzdem nichts —
// genau so soll es sein, denn nur so laesst sich spaeter aufschluesseln,
// WARUM jemand nicht angeschrieben wurde.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalisiereAdresse } from './einwilligung'

export type AbonnentErgebnis =
  | { ok: true; angelegt: boolean }
  | { ok: false; grund: string }

/**
 * Traegt die Adresse in den Verteiler ein — oder aktiviert einen frueheren
 * Eintrag wieder.
 *
 * Absichtlich NICHT werfend: der Aufrufer ist der Bestaetigungsweg, und
 * dort ist die Einwilligung zu diesem Zeitpunkt bereits eingetragen. Ein
 * Fehler hier darf die Bestaetigung nicht kippen — die Einwilligung ist
 * die rechtlich tragende Aussage, der Verteilereintrag ist nachholbar.
 * Der Aufrufer protokolliert das Ergebnis.
 */
export async function registriereAbonnent(
  supabase: SupabaseClient,
  organizationId: string,
  email: string,
  quelle = 'doppel_opt_in',
): Promise<AbonnentErgebnis> {
  const adresse = normalisiereAdresse(email)
  if (!adresse) return { ok: false, grund: 'Leere Adresse.' }

  const { data: bestand, error: leseFehler } = await supabase
    .from('newsletter_subscribers')
    .select('id, active')
    .eq('organization_id', organizationId)
    .eq('email', adresse)
    .maybeSingle()

  if (leseFehler) return { ok: false, grund: `Verteiler nicht lesbar: ${leseFehler.message}` }

  if (bestand) {
    // Schon drin und aktiv: nichts zu tun. Ein erneutes Schreiben wuerde
    // nur subscribed_at zurueckstempeln — dieselbe Klasse Fehler wie bei
    // den Monatsabschluessen, wo ein Upsert Endzustaende ueberschrieb.
    if (bestand.active === true) return { ok: true, angelegt: false }

    // Frueher abgemeldet, jetzt neu bestaetigt. Der Widerruf war eine
    // Aussage von damals; die frische Bestaetigung ist eine von heute und
    // hebt ihn auf. `unsubscribed_at` wird dabei geleert — sonst stuende
    // an einer aktiven Zeile ein Abmeldezeitpunkt und niemand wuesste,
    // welche der beiden Angaben gilt.
    const { data: getroffen, error: aktivFehler } = await supabase
      .from('newsletter_subscribers')
      .update({ active: true, unsubscribed_at: null, subscribed_at: new Date().toISOString() })
      .eq('id', bestand.id)
      .select('id')

    if (aktivFehler) return { ok: false, grund: `Verteiler nicht aktualisierbar: ${aktivFehler.message}` }
    // `.select()` ist der Wirkungsnachweis: PostgREST meldet keinen Fehler,
    // wenn NULL Zeilen getroffen wurden.
    if (!getroffen || getroffen.length === 0) {
      return { ok: false, grund: 'Verteilereintrag ohne Wirkung aktualisiert.' }
    }
    return { ok: true, angelegt: true }
  }

  const { data: neu, error: schreibFehler } = await supabase
    .from('newsletter_subscribers')
    // organization_id steht AUSDRUECKLICH hier: dieser Weg laeuft mit dem
    // Dienstschluessel ohne auth.uid(), der Spalten-Default current_org_id()
    // faellt dann auf die Stamm-Organisation zurueck — aber als fail-open-
    // Rueckfall, nicht als Aussage.
    .insert({ organization_id: organizationId, email: adresse, source: quelle, active: true })
    .select('id')
    .maybeSingle()

  if (schreibFehler) return { ok: false, grund: `Verteiler nicht schreibbar: ${schreibFehler.message}` }
  if (!neu) return { ok: false, grund: 'Verteilereintrag ohne Wirkung geschrieben.' }
  return { ok: true, angelegt: true }
}
