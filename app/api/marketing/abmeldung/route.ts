import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, escapeHtml } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { normalisiereAdresse, pruefeAbmeldeToken } from '@/lib/newsletter/abmelde-token'
import { widerrufeEinwilligung } from '@/lib/marketing/einwilligung'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'

const log = logger.child('marketing:abmeldung')

// ═══════════════════════════════════════════════════════════════════════════
// ABMELDUNG VON WERBEPOST
//
// GET  = zeigen, was passieren wird. Meldet NICHTS ab.
// POST = abmelden.
//
// ── WARUM GET NICHTS TUT ───────────────────────────────────────────────────
// Ein Link in einer Mail wird nicht nur von Menschen geoeffnet.
// Sicherheitsprodukte im Mailweg (Link-Umschreibung, Vorab-Pruefung von
// Zielen, Bild-Proxys) rufen Links beim Zustellen auf. Wer die Abmeldung an
// GET haengt, meldet Empfaenger ab, die nie geklickt haben. RFC 8058
// verlangt fuer die Ein-Klick-Abmeldung aus demselben Grund POST — und
// genau diesen POST setzt der Header `List-Unsubscribe-Post` ab.
//
// ── WAS DIESE ROUTE ANDERS MACHT ALS DER NEWSLETTER-WEG ────────────────────
// /api/newsletter/unsubscribe setzt `newsletter_subscribers.active = false`.
// Das genuegt hier nicht: eine Werbeeinwilligung kann auch ohne
// Verteilerzeile bestehen. Diese Route tut deshalb DREI Dinge:
//
//   1. widerruft JEDE offene Einwilligung dieser Adresse,
//   2. setzt die Adresse auf die Sperrliste (Art. 21 Abs. 3 DSGVO — dem
//      Widerspruch ist DAUERHAFT zu entsprechen, und das geht nur, wenn
//      die Adresse gespeichert bleibt),
//   3. deaktiviert zusaetzlich die Verteilerzeile, falls es eine gibt.
//
// Schritt 2 ist der wichtigste. Ohne ihn wuerde die naechste Anmeldung
// ueber ein beliebiges Formular den Widerruf aufheben.
//
// ── DAS TOKEN ──────────────────────────────────────────────────────────────
// Dasselbe HMAC wie beim Newsletter (lib/newsletter/abmelde-token.ts): ohne
// Ablauf, beliebig oft benutzbar. Ein Abmeldelink muss noch in einer zwei
// Jahre alten Mail funktionieren — Art. 21 DSGVO verbietet, den Widerspruch
// zu erschweren.
//
// Ohne gueltiges Token gibt es keine Abmeldung UND keine Auskunft darueber,
// ob die Adresse ueberhaupt bei uns steht.
//
// ── DIE ORGANISATION ───────────────────────────────────────────────────────
// Werbepost geht heute ausschliesslich von der Stamm-Organisation aus (die
// oeffentliche Website gehoert ihr, und aus profiles laesst sich kein
// Mandant ableiten). Die Abmeldung wirkt deshalb dort. Kaeme je ein zweiter
// werbender Mandant hinzu, muesste das Token die Organisation mittragen —
// sonst meldete ein Link von Mandant B in Mandant A ab.
// ═══════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTML = { 'Content-Type': 'text/html; charset=utf-8' } as const

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

export const GET = withTracking(async function GET(request: Request) {
  const { email, token } = await leseEingang(request)

  if (!email || !pruefeAbmeldeToken(email, token)) {
    return new NextResponse(seite('Abmeldelink ungültig', UNGUELTIG, false), {
      status: 400,
      headers: HTML,
    })
  }

  return new NextResponse(bestaetigungsSeite(email, token), { status: 200, headers: HTML })
})

