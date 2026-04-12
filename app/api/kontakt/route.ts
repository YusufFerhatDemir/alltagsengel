import { NextResponse } from 'next/server'
import { Resend } from 'resend'

// ═══════════════════════════════════════════════════════════
// KONTAKT FORMULAR API
// ═══════════════════════════════════════════════════════════
// Sendet Kontaktanfragen als E-Mail an das Team.
// Bestätigung wird an den Absender geschickt.
// ═══════════════════════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const { name, email, phone, message, type } = await request.json()

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
    }

    const key = process.env.RESEND_API_KEY
    if (!key) {
      console.error('[Kontakt] RESEND_API_KEY nicht konfiguriert')
      return NextResponse.json({ error: 'E-Mail-Service nicht verfügbar' }, { status: 500 })
    }

    const resend = new Resend(key)
    const adminEmail = process.env.ADMIN_ALERT_EMAIL || 'info@alltagsengel.care'
    const typeLabel = type === 'engel' ? 'Alltagsbegleiter-Bewerber' : 'Kunde/Angehöriger'

    // E-Mail an das Team
    await resend.emails.send({
      from: 'AlltagsEngel <info@alltagsengel.care>',
      to: adminEmail,
      subject: `Neue Kontaktanfrage von ${name} (${typeLabel})`,
      html: `
        <h2>Neue Kontaktanfrage</h2>
        <table style="border-collapse:collapse;font-family:sans-serif">
          <tr><td style="padding:8px;font-weight:bold;color:#666">Name:</td><td style="padding:8px">${name}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">E-Mail:</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Telefon:</td><td style="padding:8px">${phone || '–'}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Typ:</td><td style="padding:8px">${typeLabel}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666;vertical-align:top">Nachricht:</td><td style="padding:8px;white-space:pre-wrap">${message}</td></tr>
        </table>
      `,
    })

    // Bestätigung an den Absender
    await resend.emails.send({
      from: 'AlltagsEngel <info@alltagsengel.care>',
      to: email,
      subject: 'Ihre Anfrage bei AlltagsEngel — Bestätigung',
      html: `
        <div style="max-width:560px;margin:0 auto;font-family:-apple-system,sans-serif;background:#F7F2EA;padding:24px">
          <div style="text-align:center;padding:16px 0">
            <img src="https://alltagsengel.care/icon-192x192.png" width="50" height="50" alt="AlltagsEngel" style="border-radius:10px">
          </div>
          <div style="background:white;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
            <h2 style="color:#1A1612;margin:0 0 12px">Vielen Dank, ${name}!</h2>
            <p style="color:#444;font-size:15px;line-height:1.6">
              Wir haben Ihre Nachricht erhalten und melden uns schnellstmöglich bei Ihnen —
              in der Regel innerhalb von 24 Stunden.
            </p>
            <p style="color:#444;font-size:15px;line-height:1.6">
              Falls Sie dringende Fragen haben, erreichen Sie uns auch per WhatsApp oder Telefon:
            </p>
            <div style="background:#F7F2EA;border-radius:12px;padding:16px;margin:16px 0">
              <p style="margin:0;font-size:14px;color:#333">📞 <strong>+49 178 338 28 25</strong></p>
              <p style="margin:4px 0 0;font-size:14px;color:#333">💬 <a href="https://wa.me/4915678543210" style="color:#C9963C">WhatsApp Chat</a></p>
            </div>
            <p style="color:#888;font-size:13px;margin-top:16px">
              Herzliche Grüße,<br>Ihr AlltagsEngel Team
            </p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Kontakt] Fehler:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
