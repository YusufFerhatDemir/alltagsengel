import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAngelNewBooking, notifyCustomerBookingAccepted, type BookingNotifyData } from '@/lib/notifications'
import { getActiveOrgId } from '@/lib/organizations/server'

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

/**
 * POST /api/bookings/notify
 * Body: { bookingId: string, event: 'created' | 'accepted' }
 *
 * Triggers in-app + email notifications for booking events.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { bookingId, event } = await req.json()
    if (!bookingId || !event) {
      return NextResponse.json({ error: 'bookingId und event sind erforderlich' }, { status: 400 })
    }

    // org_fence: Booking-Zugriff auf eigene Organisation beschraenken
    const orgId = await getActiveOrgId()

    // Booking mit allen nötigen Daten laden (RLS + expliziter org-Filter)
    let bookingQuery = supabase
      .from('bookings')
      .select(`
        id, customer_id, angel_id, service, date, time, duration_hours, total_amount, status,
        customer:profiles!bookings_customer_id_fkey(id, first_name, last_name, email),
        angel:angels!bookings_angel_id_fkey(id, profiles(id, first_name, last_name, email))
      `)
      .eq('id', bookingId)
    if (orgId) bookingQuery = bookingQuery.eq('organization_id', orgId)
    const { data: bookingRaw, error: bookErr } = await bookingQuery.single()

    if (bookErr || !bookingRaw) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    const booking = bookingRaw as unknown as BookingRow

    // Sicherheit: Nur Beteiligte der Buchung oder Admins dürfen Notifications auslösen
    const isBookingParticipant = booking.customer_id === user.id || (booking.angel_id && booking.angel_id === user.id)
    if (!isBookingParticipant) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Keine Berechtigung für diese Buchung' }, { status: 403 })
      }
    }

    const cust = firstOrSelf(booking.customer)
    const customerName = cust
      ? `${cust.first_name} ${cust.last_name?.[0] || ''}.`
      : 'Kunde'
    const angel = firstOrSelf(booking.angel)
    const ap = firstOrSelf(angel?.profiles)
    const angelName = ap
      ? `${ap.first_name} ${ap.last_name?.[0] || ''}.`
      : 'Engel'

    const notifyData: BookingNotifyData = {
      bookingId: booking.id,
      customerName,
      angelName,
      service: booking.service || 'Alltagsbegleitung',
      date: booking.date,
      time: booking.time?.slice(0, 5) || '—',
      duration: booking.duration_hours || 2,
      amount: Number(booking.total_amount) || 0,
    }

    // Notifications werden über den Service-Role-Client geschrieben,
    // damit die verschärfte RLS (auth.uid() = user_id) den Cross-User-Insert
    // (Kunde → Engel bzw. Engel → Kunde) nicht blockiert.
    const adminSupabase = createAdminClient()

    if (event === 'created') {
      // Neue Buchung → Engel benachrichtigen
      const angelUserId = angel?.id || ap?.id
      if (angelUserId) {
        await notifyAngelNewBooking(adminSupabase, angelUserId, notifyData)
      }
      return NextResponse.json({ success: true, event: 'created', notified: 'angel' })
    }

    if (event === 'accepted') {
      // Buchung angenommen → Kunde benachrichtigen
      if (booking.customer_id) {
        await notifyCustomerBookingAccepted(adminSupabase, booking.customer_id, notifyData)
      }
      return NextResponse.json({ success: true, event: 'accepted', notified: 'customer' })
    }

    return NextResponse.json({ error: 'Unbekanntes Event' }, { status: 400 })
  } catch (err: unknown) {
    console.error('Booking notify error:', err)
    const message = err instanceof Error ? err.message : 'Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
