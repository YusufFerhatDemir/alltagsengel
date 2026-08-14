// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Schreibende Vorgänge des Selbstzahler-Wegs
//
// Alles, was eine Bestellung tatsächlich verändert, steht hier — und nur
// hier. Der Stripe-Webhook und die Konto-Aktionen (Kündigung, Widerruf)
// rufen dieselben Funktionen auf. Läge die Logik in den Routen, gäbe es
// zwei Stellen, die einen Zugang freischalten, und irgendwann zwei
// verschiedene Vorstellungen davon, wann jemand bezahlt hat.
//
// ═══ ALLE ZUGRIFFE HIER MIT service_role ═══════════════════════
// Das ist die bewusste Ausnahme zur Regel in lib/coach/api-auth.ts
// (dort: nur Session-Client, RLS als einzige Wahrheit). Sie ist nötig
// und sie ist sicher, weil:
//   * die Tabellen für `authenticated` schreibgeschützt sind (REVOKE
//     INSERT/UPDATE/DELETE, Migration 20260907000000) — ein Nutzer kann
//     sich also gerade NICHT selbst einen bezahlten Zugang eintragen,
//   * jede Funktion hier die betroffene Bestellung entweder über ein
//     signaturgeprüftes Stripe-Ereignis oder über eine zuvor geprüfte
//     coach_user_id findet.
// Es gibt hier keine Funktion, die eine Bestellung allein anhand einer
// vom Client gelieferten ID verändert.
//
// ═══ IDEMPOTENZ ════════════════════════════════════════════════
// Stripe liefert Ereignisse mehrfach. Jede Funktion hier muss beim
// zweiten Aufruf dasselbe Ergebnis erzeugen und nichts doppelt anlegen.
// Durchgesetzt über die UNIQUE-Spalten stripe_invoice_id,
// stripe_subscription_id und coach_rechnungen.nummer.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { heuteBerlin } from '@/lib/utils/timezone'
import type { CoachBestellung } from './types'
import { laufzeitEnde, type BestellStatus } from './bestellung'
import { steuerEinstellung } from './pricing'
import { zerlegeBrutto, pruefeRechnungsangaben, type RechnungsDaten } from './rechnung'

function admin(): SupabaseClient {
  return createAdminClient()
}

// ═══════════════════════════════════════════════════════════════
// ZUGANG
// ═══════════════════════════════════════════════════════════════

/**
 * Schaltet den bezahlten Zugang frei bzw. verlängert ihn.
 *
 * Bewusst über coach_freischaltungen und nicht über ein neues Feld: So
 * bleibt istFreigeschaltet() (lib/coach/freischaltung.ts) die einzige
 * Zugangsprüfung im Produkt, egal woher der Zugang stammt.
 *
 * Verlängerung statt Neuanlage: Bei jedem Abbuchungslauf würde sonst eine
 * weitere Zeile entstehen und die Zugangsliste nach einem Jahr zwölf
 * Einträge zeigen. Es wird deshalb die vorhandene Zeile zur Bestellung
 * fortgeschrieben.
 */
export async function schalteZugangFrei(
  bestellungId: string,
  coachUserId: string,
  gueltigBis: string
): Promise<void> {
  const db = admin()

  const { data: vorhanden } = await db
    .from('coach_freischaltungen')
    .select('id')
    .eq('bestellung_id', bestellungId)
    .maybeSingle()

  if (vorhanden) {
    await db
      .from('coach_freischaltungen')
      .update({ status: 'aktiv', gueltig_bis: gueltigBis })
      .eq('id', vorhanden.id)
    return
  }

  await db.from('coach_freischaltungen').insert({
    coach_user_id: coachUserId,
    bestellung_id: bestellungId,
    quelle: 'selbstzahler',
    status: 'aktiv',
    gueltig_von: heuteBerlin(),
    gueltig_bis: gueltigBis,
  })
}

/**
 * Beendet den Zugang.
 *
 * `sofort = true` beim Widerruf: gueltig_bis wird auf gestern gesetzt,
 * damit istFreigeschaltet() noch heute false liefert. Ein Setzen auf
 * heute würde den Zugang bis Mitternacht offen lassen — beim Widerruf
 * ist das falsch, weil der Vertrag als nie geschlossen gilt.
 */
export async function beendeZugang(bestellungId: string, sofort: boolean): Promise<void> {
  const db = admin()
  const heute = heuteBerlin()
  const gestern = new Date(`${heute}T00:00:00Z`)
  gestern.setUTCDate(gestern.getUTCDate() - 1)

  await db
    .from('coach_freischaltungen')
    .update({
      status: sofort ? 'widerrufen' : 'abgelaufen',
      gueltig_bis: sofort ? gestern.toISOString().slice(0, 10) : heute,
    })
    .eq('bestellung_id', bestellungId)
}

