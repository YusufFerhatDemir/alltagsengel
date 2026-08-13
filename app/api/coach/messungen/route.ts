import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { belastungSumme } from '@/lib/coach/belastung'
import type { MessInstrument, Messzeitpunkt } from '@/lib/coach/types'

const INSTRUMENTE: MessInstrument[] = ['fes_i_k', 'bsfc_s', 'sus', 'belastung_kurz', 'selbsteinschaetzung_selbststaendigkeit', 'sturzereignis', 'befinden']
const ZEITPUNKTE: Messzeitpunkt[] = ['t0', 't1', 't2', 't3', 'laufend']

export async function GET(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const instrument = new URL(request.url).searchParams.get('instrument')
  let query = auth.supabase
    .from('coach_measurements')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('erhoben_am', { ascending: true })
  if (instrument && INSTRUMENTE.includes(instrument as MessInstrument)) {
    query = query.eq('instrument', instrument)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Messungen konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ messungen: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireCoachUser({ schreibzugriff: true })
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (!INSTRUMENTE.includes(body.instrument)) {
    return NextResponse.json({ error: 'Ungültiges Instrument.' }, { status: 400 })
  }
  const antworten = body.antworten && typeof body.antworten === 'object' && !Array.isArray(body.antworten)
    ? body.antworten
    : {}

  // Summenwert serverseitig berechnen, wo die Logik bekannt ist —
  // Clients können den Wert nicht manipulieren.
  let summenwert: number | null = null
  if (body.instrument === 'belastung_kurz') {
    summenwert = belastungSumme(antworten)
    if (summenwert === null) {
      return NextResponse.json({ error: 'Bitte alle Fragen der Belastungs-Selbsteinschätzung beantworten.' }, { status: 400 })
    }
  } else if (body.summenwert != null && Number.isFinite(Number(body.summenwert))) {
    summenwert = Number(body.summenwert)
  }

  const { data, error } = await auth.supabase
    .from('coach_measurements')
    .insert({
      coach_user_id: auth.coachUser.id,
      instrument: body.instrument,
      messzeitpunkt: ZEITPUNKTE.includes(body.messzeitpunkt) ? body.messzeitpunkt : 'laufend',
      antworten,
      summenwert,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Messung konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ messung: data })
}
