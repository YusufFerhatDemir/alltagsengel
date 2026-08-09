import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import type { AktivitaetKategorie } from '@/lib/coach/types'

const KATEGORIEN: AktivitaetKategorie[] = ['mobilitaet', 'selbstversorgung', 'alltagsgestaltung', 'soziale_teilhabe', 'entlastung', 'erinnerung']

function parseWochentage(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null
  const tage = [...new Set(input.map(Number))]
  if (tage.some(t => !Number.isInteger(t) || t < 1 || t > 7)) return null
  return tage.sort((a, b) => a - b)
}

export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_activities')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Aktivitäten konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ aktivitaeten: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (typeof body.titel !== 'string' || !body.titel.trim()) {
    return NextResponse.json({ error: 'Bitte einen Titel angeben.' }, { status: 400 })
  }
  if (!KATEGORIEN.includes(body.kategorie)) {
    return NextResponse.json({ error: 'Bitte eine gültige Kategorie wählen.' }, { status: 400 })
  }
  const wochentage = parseWochentage(body.wochentage ?? [])
  if (wochentage === null) {
    return NextResponse.json({ error: 'Wochentage müssen Zahlen von 1 (Mo) bis 7 (So) sein.' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('coach_activities')
    .insert({
      coach_user_id: auth.coachUser.id,
      titel: body.titel.trim().slice(0, 200),
      beschreibung: typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : null,
      kategorie: body.kategorie,
      wochentage,
      uhrzeit: typeof body.uhrzeit === 'string' && body.uhrzeit ? body.uhrzeit : null,
      dauer_minuten: body.dauer_minuten == null ? null : Number(body.dauer_minuten),
      goal_id: typeof body.goal_id === 'string' && body.goal_id ? body.goal_id : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Aktivität konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ aktivitaet: data })
}
