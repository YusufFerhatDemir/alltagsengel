import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { datumBerlin } from '@/lib/utils/timezone'
import { logger } from '@/lib/logger'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('review-cron')

// ═══════════════════════════════════════════════════════════
// CRON: AUTOMATISCHE BEWERTUNGS-ANFRAGE
// ═══════════════════════════════════════════════════════════
// Läuft täglich um 10:00 Uhr.
// Sendet Bewertungs-Emails an Kunden 2 Tage nach abgeschlossener Buchung.
// Nur wenn keine Bewertung für diese Buchung vorliegt.
//
// GENAU EIN TAG. Der Lauf griff bisher ein Zeitfenster von zwei Tagen ab
// (`date` zwischen heute-3 und heute-2). bookings.date ist ein reines
// Datum, der Lauf taeglich — jede Buchung fiel dadurch an zwei
// aufeinanderfolgenden Tagen ins Fenster und der Kunde bekam ZWEI
// identische Bewertungsanfragen. Jetzt wird auf den exakten Tag
// verglichen; der Idempotenzschluessel je Buchung faengt zusaetzlich
// einen doppelten Cron-Aufruf am selben Tag ab.
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY fehlt' }, { status: 500 })
    }

    const now = new Date()
    // bookings.date ist ein reines Datum (YYYY-MM-DD) — deshalb auf den
    // Tag genau vergleichen und in derselben Zeitzone rechnen, in der
    // die Termine erfasst werden.
    const stichtag = datumBerlin(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000))

    // Abgeschlossene Buchungen von vor genau 2 Tagen laden
    // Hinweis: bookings hat kein completed_at — wir verwenden das date-Feld
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_id, angel_id, service, date')
      .eq('status', 'completed')
      .eq('date', stichtag)

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ message: 'Keine Buchungen zum Bewerten', sent: 0 })
    }

    // Bereits bewertete Buchungen identifizieren
    const bookingIds = bookings.map(b => b.id)
    // angel_reviews, nicht reviews: die App schreibt Bewertungen seit
    // 20260318 ausschliesslich nach angel_reviews. Der Cron hat gegen die
    // leere Legacy-Tabelle geprueft und deshalb auch Kundschaft
    // angeschrieben, die laengst bewertet hatte.
    const { data: existingReviews } = await supabaseAdmin
      .from('angel_reviews')
      .select('booking_id')
      .in('booking_id', bookingIds)

    const reviewedBookingIds = new Set(existingReviews?.map(r => r.booking_id) || [])

    let sent = 0
    let fehlgeschlagen = 0
    for (const booking of bookings) {
      if (reviewedBookingIds.has(booking.id)) continue
      // Profil gelöscht → customer_id = NULL → keine Bewertungs-Email
      if (!booking.customer_id) continue

      // Kundenprofil laden
      const { data: customer } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name')
        .eq('id', booking.customer_id)
        .single()

      if (!customer?.email) continue

      // Engelprofil laden
      const { data: angel } = await supabaseAdmin
        .from('profiles')
        .select('first_name')
        .eq('id', booking.angel_id)
        .single()

      // Vornamen sind frei waehlbar: fuer den Betreff nur Umbrueche und
      // Laenge kappen (Header-Injection), fuer den HTML-Text zusaetzlich
      // escapen — sonst laesst sich ueber den eigenen Profilnamen HTML in
      // eine Mail einschleusen, die unter der Alltagsengel-Adresse an
      // einen ANDEREN Nutzer geht.
      const angelNameBetreff = (angel?.first_name || 'Ihrem Engel').replace(/[\r\n]+/g, ' ').slice(0, 80)
      const customerName = esc((customer.first_name || 'Kunde').slice(0, 80))
      const angelName = esc(angelNameBetreff)
      const serviceName = esc(String(booking.service || 'Alltagsbegleitung').slice(0, 120))
      // Die Bewertungsseite ist eine dynamische Route (/kunde/bewertung/[id]),
      // kein Query-Parameter — der alte Link lief in einen 404.
      const reviewUrl = `https://alltagsengel.care/kunde/bewertung/${booking.id}`

      const ergebnis = await sendRawEmail({
        to: customer.email,
        subject: `Wie war Ihr Termin mit ${angelNameBetreff}?`,
        // Ein zweiter Lauf am selben Tag erzeugt keine zweite Anfrage.
        idempotenzSchluessel: `bewertung:${booking.id}`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F7F2EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="text-align:center;padding:16px 0">
    <img src="https://alltagsengel.care/icon-192x192.png" width="50" height="50" alt="Alltagsengel" style="border-radius:10px">
  </div>
  <div style="background:white;border-radius:16px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
    <h2 style="color:#1A1612;font-size:20px;margin:0 0 12px">Hallo ${customerName},</h2>
    <p style="color:#444;font-size:15px;line-height:1.6">
      Wir hoffen, der Termin mit <strong>${angelName}</strong> war genau nach Ihren Wünschen!
    </p>
    <p style="color:#444;font-size:15px;line-height:1.6">
      Ihre Bewertung hilft anderen Kunden, den richtigen Engel zu finden — und dauert nur <strong>30 Sekunden</strong>.
    </p>

    <div style="text-align:center;margin:28px 0">
      <div style="font-size:32px;margin-bottom:8px">⭐⭐⭐⭐⭐</div>
      <a href="${reviewUrl}" style="display:inline-block;background:#C9963C;color:#1A1612;padding:14px 36px;border-radius:12px;font-weight:700;text-decoration:none;font-size:16px">
        Jetzt bewerten
      </a>
    </div>

    <p style="color:#888;font-size:13px;text-align:center">
      Service: ${serviceName}
    </p>
  </div>
  <div style="text-align:center;padding:16px 0;font-size:12px;color:#999">
    Alltagsengel · Frankfurt am Main<br>
    <a href="https://alltagsengel.care/datenschutz" style="color:#C9963C">Datenschutz</a>
  </div>
</div>
</body></html>`,
      })

      // Das Resend-SDK wirft bei einer Ablehnung nicht, sondern liefert
      // `{ error }`. Ungeprueft zaehlte der Lauf abgelehnte Mails als
      // versendet und meldete Erfolge, die es nie gab.
      if (ergebnis.ok) {
        sent++
      } else {
        fehlgeschlagen++
        log.warn('Bewertungs-Anfrage nicht versendet', {
          bookingId: booking.id, grund: ergebnis.grund,
        })
      }
    }

    log.info(`${sent} Bewertungs-Anfragen gesendet, ${fehlgeschlagen} fehlgeschlagen`)
    return NextResponse.json({ success: true, sent, fehlgeschlagen, total: bookings.length })
  } catch (err) {
    return safeApiError(err, request)
  }
})
