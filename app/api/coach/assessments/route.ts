import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { ASSESSMENT_BEREICHE } from '@/lib/coach/assessment'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_assessments')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('erhoben_am', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Assessments konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ assessments: data ?? [] })
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireCoachUser({ schreibzugriff: true })
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const zeile: Record<string, unknown> = {
    coach_user_id: auth.coachUser.id,
    assessment_typ: body.assessment_typ === 'verlaufsassessment' ? 'verlaufsassessment' : 'erstassessment',
    hilfsmittel: typeof body.hilfsmittel === 'string' ? body.hilfsmittel.slice(0, 2000) : null,
    wohnsituation: typeof body.wohnsituation === 'string' ? body.wohnsituation.slice(0, 2000) : null,
    notizen: typeof body.notizen === 'string' ? body.notizen.slice(0, 4000) : null,
    erhoben_von: auth.user.id,
  }
  for (const bereich of ASSESSMENT_BEREICHE) {
    const w = body[bereich]
    if (w === undefined || w === null) { zeile[bereich] = null; continue }
    const zahl = Number(w)
    if (!Number.isInteger(zahl) || zahl < 0 || zahl > 4) {
      return NextResponse.json({ error: `Ungültiger Wert für ${bereich} (erlaubt: 0–4).` }, { status: 400 })
    }
    zeile[bereich] = zahl
  }

  const { data, error } = await auth.supabase
    .from('coach_assessments')
    .insert(zeile)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Assessment konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ assessment: data })
})
