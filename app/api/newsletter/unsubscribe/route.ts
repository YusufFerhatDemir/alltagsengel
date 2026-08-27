import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('newsletter')

// ═══════════════════════════════════════════════════════════
// NEWSLETTER ABMELDUNG — Unsubscribe Endpoint
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

export const GET = withTracking(async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return new NextResponse(unsubPage('Ungültiger Link.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  try {
    const { error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({ active: false, unsubscribed_at: new Date().toISOString() })
      .eq('email', email.toLowerCase())

    if (error) {
      log.errorWithException('Abmeldung Fehler', error)
      return new NextResponse(unsubPage('Fehler bei der Abmeldung. Bitte versuchen Sie es erneut.', false), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return new NextResponse(unsubPage('Sie wurden erfolgreich abgemeldet.', true), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    log.errorWithException('Abmeldung Exception', err)
    return new NextResponse(unsubPage('Serverfehler. Bitte versuchen Sie es später erneut.', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
})

function unsubPage(message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Newsletter Abmeldung — Alltagsengel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1A1612;
      color: #F5F0E8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 40px;
      max-width: 440px;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { color: #8A8279; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    a {
      display: inline-block;
      background: #C9963C;
      color: #1A1612;
      padding: 12px 28px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
    }
    a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✓' : '✕'}</div>
    <h1>${success ? 'Abmeldung erfolgreich' : 'Abmeldung fehlgeschlagen'}</h1>
    <p>${message}</p>
    ${success ? '<p>Wir bedauern, Sie gehen zu sehen. Sie können sich jederzeit wieder anmelden.</p>' : ''}
    <a href="https://alltagsengel.care">Zur Startseite</a>
  </div>
</body>
</html>`
}
