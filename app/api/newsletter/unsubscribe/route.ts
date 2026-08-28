import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, escapeHtml } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { normalisiereAdresse, pruefeAbmeldeToken } from '@/lib/newsletter/abmelde-token'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('newsletter')

// ═══════════════════════════════════════════════════════════════════════
// NEWSLETTER ABMELDUNG (Track 13, Befund B3)
// ═══════════════════════════════════════════════════════════════════════
//
// GET  = zeigen, was passieren wird. Meldet NICHTS ab.
// POST = abmelden.
//
// Warum diese Trennung: ein GET-Link in einer Mail wird auch von
// Automaten geoeffnet (Link-Vorabpruefung im Mailweg, Bild-Proxys,
// Link-Umschreibung). Wer die Abmeldung an GET haengt, meldet Empfaenger
// ab, die nie geklickt haben. RFC 8058 verlangt fuer die Ein-Klick-
// Abmeldung aus demselben Grund POST. Die Herleitung im Ganzen steht in
// lib/newsletter/abmelde-token.ts.
//
// Beide Wege verlangen ein gueltiges Token. Ohne Token gibt es keine
// Abmeldung — und auch keine Auskunft darueber, ob die Adresse ueberhaupt
// im Verteiler steht.
//
// ALTLINKS: Mails, die vor dieser Aenderung verschickt wurden, tragen
// `?email=` ohne Token und funktionieren nicht mehr. Das ist vertretbar,
// weil `newsletter_subscribers` am 28.08.2026 live NULL Zeilen fuehrt —
// es gibt keinen Empfaenger, dessen Altlink hier auflaufen koennte. Waere
// der Verteiler belegt, waere der richtige Weg ein Uebergangsfenster, in
// dem tokenlose Links noch die Bestaetigungsseite erreichen.
// ═══════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTML = { 'Content-Type': 'text/html; charset=utf-8' } as const

/** Adresse + Token aus Query (GET) oder Formular/JSON (POST). */
async function leseEingang(request: Request): Promise<{ email: string; token: string }> {
  const { searchParams } = new URL(request.url)
  let email = searchParams.get('email') || ''
  let token = searchParams.get('token') || ''

  if (request.method === 'POST') {
    const typ = request.headers.get('content-type') || ''
    if (typ.includes('application/json')) {
      const rumpf = await request.json().catch(() => null)
      email = String(rumpf?.email ?? email)
      token = String(rumpf?.token ?? token)
    } else {
      const formular = await request.formData().catch(() => null)
      if (formular) {
        email = String(formular.get('email') ?? email)
        token = String(formular.get('token') ?? token)
      }
    }
  }

  return { email: normalisiereAdresse(email), token: String(token) }
}

/**
 * GET — Bestaetigungsseite. Aendert nichts.
 */
export const GET = withTracking(async function GET(request: Request) {
  const { email, token } = await leseEingang(request)

  if (!email || !pruefeAbmeldeToken(email, token)) {
    return new NextResponse(
      seite(
        'Abmeldelink ungültig',
        'Dieser Abmeldelink ist unvollständig oder gehört nicht zu dieser Adresse. Bitte öffnen Sie den Link direkt aus unserer E-Mail — oder schreiben Sie uns an info@alltagsengel.care, wir melden Sie dann ab.',
        false,
      ),
      { status: 400, headers: HTML },
    )
  }

  return new NextResponse(bestaetigungsSeite(email, token), { status: 200, headers: HTML })
})

/**
 * POST — fuehrt die Abmeldung aus.
 */
