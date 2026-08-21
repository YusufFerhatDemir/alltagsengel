// ═══════════════════════════════════════════════════════════════
// POST /api/coach/checkout — Bestellung anlegen und zu Stripe schicken
//
// Der einzige Weg, auf dem eine PflegeCoach-Bestellung entsteht.
//
// ═══ VIER SPERREN, ALLE FAIL-CLOSED ════════════════════════════
//  1. Preisfreigabe + Stripe-Konfiguration (istVerkaufBereit) — ohne
//     freigegebene Preisliste wird nichts entgegengenommen. Die Prüfung
//     steht HIER und nicht nur in der Oberfläche: Ein direkter Aufruf
//     dieser Route muss dieselbe Sperre treffen wie ein Klick.
//  2. Angemeldeter Nutzer mit PflegeCoach-Profil und gültiger Art.-9-
//     Einwilligung. Ohne Einwilligung wäre der Zugang wertlos — es
//     ließe sich nichts speichern.
//  3. AGB und Datenschutzhinweise ausdrücklich bestätigt, serverseitig
//     geprüft. Der Zeitpunkt wird als Nachweis gespeichert.
//  4. Vollständige Rechnungsanschrift (§ 14 Abs. 4 UStG).
//
// ═══ KEINE VERZICHTSERKLÄRUNG AUF DAS WIDERRUFSRECHT ═══════════
// Diese Route nimmt bewusst keine Erklärung über ein vorzeitiges
// Erlöschen des Widerrufsrechts entgegen (§ 356 Abs. 4 BGB) — es gibt
// kein solches Feld. Begründung: lib/coach/bestellung.ts.
//
// REIHENFOLGE: erst Bestellung (Status 'offen'), dann Stripe-Sitzung.
// Andersherum gäbe es Zahlungen ohne zugehörige Bestellung, und der
// Webhook wüsste nicht, wem er den Zugang freischalten soll.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import {
  istTarifKey, istVerkaufBereit, tarif, VERKAUF_GESPERRT_TEXT,
} from '@/lib/coach/pricing'
import { WIDERRUFSBELEHRUNG_VERSION } from '@/lib/coach/rechtstexte'
import { logger } from '@/lib/logger'
const log = logger.child('coach-checkout')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

const MAX = { name: 120, strasse: 160, plz: 12, ort: 100, land: 60, email: 200 }

interface AnschriftEingabe {
  name: string
  strasse: string
  plz: string
  ort: string
  land: string
  email: string
}

type AnschriftErgebnis =
  | { ok: true; wert: AnschriftEingabe }
  | { ok: false; fehler: string }

function pruefeAnschrift(body: Record<string, unknown>, fallbackEmail: string): AnschriftErgebnis {
  const hole = (k: string, max: number): string =>
    typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : ''

  const wert: AnschriftEingabe = {
    name: hole('rechnung_name', MAX.name),
    strasse: hole('rechnung_strasse', MAX.strasse),
    plz: hole('rechnung_plz', MAX.plz),
    ort: hole('rechnung_ort', MAX.ort),
    land: hole('rechnung_land', MAX.land) || 'Deutschland',
    email: hole('rechnung_email', MAX.email) || fallbackEmail,
  }

  if (!wert.name) return { ok: false, fehler: 'Bitte geben Sie den Namen für die Rechnung an.' }
  if (!wert.strasse) return { ok: false, fehler: 'Bitte geben Sie Straße und Hausnummer an.' }
  if (!wert.plz) return { ok: false, fehler: 'Bitte geben Sie die Postleitzahl an.' }
  if (!wert.ort) return { ok: false, fehler: 'Bitte geben Sie den Ort an.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(wert.email)) {
    return { ok: false, fehler: 'Bitte prüfen Sie die E-Mail-Adresse für die Rechnung.' }
  }
  return { ok: true, wert }
}

