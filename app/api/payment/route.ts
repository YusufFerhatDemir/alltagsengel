import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bookingId, paymentMethod } = body

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })

    // Zahlung erstellen
    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        booking_id: bookingId,
        user_id: user.id,
        amount: booking.total_amount,
        platform_fee: booking.platform_fee,
        payment_method: paymentMethod || 'card',
        status: 'processing',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Hinweis: Für echte Stripe-Integration hier stripe.paymentIntents.create() aufrufen
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: Math.round(booking.total_amount * 100),
    //   currency: 'eur',
    //   metadata: { bookingId, paymentId: payment.id },
    // })

    // Zahlung als abgeschlossen markieren (Demo)
    await supabase
      .from('payments')
      .update({ status: 'completed' })
      .eq('id', payment.id)

    // Benachrichtigung erstellen
    await supabase.from('notifications').insert({
      user_id: booking.angel_id,
      type: 'payment',
      title: 'Zahlung eingegangen',
      body: `Zahlung über ${booking.total_amount.toFixed(2)}€ für Buchung erhalten.`,
      data: { bookingId, paymentId: payment.id },
    })

    return NextResponse.json({ success: true, payment })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
