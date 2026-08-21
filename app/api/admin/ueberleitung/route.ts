import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('admin/ueberleitung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'client_id', 'anlass', 'ziel_einrichtung', 'uebergabe_am',
  'diagnosen', 'medikamentenplan_beigefuegt', 'hilfsmittel', 'mobilitaet',
  'kommunikation', 'ernaehrung', 'besonderheiten_pflege', 'risiken',
  'ansprechpartner_abgebend', 'ansprechpartner_uebernehmend', 'dokumente_mitgegeben',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Überleitungsbögen, optional gefiltert nach Klient. */
export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const clientId = request.nextUrl.searchParams.get('clientId')
    const admin = createAdminClient()
    let query = admin
      .from('pflegeueberleitungen')
      .select('id, client_id, anlass, ziel_einrichtung, uebergabe_am, status, ansprechpartner_uebernehmend, created_at, clients(first_name, last_name)')
      .eq('organization_id', auth.ctx.organizationId)
      .order('uebergabe_am', { ascending: false })

    if (clientId) query = query.eq('client_id', clientId)

    const showArchived = request.nextUrl.searchParams.get('showArchived')
    if (showArchived !== 'true') {
      query = query.neq('status', 'archiviert')
    }

    const { data, error } = await query
    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ ueberleitungen: data ?? [] })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/** POST — neuen Überleitungsbogen anlegen (Status: entwurf). */
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (!eingabe.client_id || !eingabe.anlass) {
      return NextResponse.json({ error: 'Klient und Anlass sind Pflichtfelder' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', eingabe.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('pflegeueberleitungen')
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
      entityType: 'pflegeueberleitung',
      entityId: data.id,
      details: { nachher: eingabe },
      request: req,
    }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}
