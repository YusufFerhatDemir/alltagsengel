import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { buildExport } from '@/lib/coach/export'
import { heuteBerlin } from '@/lib/utils/timezone';

/**
 * Self-Service-Datenexport (Art. 20 DSGVO / DiPAV Anlage 2):
 * vollständige eigene Daten als strukturiertes JSON, direkt als Download.
 */
export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const [consents, assessments, goals, activities, log, messungen, berichte] = await Promise.all([
    auth.supabase.from('coach_consents').select('*').eq('coach_user_id', auth.coachUser.id).order('erteilt_am', { ascending: true }),
    auth.supabase.from('coach_assessments').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_goals').select('*').eq('coach_user_id', auth.coachUser.id).order('created_at', { ascending: true }),
    auth.supabase.from('coach_activities').select('*').eq('coach_user_id', auth.coachUser.id).order('created_at', { ascending: true }),
    auth.supabase.from('coach_activity_log').select('*').eq('coach_user_id', auth.coachUser.id).order('datum', { ascending: true }),
    auth.supabase.from('coach_measurements').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_reports').select('*').eq('coach_user_id', auth.coachUser.id).order('erstellt_am', { ascending: true }),
  ])

  const fehler = consents.error || assessments.error || goals.error || activities.error || log.error || messungen.error || berichte.error
  if (fehler) return NextResponse.json({ error: 'Export konnte nicht erstellt werden.' }, { status: 500 })

  const exportDaten = buildExport({
    exportiertAm: new Date().toISOString(),
    coachUser: auth.coachUser,
    consents: consents.data ?? [],
    assessments: assessments.data ?? [],
    goals: goals.data ?? [],
    activities: activities.data ?? [],
    activityLog: log.data ?? [],
    measurements: messungen.data ?? [],
    reports: berichte.data ?? [],
  })

  const dateiname = `pflegecoach-export-${heuteBerlin()}.json`
  return new NextResponse(JSON.stringify(exportDaten, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dateiname}"`,
      'Cache-Control': 'no-store',
    },
  })
}
