// ═══════════════════════════════════════════════════════════════════════════
// /api/marketing/bestaetigung — Schritt 2 des Doppel-Opt-in
//
// GET  = zeigen, was passieren wird. Traegt NICHTS ein.
// POST = einwilligen.
//
// ── WARUM GET NICHTS TUT ───────────────────────────────────────────────────
// Dieselbe Begruendung wie beim Abmeldeweg, hier aber mit umgekehrtem
// Vorzeichen und deshalb noch wichtiger: Sicherheitsprodukte im Mailweg
// (Link-Umschreibung, Vorab-Pruefung von Zielen, Bild-Proxys) rufen Links
// beim Zustellen auf. Wuerde GET die Einwilligung eintragen, waere JEDE
// Bestaetigungsmail automatisch bestaetigt — und das Doppel-Opt-in-
// Verfahren damit vollstaendig wertlos. Es saehe im Datenbestand sogar
// besser aus als ein einfaches Opt-in, ohne es zu sein.
//
// Die Bestaetigung braucht deshalb einen echten Klick auf einen Knopf.
//
// ── WAS HIER ENTSTEHT ──────────────────────────────────────────────────────
// Genau eine Zeile in marketing_consents, mit source='doppel_opt_in' und
// der IP des Bestaetigenden. Das ist der Nachweis nach Art. 7 Abs. 1 DSGVO:
// wer, wozu, wann, von wo, gegen welche Textfassung.
//
// ── DIE SPERRLISTE SCHLAEGT DAS TOKEN ──────────────────────────────────────
// `erteileEinwilligung` prueft sie erneut und weist ab. Ein gueltiger Link
// aus der Zeit vor einem Widerspruch kann den Widerspruch also nicht
// aufheben (Art. 21 Abs. 3 DSGVO).
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, escapeHtml } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { normalisiereAdresse, erteileEinwilligung } from '@/lib/marketing/einwilligung'
import { pruefeOptInToken, istConsentTyp } from '@/lib/marketing/doppel-opt-in'
import { CONSENT_BEZEICHNUNG, type ConsentTyp } from '@/lib/marketing/typen'

