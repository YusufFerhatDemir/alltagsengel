import { NextResponse } from 'next/server'
import { sendEmailNotification } from '@/lib/notifications'

/**
 * POST /api/auth/send-welcome
 * Sends a branded welcome email with usage guide to newly registered users via Resend.
 * Different content for Engel, Kunde, and Fahrer.
 */
export async function POST(request: Request) {
  try {
    const { email, firstName, role } = await request.json()
    if (!email) {
      return NextResponse.json({ error: 'E-Mail erforderlich' }, { status: 400 })
    }

    const name = firstName || 'Nutzer'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

    let subject = 'Willkommen bei AlltagsEngel!'
    let bodyHtml = ''

    if (role === 'engel') {
      subject = 'Willkommen als Alltagsengel!'
      bodyHtml = `
        <p style="font-size:16px;font-weight:600;color:#C9963C;margin-bottom:4px;">Herzlich willkommen als Alltagsengel!</p>
        <p>Schön, dass Sie Teil unseres Teams werden möchten. Als Alltagsengel begleiten Sie Senioren und Pflegebedürftige in ihrem Alltag — eine wertvolle und sinnstiftende Tätigkeit.</p>

        <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
          <p style="font-weight:600;color:#C9963C;margin:0 0 12px;">So funktioniert AlltagsEngel für Sie:</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;vertical-align:top;width:32px;font-size:18px;">1️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Profil vervollständigen</strong><br/><span style="color:#B8AC9C;font-size:13px;">Laden Sie Ihre Qualifikationen hoch (§45a-Zertifikat, Erste-Hilfe-Nachweis) und beschreiben Sie Ihre Erfahrung.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">2️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Freischaltung abwarten</strong><br/><span style="color:#B8AC9C;font-size:13px;">Unser Team prüft Ihre Unterlagen und schaltet Sie frei. Sie werden per E-Mail benachrichtigt.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">3️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Aufträge erhalten</strong><br/><span style="color:#B8AC9C;font-size:13px;">Sobald Kunden in Ihrer Nähe nach Begleitung suchen, erhalten Sie eine Benachrichtigung. Sie entscheiden selbst, welche Aufträge Sie annehmen.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">4️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Einsatz durchführen & vergütet werden</strong><br/><span style="color:#B8AC9C;font-size:13px;">Nach jedem Einsatz wird die Vergütung automatisch berechnet. Sie erhalten 20€/Stunde direkt auf Ihr Konto.</span></td></tr>
          </table>
        </div>

        <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
          <p style="font-weight:600;color:#C9963C;margin:0 0 10px;">Welche Leistungen bieten Sie an?</p>
          <p style="margin:0;color:#B8AC9C;font-size:13px;">Als Alltagsengel können Sie folgende Dienste anbieten:</p>
          <ul style="color:#e8e0d4;padding-left:20px;margin:10px 0;font-size:13px;">
            <li style="margin-bottom:6px;"><strong>Alltagsbegleitung</strong> — Spaziergänge, Gespräche, gemeinsame Aktivitäten</li>
            <li style="margin-bottom:6px;"><strong>Haushaltshilfe</strong> — Einkaufen, Kochen, leichte Hausarbeit</li>
            <li style="margin-bottom:6px;"><strong>Arztbegleitung</strong> — Begleitung zu Arztterminen und Therapien</li>
            <li style="margin-bottom:6px;"><strong>Behördengänge</strong> — Unterstützung bei Amts- und Behördenbesuchen</li>
            <li style="margin-bottom:6px;"><strong>Krankenfahrten</strong> — Fahrten zu Ärzten, Krankenhäusern und Therapieeinrichtungen</li>
            <li style="margin-bottom:6px;"><strong>Freizeitbegleitung</strong> — Ausflüge, Kulturveranstaltungen, Hobbys</li>
          </ul>
        </div>

        <div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong>Versicherungsschutz inklusive</strong><br/>
          <span style="font-size:13px;color:#666;">Haftpflicht bis 5 Mio. € · Unfallversicherung · Sachschäden bis 50.000€ — Sie sind bei jedem Einsatz vollständig abgesichert.</span>
        </div>

        <a href="${siteUrl}/auth/login" style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">JETZT PROFIL VERVOLLSTÄNDIGEN</a>
      `
    } else {
      // Kunde (default)
      subject = 'Willkommen bei AlltagsEngel!'
      bodyHtml = `
        <p style="font-size:16px;font-weight:600;color:#C9963C;margin-bottom:4px;">Herzlich willkommen bei AlltagsEngel!</p>
        <p>Schön, dass Sie sich für AlltagsEngel entschieden haben. Wir helfen Ihnen, den passenden Alltagsbegleiter für sich oder Ihre Angehörigen zu finden.</p>

        <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
          <p style="font-weight:600;color:#C9963C;margin:0 0 12px;">So funktioniert AlltagsEngel für Sie:</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;vertical-align:top;width:32px;font-size:18px;">1️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Engel in der Nähe finden</strong><br/><span style="color:#B8AC9C;font-size:13px;">Durchsuchen Sie zertifizierte Alltagsbegleiter in Ihrer Region. Alle Engel sind geprüft und qualifiziert.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">2️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Termin buchen</strong><br/><span style="color:#B8AC9C;font-size:13px;">Wählen Sie eine Leistung, Datum und Uhrzeit — die Buchung dauert nur 2 Minuten.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">3️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Begleitung genießen</strong><br/><span style="color:#B8AC9C;font-size:13px;">Ihr Engel kommt zur vereinbarten Zeit. Einfach zurücklehnen und die Unterstützung genießen.</span></td></tr>
            <tr><td style="padding:8px 0;vertical-align:top;font-size:18px;">4️⃣</td><td style="padding:8px 0 8px 8px;"><strong>Bequem abrechnen</strong><br/><span style="color:#B8AC9C;font-size:13px;">Mit Pflegegrad wird die Leistung über den Entlastungsbetrag (§45b SGB XI) abgerechnet — bis zu 131€/Monat von der Pflegekasse.</span></td></tr>
          </table>
        </div>

        <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
          <p style="font-weight:600;color:#C9963C;margin:0 0 10px;">Unsere Leistungen für Sie:</p>
          <ul style="color:#e8e0d4;padding-left:20px;margin:10px 0;font-size:13px;">
            <li style="margin-bottom:6px;"><strong>Alltagsbegleitung</strong> — Spaziergänge, Gespräche, Gesellschaft im Alltag</li>
            <li style="margin-bottom:6px;"><strong>Haushaltshilfe</strong> — Einkaufen, Kochen, leichte Hausarbeit</li>
            <li style="margin-bottom:6px;"><strong>Arztbegleitung</strong> — Sicher zum Arzt und wieder nach Hause</li>
            <li style="margin-bottom:6px;"><strong>Behördengänge</strong> — Unterstützung bei Ämtern und Formularen</li>
            <li style="margin-bottom:6px;"><strong>Krankenfahrten</strong> — Zuverlässige Fahrten zu Ärzten, Krankenhäusern, Dialyse, Physiotherapie und Reha-Einrichtungen</li>
            <li style="margin-bottom:6px;"><strong>Freizeitbegleitung</strong> — Ausflüge, Kino, Spaziergänge, kulturelle Veranstaltungen</li>
            <li style="margin-bottom:6px;"><strong>Pflegehilfsmittel</strong> — Bis zu 42€/Monat: Handschuhe, Desinfektionsmittel, Masken u.v.m.</li>
          </ul>
        </div>

        <div style="background:#E8F5E9;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong style="color:#2D8F5E;">Kostenübernahme durch die Pflegekasse</strong><br/>
          <span style="font-size:13px;color:#555;">Ab Pflegegrad 1 übernimmt Ihre Pflegekasse bis zu 131€/Monat für Entlastungsleistungen nach §45b SGB XI. Sie zahlen nichts aus eigener Tasche!</span>
        </div>

        <div style="background:#F0EBE0;border-radius:10px;padding:14px 18px;margin:16px 0;">
          <strong>Versicherungsschutz inklusive</strong><br/>
          <span style="font-size:13px;color:#666;">Haftpflicht bis 5 Mio. € · Unfallversicherung · Sachschäden bis 50.000€</span>
        </div>

        <a href="${siteUrl}/auth/login" style="display:inline-block;padding:14px 32px;background:#2D8F5E;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">JETZT ENGEL FINDEN</a>
      `
    }

    await sendEmailNotification(email, name, subject, bodyHtml)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-welcome error:', err)
    return NextResponse.json({ error: 'Fehler beim Senden der Willkommens-E-Mail' }, { status: 500 })
  }
}
