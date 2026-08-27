// ═══════════════════════════════════════════════════════════════
// /api/coach/abo — Vertragsstand lesen, kündigen, widerrufen
//
// GET  → Bestellung, Zahlungsverlauf, Rechnungen, Zugangsstand.
// POST → { aktion: 'kuendigen' | 'widerrufen' | 'zahlungsmittel' }
//
// ═══ LESEN ÜBER DIE SESSION, SCHREIBEN ÜBER DEN SYSTEMKONTEXT ══
// GET benutzt den Session-Client: Die RLS-Policies aus Migration
// 20260907000000 sind damit die Zugriffs-Wahrheit, genau wie im übrigen
// PflegeCoach. POST braucht service_role, weil die Tabellen für
// `authenticated` schreibgeschützt sind — die betroffene Bestellung
// wird aber IMMER erst über die geprüfte coach_user_id ermittelt und
// nie über eine vom Client gelieferte ID. Eine fremde Bestellung ist
// über diese Route nicht erreichbar.
//
// ═══ KÜNDIGUNG OHNE HÜRDEN (§ 312k BGB) ════════════════════════
// Ein einziger Aufruf, keine Rückfrage nach Gründen, kein Halteangebot,
// keine Frist. Die Bestätigung geht als Textform-Nachweis per E-Mail
// heraus (§ 312k Abs. 4 BGB).
//
// ═══ WIDERRUF ERSTATTET IMMER VOLL ═════════════════════════════
// Kein anteiliger Abzug, kein Wertersatz — auch dann nicht, wenn das
// Produkt in den 14 Tagen intensiv genutzt wurde. Begründung in
// lib/coach/bestellung.ts.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { heuteBerlin } from '@/lib/utils/timezone'
import type { CoachBestellung, CoachRechnung, CoachZahlung } from '@/lib/coach/types'
import {
  hatZugang, kuendigungMoeglich, naechsteAbbuchung, widerrufMoeglich, widerrufsfristEnde,
} from '@/lib/coach/bestellung'
import { alleTarife, istVerkaufBereit, verkaufMoeglich } from '@/lib/coach/pricing'
import { beendeZugang, massgeblicheBestellung, setzeStatus, verbucheZahlung } from '@/lib/coach/verkauf-server'
import { sendeKuendigungsbestaetigung, sendeWiderrufsbestaetigung } from '@/lib/emails/coach-bestellung'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('coach-abo')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

// ═══════════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════════

export const GET = withTracking(async function GET() {
  // Kein schreibzugriff: Der Vertragsstand muss auch nach einem Widerruf
  // der Art.-9-Einwilligung abrufbar bleiben — sonst käme niemand mehr an
  // seine eigenen Rechnungen und könnte nicht mehr kündigen.
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const bestellung = await massgeblicheBestellung(auth.supabase, auth.coachUser.id)

  // Tarife für die Anzeige — ohne Stripe-IDs, die gehen den Client nichts an.
  const tarife = alleTarife().map(t => ({
    key: t.key,
    bezeichnung: t.bezeichnung,
    beschreibung: t.beschreibung,
    betrag_cent: t.betragCent,
    intervall_monate: t.intervallMonate,
    testphase_tage: t.testphaseTage,
    bestellbar: istVerkaufBereit(t).bereit,
  }))

  if (!bestellung) {
    return NextResponse.json({
      bestellung: null, zahlungen: [], rechnungen: [],
      zugang: false, verkauf_moeglich: verkaufMoeglich(), tarife,
    })
  }

  const [{ data: zahlungen }, { data: rechnungen }] = await Promise.all([
    auth.supabase
      .from('coach_zahlungen')
      .select('id, art, betrag_cent, waehrung, zeitraum_von, zeitraum_bis, fehlergrund, gebucht_am')
      .eq('bestellung_id', bestellung.id)
      .order('gebucht_am', { ascending: false }),
    auth.supabase
      .from('coach_rechnungen')
      .select('id, nummer, rechnungsdatum, brutto_cent, waehrung, leistung_von, leistung_bis, storniert_am')
      .eq('bestellung_id', bestellung.id)
      .order('rechnungsdatum', { ascending: false }),
  ])

  const heute = heuteBerlin()
  const widerruf = widerrufMoeglich(bestellung, heute)
  const kuendigung = kuendigungMoeglich(bestellung)

  return NextResponse.json({
    bestellung,
    zahlungen: (zahlungen ?? []) as Partial<CoachZahlung>[],
    rechnungen: (rechnungen ?? []) as Partial<CoachRechnung>[],
    zugang: hatZugang(bestellung, heute),
    naechste_abbuchung: naechsteAbbuchung(bestellung),
    widerruf_moeglich: widerruf.moeglich,
    widerruf_grund: widerruf.moeglich ? null : widerruf.grund,
    widerrufsfrist_ende: widerrufsfristEnde(bestellung.bestellt_am),
    kuendigung_moeglich: kuendigung.moeglich,
    kuendigung_grund: kuendigung.moeglich ? null : kuendigung.grund,
    kuendigung_wirkt_zum: kuendigung.moeglich ? kuendigung.wirktZum : null,
    verkauf_moeglich: verkaufMoeglich(),
    tarife,
  })
})

// ═══════════════════════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const aktion = String(body.aktion ?? '')

  const bestellung = await massgeblicheBestellung(auth.supabase, auth.coachUser.id)
  if (!bestellung) {
    return NextResponse.json({ error: 'Es liegt keine Bestellung vor.' }, { status: 404 })
  }

  try {
    switch (aktion) {
      case 'kuendigen':
        return await kuendigen(bestellung)
      case 'widerrufen':
        return await widerrufen(bestellung)
      case 'zahlungsmittel':
        return await zahlungsmittel(bestellung)
      default:
        return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 })
    }
  } catch (err) {
    return safeApiError(err, request)
  }
})

