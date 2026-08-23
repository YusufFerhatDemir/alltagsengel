import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { sendFCMToUser } from '@/lib/fcm'
import { logger } from '@/lib/logger'
import {
  protokolliereZustellung,
  vorgangsId,
  type ZustellKontext,
} from '@/lib/notifications/delivery-log'
import { esc } from '@/lib/notifications/html'
import { PROVIDER_OHNE_ID } from '@/lib/notifications/fehlerklassen'
import {
  baueBuchungsNachricht,
  type BookingNotifyData,
  type BuchungsArt,
} from '@/lib/notifications/vorgaenge/buchung-inhalt'
const log = logger.child('notifications')

export type { ZustellKontext }
export type { BookingNotifyData, BuchungsArt }

// ─── Zustellspur ───
// Jeder Kanal nimmt optional einen ZustellKontext entgegen (Organisation,
// Vorgang, ggf. notification_id). Ist er gesetzt, wird der Versuch nach
// notification_delivery_log geschrieben — Erfolg wie Misserfolg.
//
// Der Kontext ist BEWUSST optional: die Zustellspur ist ein Protokoll und
// darf keinen bestehenden Aufrufer brechen. Ohne Kontext verhalten sich
// alle Funktionen exakt wie vorher, es wird nur nichts protokolliert.
// Neue Aufrufer sollen ihn immer mitgeben.

// ─── Types ───
export interface NotifyPayload {
  userId: string
  type: 'booking' | 'system' | 'chat' | 'payment' | 'reminder'
  title: string
  body: string
  link?: string
  data?: Record<string, unknown>
}

// ─── Email Service ───

/**
 * Absender fuer JEDE Kundenkommunikation. Nie ein persoenlicher Name —
 * siehe CLAUDE.md, Abschnitt Kundenkommunikation.
 */
export const ALLTAGSENGEL_ABSENDER = 'Alltagsengel <info@alltagsengel.care>'

/**
 * Obergrenze fuer einen einzelnen Provider-Aufruf.
 *
 * WARUM DAS NOETIG IST
 * Das Resend-SDK setzt kein eigenes Zeitlimit. Antwortet der Provider
 * nicht, haengt der Aufruf, bis die Serverless-Funktion von der
 * Plattform abgeraeumt wird — dann gibt es weder eine Protokollzeile
 * noch einen Eintrag in invoice_email_log. Die Rechnung stuende ohne
 * jede Spur da: nicht versendet, nicht fehlgeschlagen, nichts.
 *
 * 20 Sekunden liegen deutlich unter der Funktionslaufzeit und deutlich
 * ueber der ueblichen Antwortzeit von Resend (< 1 s).
 */
const RESEND_ZEITLIMIT_MS = 20_000

/**
 * Marker fuer einen Aufruf, der das Zeitlimit gerissen hat.
 *
 * 408 ist bewusst gesetzt: klassifiziereFehler() wertet ihn als
 * voruebergehend, der Vorgang wird also wiederholt statt aufgegeben.
 */
const ZEITUEBERSCHREITUNG = {
  /** Unterscheidungsmerkmal gegenueber der Provider-Antwort. */
  zeitueberschreitung: true,
  name: 'timeout',
  statusCode: 408,
  message: `Zeitüberschreitung: Resend hat innerhalb von ${RESEND_ZEITLIMIT_MS} ms nicht geantwortet`,
} as const

/**
 * Legt ein Zeitlimit ueber einen Provider-Aufruf.
 *
 * Der verlorene Aufruf wird NICHT abgebrochen — das Resend-SDK nimmt
 * kein AbortSignal entgegen. Das ist unkritisch: das SDK faengt jeden
 * Fehler selbst ab und liefert immer ein Ergebnis, es kann also keine
 * unbehandelte Ablehnung zurueckbleiben. Gegen die eigentliche Gefahr —
 * dass der Auftrag beim Provider doch noch durchlaeuft und die
 * Wiederholung eine zweite Mail erzeugt — hilft nicht das Abbrechen,
 * sondern der Idempotenzschluessel (siehe RawEmailParams).
 */
