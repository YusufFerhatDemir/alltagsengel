// ═══════════════════════════════════════════════════════════════
// POST /api/coach/webhook — Stripe-Ereignisse des PflegeCoach
//
// EIGENER ENDPUNKT, NICHT /api/stripe/webhook: Der bestehende Webhook
// bedient das B2B-Abo (organization_subscriptions) und würde bei jedem
// PflegeCoach-Ereignis vergeblich nach einer orgId suchen. Zwei
// Endpunkte mit getrennten Signaturgeheimnissen sind in Stripe der
// vorgesehene Weg und halten die Produktgrenze auch im Fehlerfall: Ein
// Fehler im Coach-Weg kann das Betriebs-Abo nicht beschädigen.
//
// ═══ ANTWORT IMMER 200, AUSSER BEI UNGÜLTIGER SIGNATUR ═════════
// Stripe wiederholt jedes nicht mit 2xx quittierte Ereignis über Tage.
// Ein Fehler in einer Bestätigungsmail würde so zu einem endlosen
// Wiederholungslauf. Verarbeitungsfehler werden deshalb protokolliert
// und quittiert — nicht verschwiegen, aber auch nicht wiederholt.
// Ausnahme: eine ungültige Signatur wird mit 400 abgewiesen.
//
// ═══ IDEMPOTENZ ════════════════════════════════════════════════
// Jedes Ereignis kann mehrfach eintreffen. Die schreibenden Funktionen
// in lib/coach/verkauf-server.ts fangen das über UNIQUE-Spalten ab;
// hier wird zusätzlich nur dann eine Mail versendet, wenn tatsächlich
// etwas Neues verbucht wurde.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe/client'
import { heuteBerlin } from '@/lib/utils/timezone'
import type { CoachBestellung } from '@/lib/coach/types'
import { laufzeitEnde, widerrufsfristEnde } from '@/lib/coach/bestellung'
import {
  aktiviereBestellung, bestellungPerCheckout, bestellungPerSubscription,
  beendeZugang, setzeStatus, stelleRechnungAus, verbucheZahlung,
} from '@/lib/coach/verkauf-server'
import {
  sendeBestellbestaetigung, sendeZahlungFehlgeschlagen,
} from '@/lib/emails/coach-bestellung'
import { logger } from '@/lib/logger'
const log = logger.child('coach-webhook')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Eigenes Signaturgeheimnis — der B2B-Endpunkt hat ein anderes. */
const WEBHOOK_SECRET_ENV = 'COACH_STRIPE_WEBHOOK_SECRET'

const TARIF_BEZEICHNUNG: Record<string, string> = {
  monatlich: 'Monatlich',
  jaehrlich: 'Jährlich',
}

/** Unix-Sekunden → ISO-Datum. Null bei fehlendem Wert. */
function isoDatum(sekunden: number | null | undefined): string | null {
  if (!sekunden) return null
  return new Date(sekunden * 1000).toISOString().slice(0, 10)
}

/**
 * Abrechnungszeitraum einer Stripe-Rechnung.
 *
 * Quelle ist die erste Rechnungsposition, nicht das Abo: Bei einem
 * Wechsel oder einer anteiligen Abrechnung weicht der Positionszeitraum
 * vom Abo-Zeitraum ab, und auf der Rechnung muss der Zeitraum stehen,
 * der tatsächlich bezahlt wurde.
 */
function zeitraumAusRechnung(invoice: Stripe.Invoice): { von: string | null; bis: string | null } {
  const position = invoice.lines?.data?.[0]
  return {
    von: isoDatum(position?.period?.start),
    bis: isoDatum(position?.period?.end),
  }
}

/**
 * Findet die Bestellung zu einem Rechnungsereignis.
 *
 * Zwei Wege, weil keiner allein zuverlässig ist: die Metadaten des Abos
 * (gesetzt beim Checkout) und die Abo-ID (gesetzt bei der Aktivierung).
 * Bei der allerersten Rechnung ist die Abo-ID an der Bestellung unter
 * Umständen noch nicht vermerkt — dann trägt der Metadaten-Weg.
 */
