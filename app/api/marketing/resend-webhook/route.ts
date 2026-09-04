// ═══════════════════════════════════════════════════════════════════════════
// POST /api/marketing/resend-webhook — Zustellrueckmeldungen von Resend
//
// Bis hierher endete die Zustellspur einer Kampagne bei „gesendet": das ist
// die Aussage, dass Resend den Auftrag ANGENOMMEN hat, nicht dass die Mail
// angekommen ist. Ob eine Adresse ueberhaupt existiert, stand nirgends —
// email_campaign_logs hatte die Spalten delivered_at/opened_at/clicked_at/
// bounced_at von Anfang an, aber niemanden, der sie fuellt.
//
// Das ist nicht nur eine fehlende Statistik. Ohne Bounce-Verarbeitung
// versendet jede weitere Kampagne erneut an tote Adressen, und genau das
// ruiniert die Zustellbarkeit der ganzen Domain — auch die der Rechnungen.
//
// ── DIE ROUTE IST OEFFENTLICH UND DESHALB FAIL-CLOSED ──────────────────────
// Kein gueltiges Svix-Geheimnis, keine Signatur, kein Ereignis. Begruendung
// in lib/marketing/webhook-signatur.ts: ein gefaelschtes `email.bounced`
// wuerde eine fremde Adresse dauerhaft sperren.
//
// ── WARUM FAST IMMER 200 ───────────────────────────────────────────────────
// Resend wiederholt bei jedem Nicht-2xx. Eine Nachricht, die wir NIE
// verarbeiten koennen — unbekannte Ereignisart, kein passender Logeintrag
// (Testversand!) — bekommt deshalb 200 mit einer Begruendung im Rumpf.
// Sonst wiederholt Resend sie tagelang. Nur zwei Faelle bekommen einen
// Fehlercode: eine ungueltige Signatur (401 — die Nachricht ist nicht von
// Resend) und ein Datenbankfehler (500 — die Wiederholung SOLL kommen).
//
// ── REIHENFOLGE ────────────────────────────────────────────────────────────
// Ereignisse kommen nicht sortiert an. Der Bestand wird deshalb GELESEN und
// der Status nur gehoben, nie gesenkt — siehe lib/marketing/zustellereignis.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { pruefeSvixSignatur, svixKopfzeilen } from '@/lib/marketing/webhook-signatur'
import { signaturAbweisung } from '@/lib/marketing/webhook-antwort'
import {
  berechneAenderung, istWebhookEreignis, sperrgrundFuer, type Bestand,
} from '@/lib/marketing/zustellereignis'
import { normalisiereAdresse, sperreAdresse, widerrufeEinwilligung } from '@/lib/marketing/einwilligung'
import type { ZustellStatus } from '@/lib/marketing/typen'
import {
  verarbeiteTransaktionsRueckmeldung, istRueckmeldung,
} from '@/lib/notifications/zustellrueckmeldung'
import { erfasseSicherheitsereignis } from '@/lib/security'
import {
  trackingLage, trackingLageTransaktion, ohneTrackingFelder, istTrackingEreignis,
} from '@/lib/marketing/tracking'

const log = logger.child('marketing:resend-webhook')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Erledigt, aber nichts zu tun. Bewusst 200 — siehe Kopf. */
function erledigt(hinweis: string) {
  return NextResponse.json({ ok: true, hinweis }, { status: 200 })
}