async function mitZeitlimit<T>(auftrag: Promise<T>): Promise<T | typeof ZEITUEBERSCHREITUNG> {
  let uhr: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      auftrag,
      new Promise<typeof ZEITUEBERSCHREITUNG>(auf => {
        uhr = setTimeout(() => auf(ZEITUEBERSCHREITUNG), RESEND_ZEITLIMIT_MS)
        // Ein offener Timer darf einen Batchlauf nicht am Beenden hindern.
        uhr.unref?.()
      }),
    ])
  } finally {
    if (uhr) clearTimeout(uhr)
  }
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// ─── In-App Notification ───
export async function createNotification(
  supabase: SupabaseClient,
  payload: NotifyPayload,
  zustellung?: ZustellKontext
): Promise<boolean> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link || null,
      data: payload.data || {},
    })
    if (error) {
      log.error('Notification insert error', { errorMessage: error.message })
      await protokolliere(zustellung, {
        channel: 'in_app',
        recipient: payload.userId,
        status: 'failed',
        provider: 'supabase',
        fehler: error.message,
      })
      return false
    }
    // Fuer den In-App-Kanal IST die Zeile die Zustellung — sie liegt im
    // Postfach des Empfaengers. Deshalb 'delivered' und nicht 'sent':
    // ein Wiederholungslauf soll hier nie nachlegen.
    await protokolliere(zustellung, {
      channel: 'in_app',
      recipient: payload.userId,
      status: 'delivered',
      provider: 'supabase',
    })
    return true
  } catch (err) {
    log.errorWithException('createNotification error', err)
    await protokolliere(zustellung, {
      channel: 'in_app',
      recipient: payload.userId,
      status: 'failed',
      provider: 'supabase',
      fehler: err,
    })
    return false
  }
}

/**
 * Duennes Bindeglied zur Zustellspur.
 *
 * Ohne Kontext passiert nichts — kein Datenbankzugriff, kein Log. Mit
 * Kontext wird best effort geschrieben; ein Fehler dabei bleibt folgenlos
 * fuer den Versand (siehe lib/notifications/delivery-log.ts).
 */
async function protokolliere(
  zustellung: ZustellKontext | undefined,
  eintrag: {
    channel: 'email' | 'push' | 'in_app' | 'whatsapp'
    recipient: string
    status: 'queued' | 'sent' | 'delivered' | 'failed' | 'skipped'
    provider?: 'resend' | 'web_push' | 'supabase' | 'whatsapp_api'
    providerMessageId?: string | null
    fehler?: unknown
  }
): Promise<void> {
  if (!zustellung) return
  await protokolliereZustellung({ ...zustellung, ...eintrag })
}

/**
 * Baut den Zustellkontext fuer ein Buchungs-Ereignis.
 *
 * Die correlation_id ist NICHT die booking_id: pro Buchung gehen mehrere
 * Nachrichten raus (Anfrage, Zusage, Absage) und der Idempotenzschluessel
 * ist (correlation_id, channel). Wuerden alle dieselbe ID tragen, wuerde
 * die Zusage als Dublette der Anfrage gelten. Deshalb wird pro Ereignis
 * und Empfaenger eine eigene, reproduzierbare Vorgangs-ID abgeleitet.
 */
function buchungsKontext(
  zustellung: ZustellKontext | undefined,
  ereignis: BuchungsArt,
  bookingId: string,
  empfaengerId: string
): ZustellKontext | undefined {
  if (!zustellung) return undefined
  return {
    ...zustellung,
    correlationId: zustellung.correlationId ?? vorgangsId(ereignis, bookingId, empfaengerId),
    // Ohne diese drei Angaben kann der Wiederholungslauf die Nachricht
    // nicht neu bauen — aus der correlation_id (UUID v5) laesst sich
    // nichts zurueckrechnen.
    vorgangArt: ereignis,
    vorgangRef: bookingId,
    vorgangEmpfaenger: empfaengerId,
  }
}

