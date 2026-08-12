import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import type { ZielBereich } from '@/lib/coach/types'

const BEREICHE: ZielBereich[] = ['mobilitaet', 'selbstversorgung', 'alltagsgestaltung', 'soziale_teilhabe', 'entlastung_angehoerige']

export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_goals')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Ziele konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ ziele: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.titel !== 'string' || !body.titel.trim()) {
    return NextResponse.json({ error: 'Bitte einen Ziel-Titel angeben.' }, { status: 400 })
  }
  if (!BEREICHE.includes(body.bereich)) {
    return NextResponse.json({ error: 'Bitte einen gültigen Lebensbereich wählen.' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('coach_goals')
    .insert({
      coach_user_id: auth.coachUser.id,
      titel: body.titel.trim().slice(0, 200),
      beschreibung: typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null,
      bereich: body.bereich,
      messgroesse: typeof body.messgroesse === 'string' ? body.messgroesse.slice(0, 200) : null,
      startwert: body.startwert == null ? null : Number(body.startwert),
      zielwert: body.zielwert == null ? null : Number(body.zielwert),
      aktueller_wert: body.startwert == null ? null : Number(body.startwert),
      ziel_bis: typeof body.ziel_bis === 'string' && body.ziel_bis ? body.ziel_bis : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Ziel konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ ziel: data })
}
