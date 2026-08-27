import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Freigabe widerrufen. Idempotent: eine bereits widerrufene Zeile ist kein
 * Fehler (Doppelklick/erneuter Versuch soll nicht scheitern) — nur eine
 * fremde oder nicht existierende Zeile ist es.
 */
export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response
  const { id } = await params

  // RLS begrenzt auf eigene Zeilen; .eq owner_coach_user_id zusätzlich als Defense-in-Depth.
  const { data: bestehend, error: ladeFehler } = await auth.supabase
    .from('coach_shares')
    .select('id, widerrufen_am')
    .eq('id', id)
    .eq('owner_coach_user_id', auth.coachUser.id)
    .maybeSingle()
  if (ladeFehler) return NextResponse.json({ error: 'Freigabe konnte nicht geladen werden.' }, { status: 500 })
  if (!bestehend) return NextResponse.json({ error: 'Freigabe nicht gefunden.' }, { status: 404 })

  if (bestehend.widerrufen_am !== null) {
    return NextResponse.json({ ok: true, meldung: 'Diese Freigabe war bereits widerrufen.' })
  }

  const { error } = await auth.supabase
    .from('coach_shares')
    .update({ widerrufen_am: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_coach_user_id', auth.coachUser.id)

  if (error) return NextResponse.json({ error: 'Freigabe konnte nicht widerrufen werden.' }, { status: 500 })
  return NextResponse.json({ ok: true })
})
