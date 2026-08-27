import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import type { ErledigungStatus } from '@/lib/coach/types'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

const STATUS: ErledigungStatus[] = ['erledigt', 'teilweise', 'ausgelassen']

/** Erledigungen laden — ?von=YYYY-MM-DD (Default: letzte 28 Tage). */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const vonParam = new URL(request.url).searchParams.get('von')
  const von = vonParam && /^\d{4}-\d{2}-\d{2}$/.test(vonParam)
    ? vonParam
    : datumBerlin(new Date(Date.now() - 28 * 24 * 3600 * 1000))

  const { data, error } = await auth.supabase
    .from('coach_activity_log')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .gte('datum', von)
    .order('datum', { ascending: false })

  if (error) return NextResponse.json({ error: 'Erledigungen konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ log: data ?? [] })
})

/** Erledigung eintragen/ändern (Upsert je Aktivität+Tag). */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireCoachUser({ schreibzugriff: true })
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.activity_id !== 'string' || !body.activity_id) {
    return NextResponse.json({ error: 'activity_id ist ein Pflichtfeld.' }, { status: 400 })
  }
  const status: ErledigungStatus = STATUS.includes(body.status) ? body.status : 'erledigt'
  const datum = typeof body.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.datum)
    ? body.datum
    : heuteBerlin()

  const { data, error } = await auth.supabase
    .from('coach_activity_log')
    .upsert(
      {
        activity_id: body.activity_id,
        coach_user_id: auth.coachUser.id,
        datum,
        status,
        notiz: typeof body.notiz === 'string' ? body.notiz.slice(0, 1000) : null,
      },
      { onConflict: 'activity_id,datum' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Erledigung konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ eintrag: data })
})