async function bestellungZuRechnung(invoice: Stripe.Invoice): Promise<CoachBestellung | null> {
  const details = invoice.parent?.subscription_details
  const ausMetadaten = details?.metadata?.coach_bestellung_id

  if (ausMetadaten) {
    const { data } = await import('@/lib/supabase/admin').then(m =>
      m.createAdminClient().from('coach_bestellungen').select('*').eq('id', ausMetadaten).maybeSingle()
    )
    if (data) return data as CoachBestellung
  }

  const subId = typeof details?.subscription === 'string'
    ? details.subscription
    : details?.subscription?.id
  if (subId) return bestellungPerSubscription(subId)

  return null
}

/** Gehört dieses Ereignis überhaupt zum PflegeCoach? */
function istCoachEreignis(metadata: Stripe.Metadata | null | undefined): boolean {
  return metadata?.produkt === 'pflegecoach'
}

export async function POST(request: Request) {
  const rohkoerper = await request.text()
  const signatur = request.headers.get('stripe-signature')

  const secret = process.env[WEBHOOK_SECRET_ENV]
  if (!secret) {
    log.error(`${WEBHOOK_SECRET_ENV} fehlt — Ereignis nicht verarbeitet`)
    // 500: Das Ereignis ist echt, wir können es nur nicht prüfen. Stripe
    // soll es wiederholen, sobald das Geheimnis hinterlegt ist.
    return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 })
  }
  if (!signatur) {
    return NextResponse.json({ error: 'Signatur fehlt' }, { status: 400 })
  }

  let ereignis: Stripe.Event
  try {
    ereignis = stripe.webhooks.constructEvent(rohkoerper, signatur, secret)
  } catch {
    return NextResponse.json({ error: 'Signatur ungültig' }, { status: 400 })
  }

  try {
    await verarbeite(ereignis)
  } catch (err) {
    // Bewusst quittiert: siehe Kopf. Der Fehler steht im Protokoll und
    // die Bestellung bleibt in ihrem letzten gültigen Zustand.
    log.errorWithException(`Verarbeitung von ${ereignis.type} fehlgeschlagen:`, err)
  }

  return NextResponse.json({ received: true })
}

