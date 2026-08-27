import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listEvents, emitEvent } from '@/lib/workflow/events'
import type { WfEventStatus, WfModul } from '@/lib/workflow/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || undefined) as WfEventStatus | undefined
  const modul = (url.searchParams.get('modul') || undefined) as WfModul | undefined
  const eventTyp = url.searchParams.get('event_typ') || undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listEvents(supabase, {
      organizationId: auth.ctx.organizationId,
      status, modul, eventTyp, limit, offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    if (!body.eventTyp || !body.modul || !body.quellTabelle) {
      return NextResponse.json({ error: 'eventTyp, modul und quellTabelle sind erforderlich' }, { status: 400 })
    }
    const eventId = await emitEvent(supabase, {
      organizationId: auth.ctx.organizationId,
      eventTyp: body.eventTyp,
      modul: body.modul,
      quellTabelle: body.quellTabelle,
      quellId: body.quellId ?? null,
      payload: body.payload ?? {},
      idempotencyKey: body.idempotencyKey ?? null,
      prioritaet: body.prioritaet ?? 'normal',
      ausgeloestVon: auth.ctx.userId,
    })
    return NextResponse.json({ id: eventId })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
