import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

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
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

function wrapEmail(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:20px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="60" height="60" alt="AlltagsEngel" style="border-radius:12px">
  </div>
  <div style="background:white;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
    ${content}
  </div>
  <div style="text-align:center;padding:20px 0;font-size:12px;color:#999">
    AlltagsEngel · Neue Mainzer Str. 66-68 · 60311 Frankfurt am Main<br>
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
        Mit AlltagsEngel können Sie dieses Geld ganz einfach einsetzen: für Einkaufsbegleitung,
        Arztbesuche, Gesellschaft oder Haushaltshilfe. <strong>Sie zahlen nichts aus eigener Tasche.</strong>
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://alltagsengel.care/kunde/home" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
          Jetzt Engel finden
        </a>
      </div>
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr AlltagsEngel Team</p>
    `),
  },

  day7: {
    subject: 'Ihr erster Engel wartet auf Sie, ${firstName}!',
    html: (firstName: string) => wrapEmail(`
      <h2 style="color:#1A1612;font-size:22px;margin:0 0 16px">Hallo ${firstName},</h2>
      <p style="color:#444;line-height:1.6;font-size:15px">
        Sie haben sich vor einer Woche bei AlltagsEngel registriert — großartig!
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
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr AlltagsEngel Team</p>
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
          🎁 Bonus: Empfehlen Sie AlltagsEngel weiter!
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
      <p style="color:#888;font-size:13px">Liebe Grüße,<br>Ihr AlltagsEngel Team</p>
    `),
  },
}

export async function POST() {
  try {
    const resend = getResend()
    if (!resend) {
      return NextResponse.json({ error: 'RESEND_API_KEY nicht konfiguriert' }, { status: 500 })
    }

    const now = new Date()
    let sent = { day3: 0, day7: 0, day14: 0 }

    // Alle Kunden ohne Buchung laden
    const { data: customers } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, referral_code, created_at')
      .eq('role', 'kunde')

    if (!customers || customers.length === 0) {
      return NextResponse.json({ message: 'Keine Kunden gefunden', sent })
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

      const firstName = customer.first_name || 'Kunde'

      try {
        // Tag 3 Mail
        if (daysSinceRegistration >= 3 && daysSinceRegistration < 5) {
          await resend.emails.send({
            from: 'AlltagsEngel <info@alltagsengel.care>',
            to: customer.email,
            subject: templates.day3.subject,
            html: templates.day3.html(firstName),
          })
          sent.day3++
        }

        // Tag 7 Mail
        if (daysSinceRegistration >= 7 && daysSinceRegistration < 9) {
          await resend.emails.send({
            from: 'AlltagsEngel <info@alltagsengel.care>',
            to: customer.email,
            subject: templates.day7.subject.replace('${firstName}', firstName),
            html: templates.day7.html(firstName),
          })
          sent.day7++
        }

        // Tag 14 Mail (mit Referral-Link)
        if (daysSinceRegistration >= 14 && daysSinceRegistration < 16) {
          await resend.emails.send({
            from: 'AlltagsEngel <info@alltagsengel.care>',
            to: customer.email,
            subject: templates.day14.subject.replace('${firstName}', firstName),
            html: templates.day14.html(firstName, customer.referral_code || 'ANGEL'),
          })
          sent.day14++
        }
      } catch (emailErr) {
        console.error(`Drip mail error for ${customer.email}:`, emailErr)
      }
    }

    return NextResponse.json({ success: true, sent })
  } catch (err) {
    console.error('Drip campaign error:', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