// ─── Email Notification ───

/**
 * Wie sendEmailNotification(), liefert aber das ausfuehrliche Ergebnis
 * statt nur `true/false`.
 *
 * Der Wiederholungslauf braucht den Unterschied: „uebersprungen, weil
 * kein Schluessel gesetzt ist" darf NICHT gegen die Versuchsobergrenze
 * zaehlen, und der Fehlertext entscheidet, ob ein weiterer Versuch
 * ueberhaupt Sinn hat (lib/notifications/fehlerklassen.ts).
 */
export async function sendEmailNotificationErgebnis(
  to: string,
  recipientName: string,
  subject: string,
  bodyHtml: string,
  zustellung?: ZustellKontext
): Promise<RawEmailErgebnis> {
  return sendRawEmail({
    to,
    subject,
    html: wrapEmailTemplate(recipientName, subject, bodyHtml),
    zustellung,
  })
}

export async function sendEmailNotification(
  to: string,
  recipientName: string,
  subject: string,
  bodyHtml: string,
  zustellung?: ZustellKontext
): Promise<boolean> {
  const ergebnis = await sendEmailNotificationErgebnis(to, recipientName, subject, bodyHtml, zustellung)
  return ergebnis.ok
}

// ─── Email mit Anhang / freiem HTML ───

export interface RawEmailAnhang {
  filename: string
  /** Roh-Bytes; werden fuer Resend base64-kodiert. */
  content: Uint8Array | Buffer
  contentType?: string
}

export interface RawEmailParams {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
  attachments?: RawEmailAnhang[]
  /**
   * Optionaler Zustellkontext. Ist er gesetzt, landet jeder Versuch —
   * versendet, uebersprungen oder fehlgeschlagen — in
   * notification_delivery_log.
   */
  zustellung?: ZustellKontext
  /**
   * Idempotenzschluessel fuer Resend (Header `Idempotency-Key`, Fenster
   * 24 Stunden).
   *
   * WARUM DAS ZUM ZEITLIMIT GEHOERT
   * Eine Zeitueberschreitung sagt nichts darueber aus, ob der Provider
   * den Auftrag angenommen hat. Ohne Schluessel wuerde die Wiederholung
   * eine ZWEITE Rechnungsmail erzeugen; mit Schluessel erkennt Resend
   * den Auftrag wieder und liefert dieselbe Nachrichten-ID zurueck.
   *
   * Der Schluessel muss ueber alle Versuche DESSELBEN Vorgangs gleich
   * und zwischen verschiedenen Nachrichten verschieden sein. Ein
   * bewusster Nachversand („bitte nochmal schicken") laesst ihn deshalb
   * weg — dort sind zwei Mails die Absicht.
   */
  idempotenzSchluessel?: string
}

export type RawEmailErgebnis =
  | { ok: true; messageId: string }
  | { ok: false; uebersprungen: true; grund: string; statusCode?: null; fehler?: unknown }
  /**
   * `fehler` traegt das rohe Provider-Ergebnis samt statusCode. Der
   * Wiederholungslauf braucht es: aus `grund` allein (nur der
   * Meldungstext) laesst sich nicht ablesen, ob ein 422 vorlag —
   * DAUERHAFT_CODES in lib/notifications/fehlerklassen.ts liefe sonst
   * fuer den E-Mail-Kanal komplett ins Leere.
   */
  | { ok: false; uebersprungen: false; grund: string; statusCode: number | null; fehler: unknown }