export const POST = withTracking(async function POST(request: Request) {
  const ip = getClientIp(request)
  // Auch mit Token gehoert eine Grenze davor: sie begrenzt, wie schnell
  // jemand mit einer Liste erbeuteter Links arbeiten koennte.
  if (!(await rateLimitPersistent(`marketing-abmeldung:${ip}`, 20, 600_000))) {
    return new NextResponse(
      seite('Zu viele Anfragen', 'Bitte versuchen Sie es in einigen Minuten erneut.', false),
      { status: 429, headers: HTML },
    )
  }

  const { email, token } = await leseEingang(request)

  if (!email || !pruefeAbmeldeToken(email, token)) {
    return new NextResponse(seite('Abmeldelink ungültig', UNGUELTIG, false), {
      status: 400,
      headers: HTML,
    })
  }

  try {
    const supabase = createAdminClient()

    // 1+2) Einwilligungen widerrufen UND sperren. Beides in einem Schritt,
    //      Begruendung im Kopf.
    const ergebnis = await widerrufeEinwilligung(supabase, DEFAULT_ORG_ID, email, 'alle', 'abmeldung')

    if (!ergebnis.ok) {
      log.errorWithException('Abmeldung fehlgeschlagen', new Error(ergebnis.grund))
      return new NextResponse(
        seite(
          'Abmeldung fehlgeschlagen',
          'Bitte versuchen Sie es erneut oder schreiben Sie uns an info@alltagsengel.care. ' +
            'Wir melden Sie dann von Hand ab.',
          false,
        ),
        { status: 500, headers: HTML },
      )
    }

    // 3) Verteilerzeile deaktivieren, falls vorhanden. `.select()` ist der
    //    Wirkungsnachweis; ein Treffer-Null ist hier KEIN Fehler (nicht
    //    jede Adresse steht im Newsletter-Verteiler).
    const { error: verteilerFehler } = await supabase
      .from('newsletter_subscribers')
      .update({ active: false, unsubscribed_at: new Date().toISOString() })
      .eq('email', email)
      .select('id')

    if (verteilerFehler) {
      // Der Widerspruch steht bereits (Sperrliste). Der Verteiler ist die
      // schwaechere Stelle — protokollieren, aber die Person hat ihr Ziel
      // erreicht: die Sperrliste haelt jeden Versand auf.
      log.warn('Verteilerzeile nicht deaktiviert — Sperrliste greift trotzdem', {
        grund: verteilerFehler.message,
      })
    }

    if (ergebnis.widerrufen === 0 && !ergebnis.gesperrt) {
      // Weder eine Einwilligung noch ein neuer Sperreintrag: die Adresse
      // stand schon auf der Liste. Fuer die Person dasselbe Ergebnis.
      log.info('Abmeldung ohne neue Wirkung — Adresse war bereits gesperrt')
    }

    return new NextResponse(
      seite(
        'Abmeldung erfolgreich',
        'Sie wurden abgemeldet und erhalten keine Werbe-E-Mails mehr von uns. ' +
          'Rechnungen, Terminbestätigungen und andere Nachrichten zu bestehenden Verträgen ' +
          'bekommen Sie weiterhin — dafür ist keine Einwilligung nötig, und ohne sie könnten ' +
          'wir unsere vertraglichen Pflichten nicht erfüllen.',
        true,
      ),
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

// ── Seiten ────────────────────────────────────────────────────────────────

const UNGUELTIG =
  'Dieser Abmeldelink ist unvollständig oder gehört nicht zu dieser Adresse. Bitte öffnen Sie ' +
  'den Link direkt aus unserer E-Mail — oder schreiben Sie uns an info@alltagsengel.care, ' +
  'wir melden Sie dann ab.'

function bestaetigungsSeite(email: string, token: string): string {
  return rahmen(
    'Werbe-E-Mails abbestellen — Alltagsengel',
    `<div class="card">
    <div class="icon">✉</div>
    <h1>Werbe-E-Mails abbestellen</h1>
    <p>Möchten Sie <strong>${escapeHtml(email)}</strong> von unseren Werbe-E-Mails abmelden?</p>
    <p class="klein">Nachrichten zu bestehenden Verträgen — Rechnungen, Terminbestätigungen —
    erhalten Sie weiterhin.</p>
    <form method="post" action="/api/marketing/abmeldung">
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
      border-radius: 20px; padding: 40px; max-width: 460px; text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { color: #8A8279; font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    p strong { color: #F5F0E8; }
    .klein { font-size: 13px; }
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
