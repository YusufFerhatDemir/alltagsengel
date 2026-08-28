import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  notifyCustomerBookingAccepted,
  notifyCustomerBookingDeclined,
  type BookingNotifyData,
} from '@/lib/notifications'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import {
  erzeugeEinsatzUndNachweis,
  istEinsatzKetteFehler,
  type KetteErgebnis,
} from '@/lib/bookings/einsatz-kette'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
const log = logger.child('api:bookings')

// ─── Row-Formen des bookings-Selects (inkl. eingebetteter Joins) ───
interface BookingProfile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}
interface BookingAngel {
  id: string
  profiles: BookingProfile | BookingProfile[] | null
}
interface BookingRow {
  id: string
  customer_id: string | null
  angel_id: string | null
  service: string | null
  date: string
  time: string | null
  duration_hours: number | null
  total_amount: number | string | null
  status: string | null
  payment_method: string | null
  customer: BookingProfile | BookingProfile[] | null
  angel: BookingAngel | BookingAngel[] | null
}

function firstOrSelf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Fehlende Spalte (Schema-Drift zwischen Migrations und Live-DB)
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === 'PGRST204' || err.code === '42703' || /column .* does not exist/i.test(err.message || '')
}

/**
 * Dreht einen Statuswechsel auf 'accepted' zurück, wenn die Einsatz-Kette
 * danach gerissen ist (Track A1).
 *
 * Der Übergangs-Trigger `enforce_booking_status_transition` lässt den
 * Service-Role-Client (auth.uid() IS NULL) durch — accepted → pending ist
 * für Kunde und Engel nicht erlaubt, für diesen Pfad aber notwendig.
 * `.eq('status','accepted')` verhindert, dass ein zwischenzeitlich anderer
 * Status (z. B. eine Stornierung des Kunden) überschrieben wird.
 */
async function setzeBuchungZurueckAufPending(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
  orgId: string,
): Promise<boolean> {
  const voll = await admin
    .from('bookings')
    .update({ status: 'pending', responded_at: null, decline_reason: null })
    .eq('id', bookingId)
    .eq('organization_id', orgId)
    .eq('status', 'accepted')
    .select('id')

  if (voll.error && isMissingColumn(voll.error)) {
    const minimal = await admin
      .from('bookings')
      .update({ status: 'pending' })
      .eq('id', bookingId)
      .eq('organization_id', orgId)
      .eq('status', 'accepted')
      .select('id')
    return !minimal.error && (minimal.data?.length ?? 0) > 0
  }
  return !voll.error && (voll.data?.length ?? 0) > 0
}

/**
 * POST /api/bookings/respond
 * Body: { bookingId, action: 'accept' | 'decline', reason?, force_override?, override_reason? }
 *
 * Der zugewiesene Engel beantwortet eine Buchungsanfrage. Server-autoritativ:
 * - nur der zugewiesene Engel (oder ein Admin) darf antworten
 * - Übergang nur aus status='pending' (optimistic lock gegen Doppel-Klick
 *   und gegen Accept-nach-Decline-Races)
 * - bei 'accept' entsteht die vollständige Kette: Einsatz (`assignments`)
 *   + Leistungsnachweis-Entwurf (`service_records`) — siehe
 *   lib/bookings/einsatz-kette.ts
 * - danach wird der Kunde benachrichtigt (in-app + E-Mail + Push)
 *
 * REIHENFOLGE bei 'accept' (Track A1): erst der Statuswechsel mit
 * optimistic lock, dann die Kette. Der Lock bestimmt EINEN Gewinner unter
 * parallelen Requests; nur dieser baut die Kette. Scheitert sie, wird der
 * Status auf 'pending' zurückgedreht — eine angenommene Buchung ohne
 * Einsatz ist genau der Zustand, den Track A1 beseitigt.
 *
 * `force_override` (nur admin/superadmin) nimmt eine Buchung auch dann an,
 * wenn die Kette nicht gebaut werden kann. Der Einsatz muss dann manuell
 * geplant werden; der Vorgang wird im Audit-Trail festgehalten.
 */