/**
 * Versendet eine E-Mail mit vollstaendig selbst gebautem HTML und optionalen
 * Anhaengen. Anders als sendEmailNotification() wird hier NICHT das
 * "Hallo {name}"-Template drumherum gelegt — Rechnungen und Mahnungen
 * brauchen ihre eigene Anrede.
 *
 * Absender ist immer "Alltagsengel" (Kundenkommunikations-Regel: nie ein
 * persoenlicher Name).
 *
 * Ohne RESEND_API_KEY wird NICHT geworfen, sondern `uebersprungen: true`
 * zurueckgegeben. Der Aufrufer entscheidet dann, ob er den Vorgang trotzdem
 * als erledigt markiert — der Rechnungs- und der Mahnversand tun das
 * bewusst NICHT, damit nach dem Setzen des Keys nachversendet wird.
 */
export async function sendRawEmail(params: RawEmailParams): Promise<RawEmailErgebnis> {
  const resend = getResend()
  if (!resend) {
    log.info('RESEND_API_KEY nicht konfiguriert — E-Mail übersprungen', { subject: params.subject })
    await protokolliere(params.zustellung, {
      channel: 'email',
      recipient: params.to,
      status: 'skipped',
      provider: 'resend',
      fehler: 'RESEND_API_KEY nicht konfiguriert',
    })
    return { ok: false, uebersprungen: true, grund: 'RESEND_API_KEY nicht konfiguriert' }
  }

  /** Ein Fehlschlag geht immer denselben Weg: protokollieren, melden. */
  const gescheitert = async (
    fehler: unknown,
    grund: string,
    statusCode: number | null
  ): Promise<RawEmailErgebnis> => {
    await protokolliere(params.zustellung, {
      channel: 'email',
      recipient: params.to,
      status: 'failed',
      provider: 'resend',
      fehler,
    })
    return { ok: false, uebersprungen: false, grund, statusCode, fehler }
  }

  try {
    const antwort = await mitZeitlimit(
      resend.emails.send(
        {
          from: ALLTAGSENGEL_ABSENDER,
          to: params.to,
          subject: params.subject,
          html: params.html,
          ...(params.text ? { text: params.text } : {}),
          ...(params.replyTo ? { replyTo: params.replyTo } : {}),
          ...(params.attachments?.length
            ? {
                attachments: params.attachments.map(a => ({
                  filename: a.filename,
                  content: Buffer.from(a.content).toString('base64'),
                  ...(a.contentType ? { contentType: a.contentType } : {}),
                })),
              }
            : {}),
        },
        params.idempotenzSchluessel
          ? { idempotencyKey: params.idempotenzSchluessel }
          : undefined
      )
    )

    if ('zeitueberschreitung' in antwort) {
      log.error('Resend hat nicht rechtzeitig geantwortet', {
        subject: params.subject,
        zeitlimitMs: RESEND_ZEITLIMIT_MS,
      })
      return gescheitert(ZEITUEBERSCHREITUNG, ZEITUEBERSCHREITUNG.message, 408)
    }

    const { data, error } = antwort

    if (error) {
      log.errorWithException('Resend email error', error)
      return gescheitert(error, error.message || 'Resend-Fehler', error.statusCode ?? null)
    }

    // ── Erfolg gilt erst mit Nachrichten-ID ──
    // Die ID IST die Empfangsbestaetigung des Providers. Ohne sie waere
    // ein 'versendet' eine Behauptung: invoices.sent_at wuerde gesetzt
    // und die Rechnung nie wieder angefasst, obwohl niemand weiss, ob
    // sie rausging. Lieber ein sichtbarer Fehlschlag als eine stille
    // Falschaussage.
    if (!data?.id) {
      log.error('Resend antwortete ohne Nachrichten-ID — Versand gilt als unbestaetigt', {
        subject: params.subject,
      })
      return gescheitert(
        { name: 'unbestaetigt', statusCode: null, message: PROVIDER_OHNE_ID },
        PROVIDER_OHNE_ID,
        null
      )
    }

    await protokolliere(params.zustellung, {
      channel: 'email',
      recipient: params.to,
      status: 'sent',
      provider: 'resend',
      providerMessageId: data.id,
    })
    return { ok: true, messageId: data.id }
  } catch (err) {
    log.errorWithException('sendRawEmail error', err)
    return gescheitert(err, err instanceof Error ? err.message : String(err), null)
  }
}