// ─── Kündigung zum Laufzeitende ────────────────────────────────

async function kuendigen(bestellung: CoachBestellung): Promise<NextResponse> {
  const pruefung = kuendigungMoeglich(bestellung)
  if (!pruefung.moeglich) {
    return NextResponse.json({ error: pruefung.grund }, { status: 409 })
  }

  // Zuerst Stripe: Schlägt das fehl, darf lokal nicht „gekündigt" stehen,
  // während weiter abgebucht wird. Andersherum wäre der Schaden real.
  if (bestellung.stripe_subscription_id) {
    await stripe.subscriptions.update(bestellung.stripe_subscription_id, {
      cancel_at_period_end: true,
    })
  }

  await setzeStatus(bestellung.id, 'gekuendigt', { gekuendigt_am: new Date().toISOString() })

  // Textform-Bestätigung nach § 312k Abs. 4 BGB. Der Versand darf die
  // Kündigung nicht scheitern lassen — sie ist bereits wirksam.
  const bestaetigt = await sendeKuendigungsbestaetigung({
    email: bestellung.rechnung_email,
    name: bestellung.rechnung_name,
    zugangBis: bestellung.laufzeit_bis,
  })

  return NextResponse.json({
    status: 'gekuendigt',
    wirkt_zum: bestellung.laufzeit_bis,
    bestaetigung_versendet: bestaetigt,
    meldung: bestellung.laufzeit_bis
      ? 'Ihre Kündigung ist eingegangen. Ihr Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen.'
      : 'Ihre Kündigung ist eingegangen.',
  })
}

// ─── Widerruf innerhalb der 14-Tage-Frist ──────────────────────

async function widerrufen(bestellung: CoachBestellung): Promise<NextResponse> {
  const pruefung = widerrufMoeglich(bestellung, heuteBerlin())
  if (!pruefung.moeglich) {
    return NextResponse.json({ error: pruefung.grund }, { status: 409 })
  }

  // Abo sofort beenden — nicht zum Periodenende. Der Vertrag gilt als
  // nie geschlossen, eine Restlaufzeit gäbe es dafür nicht.
  if (bestellung.stripe_subscription_id) {
    await stripe.subscriptions.cancel(bestellung.stripe_subscription_id).catch(err => {
      // Bereits gekündigt (z. B. Doppelklick): kein Grund, den Widerruf
      // scheitern zu lassen. Alles andere schon.
      if (err?.code !== 'resource_missing') throw err
    })
  }

  // Erstattung über die tatsächlich verbuchte Zahlung. Ohne Zahlung
  // (Testphase, Checkout nie bezahlt) gibt es nichts zu erstatten.
  const db = createAdminClient()
  const { data: letzteZahlung } = await db
    .from('coach_zahlungen')
    .select('id, betrag_cent, stripe_payment_intent')
    .eq('bestellung_id', bestellung.id)
    .eq('art', 'zahlung')
    .order('gebucht_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  let erstattetCent = 0
  if (letzteZahlung?.stripe_payment_intent) {
    const erstattung = await stripe.refunds.create({
      payment_intent: letzteZahlung.stripe_payment_intent as string,
      reason: 'requested_by_customer',
    })
    erstattetCent = erstattung.amount ?? (letzteZahlung.betrag_cent as number)

    await verbucheZahlung({
      bestellung,
      art: 'erstattung',
      betragCent: erstattetCent,
      zeitraumVon: null,
      zeitraumBis: null,
      stripePaymentIntent: letzteZahlung.stripe_payment_intent as string,
    })
  } else if (letzteZahlung) {
    // Zahlung verbucht, aber ohne Payment-Intent — Erstattung muss von
    // Hand erfolgen. Sichtbar im Protokoll statt stillschweigend.
    log.warn('Widerruf: Zahlung ohne payment_intent — Erstattung muss manuell in Stripe ausgeloest werden', {
      bestellungId: bestellung.id,
    })
  }

  await setzeStatus(bestellung.id, 'widerrufen', { widerrufen_am: new Date().toISOString() })
  await beendeZugang(bestellung.id, true)

  const bestaetigt = await sendeWiderrufsbestaetigung({
    email: bestellung.rechnung_email,
    name: bestellung.rechnung_name,
    erstattungCent: erstattetCent,
  })

  return NextResponse.json({
    status: 'widerrufen',
    erstattung_cent: erstattetCent,
    bestaetigung_versendet: bestaetigt,
    meldung:
      'Ihr Widerruf ist bestätigt. Der Betrag wird vollständig erstattet und erscheint je nach ' +
      'Zahlungsmittel innerhalb weniger Werktage auf Ihrem Konto.',
  })
}

// ─── Zahlungsmittel ändern (Stripe-Kundenportal) ───────────────

async function zahlungsmittel(bestellung: CoachBestellung): Promise<NextResponse> {
  if (!bestellung.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Zu dieser Bestellung ist kein Zahlungsmittel hinterlegt.' },
      { status: 404 }
    )
  }

  const sitzung = await stripe.billingPortal.sessions.create({
    customer: bestellung.stripe_customer_id,
    return_url: `${SITE_URL}/pflegecoach/einstellungen/konto`,
    locale: 'de',
  })

  return NextResponse.json({ url: sitzung.url })
}
