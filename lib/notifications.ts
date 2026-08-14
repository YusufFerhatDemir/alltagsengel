import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { sendFCMToUser } from '@/lib/fcm'

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
  payload: NotifyPayload
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
      console.error('Notification insert error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('createNotification error:', err)
    return false
  }
}

// ─── Email Notification ───
export async function sendEmailNotification(
  to: string,
  recipientName: string,
  subject: string,
  bodyHtml: string
): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.log('RESEND_API_KEY nicht konfiguriert — E-Mail übersprungen')
    return false
  }
  try {
    const { error } = await resend.emails.send({
      from: 'Alltagsengel <info@alltagsengel.care>',
      to,
      subject,
      html: wrapEmailTemplate(recipientName, subject, bodyHtml),
    })
    if (error) {
      console.error('Resend email error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('sendEmailNotification error:', err)
    return false
  }
}

// ─── Booking: Neue Buchung → Engel benachrichtigen ───
export async function notifyAngelNewBooking(
  supabase: SupabaseClient,
  angelUserId: string,
  data: BookingNotifyData
): Promise<void> {
  const dateStr = new Date(data.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })

  // 1. In-App Notification
  await createNotification(supabase, {
    userId: angelUserId,
    type: 'booking',
    title: 'Neue Buchungsanfrage',
    body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen (${data.duration}h, ${data.amount.toFixed(2)}€).`,
    link: `/engel/buchungen`,
    data: { bookingId: data.bookingId },
  })

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
      `
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
  }).catch((err) => console.error('Web Push to angel error:', err))

  // 4. Native Push (FCM) Notification
  await sendFCMToUser(angelUserId, {
    title: 'Neue Buchungsanfrage',
    body: `${data.customerName} möchte ${data.service} am ${dateStr} um ${data.time} Uhr buchen.`,
    tag: `booking-${data.bookingId}`,
    url: '/engel/buchungen',
  }).catch((err) => console.error('FCM to angel error:', err))
}

// ─── Booking: Engel hat angenommen → Kunde benachrichtigen ───
export async function notifyCustomerBookingAccepted(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData
): Promise<void> {
  const dateStr = new Date(data.date).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: 'long', year: 'numeric' })

  // 1. In-App Notification
  await createNotification(supabase, {
    userId: customerId,
    type: 'booking',
    title: 'Buchung bestätigt!',
    body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
    link: `/kunde/bestaetigt/${data.bookingId}`,
    data: { bookingId: data.bookingId },
  })

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
      `
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
  }).catch((err) => console.error('Web Push to customer error:', err))

  // 4. Native Push (FCM) Notification
  await sendFCMToUser(customerId, {
    title: 'Buchung bestätigt!',
    body: `${data.angelName} hat Ihre Buchung für ${data.service} am ${dateStr} angenommen.`,
    tag: `booking-confirmed-${data.bookingId}`,
    url: `/kunde/bestaetigt/${data.bookingId}`,
  }).catch((err) => console.error('FCM to customer error:', err))
}

// ─── Booking: Engel hat abgelehnt → Kunde benachrichtigen ───
export async function notifyCustomerBookingDeclined(
  supabase: SupabaseClient,
  customerId: string,
  data: BookingNotifyData,
  reason?: string | null
): Promise<void> {
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
  })

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
      `
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
  }).catch((err) => console.error('Web Push to customer error:', err))

  // 4. Native Push (FCM) Notification
  await sendFCMToUser(customerId, {
    title: 'Anfrage abgelehnt',
    body: `${data.angelName} kann Ihre Anfrage für ${dateStr} leider nicht annehmen.`,
    tag: `booking-declined-${data.bookingId}`,
    url: '/kunde/home',
  }).catch((err) => console.error('FCM to customer error:', err))
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
