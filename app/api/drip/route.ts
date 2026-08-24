import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { escapeHtml } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { logger } from '@/lib/logger'
const log = logger.child('api:drip')

// ═══════════════════════════════════════════════════════════
// DRIP E-MAIL KAMPAGNE — Automatische Follow-Up Mails
// ═══════════════════════════════════════════════════════════
// Wird per Cron-Job (z.B. täglich) aufgerufen.
// Sendet gestaffelte E-Mails an User die sich registriert
// aber noch keine Buchung gemacht haben.
//
// Tag 1: Willkommen (wird schon bei Register gesendet)
// Tag 3: "Wusstest du? 131€/Monat von der Pflegekasse"
// Tag 7: "Dein erster Engel wartet auf dich"
// Tag 14: "Letzte Erinnerung + Referral-Bonus"
//
// GENAU EIN TAG JE STUFE. Die Fenster waren zwei Tage breit
// (`>= 3 && < 5`), der Cron laeuft aber taeglich — jede Stufe ging
// dadurch ZWEIMAL an denselben Kunden. Ein Vergleich auf den exakten
// Tag sendet einmal; der Idempotenzschluessel je Kunde und Stufe
// faengt zusaetzlich einen doppelten Cron-Aufruf am selben Tag ab.
// Preis dieser Wahl: ein ausgefallener Cron-Lauf laesst die Mail dieses
// Tages aus, statt sie zu verdoppeln. Ein uebersprungener Werbetext ist
// harmloser als zwei identische im Postfach.
//
// Es gibt bewusst keinen Zustand in der Datenbank — Absendetag und
// Registrierungsdatum reichen. Waere ein Nachholen gewuenscht, braeuchte
// es eine eigene Tabelle; Idempotenz allein loest das nicht.
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

/** Stufen der Kampagne: Tage seit Registrierung. */
const STUFEN = { day3: 3, day7: 7, day14: 14 } as const

function wrapEmail(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:20px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="60" height="60" alt="Alltagsengel" style="border-radius:12px">
  </div>
  <div style="background:white;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    ${content}
  </div>
  <div style="text-align:center;padding:20px 0;font-size:12px;color:#999">
    Alltagsengel · Neue Mainzer Straße 66-68 · 60311 Frankfurt am Main<br>
    <a href="https://alltagsengel.care/datenschutz" style="color:#C9963C">Datenschutz</a>
  </div>
</div>
</body></html>`
}

// ═══ E-Mail Templates ═══
const templates = {
  day3: {
    subject: '131 € im Monat — nutzen Sie schon Ihren Entlastungsbetrag?',
    html: (firstName: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">Hallo ${firstName},</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        wussten Sie, dass Ihnen mit einem Pflegegrad <strong>131 € pro Monat</strong> für Alltagshilfe zustehen?
        Das ist der sogenannte <strong>Entlastungsbetrag nach §45b SGB XI</strong> — und viele Menschen nutzen ihn nicht.
      </p>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Mit Alltagsengel können Sie dieses Geld ganz einfach einsetzen: für Einkaufsbegleitung,
        Arztbesuche, Gesellschaft oder Haushaltshilfe. <strong>Sie zahlen nichts aus eigener Tasche.</strong>
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/home" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Jetzt Engel finden
        </a>
      </div>
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr Alltagsengel Team</p>
    `),
  },

  day7: {
    subject: 'Ihr erster Engel wartet auf Sie, ${firstName}!',
    html: (firstName: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">Hallo ${firstName},</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Sie haben sich vor einer Woche bei Alltagsengel registriert — großartig!
        Aber wir haben bemerkt, dass Sie noch keine Buchung gemacht haben.
      </p>
      <p style="color:#444;line-height:1.6;font-size:15px">
        In Ihrer Region gibt es bereits <strong>zertifizierte Alltagsbegleiter</strong>, die sofort für Sie da sein können.
        Eine Buchung dauert nur 2 Minuten:
      </p>
      <ol style="color:#444;line-height:1.8;font-size:15px">
        <li>Service wählen (Einkauf, Arzt, Gesellschaft...)</li>
        <li>Wunschtermin angeben</li>
        <li>Engel wird automatisch zugewiesen</li>
      </ol>
      <p style="color:#444;line-height:1.6;font-size:15px">
        <strong>Die Pflegekasse übernimmt die Kosten</strong> — Sie zahlen 0 €.
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/buchen" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Erste Buchung starten
        </a>
      </div>
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr Alltagsengel Team</p>
    `),
  },

  day14: {
    subject: 'Letzte Erinnerung: 131€/Monat verfallen sonst, ${firstName}',
    html: (firstName: string, referralCode: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">Hallo ${firstName},</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Ihr Entlastungsbetrag von <strong>131 € pro Monat</strong> verfällt, wenn Sie ihn nicht nutzen.
        Nicht genutztes Guthaben kann teilweise ins nächste Halbjahr übertragen werden —
        aber warum warten?
      </p>
      <div style="background:#F7F2EA;border-radius:12px;padding:20px;margin:20px 0;border-left:4px solid #C9963C">
        <p style="margin:0;color:#1A1612;font-size:15px;font-weight:600">
          🎁 Bonus: Empfehlen Sie Alltagsengel weiter!
        </p>
        <p style="margin:8px 0 0;color:#444;font-size:14px">
          Teilen Sie Ihren persönlichen Empfehlungslink und Sie erhalten <strong>20 € Guthaben</strong>,
          wenn sich jemand registriert und die erste Buchung abschließt.
        </p>
        <p style="margin:12px 0 0">
          <a href="https://alltagsengel.care/?ref=${referralCode}" style="color:#C9963C;font-weight:600;font-size:14px">
            Ihr Link: alltagsengel.care/?ref=${referralCode}
          </a>
        </p>
      </div>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/buchen" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Jetzt Buchung starten
        </a>
      </div>
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr Alltagsengel Team</p>
    `),
  },
}

