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
const log = logger.child('notifications')

export type { ZustellKontext }

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

export interface BookingNotifyData {
  bookingId: string
  customerName: string
  angelName: string
  service: string
  date: string
  time: string
  duration: number
  amount: number
}

// ─── Email Service ───

/**
 * Absender fuer JEDE Kundenkommunikation. Nie ein persoenlicher Name —
 * siehe CLAUDE.md, Abschnitt Kundenkommunikation.
 */
export const ALLTAGSENGEL_ABSENDER = 'Alltagsengel <info@alltagsengel.care>'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

/**
 * HTML-Escaping fuer alles, was aus Nutzereingaben stammt (Namen,
 * Leistungsbezeichnung, Ablehnungsgrund). Ohne das kann ein Nutzer ueber
 * seinen eigenen first_name oder einen Freitext-Ablehnungsgrund HTML in
 * E-Mails injizieren, die unter der Alltagsengel-Absenderadresse an
 * ANDERE Nutzer verschickt werden (Phishing-Risiko trotz legitimen
 * Absenders). Gleiches Muster wie esc() in lib/emails/coach-bestellung.ts.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  ereignis: string,
  bookingId: string,
  empfaengerId: string
): ZustellKontext | undefined {
  if (!zustellung) return undefined
  return {
    ...zustellung,
    correlationId: zustellung.correlationId ?? vorgangsId(ereignis, bookingId, empfaengerId),
  }
}

// ─── Email Notification ───
export async function sendEmailNotification(
  to: string,
  recipientName: string,
  subject: string,
  bodyHtml: string,
  zustellung?: ZustellKontext
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    log.info('RESEND_API_KEY nicht konfiguriert — E-Mail übersprungen')
    await protokolliere(zustellung, {
      channel: 'email',
      recipient: to,
      status: 'skipped',
      provider: 'resend',
      fehler: 'RESEND_API_KEY nicht konfiguriert',
    })
    return false
  }
  try {
    const { data, error } = await resend.emails.send({
      from: ALLTAGSENGEL_ABSENDER,
      to,
      subject,
      html: wrapEmailTemplate(recipientName, subject, bodyHtml),
    })
    if (error) {
      log.errorWithException('Resend email error', error)
      await protokolliere(zustellung, {
        channel: 'email',
        recipient: to,
        status: 'failed',
        provider: 'resend',
        fehler: error,
      })
      return false
    }
    await protokolliere(zustellung, {
      channel: 'email',
      recipient: to,
      status: 'sent',
      provider: 'resend',
      providerMessageId: data?.id ?? null,
    })
    return true
  } catch (err) {
    log.errorWithException('sendEmailNotification error', err)
    await protokolliere(zustellung, {
      channel: 'email',
      recipient: to,
      status: 'failed',
      provider: 'resend',
      fehler: err,
    })
    return false
  }
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
}

export type RawEmailErgebnis =
  | { ok: true; messageId: string | null }
  | { ok: false; uebersprungen: true; grund: string }
  | { ok: false; uebersprungen: false; grund: string }

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

  try {
    const { data, error } = await resend.emails.send({
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
    })

    if (error) {
      log.errorWithException('Resend email error', error)
      await protokolliere(params.zustellung, {
        channel: 'email',
        recipient: params.to,
        status: 'failed',
        provider: 'resend',
        fehler: error,
      })
      return { ok: false, uebersprungen: false, grund: error.message || 'Resend-Fehler' }
    }

    await protokolliere(params.zustellung, {
      channel: 'email',
      recipient: params.to,
      status: 'sent',
      provider: 'resend',
      providerMessageId: data?.id ?? null,
    })
    return { ok: true, messageId: data?.id ?? null }
  } catch (err) {
    log.errorWithException('sendRawEmail error', err)
    await protokolliere(params.zustellung, {
      channel: 'email',
      recipient: params.to,
      status: 'failed',
      provider: 'resend',
      fehler: err,
    })
    return {
      ok: false,
      uebersprungen: false,
      grund: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─── Booking: Neue Buchung → Engel benachrichtigen ───
export async function notifyAngelNewBooking(
  supabase: SupabaseClient,
  angelUserId: string,
  data: BookingNotifyData,
  zustellung?: ZustellKontext
): Promise<void> {
  const spur = buchungsKontext(zustellung, 'booking-neu', data.bookingId, angelUserId)
  const dateStr = new Date(data.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })

  // 1. In-App Notification
  await createNotification(supabase, {
    userId: angelUserId,
    type: 'booking',
    title: 'Neue Buchungsanfrage',
    body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen (${data.duration}h, ${data.amount.toFixed(2)}€).`,
    link: `/engel/buchungen`,
    data: { bookingId: data.bookingId },
  }, spur)

  // 2. E-Mail
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', angelUserId)
    .single()

  if (profile?.email) {
    await sendEmailNotification(
      profile.email,
      esc(profile.first_name || 'Engel'),
      `Neue Buchungsanfrage von ${data.customerName}`,
      `
        <p>Sie haben eine neue Buchungsanfrage erhalten:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Kunde</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(data.customerName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Uhrzeit</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.time)} Uhr</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Dauer</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.duration} Stunden</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Betrag</td><td style="padding:8px 12px;font-weight:600;">${data.amount.toFixed(2)}€</td></tr>
        </table>
        <p>Bitte öffnen Sie die App, um die Anfrage anzunehmen oder abzulehnen.</p>
        <a href="https://alltagsengel.care/engel/buchungen" style="display:inline-block;padding:12px 28px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Anfrage ansehen</a>
      `,
      spur
    )

    // Mark email_sent
    await supabase.from('notifications')
      .update({ email_sent: true })
      .eq('user_id', angelUserId)
      .eq('data->>bookingId', data.bookingId)
      .eq('title', 'Neue Buchungsanfrage')
  }

  // 3. Web Push Notification
  await sendPushToUser(angelUserId, {
    title: 'Neue Buchungsanfrage',
    body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen.`,
    tag: `booking-${data.bookingId}`,
    url: '/engel/buchungen',
    actions: [
      { action: 'open', title: 'Ansehen' },
    ],
  }, spur).catch((err) => log.errorWithException('Web Push to angel error', err))

  // 4. Native Push (FCM) Notification
  // Bewusst OHNE Zustellspur: der Kanalkatalog der Migration kennt nur
  // 'push' mit Provider 'web_push'. FCM braucht einen eigenen Provider-
  // Eintrag; bis dahin waere ein Protokolleintrag hier eine Falschaussage.
  await sendFCMToUser(angelUserId, {
    title: 'Neue Buchungsanfrage',
    body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen.`,
    tag: `booking-${data.bookingId}`,
    url: '/engel/buchungen',
  }).catch((err) => log.errorWithException('FCM to angel error', err))
}

// ─── Booking: Engel hat angenommen → Kunde benachrichtigen ───
export async function notifyCustomerBookingAccepted(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData,
  zustellung?: ZustellKontext
): Promise<void> {
  const spur = buchungsKontext(zustellung, 'booking-zusage', data.bookingId, customerId)
  const dateStr = new Date(data.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })

  // 1. In-App Notification
  await createNotification(supabase, {
    userId: customerId,
    type: 'booking',
    title: 'Buchung bestätigt!',
    body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
    link: `/kunde/bestaetigt/${data.bookingId}`,
    data: { bookingId: data.bookingId },
  }, spur)

  // 2. E-Mail
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', customerId)
    .single()

  if (profile?.email) {
    await sendEmailNotification(
      profile.email,
      esc(profile.first_name || 'Kunde'),
      `${data.angelName} hat Ihre Buchung bestätigt`,
      `
        <p>Gute Nachrichten! Ihr Termin wurde bestätigt:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Engel</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${esc(data.angelName)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Uhrzeit</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.time)} Uhr</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Dauer</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${data.duration} Stunden</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Betrag</td><td style="padding:8px 12px;font-weight:600;">${data.amount.toFixed(2)}€</td></tr>
        </table>
        <div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong>Versicherungsschutz aktiv</strong><br/>
          Haftpflicht bis 5 Mio. € · Unfallversicherung · Sachschäden bis 50.000€
        </div>
        <a href="https://alltagsengel.care/kunde/bestaetigt/${data.bookingId}" style="display:inline-block;padding:12px 28px;background:#2D8F5E;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Buchung ansehen</a>
      `,
      spur
    )

    await supabase.from('notifications')
      .update({ email_sent: true })
      .eq('user_id', customerId)
      .eq('data->>bookingId', data.bookingId)
      .eq('title', 'Buchung bestätigt!')
  }

  // 3. Web Push Notification
  await sendPushToUser(customerId, {
    title: 'Buchung bestätigt!',
    body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
    tag: `booking-confirmed-${data.bookingId}`,
    url: `/kunde/bestaetigt/${data.bookingId}`,
    actions: [
      { action: 'open', title: 'Ansehen' },
    ],
  }, spur).catch((err) => log.errorWithException('Web Push to customer error', err))

  // 4. Native Push (FCM) Notification
  await sendFCMToUser(customerId, {
    title: 'Buchung bestätigt!',
    body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
    tag: `booking-confirmed-${data.bookingId}`,
    url: `/kunde/bestaetigt/${data.bookingId}`,
  }).catch((err) => log.errorWithException('FCM to customer error', err))
}

// ─── Booking: Engel hat abgelehnt → Kunde benachrichtigen ───
export async function notifyCustomerBookingDeclined(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData,
  reason?: string | null,
  zustellung?: ZustellKontext
): Promise<void> {
  const spur = buchungsKontext(zustellung, 'booking-absage', data.bookingId, customerId)
  const dateStr = new Date(data.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })
  const reasonText = reason ? ` Grund: ${reason}` : ''

  // 1. In-App Notification
  await createNotification(supabase, {
    userId: customerId,
    type: 'booking',
    title: 'Anfrage abgelehnt',
    body: `${data.angelName} kann Ihre Anfrage für ${data.service} am ${dateStr} leider nicht annehmen.${reasonText} Wir finden gerne einen anderen Engel für Sie.`,
    link: `/kunde/home`,
    data: { bookingId: data.bookingId },
  }, spur)

  // 2. E-Mail
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, first_name')
    .eq('id', customerId)
    .single()

  if (profile?.email) {
    await sendEmailNotification(
      profile.email,
      esc(profile.first_name || 'Kunde'),
      `Ihre Anfrage vom ${dateStr} konnte nicht angenommen werden`,
      `
        <p>leider kann ${esc(data.angelName)} Ihre Anfrage nicht annehmen:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;width:120px;">Leistung</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(data.service)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#888;">Datum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;color:#888;">Uhrzeit</td><td style="padding:8px 12px;">${esc(data.time)} Uhr</td></tr>
        </table>
        ${reason ? `<p style="color:#666;">Begründung: ${esc(reason)}</p>` : ''}
        <p>Das ist kein Problem — es stehen weitere Engel in Ihrer Nähe zur Verfügung. Suchen Sie einfach einen neuen Termin aus.</p>
        <a href="https://alltagsengel.care/kunde/home" style="display:inline-block;padding:12px 28px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin-top:8px;">Anderen Engel finden</a>
      `,
      spur
    )

    await supabase.from('notifications')
      .update({ email_sent: true })
      .eq('user_id', customerId)
      .eq('data->>bookingId', data.bookingId)
      .eq('title', 'Anfrage abgelehnt')
  }

  // 3. Web Push Notification
  await sendPushToUser(customerId, {
    title: 'Anfrage abgelehnt',
    body: `${data.angelName} kann Ihre Anfrage für ${dateStr} leider nicht annehmen. Jetzt anderen Engel finden.`,
    tag: `booking-declined-${data.bookingId}`,
    url: '/kunde/home',
    actions: [
      { action: 'open', title: 'Anderen Engel finden' },
    ],
  }, spur).catch((err) => log.errorWithException('Web Push to customer error', err))

  // 4. Native Push (FCM) Notification
  await sendFCMToUser(customerId, {
    title: 'Anfrage abgelehnt',
    body: `${data.angelName} kann Ihre Anfrage für ${dateStr} leider nicht annehmen.`,
    tag: `booking-declined-${data.bookingId}`,
    url: '/kunde/home',
  }).catch((err) => log.errorWithException('FCM to customer error', err))
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
