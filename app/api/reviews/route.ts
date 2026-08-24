import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import {
  ladeEngelBewertungen,
  ladeBuchungsBewertung,
  aktualisiereEngelDurchschnitt,
  istAdminUser,
  MAX_KOMMENTAR_LAENGE,
} from '@/lib/reviews'

// ═══════════════════════════════════════════════════════════════
// BEWERTUNGS-API
// ═══════════════════════════════════════════════════════════════
// Sicherheitskontrakt beider Handler:
//   1. Login-Pflicht (401 ohne Session).
//   2. Mandanten-Fence: jede Bewertung wird ueber ihre Buchung gegen
//      die aktive Organisation geprueft (angel_reviews selbst hat keine
//      organization_id). Der Fence lebt zentral in lib/reviews.ts.
//   3. Es werden nur die Felder aus `OeffentlicheBewertung` ausgeliefert
//      — kein customer_id, kein booking_id, kein Nachname.
//   4. Fremde Buchungen ergeben 404, nicht 403: ein 403 wuerde deren
//      Existenz bestaetigen.
// ═══════════════════════════════════════════════════════════════

/** Sub-Bewertung normalisieren: erlaubt ist null oder 1–5. */
function pruefeTeilnote(wert: unknown): { ok: true; wert: number | null } | { ok: false } {
  if (wert === null || wert === undefined || wert === 0 || wert === '') return { ok: true, wert: null }
  if (typeof wert !== 'number' || !Number.isInteger(wert) || wert < 1 || wert > 5) return { ok: false }
  return { ok: true, wert }
}

// POST: Bewertung erstellen
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    // Rate-Limit pro User: Bewertungen sind durch den Unique-Index auf
    // booking_id zwar auf eine pro Buchung begrenzt, die Validierungs-
    // und Buchungs-Lookups davor sind aber ungebremst aufrufbar.
    if (!(await rateLimitPersistent(`reviews:post:${user.id}`, 10, 60_000))) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte kurz warten.' }, { status: 429 })
    }

    const { bookingId, angelId, rating, punctuality, friendliness, reliability, comment } = await req.json()

    if (!bookingId || !angelId || !rating) {
      return NextResponse.json({ error: 'bookingId, angelId und rating erforderlich' }, { status: 400 })
    }

    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Bewertung muss zwischen 1 und 5 sein' }, { status: 400 })
    }

    const p = pruefeTeilnote(punctuality)
    const f = pruefeTeilnote(friendliness)
    const z = pruefeTeilnote(reliability)
    if (!p.ok || !f.ok || !z.ok) {
      return NextResponse.json({ error: 'Teilbewertungen muessen zwischen 1 und 5 liegen' }, { status: 400 })
    }

    const kommentar = typeof comment === 'string' ? comment.trim() : ''
    if (kommentar.length > MAX_KOMMENTAR_LAENGE) {
      return NextResponse.json(
        { error: `Kommentar darf maximal ${MAX_KOMMENTAR_LAENGE} Zeichen haben` },
        { status: 400 }
      )
    }

    // Buchung ueber den User-Client laden: die RESTRICTIVE org_fence-Policy
    // auf bookings schneidet hier bereits auf die aktive Org zu, der
    // explizite customer_id-Vergleich kommt als zweite Schranke dazu.
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, customer_id, angel_id, status, date')
      .eq('id', bookingId)
      .single()

    if (!booking || booking.customer_id !== user.id) {
      return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
    }

    // Der Engel MUSS der Engel dieser Buchung sein. Ohne diese Pruefung
    // konnte ein Kunde ueber seine eigene Buchung eine Bewertung auf
    // einen beliebigen — auch mandantenfremden — Engel schreiben.
    if (booking.angel_id !== angelId) {
      return NextResponse.json({ error: 'Engel gehoert nicht zu dieser Buchung' }, { status: 400 })
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Stornierte Buchungen koennen nicht bewertet werden' }, { status: 400 })
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

    // Create review — laeuft ueber den User-Client, damit die
    // INSERT-Policy (customer_id = auth.uid() + Buchungsbezug) greift.
    const { data: review, error } = await supabase
      .from('angel_reviews')
      .insert({
        booking_id: bookingId,
        angel_id: angelId,
        customer_id: user.id,
        rating,
        punctuality: p.wert,
        friendliness: f.wert,
        reliability: z.wert,
        comment: kommentar,
      })
      .select('id, rating, punctuality, friendliness, reliability, comment, created_at')
      .single()

    if (error) return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })

    // Durchschnitt neu berechnen (Admin-Client — der Kunde darf angels
    // nicht schreiben, der Update lief vorher still ins Leere).
    await aktualisiereEngelDurchschnitt(angelId)

    return NextResponse.json({ success: true, review })
  } catch (err) {
    return safeApiError(err, req)
  }
}

// GET: Bewertungen abrufen
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const angelId = searchParams.get('angelId')
    const bookingId = searchParams.get('bookingId')

    // Endkunden-/Engel-Leseweg: diese Rollen sind nicht in organization_members
    // gefuehrt. Bewusster Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte
    // Ausnahme) — die Fail-closed-Variante bleibt den Admin-Guards vorbehalten.
    const orgId = await getActiveOrgIdOrDefault()

    if (bookingId) {
      // Bewertung einer einzelnen Buchung — nur fuer Kunde, Engel, Admin
      // und nur innerhalb der aktiven Organisation.
      const istAdmin = await istAdminUser(user.id)
      const { erlaubt, bewertung } = await ladeBuchungsBewertung(bookingId, user.id, orgId, istAdmin)
      if (!erlaubt) return NextResponse.json({ error: 'Buchung nicht gefunden' }, { status: 404 })
      return NextResponse.json({ review: bewertung })
    }

    if (angelId) {
      const reviews = await ladeEngelBewertungen(angelId, orgId)
      return NextResponse.json({ reviews })
    }

    return NextResponse.json({ error: 'angelId oder bookingId erforderlich' }, { status: 400 })
  } catch (err) {
    return safeApiError(err, req)
  }
}
