import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bookingId, type, title, bodyText, data } = body

    if (!bookingId || !title) {
      return NextResponse.json({ error: 'bookingId und title erforderlich' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data: booking } = await supabase
      .from('bookings')
      .select('customer_id, angel_id')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })

    const isParty = user.id === booking.customer_id || user.id === booking.angel_id
    if (!isParty) return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })

    const recipientId = user.id === booking.customer_id ? booking.angel_id : booking.customer_id

    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: recipientId,
        type: type || 'system',
        title,
        body: bodyText,
        data: data || {},
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Benachrichtigung konnte nicht erstellt werden' }, { status: 500 })

    return NextResponse.json({ success: true, notification })
  } catch {
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: 'Fehler beim Laden der Benachrichtigungen' }, { status: 500 })

    return NextResponse.json({ notifications: data })
  } catch {
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
