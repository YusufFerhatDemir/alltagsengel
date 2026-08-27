import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { sendRawEmail } from '@/lib/notifications'
import { getClientIp, escapeHtml } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('kontakt')

// ═══════════════════════════════════════════════════════════
// KONTAKT FORMULAR API
// ═══════════════════════════════════════════════════════════
// Sendet Kontaktanfragen als E-Mail an das Team.
// Bestätigung wird an den Absender geschickt (non-fatal).
// Schutz: Rate-Limit pro IP, Längen-Caps, HTML-Escaping.
//
// VERSANDWEG: sendRawEmail() aus lib/notifications — NICHT das
// Resend-SDK direkt. Das SDK wirft bei einer Ablehnung des Providers
// nicht, sondern liefert `{ error }` zurueck. Wer das Ergebnis nicht
// prueft, antwortet dem Absender `success: true`, obwohl die Anfrage
// nie beim Team angekommen ist — der Lead ist dann still verloren.
// sendRawEmail() prueft Fehler UND Nachrichten-ID und hat ein
// Zeitlimit.
// ═══════════════════════════════════════════════════════════

const MAX_LEN = { name: 120, email: 200, phone: 40, message: 4000 }

export const POST = withTracking(async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`kontakt:${ip}`, 5, 10 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte versuchen Sie es in einigen Minuten erneut.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { name, email, phone, message, type } = body

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
    }
    if (
      typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string' ||
      name.length > MAX_LEN.name || email.length > MAX_LEN.email ||
      (phone && String(phone).length > MAX_LEN.phone) || message.length > MAX_LEN.message
    ) {
      return NextResponse.json({ error: 'Eingabe zu lang' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Ungültige E-Mail-Adresse' }, { status: 400 })
    }

    const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'info@alltagsengel.care'
    const typeLabel = type === 'engel' ? 'Alltagsbegleiter-Bewerber' : 'Kunde/Angehöriger'

    // User-Input escapen — verhindert HTML-Injection in beide Mails
    const safeName = escapeHtml(name.trim())
    const safeEmail = escapeHtml(email.trim())
    const safePhone = phone ? escapeHtml(String(phone).trim()) : ''
    const safeMessage = escapeHtml(message.trim())

    // E-Mail an das Team — muss erfolgreich sein, sonst ist der Lead weg.
    const teamMail = await sendRawEmail({
      to: adminEmail,
      subject: `Neue Kontaktanfrage von ${name.trim().slice(0, 80)} (${typeLabel})`,
      html: `
        <h2>Neue Kontaktanfrage</h2>
        <table style="border-collapse:collapse;font-family:sans-serif">
          <tr><td style="padding:8px;font-weight:bold;color:#666">Name:</td><td style="padding:8px">${safeName}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">E-Mail:</td><td style="padding:8px"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Telefon:</td><td style="padding:8px">${safePhone || '–'}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Typ:</td><td style="padding:8px">${typeLabel}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666;vertical-align:top">Nachricht:</td><td style="padding:8px;white-space:pre-wrap">${safeMessage}</td></tr>
        </table>
      `,
    })

    if (!teamMail.ok) {
      // Bewusst 502 und kein `success: true`: der Absender soll wissen,
      // dass die Nachricht NICHT angekommen ist, statt vergeblich auf
      // eine Antwort zu warten. Der Grund geht nur ins Protokoll —
      // Provider-Details haben in der Antwort nichts zu suchen.
      log.error('Kontaktanfrage nicht zustellbar', { grund: teamMail.grund })
      return NextResponse.json(
        { error: 'Ihre Nachricht konnte gerade nicht übermittelt werden. Bitte versuchen Sie es erneut oder rufen Sie uns an: +49 178 338 28 25.' },
        { status: 502 }
      )
    }

    // Bestätigung an den Absender — Fehler hier ist NICHT fatal
    // (Team-Mail ist schon raus; sonst sähe der User "Fehler" und schickt doppelt)
    const bestaetigung = await sendRawEmail({
      to: email.trim(),
      subject: 'Ihre Anfrage bei Alltagsengel — Bestätigung',
      html: `
          <div style="max-width:560px;margin:0 auto;font-family:-apple-system,sans-serif;background:#F7F2EA;padding:24px">
            <div style="text-align:center;padding:16px 0">
              <img src="https://alltagsengel.care/icon-192x192.png" width="50" height="50" alt="Alltagsengel" style="border-radius:10px">
            </div>
            <div style="background:white;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
              <h2 style="color:#1A1612;margin:0 0 12px">Vielen Dank, ${safeName}!</h2>
              <p style="color:#444;font-size:15px;line-height:1.6">
                Wir haben Ihre Nachricht erhalten und melden uns schnellstmöglich bei Ihnen —
                in der Regel innerhalb von 24 Stunden.
              </p>
              <p style="color:#444;font-size:15px;line-height:1.6">
                Falls Sie dringende Fragen haben, erreichen Sie uns auch per WhatsApp oder Telefon:
              </p>
              <div style="background:#F7F2EA;border-radius:12px;padding:16px;margin:16px 0">
                <p style="margin:0;font-size:14px;color:#333">📞 <strong>+49 178 338 28 25</strong></p>
                <p style="margin:4px 0 0;font-size:14px;color:#333">💬 <a href="https://wa.me/491783382825" style="color:#C9963C">WhatsApp Chat</a></p>
              </div>
              <p style="color:#888;font-size:13px;margin-top:16px">
                Herzliche Grüße,<br>Ihr Team von Alltagsengel
              </p>
            </div>
          </div>
        `,
    })

    if (!bestaetigung.ok) {
      log.warn('Bestätigungs-Mail fehlgeschlagen (non-fatal)', { grund: bestaetigung.grund })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
