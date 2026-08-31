// ═══════════════════════════════════════════════════════════════════════════
// POST /api/marketing/anmeldung — Schritt 1 des Doppel-Opt-in
//
// DIESE ROUTE TRAEGT KEINE EINWILLIGUNG EIN. Sie verschickt eine
// Bestaetigungsmail an die angegebene Adresse und sonst nichts. Die
// Einwilligung entsteht erst in /api/marketing/bestaetigung, wenn der
// Empfaenger dieser Mail bestaetigt.
//
// Warum getrennt: siehe Kopf von lib/marketing/doppel-opt-in.ts. Kurz —
// jeder kann jede fremde Adresse in ein Formular tippen. Erst die
// Bestaetigung aus dem Postfach belegt, dass die Einwilligung von dort
// stammt (§ 7 Abs. 2 Nr. 2 UWG; BGH I ZR 164/09).
//
// ── DIE ANTWORT VERRAET NICHTS ─────────────────────────────────────────────
// Ob eine Adresse bereits eingewilligt hat, ob sie gesperrt ist oder ob sie
// unbekannt ist: die Antwort ist in allen drei Faellen dieselbe. Sonst
// waere dieses Formular eine Auskunftsstelle darueber, wer Kunde ist.
// Aus demselben Grund gibt es keine unterschiedlichen Statuscodes.
//
// ── WAS TROTZ GLEICHER ANTWORT UNTERSCHIEDLICH PASSIERT ────────────────────
//   gesperrt        → es geht KEINE Mail. Eine Adresse, die widersprochen
//                     hat (Art. 21 DSGVO), bekommt auch keine Einladung,
//                     doch wieder einzuwilligen. Sonst waere die Sperrliste
//                     ueber dieses Formular als Mailversand nutzbar.
//   schon dabei     → es geht KEINE Mail. Eine zweite Bestaetigung aendert
//                     nichts (UNIQUE-Index), und eine Mail „bestaetigen Sie
//                     Ihre Anmeldung" an jemanden, der bereits angemeldet
//                     ist, ist selbst unerwuenschte Post.
//   sonst           → Bestaetigungsmail.
//
// ── GRENZEN ────────────────────────────────────────────────────────────────
// Zwei Grenzen, weil zwei verschiedene Missbraeuche moeglich sind:
//   je IP      — jemand traegt viele fremde Adressen ein.
//   je Adresse — jemand laesst dieselbe Adresse mit Mails zuschuetten.
// Beide persistent (lib/rate-limit-persistent), weil auf Vercel mehrere
// Instanzen laufen und eine Zaehlung im Arbeitsspeicher dort umgehbar ist.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { sendRawEmail } from '@/lib/notifications'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { normalisiereAdresse, istPlausibleAdresse } from '@/lib/marketing/einwilligung'
import {
  bestaetigungsLink, istConsentTyp, GUELTIGKEIT_TAGE,
} from '@/lib/marketing/doppel-opt-in'
import { CONSENT_BEZEICHNUNG, type ConsentTyp } from '@/lib/marketing/typen'

