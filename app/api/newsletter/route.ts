import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { abmeldeLink, normalisiereAdresse } from '@/lib/newsletter/abmelde-token'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
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

    const adresse = normalisiereAdresse(email)

    // ── Track 13, Befund B6: kein Bestands-Orakel ────────────────────
    // Frueher antwortete diese Route mit 409 `already_subscribed`, wenn
    // die Adresse schon im Verteiler stand. Damit konnte JEDER von aussen
    // pruefen, ob eine bestimmte Person bei uns eingetragen ist — eine
    // Auskunft ueber eine dritte Person an einen Unbekannten.
    //
    // Der richtige Umgang steht seit dem 19.08.2026 nebenan in
    // /api/auth/send-reset: dort ist eine unbekannte Adresse ausdruecklich
    // ein Erfolg, mit dem Kommentar „kein Hinweis darauf, ob die Adresse
    // existiert". Zwei Wege, dieselbe Frage, zwei Antworten — hier ist die
    // zweite an die erste gezogen.
    //
    // Der Bestand wird weiter gelesen, aber nur noch fuer die
    // ENTSCHEIDUNG, ob eine Willkommensmail rausgeht. Nach aussen ist die
    // Antwort in beiden Faellen dieselbe.
    const { data: bestand, error: bestandFehler } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('id')
      .eq('email', adresse)
      .maybeSingle()

    if (bestandFehler) {
      log.errorWithException('Bestandspruefung fehlgeschlagen', bestandFehler)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    if (bestand) {
      // Schon eingetragen: nichts schreiben, keine zweite Willkommensmail,
      // und nach aussen dieselbe Antwort wie bei einer Neuanmeldung.
      return NextResponse.json({ success: true })
    }

    // In DB speichern
    const { error: dbError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert({
      // Die Stamm-Organisation steht hier AUSDRUECKLICH, statt sich auf den
      // Spalten-Default current_org_id() zu verlassen: dieser Weg laeuft mit
      // dem Dienstschluessel ohne auth.uid(), der Default faellt dann auf
      // genau diesen Wert zurueck — aber als fail-open-Rueckfall, nicht als
      // Aussage. Hier ist er eine Aussage: die oeffentliche Website gehoert
      // der Stamm-Organisation, es gibt keinen anderen Mandanten dahinter.
        organization_id: DEFAULT_ORG_ID,
        email: adresse,
        source: 'website',
      })

    if (dbError) {
      log.errorWithException('DB Fehler', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    // Willkommens-Mail senden.
    //
    // Die Anmeldung steht schon in der Datenbank — ein Fehlschlag hier
    // darf die Antwort deshalb nicht kippen. Er muss aber im Protokoll
    // landen: das Resend-SDK wirft bei einer Ablehnung nicht, ein
    // ungeprueftes Ergebnis sah bisher wie ein Erfolg aus.
    const willkommen = await sendRawEmail({
      to: adresse,
      subject: 'Willkommen beim Alltagsengel Newsletter!',
      // Idempotenz: eine zweite Anmeldung derselben Adresse endet oben
      // bei der Bestandspruefung; der Schluessel deckt zusaetzlich den
      // Fall ab, dass zwei Aufrufe gleichzeitig durchlaufen.
      idempotenzSchluessel: `newsletter-willkommen:${adresse}`,
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
    <a href="${abmeldeLink(adresse, process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care')}" style="color:#999">Abmelden</a>
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
