import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('admin/fixierungen/ueberwachung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET — Überwachungseinträge einer Maßnahme. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('pflege.lesen')
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const admin = createAdminClient()
    // organization_id-Check indirekt über die Maßnahme (Fremdschlüssel-Grenze).
    const { data: massnahme } = await admin
      .from('freiheitsentziehende_massnahmen')
      .select('id')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!massnahme) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('fem_ueberwachungen')
      .select('id, kontrolliert_am, zustand_klient, verletzungen, verletzungen_beschreibung, massnahme_weiterhin_erforderlich, bemerkung')
      .eq('massnahme_id', id)
      .order('kontrolliert_am', { ascending: false })

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ ueberwachungen: data ?? [] })
  } catch (e) {
    return safeApiError(e, _req)
  }
}

/** POST — neue Überwachungskontrolle protokollieren. */
export async function POST(
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

    const admin = createAdminClient()
    const { data: massnahme } = await admin
      .from('freiheitsentziehende_massnahmen')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!massnahme) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    }
    if (massnahme.status !== 'aktiv') {
      return NextResponse.json({ error: 'Maßnahme ist bereits beendet — keine weitere Überwachung möglich.' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('fem_ueberwachungen')
      .insert({
        organization_id: auth.ctx.organizationId,
        massnahme_id: id,
        kontrolliert_von: auth.ctx.userId,
        zustand_klient: body.zustandKlient ?? null,
        verletzungen: !!body.verletzungen,
        verletzungen_beschreibung: body.verletzungenBeschreibung ?? null,
        massnahme_weiterhin_erforderlich: body.massnahmeWeiterhinErforderlich !== false,
        bemerkung: body.bemerkung ?? null,
      })
      .select('id')
      .single()

    if (error) {
      log.error('Anlegen fehlgeschlagen', { errorMessage: error.message })
      return apiErrorResponse(error)
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'fem_ueberwachung',
      entityId: data.id,
      details: { massnahme_id: id, verletzungen: !!body.verletzungen },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}
