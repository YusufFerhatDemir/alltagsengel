import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// NEWSLETTER API — Anmeldung + Willkommens-Mail
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Ungültige E-Mail' }, { status: 400 })
    }

    // Prüfe ob bereits angemeldet
    const { data: existing } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Bereits angemeldet', code: 'already_subscribed' }, { status: 409 })
    }

    // In DB speichern
    const { error: dbError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert({ email: email.toLowerCase(), source: 'website' })

    if (dbError) {
      console.error('[Newsletter] DB Fehler:', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    // Willkommens-Mail senden
    const key = process.env.RESEND_API_KEY
    if (key) {
      const resend = new Resend(key)
      await resend.emails.send({
        from: 'AlltagsEngel <info@alltagsengel.care>',
        to: email,
        subject: 'Willkommen beim AlltagsEngel Newsletter!',
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:16px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="50" height="50" alt="AlltagsEngel" style="border-radius:10px">
  </div>
  <div style="background:white;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
    <h2 style="color:#1A1612;font-size:22px;margin:0 0 12px">Willkommen!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6">
      Vielen Dank für Ihre Anmeldung zum AlltagsEngel Newsletter. Ab jetzt erhalten Sie:
    </p>
    <ul style="color:#444;font-size:15px;line-height:1.8;padding-left:20px">
      <li>Praktische Pflege-Tipps & Ratgeber</li>
      <li>Infos zu Entlastungsbetrag & Pflegegrad</li>
      <li>Neuigkeiten rund um AlltagsEngel</li>
      <li>Exklusive Angebote & Aktionen</li>
    </ul>
    <div style="text-align:center;margin:24px 0">
      <a href="https://alltagsengel.care/blog" style="display:inline-block;background:#C9963C;color:#1A1612;padding:12px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">
        Ratgeber lesen
      </a>
    </div>
    <p style="color:#888;font-size:13px">Herzliche Grüße,<br>Ihr AlltagsEngel Team</p>
  </div>
  <div style="text-align:center;padding:16px 0;font-size:11px;color:#999">
    <a href="https://alltagsengel.care/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}" style="color:#999">Abmelden</a>
  </div>
</div>
</body></html>`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Newsletter] Fehler:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
