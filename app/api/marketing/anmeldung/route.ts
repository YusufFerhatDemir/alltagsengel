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
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { normalisiereAdresse, istPlausibleAdresse } from '@/lib/marketing/einwilligung'
import { istConsentTyp } from '@/lib/marketing/doppel-opt-in'
import { sendeBestaetigungsmail } from '@/lib/marketing/anmeldung'
import { type ConsentTyp } from '@/lib/marketing/typen'

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

    // Der Kern steht seit dem 31.08.2026 in lib/marketing/anmeldung.ts —
    // dieselbe Fachlogik bedient jetzt auch /api/newsletter, das vorher
    // ein EINFACHES Opt-in war. Zwei oeffentliche Anmeldewege mit
    // verschiedener Rechtsfolge waren der eigentliche Befund.
    const ergebnis = await sendeBestaetigungsmail(createAdminClient(), {
      email, typ, organizationId: DEFAULT_ORG_ID, site: SITE,
    })

    // Nach aussen bleibt die Antwort in JEDEM Fall dieselbe. Nur das
    // Protokoll unterscheidet.
    if (!ergebnis.gesendet) {
      const schwer = ergebnis.grund === 'sperrliste_unlesbar'
        || ergebnis.grund === 'bestand_unlesbar'
        || ergebnis.grund === 'kein_link'
      if (schwer) {
        log.errorWithException(
          `Bestätigungsmail nicht versendet (${ergebnis.grund})`,
          new Error(ergebnis.hinweis ?? ergebnis.grund),
        )
      } else {
        log.info('Keine Bestätigungsmail versendet', { grund: ergebnis.grund })
      }
    }

    return NextResponse.json(ANTWORT)
  } catch (err) {
    return safeApiError(err, request)
  }
})
