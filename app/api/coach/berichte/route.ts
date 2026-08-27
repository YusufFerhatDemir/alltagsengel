import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { buildVerlaufsbericht } from '@/lib/coach/export'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_reports')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('erstellt_am', { ascending: false })

  if (error) return NextResponse.json({ error: 'Berichte konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ berichte: data ?? [] })
})

/** Verlaufsbericht als unveränderlichen Snapshot erzeugen (Default: letzte 12 Wochen). */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireCoachUser({ schreibzugriff: true })
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const bis = typeof body.bis === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.bis)
    ? body.bis
    : heuteBerlin()
  const von = typeof body.von === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.von)
    ? body.von
    : datumBerlin(new Date(Date.now() - 84 * 24 * 3600 * 1000))
  if (von > bis) return NextResponse.json({ error: 'Zeitraum ungültig (von > bis).' }, { status: 400 })

  const [assessments, goals, log, messungen] = await Promise.all([
    auth.supabase.from('coach_assessments').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_goals').select('*').eq('coach_user_id', auth.coachUser.id),
    auth.supabase.from('coach_activity_log').select('*').eq('coach_user_id', auth.coachUser.id).gte('datum', von).lte('datum', bis),
    auth.supabase.from('coach_measurements').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
  ])
  if (assessments.error || goals.error || log.error || messungen.error) {
    return NextResponse.json({ error: 'Bericht konnte nicht erstellt werden.' }, { status: 500 })
  }

  const inhalt = buildVerlaufsbericht({
    von, bis,
    assessments: assessments.data ?? [],
    goals: goals.data ?? [],
    activityLog: log.data ?? [],
    measurements: messungen.data ?? [],
  })

  const { data, error } = await auth.supabase
    .from('coach_reports')
    .insert({
      coach_user_id: auth.coachUser.id,
      report_typ: 'verlaufsbericht',
      zeitraum_von: von,
      zeitraum_bis: bis,
      inhalt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Bericht konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ bericht: data })
})
