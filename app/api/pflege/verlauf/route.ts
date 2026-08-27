import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { rolleDarf } from '@/lib/auth/guard'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requirePflegeAdmin, requirePflegeUser } from '@/lib/pflege/api-auth'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { createVerlauf, listVerlauf } from '@/lib/pflege/verlauf'
import type { VerlaufKategorie, VerlaufSichtbarkeit, VerlaufTyp } from '@/lib/pflege/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const eintraege = await listVerlauf(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      eintragTyp: (params.get('eintragTyp') as VerlaufTyp) ?? undefined,
      kategorie: (params.get('kategorie') as VerlaufKategorie) ?? undefined,
      sichtbarkeit: (params.get('sichtbarkeit') as VerlaufSichtbarkeit) ?? undefined,
      vonDatum: params.get('vonDatum') ?? undefined,
      bisDatum: params.get('bisDatum') ?? undefined,
      nurDringende: params.get('nurDringende') === 'true',
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ eintraege })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * POST — Verlaufseintrag anlegen.
 * Admins schreiben mit Service-Role und expliziter Organisation.
 * Engel schreiben mit ihrem eigenen Client: RLS (engel_pflege_verlauf_insert)
 * prüft die aktive Zuordnung, current_org_id() setzt die Organisation.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePflegeUser()
    if (!auth.ok) return auth.response

    const body = await request.json()
    if (!body.clientId || !body.inhalt) {
      return NextResponse.json({ error: 'clientId und inhalt sind Pflichtfelder.' }, { status: 400 })
    }

    const istAdmin = rolleDarf(auth.role, 'pflege.lesen')
    let supabase = await createClient()
    let organizationId: string | undefined

    if (istAdmin) {
      const adminAuth = await requirePflegeAdmin('pflege.schreiben')
      if (!adminAuth.ok) return adminAuth.response
      organizationId = adminAuth.ctx.organizationId
      supabase = createAdminClient()
      if (!(await clientGehoertZuOrg(supabase, body.clientId, organizationId))) {
        return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
      }
    }

    const eintrag = await createVerlauf(supabase, {
      organizationId,
      clientId: body.clientId,
      eintragDatum: body.eintragDatum,
      eintragTyp: body.eintragTyp,
      kategorie: body.kategorie,
      titel: body.titel ?? null,
      inhalt: body.inhalt,
      istDringend: body.istDringend,
      serviceRecordId: body.serviceRecordId ?? null,
      massnahmeId: body.massnahmeId ?? null,
      anamneseId: body.anamneseId ?? null,
      autorId: auth.userId,
      autorName: auth.name,
      autorRolle: auth.role,
      sichtbarkeit: body.sichtbarkeit,
    })

    return NextResponse.json({ eintrag })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
