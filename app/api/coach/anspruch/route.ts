import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { pruefeAnspruch, type NutzungDurch } from '@/lib/coach/anspruch'

const NUTZUNG_DURCH: NutzungDurch[] = ['pflegebeduerftig', 'angehoerig', 'gemeinsam']

/** Bisherige Anspruchsprüfungen des Nutzers (neueste zuerst). */
export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_anspruchspruefungen')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('geprueft_am', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Prüfungen konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ pruefungen: data ?? [] })
}

/**
 * Selbstauskunft auswerten und speichern.
 * Die Bewertung passiert serverseitig (lib/coach/anspruch.ts), damit
 * Ergebnis und gespeicherte Kriterien-Version immer zusammenpassen.
 */
export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))

  const pflegegrad = body.pflegegrad == null ? null : Number(body.pflegegrad)
  if (pflegegrad !== null && (!Number.isInteger(pflegegrad) || pflegegrad < 0 || pflegegrad > 5)) {
    return NextResponse.json({ error: 'Pflegegrad muss zwischen 0 und 5 liegen (0 = kein Pflegegrad).' }, { status: 400 })
  }
  const nutzungDurch: NutzungDurch | null = NUTZUNG_DURCH.includes(body.nutzung_durch) ? body.nutzung_durch : null
  const haeuslich = body.haeusliche_versorgung == null ? null : Boolean(body.haeusliche_versorgung)

  const ergebnis = pruefeAnspruch({
    pflegegrad,
    pflegegradBeantragt: Boolean(body.pflegegrad_beantragt),
    haeuslicheVersorgung: haeuslich,
    nutzungDurch,
  })

  const { data, error } = await auth.supabase
    .from('coach_anspruchspruefungen')
    .insert({
      coach_user_id: auth.coachUser.id,
      pflegegrad,
      pflegegrad_beantragt: Boolean(body.pflegegrad_beantragt),
      haeusliche_versorgung: haeuslich,
      nutzung_durch: nutzungDurch,
      ergebnis: ergebnis.ergebnis,
      kriterien_version: ergebnis.kriterienVersion,
      hinweise: ergebnis.hinweise,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Prüfung konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ pruefung: data, ergebnis })
}