export const POST = withTracking(async function POST(request: Request) {
  // Der ROHE Rumpf. `request.json()` wuerde die Signatur unbrauchbar
  // machen — Reihenfolge und Leerzeichen gehen beim Neuserialisieren
  // verloren.
  const rumpf = await request.text()

  const signatur = pruefeSvixSignatur(rumpf, svixKopfzeilen(request))
  if (!signatur.ok) {
    // Status, Rumpf und Kopfzeilen entscheidet lib/marketing/webhook-antwort.ts
    // — dort ist die Zuordnung geprueft. Hier wird nur protokolliert und
    // ausgeliefert.
    const antwort = signaturAbweisung(signatur.grund)
    if (antwort.protokoll.schwere === 'error') log.error(antwort.protokoll.text)
    else log.warn(antwort.protokoll.text, antwort.protokoll.details)
    return NextResponse.json(antwort.rumpf, {
      status: antwort.status,
      headers: antwort.kopfzeilen,
    })
  }

  let nutzlast: Record<string, unknown>
  try {
    nutzlast = JSON.parse(rumpf) as Record<string, unknown>
  } catch {
    return erledigt('Rumpf ist kein JSON — nicht verarbeitbar.')
  }

  const typ = nutzlast.type
  if (!istWebhookEreignis(typ)) {
    // Resend ergaenzt Ereignisarten. Eine unbekannte ist kein Fehler.
    return erledigt(`Ereignisart ${String(typ)} wird nicht ausgewertet.`)
  }

  const daten = (nutzlast.data ?? {}) as Record<string, unknown>
  const emailId = typeof daten.email_id === 'string' ? daten.email_id : null
  if (!emailId) return erledigt('Ohne email_id lässt sich kein Eintrag zuordnen.')

  const zeitpunkt = typeof nutzlast.created_at === 'string'
    ? new Date(nutzlast.created_at).toISOString()
    : new Date().toISOString()

  // Der Bounce-Typ wird in BEIDEN Zweigen gebraucht (Kampagne wie
  // Transaktionspost) und deshalb vor der Verzweigung gelesen.
  const bounceRoh = (daten.bounce ?? {}) as Record<string, unknown>
  const bounceTyp = typeof bounceRoh.type === 'string'
    ? bounceRoh.type
    : (typeof daten.bounce_type === 'string' ? daten.bounce_type : null)

  try {
    const admin = createAdminClient()

    // ── Den Logeintrag finden ───────────────────────────────────────────
    // Ueber provider_id, die Kennung von Resend. Sie ist der einzige
    // verlaessliche Schluessel: die Adresse allein waere mehrdeutig, weil
    // dieselbe Adresse in mehreren Kampagnen steht.
    const { data: eintrag, error: leseFehler } = await admin
      .from('email_campaign_logs')
      .select('id, organization_id, campaign_id, empfaenger, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, unsubscribed_at')
      .eq('provider_id', emailId)
      .maybeSingle()

    if (leseFehler) {
      log.errorWithException('Logeintrag nicht lesbar', new Error(leseFehler.message))
      // 500: die Wiederholung soll kommen.
      return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen.' }, { status: 500 })
    }

    if (!eintrag) {
      // ── Zweiter Anlauf: Transaktionspost ────────────────────────────
      // Bis zum 31.08.2026 endete die Verarbeitung hier mit „nichts zu
      // tun". Damit fiel JEDE Rueckmeldung zu Sicherheitsmeldungen,
      // Rechnungen und Mahnungen ersatzlos weg — auch ein Hard Bounce
      // auf eine Sicherheitsmeldung, also genau der Fall „die Warnung
      // hat niemanden erreicht". Die Zustellzeile behielt `sent`, und
      // `sent` heisst nur „dem Provider uebergeben".
      //
      // Der Schluessel dafuer liegt seit demselben Tag vor:
      // notification_delivery_log.provider_message_id.
      if (istTrackingEreignis(typ)) {
        // Rechnungen, Mahnungen, Sicherheitsmeldungen werden NICHT auf
        // Öffnungen und Klicks gemessen — ohne Schalter und ohne
        // Ausnahme. Es gibt hier keine Einwilligung, auf die sich eine
        // Verhaltensmessung stützen ließe, und die Mail erfüllt ihren
        // Zweck auch ohne sie.
        return erledigt(trackingLageTransaktion().grund)
      }

      if (!istRueckmeldung(typ)) {
        return erledigt(`Ereignisart ${typ} ist fuer Transaktionspost ohne Bedeutung.`)
      }

      const rueck = await verarbeiteTransaktionsRueckmeldung(
        admin,
        { providerNachrichtId: emailId, ereignis: typ, zeitpunkt, bounceTyp },
        // ── Eskalation ────────────────────────────────────────────────
        // Eine Sicherheitsmeldung, die nicht ankommt, ist selbst ein
        // Sicherheitsvorfall — sie darf nicht nur als rote Zeile in
        // einer Zustellspur enden, die niemand oeffnet.
        //
        // OHNE MAIL, und das ist Absicht: der Kanal, ueber den gemeldet
        // wuerde, ist gerade der gescheiterte. Eine Meldung an dieselbe
        // Adresse liefe in denselben Bounce, der die naechste Eskalation
        // ausloeste — eine Schleife, die sich selbst befeuert. Das
        // Ereignis steht in der Sicherheitsspur, ist dort rot markiert
        // und geht zusaetzlich als Fehler ins Log.
        async (bezug) => {
          log.error('Sicherheitsmeldung nicht zugestellt', {
            empfaenger: bezug.empfaenger, grund: bezug.grund,
            bezugEreignis: bezug.ereignisId,
          })
          await erfasseSicherheitsereignis({
            eventType: 'security_error',
            userId: bezug.userId,
            organizationId: bezug.organizationId,
            severity: 'critical',
            alsTest: 'SYNTHETIC_EVENT',
            metadata: {
              gegenstand: 'Sicherheitsmeldung nicht zugestellt',
              grund: bezug.grund,
              bezug_ereignis: bezug.ereignisId,
              provider_nachricht: emailId,
              // Die Adresse steht bewusst NICHT hier: sie steht bereits
              // an der Zustellzeile, und die Sicherheitsspur wird lange
              // aufbewahrt.
            },
          }, { ohneMeldung: true })
        },
      )

      if (!rueck.gefunden) {
        // Testversand und alles, was weder Kampagne noch Zustellvorgang
        // ist. Bewusst 200 — sonst wiederholt Resend tagelang.
        return erledigt('Weder Kampagnen- noch Transaktionseintrag zu dieser Kennung.')
      }
      return NextResponse.json({
        ok: true, art: 'transaktion', vorgang: rueck.vorgangArt,
        status: rueck.status, eskaliert: rueck.eskaliert,
        beendet: rueck.beendet, hinweis: rueck.hinweis,
      }, { status: 200 })
    }

    const bestand: Bestand = {
      status: eintrag.status as ZustellStatus,
      sent_at: (eintrag.sent_at as string | null) ?? null,
      delivered_at: (eintrag.delivered_at as string | null) ?? null,
      opened_at: (eintrag.opened_at as string | null) ?? null,
      clicked_at: (eintrag.clicked_at as string | null) ?? null,
      bounced_at: (eintrag.bounced_at as string | null) ?? null,
      unsubscribed_at: (eintrag.unsubscribed_at as string | null) ?? null,
    }

    const { felder: roheFelder, statusGehoben } = berechneAenderung(typ, bestand, zeitpunkt)

    // ── Öffnungs- und Klicktracking (Befund 31.08.2026) ──────────────
    // Bis hierher wurden opened_at und clicked_at bedingungslos
    // geschrieben. Eine individualisierte Öffnungsmessung ist eine
    // Verhaltensbeobachtung und braucht eine eigene Einwilligung — die
    // Einwilligung in den Newsletter deckt sie nicht mit ab.
    // Fail-closed: ohne MARKETING_TRACKING_ERLAUBT=1 wird der Zeitpunkt
    // verworfen. Die Zustellung selbst (gesendet, zugestellt,
    // unzustellbar, Beschwerde) bleibt davon unberührt — das sind
    // Tatsachen über die Mail, keine über die Person.
    const lage = trackingLage()
    const { felder, verworfen } = ohneTrackingFelder(roheFelder, lage)
    if (verworfen.length > 0) {
      log.info('Tracking-Zeitpunkt verworfen', { ereignis: typ, verworfen, grund: lage.grund })
    }

    if (Object.keys(felder).length > 0) {
      // `.select()` ist der Wirkungsnachweis: PostgREST meldet keinen
      // Fehler, wenn NULL Zeilen getroffen wurden.
      const { data: getroffen, error: schreibFehler } = await admin
        .from('email_campaign_logs')
        .update(felder)
        .eq('id', eintrag.id)
        .select('id')

      if (schreibFehler) {
        log.errorWithException('Zustellstand nicht schreibbar', new Error(schreibFehler.message))
        return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen.' }, { status: 500 })
      }
      if (!getroffen || getroffen.length === 0) {
        log.warn('Zustellstand ohne Wirkung geschrieben', { eintrag: eintrag.id })
      }
    }

    // ── Sperrliste bei dauerhaftem Fehler oder Beschwerde ───────────────
    const grund = sperrgrundFuer(typ, bounceTyp)
    if (grund) {
      const adresse = normalisiereAdresse(eintrag.empfaenger as string)
      const organizationId = eintrag.organization_id as string

      if (grund === 'spam_beschwerde') {
        // Eine Beschwerde ist ein Widerspruch: die Einwilligung wird
        // widerrufen UND die Adresse gesperrt. Nur zu sperren liesse die
        // offene Einwilligung stehen — und die naechste Auswertung
        // zaehlte die Person weiter als eingewilligt.
        const ergebnis = await widerrufeEinwilligung(
          admin, organizationId, adresse, 'alle', 'spam_beschwerde',
        )
        if (!ergebnis.ok) {
          log.errorWithException('Widerruf nach Beschwerde fehlgeschlagen', new Error(ergebnis.grund))
          return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen.' }, { status: 500 })
        }
      } else {
        // Hard Bounce: die Adresse existiert nicht. Die Einwilligung
        // bleibt bewusst stehen — sie wurde nicht widerrufen, die Adresse
        // ist nur unzustellbar. Die Sperrliste haelt den Versand auf.
        const ergebnis = await sperreAdresse(
          admin, organizationId, adresse, 'hard_bounce', null,
          `Automatisch gesperrt nach ${typ} (Resend ${emailId}).`,
        )
        if (!ergebnis.ok) {
          log.errorWithException('Sperre nach Bounce fehlgeschlagen', new Error(ergebnis.grund))
          return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen.' }, { status: 500 })
        }
      }

      log.info('Adresse nach Zustellereignis gesperrt', { ereignis: typ, grund })
    }

    return NextResponse.json({
      ok: true,
      ereignis: typ,
      eintrag: eintrag.id,
      statusGehoben,
      gesperrt: grund,
    })
  } catch (err) {
    // Bewusst 500 und KEIN safeApiError: der Empfaenger ist Resend, kein
    // Browser. Eine Wiederholung ist hier die richtige Reaktion.
    log.errorWithException('Webhook-Verarbeitung Exception', err)
    return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen.' }, { status: 500 })
  }
})
