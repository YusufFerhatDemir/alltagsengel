import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('newsletter')

// ═══════════════════════════════════════════════════════════
// NEWSLETTER API — Anmeldung + Willkommens-Mail
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

export const POST = withTracking(async function POST(request: Request) {
  try {
    // NIEDRIG-8 (Security-Audit 2026-08-19): ratenbegrenzt wie kontakt /
    // lead-inquiry — sonst laesst sich die Willkommens-Mail als Versandhilfe
    // auf fremde Adressen missbrauchen.
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`newsletter:${ip}`, 5, 600_000))) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 })
    }

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
      log.errorWithException('DB Fehler', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    // Willkommens-Mail senden.
    //
    // Die Anmeldung steht schon in der Datenbank — ein Fehlschlag hier
    // darf die Antwort deshalb nicht kippen (der Absender wuerde sich
    // sonst ein zweites Mal anmelden und bekaeme 409). Er muss aber im
    // Protokoll landen: das Resend-SDK wirft bei einer Ablehnung nicht,
    // ein ungeprueftes Ergebnis sah bisher wie ein Erfolg aus.
    const willkommen = await sendRawEmail({
      to: email,
      subject: 'Willkommen beim Alltagsengel Newsletter!',
      // Idempotenz: eine zweite Anmeldung derselben Adresse prallt oben
      // an `already_subscribed` ab; der Schluessel deckt zusaetzlich den
      // Fall ab, dass zwei Aufrufe gleichzeitig durchlaufen.
      idempotenzSchluessel: `newsletter-willkommen:${String(email).toLowerCase()}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:16px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="50" height="50" alt="Alltagsengel" style="border-radius:10px">
  </div>
  <div style="background:white;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
    <h2 style="color:#1A1612;font-size:22px;margin:0 0 12px">Willkommen!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6">
      Vielen Dank für Ihre Anmeldung zum Alltagsengel Newsletter. Ab jetzt erhalten Sie:
    </p>
    <ul style="color:#444;font-size:15px;line-height:1.8;padding-left:20px">
      <li>Praktische Pflege-Tipps & Ratgeber</li>
      <li>Infos zu Entlastungsbetrag & Pflegegrad</li>
      <li>Neuigkeiten rund um Alltagsengel</li>
      <li>Exklusive Angebote & Aktionen</li>
    </ul>
    <div style="text-align:center;margin:24px 0">
      <a href="https://alltagsengel.care/blog" style="display:inline-block;background:#C9963C;color:#1A1612;padding:12px 32px;border-radius:10px;font-weight:700;text-decoration:none;font-size:15px">
        Ratgeber lesen
      </a>
    </div>
    <p style="color:#888;font-size:13px">Herzliche Grüße,<br>Ihr Alltagsengel Team</p>
  </div>
  <div style="text-align:center;padding:16px 0;font-size:11px;color:#999">
    <a href="https://alltagsengel.care/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}" style="color:#999">Abmelden</a>
  </div>
</div>
</body></html>`,
    })

    if (!willkommen.ok) {
      log.warn('Willkommens-Mail nicht versendet — Anmeldung bleibt gültig', {
        grund: willkommen.grund,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
