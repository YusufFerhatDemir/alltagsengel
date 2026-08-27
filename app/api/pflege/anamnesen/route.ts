import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { createAnamnese, listAnamnesen } from '@/lib/pflege/anamnesen'
import type { AnamneseStatus, AnamneseTyp } from '@/lib/pflege/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const anamnesen = await listAnamnesen(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      anamneseTyp: (params.get('anamneseTyp') as AnamneseTyp) ?? undefined,
      status: (params.get('status') as AnamneseStatus) ?? undefined,
    })

    return NextResponse.json({ anamnesen })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId, role } = auth.ctx

    const body = await request.json()
    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId ist ein Pflichtfeld.' }, { status: 400 })
    }

    // organizationId/erstelltVon werden bewusst aus dem Body herausdestrukturiert:
    // sonst landen sie in ...felder und überschreiben die Auth-Werte (Mandanten-Leak).
    const {
      clientId, anamneseDatum, anamneseTyp, erhobenVon, erhobenRolle,
      organizationId: _bodyOrganizationId,
      erstelltVon: _bodyErstelltVon,
      ...felder
    } = body
    void _bodyOrganizationId
    void _bodyErstelltVon

    const admin = createAdminClient()
    if (!(await clientGehoertZuOrg(admin, clientId, organizationId))) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }
    const anamnese = await createAnamnese(admin, {
      // Fachfelder zuerst — die vertrauenswürdigen Werte darunter gewinnen immer.
      ...felder,
      organizationId,
      clientId,
      anamneseDatum,
      anamneseTyp,
      erhobenVon: erhobenVon ?? userId,
      erhobenRolle: erhobenRolle ?? role,
      erstelltVon: userId,
    })

    return NextResponse.json({ anamnese })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
