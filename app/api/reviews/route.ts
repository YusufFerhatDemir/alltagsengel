import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST: Bewertung erstellen
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { bookingId, angelId, rating, punctuality, friendliness, reliability, comment } = await req.json()

    if (!bookingId || !angelId || !rating) {
      return NextResponse.json({ error: 'bookingId, angelId und rating erforderlich' }, { status: 400 })
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Bewertung muss zwischen 1 und 5 sein' }, { status: 400 })
    }

    // Verify booking belongs to this customer and is confirmed
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_id, status, date')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.customer_id !== user.id) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    // Check if booking date has passed
    const bookingDate = new Date(booking.date)
    if (bookingDate > new Date()) {
      return NextResponse.json({ error: 'Bewertung erst nach dem Termin möglich' }, { status: 400 })
    }

    // Check if already reviewed
    const { data: existing } = await supabase
      .from('angel_reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Bereits bewertet' }, { status: 409 })
    }

    // Create review
    const { data: review, error } = await supabase
      .from('angel_reviews')
      .insert({
        booking_id: bookingId,
        angel_id: angelId,
        customer_id: user.id,
        rating,
        punctuality: punctuality || null,
        friendliness: friendliness || null,
        reliability: reliability || null,
        comment: comment || '',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update angel's average rating
    const { data: stats } = await supabase
      .from('angel_reviews')
      .select('rating')
      .eq('angel_id', angelId)

    if (stats && stats.length > 0) {
      const avg = stats.reduce((sum, r) => sum + r.rating, 0) / stats.length
      await supabase
        .from('angels')
        .update({ rating: Math.round(avg * 10) / 10, total_jobs: stats.length })
        .eq('id', angelId)
    }

    return NextResponse.json({ success: true, review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: Bewertungen für einen Engel abrufen
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const angelId = searchParams.get('angelId')
    const bookingId = searchParams.get('bookingId')

    const supabase = await createClient()

    if (bookingId) {
      // Check if a specific booking has been reviewed
      const { data } = await supabase
        .from('angel_reviews')
        .select('*')
        .eq('booking_id', bookingId)
        .maybeSingle()
      return NextResponse.json({ review: data })
    }

    if (angelId) {
      // Get all reviews for an angel
      const { data } = await supabase
        .from('angel_reviews')
        .select('*, profiles:customer_id(first_name, last_name, avatar_color)')
        .eq('angel_id', angelId)
        .order('created_at', { ascending: false })
        .limit(50)
      return NextResponse.json({ reviews: data || [] })
    }

    return NextResponse.json({ error: 'angelId oder bookingId erforderlich' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
