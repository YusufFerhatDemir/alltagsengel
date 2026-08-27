import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('admin/mitarbeitergespraeche')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'caregiver_id', 'gespraechsart', 'datum', 'teilnehmer',
  'themen', 'ziele_vereinbart', 'massnahmen', 'naechstes_gespraech_geplant_am',
  'status', 'vertraulich',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Mitarbeitergespräche, optional gefiltert nach Mitarbeiter. */
export const GET = withTracking(async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin('personal.lesen')
  if (!auth.ok) return auth.response

  try {
    const caregiverId = request.nextUrl.searchParams.get('caregiverId')
    const showArchived = request.nextUrl.searchParams.get('showArchived')
    const admin = createAdminClient()
    let query = admin
      .from('mitarbeitergespraeche')
      .select('id, caregiver_id, gespraechsart, datum, teilnehmer, themen, ziele_vereinbart, massnahmen, naechstes_gespraech_geplant_am, status, vertraulich, created_at, caregivers(first_name, last_name)')
      .eq('organization_id', auth.ctx.organizationId)
      .order('datum', { ascending: false })

    if (caregiverId) query = query.eq('caregiver_id', caregiverId)
    if (showArchived !== 'true') query = query.neq('status', 'archiviert')

    const { data, error } = await query
    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ gespraeche: data ?? [] })
  } catch (e) {
    return safeApiError(e, request)
  }
})

/** POST — neues Mitarbeitergespräch anlegen. */
export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin('personal.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (!eingabe.caregiver_id || !eingabe.gespraechsart) {
      return NextResponse.json({ error: 'Mitarbeiter und Gesprächsart sind Pflichtfelder' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: caregiver } = await admin
      .from('caregivers')
      .select('id')
      .eq('id', eingabe.caregiver_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!caregiver) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('mitarbeitergespraeche')
      .insert({ ...eingabe, organization_id: auth.ctx.organizationId, erstellt_von: auth.ctx.userId })
      .select('id')
      .single()

    if (error) {
      log.error('Anlegen fehlgeschlagen', { errorMessage: error.message })
      return apiErrorResponse(error, req)
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      entityType: 'mitarbeitergespraech',
      entityId: data.id,
      details: { nachher: eingabe },
      request: req,
    }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
})
