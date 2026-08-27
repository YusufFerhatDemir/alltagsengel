import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('admin/ueberleitung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'anlass', 'ziel_einrichtung', 'uebergabe_am', 'diagnosen', 'medikamentenplan_beigefuegt',
  'hilfsmittel', 'mobilitaet', 'kommunikation', 'ernaehrung', 'besonderheiten_pflege', 'risiken',
  'ansprechpartner_abgebend', 'ansprechpartner_uebernehmend', 'dokumente_mitgegeben', 'status',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — einzelnen Überleitungsbogen laden. */
export const GET = withTracking(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('pflege.lesen')
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pflegeueberleitungen')
      .select('*, clients(first_name, last_name)')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, _req)
  }
})

/** PATCH — Überleitungsbogen aktualisieren/abschließen. */
export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('pflege.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }
    const eingabe = nurErlaubteFelder(body)
    if (Object.keys(eingabe).length === 0) {
      return NextResponse.json({ error: 'Keine aenderbaren Felder uebergeben' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('pflegeueberleitungen')
      .update(eingabe)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Update fehlgeschlagen', { errorMessage: error.message })
      return apiErrorResponse(error)
    }
    if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    const auditAction = eingabe.status === 'archiviert' ? 'archive' : 'update'
    await logAuditEvent({
      action: auditAction,
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      entityType: 'pflegeueberleitung',
      entityId: data.id,
      details: { nachher: eingabe },
      request: req,
    }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
})
