import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
const log = logger.child('lead-inquiry')

// ═══════════════════════════════════════════════════════════
// LEAD INQUIRY API — Beratungsanfrage speichern
// ═══════════════════════════════════════════════════════════
// Speichert Anfragen vom Lead-Formular in Supabase.
// Schutz: Rate-Limit pro IP, Honeypot, Längen-Caps.
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

const MAX_LEN = { name: 120, phone: 40, message: 2000, service: 60, source: 60, utm_source: 120 }

export const POST = withTracking(async function POST(request: Request) {
  try {
    const ip = getClientIp(request)
    if (!(await rateLimitPersistent(`lead:${ip}`, 5, 10 * 60 * 1000))) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte versuchen Sie es in einigen Minuten erneut.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { name, phone, plz, message, service, source, utm_source } = body

    // Honeypot: unsichtbares Feld — wenn befüllt, ist es ein Bot.
    // Bewusst 201 zurückgeben, damit der Bot nichts merkt.
    if (body.website) {
      return NextResponse.json({ success: true }, { status: 201 })
    }

    // PLZ ist optional: Der niedrigschwellige Rückrufservice fragt nur
    // Name + Telefon + Wunschzeit ab. Das Haupt-Lead-Formular sendet die
    // PLZ weiterhin mit und wird unten weiter validiert.
    if (!name || !phone) {
      return NextResponse.json(
        { error: 'Pflichtfelder fehlen (Name, Telefon)' },
        { status: 400 }
      )
    }

    if (
      typeof name !== 'string' || typeof phone !== 'string' ||
      name.length > MAX_LEN.name || phone.length > MAX_LEN.phone ||
      (message && String(message).length > MAX_LEN.message) ||
      (service && String(service).length > MAX_LEN.service) ||
      (source && String(source).length > MAX_LEN.source) ||
      (utm_source && String(utm_source).length > MAX_LEN.utm_source)
    ) {
      return NextResponse.json({ error: 'Eingabe zu lang' }, { status: 400 })
    }

    // Telefon plausibel? (mind. 6 Ziffern — sonst ist der Lead nicht anrufbar)
    if ((phone.match(/[0-9]/g) || []).length < 6) {
      return NextResponse.json(
        { error: 'Bitte geben Sie eine gültige Telefonnummer an' },
        { status: 400 }
      )
    }

    // PLZ-Format prüfen (5-stellig, nur Ziffern) — nur wenn angegeben.
    if (plz && !/^[0-9]{5}$/.test(plz)) {
      return NextResponse.json(
        { error: 'Ungültige Postleitzahl' },
        { status: 400 }
      )
    }

    const { error: dbError } = await supabaseAdmin
      .from('lead_inquiries')
      .insert({
      // Die Stamm-Organisation steht hier AUSDRUECKLICH, statt sich auf den
      // Spalten-Default current_org_id() zu verlassen: dieser Weg laeuft mit
      // dem Dienstschluessel ohne auth.uid(), der Default faellt dann auf
      // genau diesen Wert zurueck — aber als fail-open-Rueckfall, nicht als
      // Aussage. Hier ist er eine Aussage: die oeffentliche Website gehoert
      // der Stamm-Organisation, es gibt keinen anderen Mandanten dahinter.
        organization_id: DEFAULT_ORG_ID,
        name: name.trim(),
        phone: phone.trim(),
        plz: plz?.trim() || '',
        message: message?.trim() || null,
        service: service?.trim() || null,
        source: source || 'website',
        utm_source: utm_source?.trim() || null,
      })

    if (dbError) {
      log.errorWithException('DB Fehler', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