const log = logger.child('marketing:bestaetigung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HTML = { 'Content-Type': 'text/html; charset=utf-8' } as const

interface Eingang {
  email: string
  typ: string
  token: string
}

async function leseEingang(request: Request): Promise<Eingang> {
  const { searchParams } = new URL(request.url)
  let email = searchParams.get('email') || ''
  let typ = searchParams.get('typ') || ''
  let token = searchParams.get('token') || ''

  if (request.method === 'POST') {
    const art = request.headers.get('content-type') || ''
    if (art.includes('application/json')) {
      const rumpf = await request.json().catch(() => null)
      email = String(rumpf?.email ?? email)
      typ = String(rumpf?.typ ?? typ)
      token = String(rumpf?.token ?? token)
    } else {
      const formular = await request.formData().catch(() => null)
      if (formular) {
        email = String(formular.get('email') ?? email)
        typ = String(formular.get('typ') ?? typ)
        token = String(formular.get('token') ?? token)
      }
    }
  }

  return { email: normalisiereAdresse(email), typ: String(typ), token: String(token) }
}

/** Die Fehlerseite zum Pruefergebnis. Ein abgelaufener Link ist etwas
 *  anderes als ein gefaelschter, und die Meldung soll das sagen. */
function fehlerseite(grund: 'form' | 'abgelaufen' | 'signatur' | 'schluessel'): Response {
  if (grund === 'abgelaufen') {
    return new NextResponse(
      seite(
        'Bestätigungslink abgelaufen',
        'Dieser Link ist nicht mehr gültig. Bitte melden Sie sich erneut an — Sie bekommen dann '
        + 'einen frischen Bestätigungslink. Es ist keine Einwilligung gespeichert worden.',
        false,
      ),
      { status: 410, headers: HTML },
    )
  }
  return new NextResponse(seite('Bestätigungslink ungültig', UNGUELTIG, false), {
    status: 400,
    headers: HTML,
  })
}

export const GET = withTracking(async function GET(request: Request) {
  const { email, typ, token } = await leseEingang(request)

  const pruefung = pruefeOptInToken(email, typ, DEFAULT_ORG_ID, token)
  if (!pruefung.gueltig) return fehlerseite(pruefung.grund)

  return new NextResponse(
    bestaetigungsSeite(email, typ as ConsentTyp, token),
    { status: 200, headers: HTML },
  )
})

export const POST = withTracking(async function POST(request: Request) {
  const ip = getClientIp(request)
  // Auch mit gueltigem Token eine Grenze davor: sie begrenzt, wie schnell
  // jemand mit einer Liste erbeuteter Links arbeiten koennte.
  if (!(await rateLimitPersistent(`marketing-bestaetigung:${ip}`, 20, 600_000))) {
    return new NextResponse(
      seite('Zu viele Anfragen', 'Bitte versuchen Sie es in einigen Minuten erneut.', false),
      { status: 429, headers: HTML },
    )
  }

  const { email, typ, token } = await leseEingang(request)

  const pruefung = pruefeOptInToken(email, typ, DEFAULT_ORG_ID, token)
  if (!pruefung.gueltig) return fehlerseite(pruefung.grund)
  if (!istConsentTyp(typ)) return fehlerseite('form')

  try {
    const ergebnis = await erteileEinwilligung(createAdminClient(), {
      organizationId: DEFAULT_ORG_ID,
      email,
      consentTyp: typ,
      quelle: 'doppel_opt_in',
      // Der Nachweis nach Art. 7 Abs. 1 DSGVO: die IP des BESTAETIGENDEN,
      // nicht die des Formularausfuellers. Das ist der Unterschied, auf
      // den es im Streitfall ankommt.
      ipAdresse: ip || null,
      notiz: 'Bestätigt über Doppel-Opt-in-Link',
    })

    if (!ergebnis.ok) {
      // Der haeufigste Fall hier ist die Sperrliste — und dann ist die
      // Ablehnung richtig und die Meldung von erteileEinwilligung
      // erklaert sie bereits verstaendlich.
      log.info('Bestätigung abgelehnt', { grund: ergebnis.grund })
      return new NextResponse(
        seite('Anmeldung nicht möglich', ergebnis.grund, false),
        { status: 409, headers: HTML },
      )
    }

    return new NextResponse(
      seite(
        'Anmeldung bestätigt',
        `Vielen Dank — Ihre Anmeldung zu „${CONSENT_BEZEICHNUNG[typ]}" ist jetzt wirksam. `
        + 'Sie können sich jederzeit wieder abmelden; in jeder E-Mail steht dafür ein Link.',
        true,
      ),
      { status: 200, headers: HTML },
    )
  } catch (err) {
    log.errorWithException('Bestätigung Exception', err)
    return new NextResponse(
      seite('Serverfehler', 'Bitte versuchen Sie es später erneut.', false),
      { status: 500, headers: HTML },
    )
  }
})

// ── Seiten ────────────────────────────────────────────────────────────────

const UNGUELTIG =
  'Dieser Bestätigungslink ist unvollständig oder gehört nicht zu dieser Adresse. Bitte öffnen '
  + 'Sie den Link direkt aus unserer E-Mail — oder melden Sie sich erneut an.'

function bestaetigungsSeite(email: string, typ: ConsentTyp, token: string): string {
  return rahmen(
    'Anmeldung bestätigen — Alltagsengel',
    `<div class="card">
    <div class="icon">✉</div>
    <h1>Anmeldung bestätigen</h1>
    <p>Möchten Sie <strong>${escapeHtml(email)}</strong> für
    „${escapeHtml(CONSENT_BEZEICHNUNG[typ])}" anmelden?</p>
    <p class="klein">Erst mit diesem Klick wird die Anmeldung wirksam. Sie können sich jederzeit
    wieder abmelden.</p>
    <form method="post" action="/api/marketing/bestaetigung">
      <input type="hidden" name="email" value="${escapeHtml(email)}">
      <input type="hidden" name="typ" value="${escapeHtml(typ)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Anmeldung bestätigen</button>
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
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { line-height: 1.6; margin-bottom: 16px; opacity: 0.85; }
    .klein { font-size: 14px; opacity: 0.6; }
    button {
      background: #F5F0E8; color: #1A1612; border: 0; border-radius: 10px;
      padding: 14px 24px; font-size: 15px; font-weight: 600; cursor: pointer;
      margin: 8px 0 16px;
    }
    a { color: #F5F0E8; }
    a.schlicht { opacity: 0.6; font-size: 14px; }
  </style>
</head>
<body>${inhalt}</body>
</html>`
}
