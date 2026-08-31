// ═══════════════════════════════════════════════════════════════════════════
// POST /api/newsletter — Anmeldung zum Newsletter
//
// ── WAS SICH AM 31.08.2026 GEAENDERT HAT ───────────────────────────────────
// Diese Route trug die Adresse SOFORT in `newsletter_subscribers` ein und
// verschickte eine Willkommensmail — ein EINFACHES Opt-in. Daneben lag,
// vollstaendig gebaut, die Doppel-Opt-in-Kette
// (/api/marketing/anmeldung → Bestaetigungsmail → Token →
// /api/marketing/bestaetigung → `marketing_consents`). Die hatte KEINEN
// einzigen Aufrufer.
//
// Das Formular auf der Website rief diese Route hier. Also ging jede
// echte Anmeldung den rechtlich schwaecheren Weg, waehrend der starke
// unerreichbar danebenlag. § 7 Abs. 2 Nr. 2 UWG und BGH I ZR 164/09
// verlangen fuer Werbemail die BESTAETIGTE Einwilligung; ein Eintrag,
// den irgendwer in ein Formular getippt hat, ist keine.
//
// Und die Oberflaeche versprach das Doppelte bereits: „Bestaetigen Sie
// Ihre E-Mail — wir haben Ihnen eine Nachricht geschickt." Die Nachricht,
// die ankam, war die Willkommensmail, und es gab nichts zu bestaetigen.
//
// Seitdem laeuft diese Route ueber DENSELBEN Kern wie
// /api/marketing/anmeldung (lib/marketing/anmeldung.ts). Sie bleibt
// bestehen, statt geloescht zu werden: die oeffentliche Adresse ist
// bekannt, sie steht in ausgelieferten Seiten, und ein toter oeffentlicher
// Endpunkt waere ein zweiter Weg mit anderer Rechtsfolge — genau das
// Problem, das hier behoben wird.
//
// ── DIE ANTWORT VERRAET NICHTS ─────────────────────────────────────────────
// Ob die Adresse neu ist, gesperrt ist oder bereits eingewilligt hat: die
// Antwort ist dieselbe. Das war schon vorher so (Track 13, Befund B6) und
// bleibt es. Sonst waere dieses Formular eine Auskunft darueber, wer im
// Verteiler steht.
//
// ── WO DER VERTEILEREINTRAG JETZT ENTSTEHT ─────────────────────────────────
// Nicht mehr hier, sondern in /api/marketing/bestaetigung — nach dem Klick
// im Postfach, zusammen mit der Einwilligung. Begruendung in
// lib/marketing/abonnent.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { normalisiereAdresse } from '@/lib/newsletter/abmelde-token'
import { sendeBestaetigungsmail } from '@/lib/marketing/anmeldung'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'

const log = logger.child('newsletter')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

export const POST = withTracking(async function POST(request: Request) {
  try {
    // NIEDRIG-8 (Security-Audit 2026-08-19): ratenbegrenzt wie kontakt /
    // lead-inquiry — sonst laesst sich die Bestaetigungsmail als
    // Versandhilfe auf fremde Adressen missbrauchen.
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`newsletter:${ip}`, 5, 600_000))) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte später erneut versuchen.' }, { status: 429 })
    }

    const { email } = await request.json()
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      // Ein Eingabefehler des Absenders — hier ist eine echte Meldung
      // richtig, sie sagt nichts ueber eine dritte Person aus.
      return NextResponse.json({ error: 'Ungültige E-Mail' }, { status: 400 })
    }

    const adresse = normalisiereAdresse(email)

    // Zweite Grenze, je ADRESSE: die erste greift nur je IP. Ohne diese
    // liesse sich dieselbe Adresse von wechselnden Anschluessen mit
    // Bestaetigungsmails zuschuetten. Gleiche Werte wie in
    // /api/marketing/anmeldung — es ist derselbe Vorgang.
    if (!(await rateLimitPersistent(`marketing-anmeldung-adr:${adresse}`, 3, 86_400_000))) {
      return NextResponse.json({ success: true })
    }

    const ergebnis = await sendeBestaetigungsmail(createAdminClient(), {
      email: adresse,
      typ: 'newsletter',
      organizationId: DEFAULT_ORG_ID,
      site: SITE,
    })

    if (!ergebnis.gesendet) {
      const schwer = ergebnis.grund === 'sperrliste_unlesbar'
        || ergebnis.grund === 'bestand_unlesbar'
        || ergebnis.grund === 'kein_link'
        || ergebnis.grund === 'versand_fehlgeschlagen'
      if (schwer) {
        // Muss auffallen: die Anmeldung laeuft sonst still ins Leere.
        // Anders als frueher gibt es hier KEINE Zeile in der Datenbank,
        // die den Vorgang belegen wuerde — ohne Mail ist er verloren.
        log.errorWithException(
          `Bestätigungsmail nicht versendet (${ergebnis.grund})`,
          new Error(ergebnis.hinweis ?? ergebnis.grund),
        )
      } else {
        log.info('Keine Bestätigungsmail versendet', { grund: ergebnis.grund })
      }
    }

    // In JEDEM Fall dieselbe Antwort — auch bei einem Fehler auf unserer
    // Seite. Die Alternative waere eine Auskunft darueber, was mit dieser
    // Adresse los ist.
    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
})