export async function POST(request: Request) {
  try {
    // Rate-Limit vor allem anderen: Jeder Aufruf, der durchkommt, legt
    // einen Stripe-Customer an — das ist eine Ressource bei einem Dritten.
    const ip = getClientIp(request)
    if (!rateLimit(`coach-checkout:${ip}`, 10, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Zu viele Versuche — bitte warten Sie einige Minuten.' },
        { status: 429 }
      )
    }

    // schreibzugriff: true — prüft zusätzlich die Art.-9-Einwilligung.
    const auth = await requireCoachUser({ schreibzugriff: true })
    if (!auth.ok) return auth.response

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

    if (!istTarifKey(body.tarif)) {
      return NextResponse.json({ error: 'Bitte wählen Sie einen Tarif.' }, { status: 400 })
    }
    const gewaehlt = tarif(body.tarif)

    const bereit = istVerkaufBereit(gewaehlt)
    if (!bereit.bereit) {
      // Der interne Grund wandert ins Protokoll, nicht in die Antwort —
      // die Konfigurationslage geht Kundinnen und Kunden nichts an.
      log.warn(`Verkauf gesperrt (${bereit.code}): ${bereit.grund}`)
      return NextResponse.json(
        { error: VERKAUF_GESPERRT_TEXT, code: bereit.code },
        { status: 409 }
      )
    }

    if (body.agb_akzeptiert !== true) {
      return NextResponse.json(
        { error: 'Bitte bestätigen Sie die Allgemeinen Geschäftsbedingungen.' },
        { status: 400 }
      )
    }
    if (body.datenschutz_akzeptiert !== true) {
      return NextResponse.json(
        { error: 'Bitte bestätigen Sie die Datenschutzhinweise.' },
        { status: 400 }
      )
    }

    const anschrift = pruefeAnschrift(body, auth.user.email ?? '')
    if (!anschrift.ok) {
      return NextResponse.json({ error: anschrift.fehler }, { status: 400 })
    }

    const db = createAdminClient()
    const jetzt = new Date().toISOString()

    // Bereits laufende Bestellung? Dann kein zweites Abo anlegen —
    // sonst zahlt jemand doppelt, weil er die Bestellseite erneut
    // aufgerufen hat.
    const { data: laufend } = await db
      .from('coach_bestellungen')
      .select('id, status')
      .eq('coach_user_id', auth.coachUser.id)
      .in('status', ['aktiv', 'gekuendigt', 'zahlung_offen'])
      .maybeSingle()

    if (laufend) {
      return NextResponse.json(
        {
          error: 'Für Ihr Konto besteht bereits ein Zugang. Ihren Vertrag verwalten Sie unter „Konto und Nutzung beenden".',
          code: 'BEREITS_AKTIV',
        },
        { status: 409 }
      )
    }

    // Stripe-Kunde: vorhandenen wiederverwenden, damit ein Nutzer nach
    // Kündigung und Neubestellung nicht als zweiter Kunde geführt wird.
    const { data: frueher } = await db
      .from('coach_bestellungen')
      .select('stripe_customer_id')
      .eq('coach_user_id', auth.coachUser.id)
      .not('stripe_customer_id', 'is', null)
      .order('bestellt_am', { ascending: false })
      .limit(1)
      .maybeSingle()

    let customerId = frueher?.stripe_customer_id as string | undefined
    if (!customerId) {
      const kunde = await stripe.customers.create({
        email: anschrift.wert.email,
        name: anschrift.wert.name,
        address: {
          line1: anschrift.wert.strasse,
          postal_code: anschrift.wert.plz,
          city: anschrift.wert.ort,
          country: 'DE',
        },
        metadata: { produkt: 'pflegecoach', coach_user_id: auth.coachUser.id },
      })
      customerId = kunde.id
    }

    const { data: bestellung, error: anlageFehler } = await db
      .from('coach_bestellungen')
      .insert({
        coach_user_id: auth.coachUser.id,
        tarif: gewaehlt.key,
        betrag_cent: gewaehlt.betragCent,
        intervall_monate: gewaehlt.intervallMonate,
        status: 'offen',
        rechnung_name: anschrift.wert.name,
        rechnung_strasse: anschrift.wert.strasse,
        rechnung_plz: anschrift.wert.plz,
        rechnung_ort: anschrift.wert.ort,
        rechnung_land: anschrift.wert.land,
        rechnung_email: anschrift.wert.email,
        agb_akzeptiert_am: jetzt,
        datenschutz_akzeptiert_am: jetzt,
        widerrufsbelehrung_version: WIDERRUFSBELEHRUNG_VERSION,
        stripe_customer_id: customerId,
      })
      .select('id')
      .single()

    if (anlageFehler || !bestellung) {
      log.error('Bestellung konnte nicht angelegt werden', { anlageFehler })
      return NextResponse.json(
        { error: 'Die Bestellung konnte nicht angelegt werden. Bitte versuchen Sie es erneut.' },
        { status: 500 }
      )
    }

    // Die Bestell-ID reist in beiden Metadaten-Sätzen mit: in der Sitzung
    // (für checkout.session.completed) und im Abo (für alle späteren
    // Rechnungsereignisse, die die Sitzung nicht mehr kennen).
    const metadaten = { produkt: 'pflegecoach', coach_bestellung_id: bestellung.id }

    const sitzung = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: gewaehlt.stripePriceId, quantity: 1 }],
      success_url: `${SITE_URL}/pflegecoach/checkout/danke?sitzung={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/pflegecoach/checkout?abgebrochen=1`,
      metadata: metadaten,
      subscription_data: {
        metadata: metadaten,
        ...(gewaehlt.testphaseTage > 0 ? { trial_period_days: gewaehlt.testphaseTage } : {}),
      },
      locale: 'de',
      // Rechnungsanschrift wurde bereits erhoben — Stripe soll sie nicht
      // ein zweites Mal abfragen und dabei von unserer abweichen dürfen.
      billing_address_collection: 'auto',
    })

    await db
      .from('coach_bestellungen')
      .update({ stripe_checkout_id: sitzung.id })
      .eq('id', bestellung.id)

    if (!sitzung.url) {
      log.error('Stripe lieferte keine Weiterleitungs-URL')
      return NextResponse.json(
        { error: 'Die Zahlungsseite konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.' },
        { status: 502 }
      )
    }

    return NextResponse.json({ url: sitzung.url })
  } catch (err) {
    return safeApiError(err, request)
  }
}