const log = logger.child('marketing:anmeldung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

const IP_GRENZE = 10
const IP_FENSTER_MS = 3_600_000
const ADRESSE_GRENZE = 3
const ADRESSE_FENSTER_MS = 86_400_000

/**
 * Die eine Antwort, die es gibt. Bewusst ohne Angabe darueber, ob
 * tatsaechlich eine Mail unterwegs ist.
 */
const ANTWORT = {
  ok: true,
  hinweis:
    'Wenn diese Adresse verwendet werden kann, ist eine Bestätigungs-E-Mail unterwegs. '
    + 'Bitte öffnen Sie den Link darin — erst dann ist die Anmeldung wirksam.',
} as const

export const POST = withTracking(async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`marketing-anmeldung-ip:${ip}`, IP_GRENZE, IP_FENSTER_MS))) {
      return NextResponse.json(
        { error: 'Zu viele Anmeldeversuche. Bitte versuchen Sie es später erneut.' },
        { status: 429 },
      )
    }

    const rumpf = await request.json().catch(() => null) as {
      email?: unknown
      typ?: unknown
      name?: unknown
    } | null

    const email = normalisiereAdresse(typeof rumpf?.email === 'string' ? rumpf.email : '')
    if (!email || !istPlausibleAdresse(email)) {
      // Hier ist eine echte Fehlermeldung richtig: eine unbrauchbare
      // Adresse ist ein Eingabefehler des Absenders, keine Auskunft ueber
      // eine dritte Person.
      return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 })
    }

    const typ: ConsentTyp = istConsentTyp(rumpf?.typ) ? rumpf.typ : 'newsletter'

    if (!(await rateLimitPersistent(
      `marketing-anmeldung-adr:${email}`, ADRESSE_GRENZE, ADRESSE_FENSTER_MS,
    ))) {
      // Auch hier die neutrale Antwort: eine Meldung „zu viele Versuche fuer
      // DIESE Adresse" bestaetigte, dass die Adresse angefragt wurde.
      return NextResponse.json(ANTWORT)
    }

    const admin = createAdminClient()

    // ── Sperrliste ──────────────────────────────────────────────────────
    // Fail-closed: eine unlesbare Sperrliste ist kein Freibrief. Ohne diese
    // Pruefung ginge eine Einladung zum Wiedereinwilligen an jemanden, der
    // ausdruecklich widersprochen hat.
    const { data: sperre, error: sperrFehler } = await admin
      .from('email_suppression_list')
      .select('id')
      .eq('organization_id', DEFAULT_ORG_ID)
      .eq('email', email)
      .maybeSingle()

    if (sperrFehler) {
      log.errorWithException('Sperrliste nicht lesbar — keine Bestätigungsmail', new Error(sperrFehler.message))
      return NextResponse.json(ANTWORT)
    }
    if (sperre) {
      log.info('Anmeldung für gesperrte Adresse — keine Mail versendet')
      return NextResponse.json(ANTWORT)
    }

    // ── Schon eingewilligt? ─────────────────────────────────────────────
    const { data: bestehend, error: bestandFehler } = await admin
      .from('marketing_consents')
      .select('id')
      .eq('organization_id', DEFAULT_ORG_ID)
      .eq('email', email)
      .eq('consent_type', typ)
      .is('revoked_at', null)
      .maybeSingle()

    if (bestandFehler) {
      log.errorWithException('Einwilligungsstand nicht lesbar', new Error(bestandFehler.message))
      return NextResponse.json(ANTWORT)
    }
    if (bestehend) {
      log.info('Anmeldung für bereits eingewilligte Adresse — keine Mail versendet')
      return NextResponse.json(ANTWORT)
    }

    // ── Bestätigungsmail ────────────────────────────────────────────────
    let link: string
    try {
      ({ link } = bestaetigungsLink(email, typ, DEFAULT_ORG_ID, SITE))
    } catch (err) {
      // Fehlender Signaturschluessel. Nach aussen unveraendert — der
      // Betrieb sieht es im Protokoll.
      log.errorWithException('Bestätigungslink nicht erzeugbar', err)
      return NextResponse.json(ANTWORT)
    }

    const bezeichnung = CONSENT_BEZEICHNUNG[typ]
    const ergebnis = await sendRawEmail({
      to: email,
      subject: `Bitte bestätigen Sie Ihre Anmeldung — ${bezeichnung}`,
      html: bestaetigungsMail(bezeichnung, link),
      text:
        `Bitte bestätigen Sie Ihre Anmeldung zu: ${bezeichnung}\n\n${link}\n\n`
        + `Der Link ist ${GUELTIGKEIT_TAGE} Tage gültig. Haben Sie sich nicht angemeldet, `
        + `ignorieren Sie diese E-Mail einfach — ohne Bestätigung geschieht nichts.\n\n`
        + `Herzliche Grüße\nIhr Team von Alltagsengel`,
      // Diese Mail ist selbst KEINE Werbung, sondern die Rueckfrage zu
      // einer Anfrage. Sie traegt deshalb bewusst keinen Abmeldelink:
      // ohne Bestaetigung entsteht ohnehin nichts, wovon man sich
      // abmelden koennte.
      idempotenzSchluessel: `marketing-optin:${typ}:${email}`,
    })

    if (!ergebnis.ok) {
      log.warn('Bestätigungsmail nicht versendet', { grund: ergebnis.grund })
    }

    return NextResponse.json(ANTWORT)
  } catch (err) {
    return safeApiError(err, request)
  }
})

function bestaetigungsMail(bezeichnung: string, link: string): string {
  return `<!DOCTYPE html>
<html lang="de"><body style="margin:0;padding:24px;background:#F5F0E8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1A1612;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 16px;">Bitte bestätigen Sie Ihre Anmeldung</h1>
    <p style="line-height:1.6;margin:0 0 16px;">
      Sie haben sich für <strong>${bezeichnung}</strong> angemeldet. Damit wir sicher sein können,
      dass diese Anmeldung wirklich von Ihnen stammt, bitten wir um eine Bestätigung.
    </p>
    <p style="margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#1A1612;color:#F5F0E8;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:600;">Anmeldung bestätigen</a>
    </p>
    <p style="line-height:1.6;margin:0 0 16px;font-size:14px;color:#5A5248;">
      Der Link ist ${GUELTIGKEIT_TAGE} Tage gültig. Haben Sie sich nicht angemeldet, ignorieren Sie
      diese E-Mail einfach — ohne Bestätigung geschieht nichts, und wir speichern keine Einwilligung.
    </p>
    <p style="line-height:1.6;margin:24px 0 0;">Herzliche Grüße<br>Ihr Team von Alltagsengel</p>
  </div>
</body></html>`
}
