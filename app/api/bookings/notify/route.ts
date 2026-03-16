import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAngelNewBooking, notifyCustomerBookingAccepted, type BookingNotifyData } from '@/lib/notifications'

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

    // Booking mit allen nötigen Daten laden
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select(`
        id, customer_id, angel_id, service, date, time, duration_hours, total_amount, status,
        customer:profiles!bookings_customer_id_fkey(id, first_name, last_name, email),
        angel:angels!bookings_angel_id_fkey(id, user_id, profiles(id, first_name, last_name, email))
      `)
      .eq('id', bookingId)
      .single()

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    const cust: any = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
    const customerName = cust
      ? `${cust.first_name} ${cust.last_name?.[0] || ''}.`
      : 'Kunde'
    const angel: any = booking.angel
    const ap: any = angel?.profiles ? (Array.isArray(angel.profiles) ? angel.profiles[0] : angel.profiles) : null
    const angelName = ap
      ? `${ap.first_name} ${ap.last_name?.[0] || ''}.`
      : 'Engel'

    const notifyData: BookingNotifyData = {
      bookingId: booking.id,
      customerName,
      angelName,
      service: (booking as any).service || 'Alltagsbegleitung',
      date: (booking as any).date,
      time: (booking as any).time?.slice(0, 5) || '—',
      duration: (booking as any).duration_hours || 2,
      amount: Number((booking as any).total_amount) || 0,
    }

    if (event === 'created') {
      // Neue Buchung → Engel benachrichtigen
      const angelUserId = angel?.user_id || ap?.id
      if (angelUserId) {
        await notifyAngelNewBooking(supabase, angelUserId, notifyData)
      }
      return NextResponse.json({ success: true, event: 'created', notified: 'angel' })
    }

    if (event === 'accepted') {
      // Buchung angenommen → Kunde benachrichtigen
      if (booking.customer_id) {
        await notifyCustomerBookingAccepted(supabase, booking.customer_id, notifyData)
      }
      return NextResponse.json({ success: true, event: 'accepted', notified: 'customer' })
    }

    return NextResponse.json({ error: 'Unbekanntes Event' }, { status: 400 })
  } catch (err: any) {
    console.error('Booking notify error:', err)
    return NextResponse.json({ error: err.message || 'Serverfehler' }, { status: 500 })
  }
}
