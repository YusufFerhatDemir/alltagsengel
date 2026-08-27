import { NextResponse, type NextRequest } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { buildExport } from '@/lib/coach/export'
import { buildFhirBundle } from '@/lib/coach/fhir'
import { heuteBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Self-Service-Datenexport (Art. 20 DSGVO / DiPAV Anlage 2):
 * vollständige eigene Daten als strukturiertes JSON, direkt als Download.
 *
 * `?format=fhir` liefert stattdessen ein FHIR-R4-Bundle für die Übergabe an
 * ein Praxis- oder Pflegesystem (lib/coach/fhir.ts). Der hauseigene Export
 * bleibt die Vollausgabe — das Bundle enthält bewusst weniger
 * (keine Einwilligungen, keine Berichte, keine Identität).
 */
export const GET = withTracking(async function GET(request: NextRequest) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const [consents, assessments, goals, activities, log, messungen, berichte, freigaben, anspruchspruefungen] = await Promise.all([
    auth.supabase.from('coach_consents').select('*').eq('coach_user_id', auth.coachUser.id).order('erteilt_am', { ascending: true }),
    auth.supabase.from('coach_assessments').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_goals').select('*').eq('coach_user_id', auth.coachUser.id).order('created_at', { ascending: true }),
    auth.supabase.from('coach_activities').select('*').eq('coach_user_id', auth.coachUser.id).order('created_at', { ascending: true }),
    auth.supabase.from('coach_activity_log').select('*').eq('coach_user_id', auth.coachUser.id).order('datum', { ascending: true }),
    auth.supabase.from('coach_measurements').select('*').eq('coach_user_id', auth.coachUser.id).order('erhoben_am', { ascending: true }),
    auth.supabase.from('coach_reports').select('*').eq('coach_user_id', auth.coachUser.id).order('erstellt_am', { ascending: true }),
    auth.supabase.from('coach_shares').select('*').eq('owner_coach_user_id', auth.coachUser.id).order('erstellt_am', { ascending: true }),
    auth.supabase.from('coach_anspruchspruefungen').select('*').eq('coach_user_id', auth.coachUser.id).order('geprueft_am', { ascending: true }),
  ])

  const fehler = consents.error || assessments.error || goals.error || activities.error || log.error
    || messungen.error || berichte.error || freigaben.error || anspruchspruefungen.error
  if (fehler) return NextResponse.json({ error: 'Export konnte nicht erstellt werden.' }, { status: 500 })

  if (request.nextUrl.searchParams.get('format') === 'fhir') {
    const bundle = buildFhirBundle({
      erstelltAm: new Date().toISOString(),
      assessments: assessments.data ?? [],
      measurements: messungen.data ?? [],
      goals: goals.data ?? [],
      activities: activities.data ?? [],
    })
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        // Offizieller FHIR-Medientyp — Empfängersysteme erkennen das Format daran.
        'Content-Type': 'application/fhir+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="pflegecoach-fhir-${heuteBerlin()}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  }

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
    shares: freigaben.data ?? [],
    anspruchspruefungen: anspruchspruefungen.data ?? [],
  })

  const dateiname = `pflegecoach-export-${heuteBerlin()}.json`
  return new NextResponse(JSON.stringify(exportDaten, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${dateiname}"`,
      'Cache-Control': 'no-store',
    },
  })
})
