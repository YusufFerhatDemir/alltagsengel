import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { getAufgabe, updateAufgabe, deleteAufgabe } from '@/lib/ops/aufgaben'
import { logAktivitaet } from '@/lib/ops/aktivitaetslog'
import { logger } from '@/lib/logger'
const log = logger.child('api:ops')

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const data = await getAufgabe(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, ...safeData } = body
    const vorher = await getAufgabe(supabase, { organizationId: auth.ctx.organizationId, id }).catch(() => null)
    const data = await updateAufgabe(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
      data: safeData,
    })
    const statusGeaendert = vorher != null && vorher.status !== data.status
    await logAktivitaet(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'aufgabe',
      entitaetId: id,
      aktion: statusGeaendert ? 'status_geaendert' : 'aktualisiert',
      vorher,
      nachher: data,
      akteurId: auth.ctx.userId,
    }).catch((err) => log.error('Aktivitaetslog (Aufgabe aktualisiert) fehlgeschlagen', { errorMessage: String(err) }))
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const vorher = await getAufgabe(supabase, { organizationId: auth.ctx.organizationId, id }).catch(() => null)
    const data = await deleteAufgabe(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
    })
    await logAktivitaet(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'aufgabe',
      entitaetId: id,
      aktion: 'archiviert',
      vorher,
      akteurId: auth.ctx.userId,
    }).catch((err) => log.error('Aktivitaetslog (Aufgabe geloescht) fehlgeschlagen', { errorMessage: String(err) }))
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
