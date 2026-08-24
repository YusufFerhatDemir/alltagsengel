// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anfrage aus dem Selbstzahler-Weg
//
// ZWECK: Wer den PflegeCoach nutzen möchte, aber Fragen zur Eignung
// oder zu den Konditionen hat, soll uns erreichen können, OHNE sich
// vorher zu registrieren. Es gibt bewusst keinen Checkout und keine
// Zahlungsabwicklung — die Anfrage geht als E-Mail an das Team.
//
// ═══ WAS HIER AUSDRÜCKLICH NICHT PASSIERT ══════════════════════
//  * Keine Speicherung in der Produktdatenbank. Die Route legt weder
//    `coach_users` noch irgendeinen anderen Datensatz an. Ein Interessent
//    ist noch kein Nutzer; ein stiller Vorab-Datensatz wäre eine
//    Verarbeitung ohne Einwilligung und würde die Produktgrenze
//    aufweichen (audit/dipa/datenfluesse_pflegecoach.md).
//  * Keine Gesundheitsdaten. Das Formular weist ausdrücklich darauf hin;
//    die Rolle ist eine grobe Selbstauskunft (für sich / für Angehörige),
//    kein Gesundheitsdatum. Rechtsgrundlage der Verarbeitung der
//    Kontaktdaten: Art. 6 Abs. 1 lit. b DSGVO (vorvertraglich).
//  * Keine Aussage über Kostenträger. Das Produkt wird als
//    Selbstzahler-Angebot angeboten; die Antwortmail nennt keine Beträge,
//    weil es keine freigegebene Preisliste gibt.
//
// Schutz: Rate-Limit pro IP, Längen-Caps, HTML-Escaping — identisch zum
// allgemeinen Kontaktformular (app/api/kontakt/route.ts).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { sendRawEmail } from '@/lib/notifications'
import { getClientIp, escapeHtml } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { COACH_PRODUKT_VERSION, COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { logger } from '@/lib/logger'
const log = logger.child('coach-anfrage')

const MAX_LEN = { name: 120, email: 200, telefon: 40, nachricht: 2000 }

/** Grobe Selbstauskunft — bewusst ohne Diagnose-, Pflegegrad- oder Krankheitsbezug. */
const ROLLEN: Record<string, string> = {
  fuer_mich: 'Für mich selbst',
  fuer_angehoerige: 'Für eine angehörige Person',
  beruflich: 'Beruflich / für eine Einrichtung',
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`coach-anfrage:${ip}`, 5, 10 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte versuchen Sie es in einigen Minuten erneut.' },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { name, email, telefon, nachricht, rolle, einwilligung } = body ?? {}

    if (!name || !email) {
      return NextResponse.json({ error: 'Bitte geben Sie Name und E-Mail-Adresse an.' }, { status: 400 })
    }
    // Die Einwilligung wird serverseitig geprüft, nicht nur im Formular:
    // Eine Anfrage ohne bestätigten Datenschutzhinweis dürfen wir nicht
    // verarbeiten, auch wenn sie an der Oberfläche vorbei eingeht.
    if (einwilligung !== true) {
      return NextResponse.json(
        { error: 'Bitte bestätigen Sie den Datenschutzhinweis.' },
        { status: 400 }
      )
    }
    if (
      typeof name !== 'string' || typeof email !== 'string' ||
      name.length > MAX_LEN.name || email.length > MAX_LEN.email ||
      (telefon && String(telefon).length > MAX_LEN.telefon) ||
      (nachricht && String(nachricht).length > MAX_LEN.nachricht)
    ) {
      return NextResponse.json({ error: 'Eingabe zu lang' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Bitte prüfen Sie Ihre E-Mail-Adresse.' }, { status: 400 })
    }

    const adminEmail = process.env.ADMIN_ALERT_EMAIL || COACH_SUPPORT_EMAIL

    const sicherName = escapeHtml(name.trim())
    const sicherEmail = escapeHtml(email.trim())
    const sicherTelefon = telefon ? escapeHtml(String(telefon).trim()) : ''
    const sicherNachricht = nachricht ? escapeHtml(String(nachricht).trim()) : ''
    const rolleLabel = ROLLEN[String(rolle)] ?? 'Keine Angabe'

    // An das Team — muss erfolgreich sein, sonst geht die Anfrage verloren.
    //
    // sendRawEmail() statt des Resend-SDK: das SDK wirft bei einer
    // Ablehnung nicht, sondern liefert `{ error }`. Ungeprueft haette
    // der Anfragende `gesendet: true` gesehen, waehrend die Anfrage nie
    // beim Team ankam.
    const teamMail = await sendRawEmail({
      to: adminEmail,
      subject: `PflegeCoach-Anfrage von ${name.trim().slice(0, 80)}`,
      html: `
        <h2>Neue Anfrage zum PflegeCoach</h2>
        <table style="border-collapse:collapse;font-family:sans-serif">
          <tr><td style="padding:8px;font-weight:bold;color:#666">Name:</td><td style="padding:8px">${sicherName}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">E-Mail:</td><td style="padding:8px"><a href="mailto:${sicherEmail}">${sicherEmail}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Telefon:</td><td style="padding:8px">${sicherTelefon || '–'}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Anliegen für:</td><td style="padding:8px">${escapeHtml(rolleLabel)}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666;vertical-align:top">Nachricht:</td><td style="padding:8px;white-space:pre-wrap">${sicherNachricht || '–'}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;color:#666">Produktversion:</td><td style="padding:8px">${COACH_PRODUKT_VERSION}</td></tr>
        </table>
        <p style="font-family:sans-serif;color:#666;font-size:13px">
          Selbstzahler-Anfrage. Keine Aussagen zu Kostenträgern treffen.
        </p>
      `,
    })

    if (!teamMail.ok) {
      log.error('PflegeCoach-Anfrage nicht zustellbar', { grund: teamMail.grund })
      return NextResponse.json(
        { error: 'Der Versand ist gerade nicht möglich. Bitte schreiben Sie uns an ' + COACH_SUPPORT_EMAIL + '.' },
        { status: 502 }
      )
    }

    // Bestätigung an den Absender — Fehler hier ist NICHT fatal:
    // Die Team-Mail ist bereits raus, ein Fehler würde den Absender nur zu
    // einer zweiten Anfrage verleiten.
    const bestaetigung = await sendRawEmail({
      to: email.trim(),
      subject: 'Ihre Anfrage zum PflegeCoach',
      html: `
          <div style="max-width:560px;margin:0 auto;font-family:-apple-system,sans-serif;background:#F7F2EA;padding:24px">
            <div style="background:white;border-radius:16px;padding:28px">
              <h2 style="color:#1A1612;margin:0 0 12px">Vielen Dank, ${sicherName}!</h2>
              <p style="color:#444;font-size:15px;line-height:1.6">
                Wir haben Ihre Anfrage zum PflegeCoach erhalten und melden uns bei Ihnen —
                in der Regel innerhalb von zwei Werktagen.
              </p>
              <p style="color:#444;font-size:15px;line-height:1.6">
                Zur Einordnung: Der Digitale PflegeCoach ist ein digitales Unterstützungsangebot
                für die häusliche Pflege. Er ist kein Medizinprodukt und keine Leistung der
                gesetzlichen Pflege- oder Krankenversicherung; die Nutzung erfolgt als privat zu
                zahlendes Angebot.
              </p>
              <p style="color:#888;font-size:13px;margin-top:16px">
                Herzliche Grüße<br>Ihr Team von Alltagsengel
              </p>
            </div>
          </div>
        `,
    })

    if (!bestaetigung.ok) {
      log.warn('Bestätigungsmail fehlgeschlagen (non-fatal)', { grund: bestaetigung.grund })
    }

    return NextResponse.json({ gesendet: true })
  } catch (err) {
    return safeApiError(err, request)
  }
}
