import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireAngehAdmin } from '@/lib/angehoerige/api-auth'
import {
  holeZugang,
  widerrufeZugang,
  aktualisiereFreigaben,
  protokolliereZugriff,
} from '@/lib/angehoerige/angehoerige'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAngehAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const supabase = await createClient()
    const zugang = await holeZugang(supabase, auth.ctx.organizationId, id)
    if (!zugang) {
      return NextResponse.json({ error: 'Zugang nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json(zugang)
  } catch (err) {
    return safeApiError(err, _req)
  }
})

export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAngehAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await req.json()

  try {
    const supabase = await createClient()

    if (body.action === 'widerrufen') {
      const zugang = await widerrufeZugang(
        supabase, auth.ctx.organizationId, id, auth.ctx.userId, body.grund,
      )
      await protokolliereZugriff(supabase, auth.ctx.organizationId, {
        zugang_id: id,
        user_id: auth.ctx.userId,
        client_id: zugang.client_id,
        aktion: 'zugang_widerrufen',
        details: { grund: body.grund },
      })
      return NextResponse.json(zugang)
    }

    if (body.freigegebene_bereiche) {
      const zugang = await aktualisiereFreigaben(
        supabase, auth.ctx.organizationId, id,
        body.freigegebene_bereiche, !!body.pflegeberichte_freigegeben,
      )
      await protokolliereZugriff(supabase, auth.ctx.organizationId, {
        zugang_id: id,
        user_id: auth.ctx.userId,
        client_id: zugang.client_id,
        aktion: 'freigabe_geaendert',
        details: { bereiche: body.freigegebene_bereiche },
      })
      return NextResponse.json(zugang)
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 })
  } catch (err) {
    return safeApiError(err, req)
  }
})