// ═══════════════════════════════════════════════════════════════
// BESTELLUNG FINDEN
// ═══════════════════════════════════════════════════════════════

export async function bestellungPerCheckout(checkoutId: string): Promise<CoachBestellung | null> {
  const { data } = await admin()
    .from('coach_bestellungen')
    .select('*')
    .eq('stripe_checkout_id', checkoutId)
    .maybeSingle()
  return (data as CoachBestellung) ?? null
}

export async function bestellungPerSubscription(subId: string): Promise<CoachBestellung | null> {
  const { data } = await admin()
    .from('coach_bestellungen')
    .select('*')
    .eq('stripe_subscription_id', subId)
    .maybeSingle()
  return (data as CoachBestellung) ?? null
}

/**
 * Die eine maßgebliche Bestellung eines Nutzers.
 *
 * „Maßgeblich" heißt: die zuletzt bestellte, die nicht bloß ein
 * abgebrochener Checkout ist. Ein Nutzer kann mehrere Anläufe
 * hinterlassen haben (Checkout geöffnet, abgebrochen, neu gestartet);
 * offene Bestellungen ohne Zahlung dürfen die Kontoanzeige nicht
 * beherrschen. Gibt es ausschließlich offene, wird die neueste davon
 * zurückgegeben, damit ein hängengebliebener Checkout sichtbar bleibt.
 */
export async function massgeblicheBestellung(
  supabase: SupabaseClient,
  coachUserId: string
): Promise<CoachBestellung | null> {
  const { data } = await supabase
    .from('coach_bestellungen')
    .select('*')
    .eq('coach_user_id', coachUserId)
    .order('bestellt_am', { ascending: false })

  const zeilen = (data ?? []) as CoachBestellung[]
  if (zeilen.length === 0) return null
  return zeilen.find(b => b.status !== 'offen') ?? zeilen[0]
}

// ═══════════════════════════════════════════════════════════════
// STATUSWECHSEL
// ═══════════════════════════════════════════════════════════════

export async function setzeStatus(
  bestellungId: string,
  status: BestellStatus,
  weitere: Record<string, unknown> = {}
): Promise<void> {
  await admin()
    .from('coach_bestellungen')
    .update({ status, ...weitere })
    .eq('id', bestellungId)
}

/**
 * Aktiviert eine bezahlte Bestellung und schaltet den Zugang frei.
 *
 * `laufzeitBis` kommt bevorzugt aus dem Stripe-Zeitraum. Fehlt er,
 * wird er aus dem Intervall gerechnet — der Zugang darf nicht daran
 * scheitern, dass ein Feld in einem Ereignis nicht gesetzt war.
 */
export async function aktiviereBestellung(
  bestellung: CoachBestellung,
  subscriptionId: string | null,
  laufzeitBis: string | null
): Promise<string> {
  const bis = laufzeitBis ?? laufzeitEnde(heuteBerlin(), bestellung.intervall_monate)

  await setzeStatus(bestellung.id, 'aktiv', {
    laufzeit_bis: bis,
    ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
  })
  await schalteZugangFrei(bestellung.id, bestellung.coach_user_id, bis)
  return bis
}

// ═══════════════════════════════════════════════════════════════
// ZAHLUNGEN
// ═══════════════════════════════════════════════════════════════

export interface ZahlungEingang {
  bestellung: CoachBestellung
  art: 'zahlung' | 'fehlgeschlagen' | 'erstattung'
  betragCent: number
  zeitraumVon: string | null
  zeitraumBis: string | null
  fehlergrund?: string | null
  stripeInvoiceId?: string | null
  stripePaymentIntent?: string | null
}

/**
 * Verbucht eine Zahlung. Gibt die Zeilen-ID zurück oder null, wenn das
 * Ereignis bereits verbucht war (Stripe-Wiederholung).
 */
