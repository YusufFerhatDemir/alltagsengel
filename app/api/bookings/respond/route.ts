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
import { logger } from '@/lib/logger'
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
 * POST /api/bookings/respond
 * Body: { bookingId: string, action: 'accept' | 'decline', reason?: string }
 *
 * Der zugewiesene Engel beantwortet eine Buchungsanfrage. Server-autoritativ:
 * - nur der zugewiesene Engel (oder ein Admin) darf antworten
 * - Übergang nur aus status='pending' (optimistic lock gegen Doppel-Klick
 *   und gegen Accept-nach-Decline-Races)
 * - danach wird der Kunde benachrichtigt (in-app + E-Mail + Push)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { bookingId, action, reason } = await req.json()
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
        id, customer_id, angel_id, service, date, time, duration_hours, total_amount, status,
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

    // Nur der zugewiesene Engel darf annehmen/ablehnen — Admins zur Nachsteuerung.
    if (booking.angel_id !== user.id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Nur der zugewiesene Engel kann diese Anfrage beantworten' }, { status: 403 })
      }
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
          await notifyCustomerBookingAccepted(admin, booking.customer_id, notifyData)
        } else {
          await notifyCustomerBookingDeclined(admin, booking.customer_id, notifyData, declineReason)
        }
      } catch (notifyErr) {
        // Benachrichtigung ist Nebenwirkung — der Statuswechsel bleibt gültig.
        log.errorWithException('Booking respond notify error', notifyErr)
      }
    }

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err) {
    return safeApiError(err, req)
  }
}