export const POST = withTracking(async function POST(request: Request) {
  const ip = getClientIp(request)
  // Der Endpunkt schreibt mit dem Dienstschluessel. Auch mit Token gehoert
  // eine Grenze davor: sie begrenzt, wie schnell jemand mit einer Liste
  // erbeuteter Links arbeiten koennte.
  if (!(await rateLimitPersistent(`newsletter-abmeldung:${ip}`, 20, 600_000))) {
    return new NextResponse(
      seite('Zu viele Anfragen', 'Bitte versuchen Sie es in einigen Minuten erneut.', false),
      { status: 429, headers: HTML },
    )
  }

  const { email, token } = await leseEingang(request)

  if (!email || !pruefeAbmeldeToken(email, token)) {
    return new NextResponse(
      seite(
        'Abmeldelink ungültig',
        'Dieser Abmeldelink ist unvollständig oder gehört nicht zu dieser Adresse. Bitte öffnen Sie den Link direkt aus unserer E-Mail — oder schreiben Sie uns an info@alltagsengel.care, wir melden Sie dann ab.',
        false,
      ),
      { status: 400, headers: HTML },
    )
  }

  try {
    // Der Admin-Client wird HIER erzeugt, nicht im Modul-Scope: ein
    // Modul-Scope-Client wird beim Laden der Datei gebaut, also auch in
    // Umgebungen ohne Schluessel (Tests, Build).
    const supabaseAdmin = createAdminClient()

    // `.select('id')` ist der Wirkungsnachweis. Ohne ihn meldet PostgREST
    // keinen Fehler, wenn NULL Zeilen getroffen wurden — die Seite sagte
    // frueher „erfolgreich abgemeldet", ohne dass etwas geschehen war.
    const { data, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({ active: false, unsubscribed_at: new Date().toISOString() })
      .eq('email', email)
      .select('id')

    if (error) {
      log.errorWithException('Abmeldung Fehler', error)
      return new NextResponse(
        seite('Abmeldung fehlgeschlagen', 'Bitte versuchen Sie es erneut oder schreiben Sie uns an info@alltagsengel.care.', false),
        { status: 500, headers: HTML },
      )
    }

    if (!data || data.length === 0) {
      // Das Token war gueltig, aber es gibt keine Zeile. Fuer die Person
      // ist das Ergebnis dasselbe — sie bekommt nichts mehr. Deshalb die
      // gleiche Erfolgsmeldung, aber ein Protokolleintrag, damit ein
      // stiller Treffer-Null nicht unbemerkt zum Dauerzustand wird.
      log.warn('Abmeldung ohne getroffene Zeile (Adresse nicht im Verteiler)')
    }

    return new NextResponse(
      seite('Abmeldung erfolgreich', 'Sie wurden erfolgreich abgemeldet und erhalten keine weiteren Newsletter von uns.', true),
      { status: 200, headers: HTML },
    )
  } catch (err) {
    log.errorWithException('Abmeldung Exception', err)
    return new NextResponse(
      seite('Serverfehler', 'Bitte versuchen Sie es später erneut.', false),
      { status: 500, headers: HTML },
    )
  }
})

// ── Seiten ────────────────────────────────────────────────────────────

/**
 * Bestaetigungsseite: ein Formular, das per POST auf denselben Pfad geht.
 * Adresse und Token werden escaped — sie stammen aus der Anfrage.
 */
function bestaetigungsSeite(email: string, token: string): string {
  return rahmen(
    'Newsletter abmelden — Alltagsengel',
    `<div class="card">
    <div class="icon">✉</div>
    <h1>Newsletter abmelden</h1>
    <p>Möchten Sie <strong>${escapeHtml(email)}</strong> vom Alltagsengel Newsletter abmelden?</p>
    <form method="post" action="/api/newsletter/unsubscribe">
      <input type="hidden" name="email" value="${escapeHtml(email)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Jetzt abmelden</button>
    </form>
    <p class="klein"><a class="schlicht" href="https://alltagsengel.care">Abbrechen und zur Startseite</a></p>
  </div>`,
  )
}

function seite(titel: string, nachricht: string, erfolg: boolean): string {
  return rahmen(
    `${titel} — Alltagsengel`,
    `<div class="card">
    <div class="icon">${erfolg ? '✓' : '✕'}</div>
    <h1>${escapeHtml(titel)}</h1>
    <p>${escapeHtml(nachricht)}</p>
    ${erfolg ? '<p class="klein">Sie können sich jederzeit wieder anmelden.</p>' : ''}
    <a href="https://alltagsengel.care">Zur Startseite</a>
  </div>`,
  )
}

function rahmen(titel: string, inhalt: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(titel)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1A1612; color: #F5F0E8; min-height: 100vh;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px; padding: 40px; max-width: 440px; text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { color: #8A8279; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    p strong { color: #F5F0E8; }
    .klein { font-size: 13px; margin-bottom: 0; }
    a, button {
      display: inline-block; background: #C9963C; color: #1A1612;
      padding: 12px 28px; border-radius: 10px; font-weight: 700; font-size: 14px;
      text-decoration: none; border: none; cursor: pointer; font-family: inherit;
    }
    a:hover, button:hover { opacity: 0.9; }
    a.schlicht { background: none; color: #8A8279; padding: 0; font-weight: 400; text-decoration: underline; }
  </style>
</head>
<body>
  ${inhalt}
</body>
</html>`
}
