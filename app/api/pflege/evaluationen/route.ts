import { apiErrorResponse, safeApiError } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import {
  evaluiereMassnahme,
  listEvaluationen,
  listFaelligeEvaluationen,
} from '@/lib/pflege/evaluation'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Evaluationen einer Massnahme — oder die Faelligkeitsliste.
 *
 * `?faellig=true` beantwortet die Frage, die vor dem 29.08.2026 gar nicht
 * beantwortbar war: welche Massnahmen zur Beurteilung anstehen. Genau
 * danach wird bei einer Qualitaetspruefung nach § 114 SGB XI gefragt.
 *
 * `?stichtag=` ist bewusst zugelassen: ohne ihn liesse sich die
 * Faelligkeit nur pruefen, indem man die Uhr stellt.
 */
export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()

    if (params.get('faellig') === 'true') {
      const faellig = await listFaelligeEvaluationen(
        admin,
        auth.ctx.organizationId,
        params.get('stichtag') ?? undefined,
      )
      return NextResponse.json({ faellig })
    }

    const massnahmeId = params.get('massnahmeId')
    if (!massnahmeId) {
      return NextResponse.json(
        { error: 'massnahmeId ist erforderlich (oder faellig=true).' },
        { status: 400 },
      )
    }

    const evaluationen = await listEvaluationen(admin, {
      organizationId: auth.ctx.organizationId,
      massnahmeId,
    })
    return NextResponse.json({ evaluationen })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    if (!body.massnahmeId || !body.zielerreichung || !body.folgerung) {
      return NextResponse.json(
        { error: 'massnahmeId, zielerreichung und folgerung sind Pflichtfelder.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const evaluation = await evaluiereMassnahme(admin, {
      organizationId,
      massnahmeId: body.massnahmeId,
      zielerreichung: body.zielerreichung,
      bewertung: body.bewertung,
      folgerung: body.folgerung,
      evaluiertAm: body.evaluiertAm,
      naechsteEvaluation: body.naechsteEvaluation ?? null,
      // NIE aus dem Rumpf: der Urheber kommt aus dem Auth-Kontext. Eine
      // Beurteilung, deren Verfasser der Aufrufer frei waehlen kann, ist
      // als Nachweis wertlos.
      evaluiertVon: userId,
    })

    return NextResponse.json({ evaluation }, { status: 201 })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