async function verarbeite(ereignis: Stripe.Event): Promise<void> {
  switch (ereignis.type) {
    // ─── Bezahlt: Zugang freischalten ───────────────────────────
    case 'checkout.session.completed': {
      const sitzung = ereignis.data.object
      if (!istCoachEreignis(sitzung.metadata)) return
      if (sitzung.mode !== 'subscription') return

      const bestellung = await bestellungPerCheckout(sitzung.id)
      if (!bestellung) {
        log.error('Keine Bestellung zu Checkout', { id: sitzung.id })
        return
      }
      // Bereits aktiv = zweite Zustellung desselben Ereignisses.
      if (bestellung.status !== 'offen') return

      const subId = typeof sitzung.subscription === 'string'
        ? sitzung.subscription
        : sitzung.subscription?.id ?? null

      let bis: string | null = null
      if (subId) {
        const abo = await stripe.subscriptions.retrieve(subId)
        bis = isoDatum(abo.items?.data?.[0]?.current_period_end)
      }

      const laufzeitBis = await aktiviereBestellung(bestellung, subId, bis)

      // Die Bestätigungsmail nennt noch keine Rechnungsnummer: Die
      // Rechnung entsteht erst mit invoice.paid, das je nach Reihenfolge
      // Sekunden später eintrifft. Lieber eine Bestätigung ohne Nummer
      // als eine verzögerte Bestätigung.
      await sendeBestellbestaetigung({
        email: bestellung.rechnung_email,
        name: bestellung.rechnung_name,
        tarifBezeichnung: TARIF_BEZEICHNUNG[bestellung.tarif] ?? bestellung.tarif,
        betragCent: bestellung.betrag_cent,
        laufzeitBis,
        widerrufsfristEnde: widerrufsfristEnde(bestellung.bestellt_am),
      })
      return
    }

    // ─── Abbuchung erfolgreich: verbuchen, Rechnung, verlängern ──
    case 'invoice.paid': {
      const invoice = ereignis.data.object
      const bestellung = await bestellungZuRechnung(invoice)
      if (!bestellung) return

      const { von, bis } = zeitraumAusRechnung(invoice)
      const zeitraumVon = von ?? heuteBerlin()
      const zeitraumBis = bis ?? laufzeitEnde(zeitraumVon, bestellung.intervall_monate)

      const zahlungId = await verbucheZahlung({
        bestellung,
        art: 'zahlung',
        betragCent: invoice.amount_paid ?? bestellung.betrag_cent,
        zeitraumVon,
        zeitraumBis,
        stripeInvoiceId: invoice.id,
      })
      // null = bereits verbucht. Dann auch keine zweite Rechnung.
      if (zahlungId === null) return

      await stelleRechnungAus(
        bestellung,
        zahlungId,
        invoice.amount_paid ?? bestellung.betrag_cent,
        zeitraumVon,
        zeitraumBis
      )

      // Verlängerung. Bei einer gekündigten Bestellung wird der Status
      // NICHT auf 'aktiv' zurückgesetzt — sonst hübe eine
      // Schlussabrechnung die Kündigung wieder auf.
      if (bestellung.status === 'gekuendigt') {
        await setzeStatus(bestellung.id, 'gekuendigt', { laufzeit_bis: zeitraumBis })
      } else {
        await aktiviereBestellung(bestellung, null, zeitraumBis)
      }
      return
    }

    // ─── Abbuchung fehlgeschlagen ───────────────────────────────
    case 'invoice.payment_failed': {
      const invoice = ereignis.data.object
      const bestellung = await bestellungZuRechnung(invoice)
      if (!bestellung) return

      const zahlungId = await verbucheZahlung({
        bestellung,
        art: 'fehlgeschlagen',
        betragCent: invoice.amount_due ?? bestellung.betrag_cent,
        zeitraumVon: null,
        zeitraumBis: null,
        fehlergrund: invoice.last_finalization_error?.message ?? 'Die Zahlung wurde abgelehnt.',
        stripeInvoiceId: invoice.id,
      })
      if (zahlungId === null) return

      // Zugang bleibt zunächst bestehen (Status 'zahlung_offen'). Stripe
      // versucht es mehrfach; erst wenn das Abo endgültig scheitert,
      // kommt customer.subscription.deleted und sperrt.
      await setzeStatus(bestellung.id, 'zahlung_offen')

      await sendeZahlungFehlgeschlagen({
        email: bestellung.rechnung_email,
        name: bestellung.rechnung_name,
        betragCent: invoice.amount_due ?? bestellung.betrag_cent,
        zugangBis: bestellung.laufzeit_bis,
      })
      return
    }

    // ─── Abo endgültig beendet ──────────────────────────────────
    case 'customer.subscription.deleted': {
      const abo = ereignis.data.object
      if (!istCoachEreignis(abo.metadata)) return

      const bestellung = await bestellungPerSubscription(abo.id)
      if (!bestellung) return
      // Widerrufene Bestellungen sind bereits abschließend behandelt —
      // der Widerruf hat das Abo selbst beendet und ausgelöst.
      if (bestellung.status === 'widerrufen') return

      // 'gesperrt' statt 'abgelaufen', wenn eine Zahlung offen blieb:
      // Der Unterschied entscheidet, welchen Text die Kontoseite zeigt
      // und ob eine Wiederaufnahme möglich ist.
      const neuerStatus = bestellung.status === 'zahlung_offen' ? 'gesperrt' : 'abgelaufen'
      await setzeStatus(bestellung.id, neuerStatus)
      await beendeZugang(bestellung.id, false)
      return
    }

    // ─── Kündigung zum Laufzeitende (in Stripe gesetzt) ─────────
    case 'customer.subscription.updated': {
      const abo = ereignis.data.object
      if (!istCoachEreignis(abo.metadata)) return

      const bestellung = await bestellungPerSubscription(abo.id)
      if (!bestellung) return
      if (bestellung.status === 'widerrufen') return

      const bis = isoDatum(abo.items?.data?.[0]?.current_period_end)

      // Deckt den Fall ab, dass im Stripe-Portal gekündigt wurde statt
      // in unserer Oberfläche — sonst zeigte die Kontoseite weiter
      // „Aktiv" und eine nächste Abbuchung, die nie kommt.
      if (abo.cancel_at_period_end && bestellung.status !== 'gekuendigt') {
        await setzeStatus(bestellung.id, 'gekuendigt', {
          gekuendigt_am: new Date().toISOString(),
          ...(bis ? { laufzeit_bis: bis } : {}),
        })
        return
      }
      // Kündigung im Portal zurückgenommen.
      if (!abo.cancel_at_period_end && bestellung.status === 'gekuendigt') {
        await setzeStatus(bestellung.id, 'aktiv', {
          gekuendigt_am: null,
          ...(bis ? { laufzeit_bis: bis } : {}),
        })
      }
      return
    }

    default:
      return
  }
}
