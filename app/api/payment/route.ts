import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const ALLOWED_METHODS = ['card', 'sepa', '45b', 'paypal']

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { success } = rateLimit(`payment:${ip}`, 5, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warten Sie.' }, { status: 429 })
    }

    const body = await req.json()
    const { bookingId, paymentMethod } = body

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId erforderlich' }, { status: 400 })
    }

    const method = paymentMethod || 'card'
    if (!ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: 'Ungültige Zahlungsmethode' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })

    if (booking.customer_id !== user.id) {
      return NextResponse.json({ error: 'Keine Berechtigung für diese Buchung' }, { status: 403 })
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        user_id: user.id,
        amount: booking.total_amount,
        platform_fee: booking.platform_fee,
        payment_method: method,
        status: 'processing',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Zahlung konnte nicht erstellt werden' }, { status: 500 })

    await supabase
      .from('payments')
      .update({ status: 'completed' })
      .eq('id', payment.id)

    await supabase.from('notifications').insert({
      user_id: booking.angel_id,
      type: 'payment',
      title: 'Zahlung eingegangen',
      body: `Zahlung über ${booking.total_amount.toFixed(2)}€ für Buchung erhalten.`,
      data: { bookingId, paymentId: payment.id },
    })

    return NextResponse.json({ success: true, payment: { id: payment.id, status: 'completed' } })
  } catch {
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