export async function POST(request: Request) {
  // ═══ AUTH: Massen-Mail-Versand nur mit CRON_SECRET auslösbar ═══
  // Vorher: KEIN Auth-Check → jeder Anonyme konnte die komplette Drip-Kampagne
  // (alle Kunden) auslösen + Namen/Registrierungsdaten/Referral-Codes abgreifen.
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY nicht konfiguriert' }, { status: 500 })
    }

    const now = new Date()
    const sent = { day3: 0, day7: 0, day14: 0 }
    const fehlgeschlagen = { day3: 0, day7: 0, day14: 0 }

    // Alle Kunden ohne Buchung laden
    const { data: customers } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, referral_code, created_at')
      .eq('role', 'kunde')

    if (!customers || customers.length === 0) {
      return NextResponse.json({ message: 'Keine Kunden gefunden', sent, fehlgeschlagen })
    }

    // Kunden mit Buchungen identifizieren
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('customer_id')

    const customersWithBookings = new Set(bookings?.map(b => b.customer_id) || [])

    for (const customer of customers) {
      // Skip wenn schon gebucht hat
      if (customersWithBookings.has(customer.id)) continue
      if (!customer.email) continue

      const daysSinceRegistration = Math.floor(
        (now.getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      // first_name ist vom User bei der Registrierung frei wählbar → für den
      // Subject nur Zeilenumbrüche/Länge kappen (Header-Injection), für den
      // HTML-Body zusätzlich HTML-escapen (Output-Encoding).
      const firstNameSubject = (customer.first_name || 'Kunde').replace(/[\r\n]+/g, ' ').slice(0, 80)
      const firstName = escapeHtml(firstNameSubject)
      const referralCode = escapeHtml((customer.referral_code || 'ANGEL').replace(/[\r\n]+/g, ' ').slice(0, 40))

      // Ergebnis wird geprueft: das Resend-SDK wirft bei einer Ablehnung
      // nicht, sondern liefert `{ error }`. Der Zaehler zaehlte deshalb
      // bisher auch Mails mit, die der Provider abgelehnt hatte — der
      // Cron meldete Erfolge, die es nie gab.
      const stufe = async (
        name: keyof typeof STUFEN,
        subject: string,
        html: string
      ): Promise<void> => {
        if (daysSinceRegistration !== STUFEN[name]) return
        const ergebnis = await sendRawEmail({
          to: customer.email,
          subject,
          html,
          idempotenzSchluessel: `drip:${name}:${customer.id}`,
        })
        if (ergebnis.ok) {
          sent[name]++
        } else {
          fehlgeschlagen[name]++
          log.warn('Drip-Mail nicht versendet', { stufe: name, grund: ergebnis.grund })
        }
      }

      await stufe('day3', templates.day3.subject, templates.day3.html(firstName))
      await stufe(
        'day7',
        templates.day7.subject.replace('${firstName}', firstNameSubject),
        templates.day7.html(firstName)
      )
      await stufe(
        'day14',
        templates.day14.subject.replace('${firstName}', firstNameSubject),
        templates.day14.html(firstName, referralCode)
      )
    }

    return NextResponse.json({ success: true, sent, fehlgeschlagen })
  } catch (err) {
    return safeApiError(err, request)
  }
}