export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { bookingId, action, reason, force_override, override_reason } = await req.json()
    if (!bookingId || !action) {
      return NextResponse.json({ error: 'bookingId und action sind erforderlich' }, { status: 400 })
    }
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ error: 'action muss "accept" oder "decline" sein' }, { status: 400 })
    }

    // org_fence: nur Bookings der eigenen Organisation.
    // Endkunden-/Engel-Pfad: diese Rollen sind nicht in organization_members
    // gefuehrt. Bewusster Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte
    // Ausnahme) — entscheidend ist, dass der Org-Filter UNBEDINGT greift und
    // nicht mehr an einer Bedingung haengt und uebersprungen werden kann.
    const orgId = await getActiveOrgIdOrDefault()

    let bookingQuery = supabase
      .from('bookings')
      .select(`
        id, customer_id, angel_id, service, date, time, duration_hours, total_amount, status, payment_method,
        customer:profiles!bookings_customer_id_fkey(id, first_name, last_name, email),
        angel:angels!bookings_angel_id_fkey(id, profiles(id, first_name, last_name, email))
      `)
      .eq('id', bookingId)
    bookingQuery = bookingQuery.eq('organization_id', orgId)
    const { data: bookingRaw, error: bookErr } = await bookingQuery.single()

    if (bookErr || !bookingRaw) {
      return NextResponse.json({ error: 'Anfrage nicht gefunden' }, { status: 404 })
    }

    const booking = bookingRaw as unknown as BookingRow

    // Rolle wird immer geholt: sie entscheidet sowohl über die Berechtigung
    // als auch darüber, ob force_override erlaubt ist (D1-Regel wie in
    // /api/einsatzplanung — Override ausschließlich für Administratoren).
    const quellen = await holeRollenQuellenFuer(supabase, user)
    const istAdmin = quellenDuerfen(quellen, 'einsatz.schreiben')

    // Nur der zugewiesene Engel darf annehmen/ablehnen — Admins zur Nachsteuerung.
    if (booking.angel_id !== user.id && !istAdmin) {
      return NextResponse.json({ error: 'Nur der zugewiesene Engel kann diese Anfrage beantworten' }, { status: 403 })
    }

    if (force_override && !istAdmin) {
      return NextResponse.json(
        { error: 'force_override ist nur für Administratoren erlaubt.' },
        { status: 403 },
      )
    }

    if (booking.status !== 'pending') {
      return NextResponse.json(
        { error: 'Diese Anfrage wurde bereits beantwortet', status: booking.status },
        { status: 409 }
      )
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined'
    const admin = createAdminClient()

    // Statuswechsel über den Service-Role-Client, aber weiterhin mit
    // .eq('status','pending') als optimistic lock: parallele Requests
    // (Doppel-Klick, zwei Geräte) treffen dann 0 Zeilen.
    const respondedAt = new Date().toISOString()
    const declineReason = action === 'decline' && typeof reason === 'string'
      ? reason.trim().slice(0, 500) || null
      : null

    let updated: { id: string }[] | null = null
    let fullQuery = admin
      .from('bookings')
      .update({ status: newStatus, responded_at: respondedAt, decline_reason: declineReason })
      .eq('id', bookingId)
      .eq('status', 'pending')
    fullQuery = fullQuery.eq('organization_id', orgId)
    const full = await fullQuery.select('id')

    if (full.error && isMissingColumn(full.error)) {
      // Live-DB kennt responded_at/decline_reason noch nicht (Migration
      // 20260719_booking_request_workflow.sql noch nicht eingespielt) —
      // der Statuswechsel selbst darf daran nicht scheitern.
      let minQuery = admin
        .from('bookings')
        .update({ status: newStatus })
        .eq('id', bookingId)
        .eq('status', 'pending')
      minQuery = minQuery.eq('organization_id', orgId)
      const minimal = await minQuery.select('id')
      if (minimal.error) {
        log.error('Booking respond update error', { minimalMessage: minimal.error.message })
        return NextResponse.json({ error: 'Status konnte nicht gesetzt werden' }, { status: 500 })
      }
      updated = minimal.data
    } else if (full.error) {
      log.error('Booking respond update error', { fullMessage: full.error.message })
      return NextResponse.json({ error: 'Status konnte nicht gesetzt werden' }, { status: 500 })
    } else {
      updated = full.data
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Diese Anfrage wurde bereits beantwortet' }, { status: 409 })
    }

    // ─── Track A1: Einsatz + Leistungsnachweis-Entwurf ───
    // Erst hier, weil der optimistic lock oben bereits EINEN Gewinner
    // bestimmt hat. Scheitert die Kette, geht die Buchung zurück auf
    // 'pending' und der Engel bekommt den Grund im Klartext.
    let kette: KetteErgebnis | null = null
    const ketteWarnungen: string[] = []

    if (action === 'accept') {
      try {
        kette = await erzeugeEinsatzUndNachweis(admin, {
          booking: {
            id: booking.id,
            customer_id: booking.customer_id,
            angel_id: booking.angel_id,
            service: booking.service,
            date: booking.date,
            time: booking.time,
            duration_hours: booking.duration_hours,
            payment_method: booking.payment_method,
          },
          organizationId: orgId,
          actorId: user.id,
        })
        ketteWarnungen.push(...kette.warnungen)

        await logAuditEventOrWarn({
          action: 'create',
          actorId: user.id,
          actorRole: quellen.rolle ?? null,
          organizationId: orgId,
          entityType: 'assignment',
          entityId: kette.assignmentId,
          details: {
            quelle: 'booking_accept',
            booking_id: booking.id,
            service_record_id: kette.serviceRecordId,
            client_id: kette.clientId,
            caregiver_id: kette.caregiverId,
            leistungsart: kette.leistungsart,
            zeitfenster: `${kette.assignmentDate} ${kette.startTime}–${kette.endTime}`,
            warnungen: kette.warnungen,
          },
          request: req,
        })
      } catch (rohFehler) {
        // Fachlicher Bruch (behebbar, Klartext für den Engel) vs. technischer
        // Fehler (Details bleiben im Log).
        const fachlich = istEinsatzKetteFehler(rohFehler) ? rohFehler : null
        if (!fachlich) {
          log.errorWithException('Booking-Kette unerwartet fehlgeschlagen', rohFehler)
        }

        if (istAdmin && force_override) {
          // Bewusste Admin-Entscheidung: Buchung annehmen, Einsatz später
          // von Hand planen. Wird protokolliert, nicht verschwiegen.
          const grund = fachlich ? fachlich.message : 'Technischer Fehler beim Anlegen des Einsatzes'
          ketteWarnungen.push(
            `Kein Einsatz und kein Leistungsnachweis angelegt (${grund}). ` +
            'Der Einsatz muss manuell in der Einsatzplanung erfasst werden.',
          )
          await logAuditEventOrWarn({
            action: 'update',
            actorId: user.id,
            actorRole: quellen.rolle ?? null,
            organizationId: orgId,
            entityType: 'booking',
            entityId: booking.id,
            details: {
              quelle: 'booking_accept_force_override',
              fehlercode: fachlich ? fachlich.code : 'UNERWARTET',
              fehler: grund,
              begruendung: typeof override_reason === 'string' && override_reason.trim()
                ? override_reason.trim().slice(0, 500)
                : 'Keine Begründung angegeben',
            },
            request: req,
          })
        } else {
          // Rollback: ohne Einsatz darf die Buchung nicht angenommen bleiben.
          const zurueckgedreht = await setzeBuchungZurueckAufPending(admin, bookingId, orgId)
          if (!zurueckgedreht) {
            log.error('Rollback des Buchungsstatus fehlgeschlagen', { bookingId })
          }

          return NextResponse.json(
            {
              error: fachlich
                ? fachlich.message
                : 'Der Einsatz konnte nicht angelegt werden. Die Anfrage bleibt offen.',
              code: fachlich ? fachlich.code : 'UNERWARTET',
              details: fachlich ? fachlich.details : undefined,
              status: 'pending',
              rollback: zurueckgedreht,
              hinweis: istAdmin
                ? 'Mit force_override: true kann die Buchung ohne Einsatz angenommen werden.'
                : undefined,
            },
            { status: fachlich ? fachlich.httpStatus : 500 },
          )
        }
      }
    }

    // ─── Kunde benachrichtigen ───
    const cust = firstOrSelf(booking.customer)
    const angel = firstOrSelf(booking.angel)
    const ap = firstOrSelf(angel?.profiles)

    const notifyData: BookingNotifyData = {
      bookingId: booking.id,
      customerName: cust ? `${cust.first_name} ${cust.last_name?.[0] || ''}.` : 'Kunde',
      angelName: ap ? `${ap.first_name} ${ap.last_name?.[0] || ''}.` : 'Engel',
      service: booking.service || 'Alltagsbegleitung',
      date: booking.date,
      time: booking.time?.slice(0, 5) || '—',
      duration: booking.duration_hours || 2,
      amount: Number(booking.total_amount) || 0,
    }

    if (booking.customer_id) {
      try {
        if (action === 'accept') {
          await notifyCustomerBookingAccepted(admin, booking.customer_id, notifyData, { organizationId: orgId })
        } else {
          await notifyCustomerBookingDeclined(admin, booking.customer_id, notifyData, declineReason, { organizationId: orgId })
        }
      } catch (notifyErr) {
        // Benachrichtigung ist Nebenwirkung — der Statuswechsel bleibt gültig.
        log.errorWithException('Booking respond notify error', notifyErr)
      }
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      assignment_id: kette?.assignmentId,
      service_record_id: kette?.serviceRecordId,
      warnungen: ketteWarnungen.length > 0 ? ketteWarnungen : undefined,
    })
  } catch (err) {
    return safeApiError(err, req)
  }
})