// ─── Booking: Versandweg je Ereignis ───
//
// Die drei Funktionen unterscheiden sich nur noch in Ereignis und
// Empfaenger — der Text kommt aus baueBuchungsNachricht(). Genau
// dieselbe Quelle benutzt der Wiederholungslauf
// (lib/notifications/vorgaenge/buchung.ts), damit ein Nachversand nicht
// anders aussieht als der Erstversand.

async function versendeBuchungsereignis(
  supabase: SupabaseClient,
  art: BuchungsArt,
  empfaengerId: string,
  data: BookingNotifyData,
  grund: string | null,
  zustellung?: ZustellKontext
): Promise<void> {
  const spur = buchungsKontext(zustellung, art, data.bookingId, empfaengerId)
  const nachricht = baueBuchungsNachricht(art, data, grund)

  // 1. In-App
  await createNotification(supabase, {
    userId: empfaengerId,
    type: nachricht.inApp.type,
    title: nachricht.inApp.title,
    body: nachricht.inApp.body,
    link: nachricht.inApp.link,
    data: nachricht.inApp.data,
  }, spur)

  // 2. E-Mail
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', empfaengerId)
    .single()

  if (profile?.email) {
    await sendEmailNotification(
      profile.email,
      esc(profile.first_name || nachricht.email.anredeFallback),
      nachricht.email.subject,
      nachricht.email.html,
      spur
    )

    await supabase.from('notifications')
      .update({ email_sent: true })
      .eq('user_id', empfaengerId)
      .eq('data->>bookingId', data.bookingId)
      .eq('title', nachricht.inApp.title)
  }

  // 3. Web Push
  await sendPushToUser(empfaengerId, nachricht.push, spur)
    .catch((err) => log.errorWithException('Web Push error', err, { art }))

  // 4. Native Push (FCM)
  // Bewusst OHNE Zustellspur: der Kanalkatalog der Migration kennt nur
  // 'push' mit Provider 'web_push'. FCM braucht einen eigenen Provider-
  // Eintrag; bis dahin waere ein Protokolleintrag hier eine Falschaussage.
  await sendFCMToUser(empfaengerId, nachricht.fcm)
    .catch((err) => log.errorWithException('FCM error', err, { art }))
}

/** Neue Buchung → Engel benachrichtigen. */
export async function notifyAngelNewBooking(
  supabase: SupabaseClient,
  angelUserId: string,
  data: BookingNotifyData,
  zustellung?: ZustellKontext
): Promise<void> {
  await versendeBuchungsereignis(supabase, 'booking-neu', angelUserId, data, null, zustellung)
}

/** Engel hat angenommen → Kunde benachrichtigen. */
export async function notifyCustomerBookingAccepted(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData,
  zustellung?: ZustellKontext
): Promise<void> {
  await versendeBuchungsereignis(supabase, 'booking-zusage', customerId, data, null, zustellung)
}

/** Engel hat abgelehnt → Kunde benachrichtigen. */
export async function notifyCustomerBookingDeclined(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData,
  reason?: string | null,
  zustellung?: ZustellKontext
): Promise<void> {
  await versendeBuchungsereignis(supabase, 'booking-absage', customerId, data, reason ?? null, zustellung)
}

// ─── Email Template Wrapper ───
function wrapEmailTemplate(name: string, subject: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:#1A1612;">Alltags<span style="color:#C9963C;">Engel</span></span>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <p style="color:#888;font-size:13px;margin:0 0 4px;">Hallo ${name},</p>
      ${content}
    </div>
    <div style="text-align:center;margin-top:24px;font-size:11px;color:#aaa;">
      <p>Alltagsengel UG (haftungsbeschränkt) · Frankfurt am Main</p>
      <p>Diese E-Mail wurde automatisch gesendet. Bitte nicht antworten.</p>
    </div>
  </div>
</body>
</html>`
}