export async function verbucheZahlung(e: ZahlungEingang): Promise<string | null> {
  const db = admin()

  // Idempotenz: dieselbe Stripe-Rechnung nie zweimal verbuchen.
  // Der UNIQUE-Index fängt es ohnehin ab — die Vorabprüfung vermeidet nur
  // eine Fehlermeldung im Protokoll bei jeder Wiederholung.
  if (e.stripeInvoiceId) {
    const { data: schon } = await db
      .from('coach_zahlungen')
      .select('id')
      .eq('stripe_invoice_id', e.stripeInvoiceId)
      .maybeSingle()
    if (schon) return null
  }

  const { data, error } = await db
    .from('coach_zahlungen')
    .insert({
      bestellung_id: e.bestellung.id,
      coach_user_id: e.bestellung.coach_user_id,
      art: e.art,
      betrag_cent: e.betragCent,
      waehrung: e.bestellung.waehrung,
      zeitraum_von: e.zeitraumVon,
      zeitraum_bis: e.zeitraumBis,
      // Grund kürzen: Stripe-Meldungen können lang sein und stehen sonst
      // ungefiltert auf der Kontoseite.
      fehlergrund: e.fehlergrund ? String(e.fehlergrund).slice(0, 300) : null,
      stripe_invoice_id: e.stripeInvoiceId ?? null,
      stripe_payment_intent: e.stripePaymentIntent ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // Unique-Verletzung = zweite Zustellung desselben Ereignisses.
    if (error.code === '23505') return null
    throw error
  }
  return data.id as string
}

// ═══════════════════════════════════════════════════════════════
// RECHNUNGEN
// ═══════════════════════════════════════════════════════════════

/**
 * Stellt zu einer erfolgreichen Zahlung eine Rechnung aus.
 *
 * Die Nummer kommt aus der Datenbank-Sequenz (coach_naechste_rechnungs-
 * nummer), nicht aus einem SELECT max()+1 — bei zwei gleichzeitigen
 * Abbuchungen wäre die Nummer sonst doppelt.
 *
 * Fehlende Pflichtangaben nach § 14 UStG werden NICHT unterdrückt,
 * sondern in `angaben_unvollstaendig` vermerkt. Solange die Steuernummer
 * nicht zugeteilt ist, entsteht damit eine nachweislich unvollständige
 * Rechnung statt einer, die vollständig aussieht und es nicht ist.
 */
export async function stelleRechnungAus(
  bestellung: CoachBestellung,
  zahlungId: string | null,
  betragCent: number,
  zeitraumVon: string,
  zeitraumBis: string
): Promise<string | null> {
  const db = admin()

  // Idempotenz über die Zahlung: eine Zahlung, eine Rechnung.
  if (zahlungId) {
    const { data: schon } = await db
      .from('coach_rechnungen')
      .select('nummer')
      .eq('zahlung_id', zahlungId)
      .maybeSingle()
    if (schon) return schon.nummer as string
  }

  const { data: nummerDaten, error: nummerFehler } = await db.rpc('coach_naechste_rechnungsnummer')
  if (nummerFehler || !nummerDaten) {
    console.error('[Coach-Verkauf] Rechnungsnummer konnte nicht gezogen werden:', nummerFehler)
    return null
  }
  const nummer = String(nummerDaten)

  const steuer = steuerEinstellung()
  const { nettoCent, steuerCent } = zerlegeBrutto(betragCent, steuer.satzProzent)

  const anschrift = [
    bestellung.rechnung_strasse,
    `${bestellung.rechnung_plz} ${bestellung.rechnung_ort}`,
    bestellung.rechnung_land,
  ]

  const daten: RechnungsDaten = {
    nummer,
    datum: heuteBerlin(),
    leistung_von: zeitraumVon,
    leistung_bis: zeitraumBis,
    tarif: bestellung.tarif,
    tarif_bezeichnung: bestellung.tarif === 'jaehrlich' ? 'Jährlich' : 'Monatlich',
    brutto_cent: betragCent,
    empfaenger: {
      name: bestellung.rechnung_name,
      anschrift,
      email: bestellung.rechnung_email,
    },
  }
  const pruefung = pruefeRechnungsangaben(daten)

  const { error } = await db.from('coach_rechnungen').insert({
    bestellung_id: bestellung.id,
    coach_user_id: bestellung.coach_user_id,
    zahlung_id: zahlungId,
    nummer,
    leistung_von: zeitraumVon,
    leistung_bis: zeitraumBis,
    brutto_cent: betragCent,
    netto_cent: nettoCent,
    steuer_cent: steuerCent,
    steuersatz: steuer.satzProzent,
    waehrung: bestellung.waehrung,
    empfaenger_name: bestellung.rechnung_name,
    empfaenger_anschrift: anschrift.join('\n'),
    angaben_unvollstaendig: pruefung.vollstaendig ? null : pruefung.fehlend.join('; '),
  })

  if (error) {
    console.error('[Coach-Verkauf] Rechnung konnte nicht angelegt werden:', error)
    return null
  }
  if (!pruefung.vollstaendig) {
    // Sichtbar im Protokoll, damit die Lücke nicht erst beim Betriebsprüfer auffällt.
    console.warn(`[Coach-Verkauf] Rechnung ${nummer} unvollständig: ${pruefung.fehlend.join('; ')}`)
  }
  return nummer
}
