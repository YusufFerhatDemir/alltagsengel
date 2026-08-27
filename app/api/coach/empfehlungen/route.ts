import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { berechneEmpfehlungen, EMPFEHLUNG_DISCLAIMER } from '@/lib/coach/empfehlungen'
import { datumBerlin, heuteBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Regelbasierte, ORGANISATORISCHE Anpassungs-Hinweise (kein Medizinprodukt-
 * Feature — Details in lib/coach/empfehlungen.ts). Berechnung serverseitig
 * aus den eigenen Daten des Nutzers, nichts wird gespeichert.
 */
export const GET = withTracking(async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const heute = heuteBerlin()
  const vor14Tagen = datumBerlin(new Date(Date.now() - 14 * 24 * 3600 * 1000))

  const [goals, activities, log, assessments, messungen] = await Promise.all([
    auth.supabase.from('coach_goals').select('*').eq('coach_user_id', auth.coachUser.id),
    auth.supabase.from('coach_activities').select('*').eq('coach_user_id', auth.coachUser.id),
    auth.supabase.from('coach_activity_log').select('*').eq('coach_user_id', auth.coachUser.id).gte('datum', vor14Tagen),
    auth.supabase.from('coach_assessments').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_measurements').select('*').eq('coach_user_id', auth.coachUser.id).in('instrument', ['belastung_kurz', 'sturzereignis']).order('erhoben_am', { ascending: true }),
  ])

  const fehler = goals.error || activities.error || log.error || assessments.error || messungen.error
  if (fehler) return NextResponse.json({ error: 'Empfehlungen konnten nicht berechnet werden.' }, { status: 500 })

  const empfehlungen = berechneEmpfehlungen({
    heute,
    goals: goals.data ?? [],
    activities: activities.data ?? [],
    activityLog: log.data ?? [],
    assessments: assessments.data ?? [],
    belastungMessungen: (messungen.data ?? []).filter(m => m.instrument === 'belastung_kurz'),
    sturzEreignisse: (messungen.data ?? []).filter(m => m.instrument === 'sturzereignis'),
  })

  return NextResponse.json({ empfehlungen, hinweis: EMPFEHLUNG_DISCLAIMER })
})
