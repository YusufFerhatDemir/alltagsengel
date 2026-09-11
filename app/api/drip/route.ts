import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { escapeHtml } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendRawEmail } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'
import { kundenAnrede } from '@/lib/kommunikation/anrede'
import { DRIP_VORLAGEN as templates } from '@/lib/email/drip-vorlagen'
const log = logger.child('api:drip')

// ═══════════════════════════════════════════════════════════
// DRIP E-MAIL KAMPAGNE — Automatische Follow-Up Mails
// ═══════════════════════════════════════════════════════════
// Wird per Cron-Job (z.B. täglich) aufgerufen.
// Sendet gestaffelte E-Mails an User die sich registriert
// aber noch keine Buchung gemacht haben.
//
// Tag 1: Willkommen (wird schon bei Register gesendet)
// Tag 3: Entlastungsbetrag erklären (131 €/Monat) — ohne Abrechnungsversprechen, §45a im Anerkennungsverfahren
// Tag 7: „Ihr erster Engel wartet auf Sie“
// Tag 14: Entlastungsbetrag-Hinweis + Referral-Bonus
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


export const POST = withTracking(async function POST(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY nicht konfiguriert' }, { status: 500 })
    }

    const now = new Date()
    const sent = { day3: 0, day7: 0, day14: 0 }
    const fehlgeschlagen = { day3: 0, day7: 0, day14: 0 }

    // Alle Kunden ohne Buchung laden
    const { data: customers, error: customersFehler } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name, referral_code, created_at')
      .eq('role', 'kunde')

    if (customersFehler) {
      return NextResponse.json(
        { error: 'Die Kundenliste konnte nicht gelesen werden — der Lauf wurde abgebrochen, es wurde nichts versendet.' },
        { status: 500 },
      )
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({ message: 'Keine Kunden gefunden', sent, fehlgeschlagen })
    }

    // ── DIESE LISTE IST DIE SPERRLISTE DES VERSANDS ─────────────────
    //
    // Wer hier drin steht, hat gebucht und bekommt die Drip-Mail
    // („Sie haben noch nicht gebucht") NICHT. Bei verworfenem Fehler war
    // die Menge leer — und damit galt JEDER Kunde als Nichtbucher. Der
    // Lauf haette langjaehrige Kundschaft angeschrieben, sie habe noch
    // nie gebucht: eine Aussage, die nach aussen geht, beim Empfaenger
    // ankommt und sich nicht zurueckholen laesst.
    //
    // An einem Weg, der Post verschickt, ist die leere Sperrliste die
    // gefaehrlichste Form des verworfenen Fehlers. Deshalb bricht der
    // Lauf ab, statt im Zweifel zu senden.
    // TODO (MITTEL, Dienstschluessel-Pass 01.09.2026): diese Abfrage —
    // wie die Kundenliste darueber — laeuft OHNE Mandantenfilter ueber
    // alle Organisationen. Solange Alltagsengel der einzige Betrieb mit
    // Endkundengeschaeft ist, trifft das denselben Personenkreis; sobald
    // ein zweiter Mandant Privatkundschaft fuehrt, verschickt dieser
    // Lauf Alltagsengel-Werbung an dessen Kundschaft. Fuer den Fix
    // braucht es eine Festlegung, welcher Mandant die Drip-Strecke
    // fahren darf — das ist eine Produktentscheidung, keine Codefrage,
    // und deshalb hier nur vermerkt statt still geaendert.
    const { data: bookings, error: bookingsFehler } = await supabaseAdmin
      .from('bookings')
      .select('customer_id')

    if (bookingsFehler) {
      return NextResponse.json(
        {
          error: 'Die bereits buchende Kundschaft konnte nicht ermittelt werden — der Lauf wurde '
            + 'abgebrochen. Ohne diese Sperrliste würden Bestandskunden angeschrieben, sie hätten nie gebucht.',
        },
        { status: 500 },
      )
    }

    const customersWithBookings = new Set(bookings?.map(b => b.customer_id) || [])

    for (const customer of customers) {
      // Skip wenn schon gebucht hat
      if (customersWithBookings.has(customer.id)) continue
      if (!customer.email) continue

      const daysSinceRegistration = Math.floor(
        (now.getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Anrede nach Projektregel (lib/kommunikation/anrede.ts): „Frau/Herr“
      // nur bei bekannter Anredeform — `profiles` fuehrt keine, also neutral
      // „Guten Tag Vorname Nachname,“ statt „Hallo Vorname,“. Die Namen sind
      // bei der Registrierung frei waehlbar → im HTML escapen. Der Betreff
      // traegt bewusst KEINEN Namen mehr (kein Header-Injection-Weg).
      const anrede = escapeHtml(kundenAnrede({ vorname: customer.first_name, nachname: customer.last_name }))
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

      await stufe('day3', templates.day3.subject, templates.day3.html(anrede))
      await stufe('day7', templates.day7.subject, templates.day7.html(anrede))
      await stufe('day14', templates.day14.subject, templates.day14.html(anrede, referralCode))
    }

    return NextResponse.json({ success: true, sent, fehlgeschlagen })
  } catch (err) {
    return safeApiError(err, request)
  }
})
