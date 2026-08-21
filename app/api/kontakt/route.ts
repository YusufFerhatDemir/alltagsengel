import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { Resend } from 'resend'
import { rateLimit, getClientIp, escapeHtml } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
const log = logger.child('kontakt')

// ═══════════════════════════════════════════════════════════
// KONTAKT FORMULAR API
// ═══════════════════════════════════════════════════════════
// Sendet Kontaktanfragen als E-Mail an das Team.
// Bestätigung wird an den Absender geschickt (non-fatal).
// Schutz: Rate-Limit pro IP, Längen-Caps, HTML-Escaping.
// ═══════════════════════════════════════════════════════════

const MAX_LEN = { name: 120, email: 200, phone: 40, message: 4000 }

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!rateLimit(`kontakt:${ip}`, 5, 10 * 60 * 1000)) {
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

    const key = process.env.RESEND_API_KEY
    if (!key) {
      log.error('RESEND_API_KEY nicht konfiguriert')
      return NextResponse.json({ error: 'E-Mail-Service nicht verfügbar' }, { status: 500 })
    }

    const resend = new Resend(key)
    const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'info@alltagsengel.care'
    const typeLabel = type === 'engel' ? 'Alltagsbegleiter-Bewerber' : 'Kunde/Angehöriger'

    // User-Input escapen — verhindert HTML-Injection in beide Mails
    const safeName = escapeHtml(name.trim())
    const safeEmail = escapeHtml(email.trim())
    const safePhone = phone ? escapeHtml(String(phone).trim()) : ''
    const safeMessage = escapeHtml(message.trim())

    // E-Mail an das Team — muss erfolgreich sein
    await resend.emails.send({
      from: 'Alltagsengel <info@alltagsengel.care>',
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

    // Bestätigung an den Absender — Fehler hier ist NICHT fatal
    // (Team-Mail ist schon raus; sonst sähe der User "Fehler" und schickt doppelt)
    try {
      await resend.emails.send({
        from: 'Alltagsengel <info@alltagsengel.care>',
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
    } catch (confirmErr) {
      log.errorWithException('Bestätigungs-Mail fehlgeschlagen (non-fatal)', confirmErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
}
