import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('admin/lagerungsprotokoll')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'client_id', 'position', 'durchgefuehrt_am', 'hautzustand',
  'dekubitusrisiko_auffaellig', 'hilfsmittel', 'naechste_lagerung_geplant_am', 'bemerkung',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Lagerungsprotokolle, optional gefiltert nach Klient. */
export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const clientId = request.nextUrl.searchParams.get('clientId')
    const admin = createAdminClient()
    let query = admin
      .from('lagerungsprotokolle')
      .select('id, client_id, position, durchgefuehrt_am, hautzustand, dekubitusrisiko_auffaellig, hilfsmittel, naechste_lagerung_geplant_am, bemerkung, created_at')
      .eq('organization_id', auth.ctx.organizationId)
      .is('archiviert_am', null)
      .order('durchgefuehrt_am', { ascending: false })
      .limit(200)

    if (clientId) query = query.eq('client_id', clientId)

    const { data, error } = await query
    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ protokolle: data ?? [] })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/** POST — neue Umlagerung protokollieren. */
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (!eingabe.client_id || !eingabe.position) {
      return NextResponse.json({ error: 'Klient und Position sind Pflichtfelder' }, { status: 400 })
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
      .from('lagerungsprotokolle')
      .insert({ ...eingabe, organization_id: auth.ctx.organizationId, durchgefuehrt_von: auth.ctx.userId })
      .select('id')
      .single()

    if (error) {
      log.error('Anlegen fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'lagerungsprotokoll',
      entityId: data.id,
      details: { client_id: eingabe.client_id, position: eingabe.position },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}

/** DELETE — Lagerungseintrag archivieren (Soft-Delete). */
export async function DELETE(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body?.id) {
      return NextResponse.json({ error: 'ID ist ein Pflichtfeld' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('lagerungsprotokolle')
      .update({ archiviert_am: new Date().toISOString() })
      .eq('id', body.id)
      .eq('organization_id', auth.ctx.organizationId)
      .is('archiviert_am', null)
      .select('id')
      .maybeSingle()

    if (error) {
      log.error('Archivierung fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: `Archivierung fehlgeschlagen: ${error.message}` }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Nicht gefunden oder bereits archiviert' }, { status: 404 })
    }

    await logAuditEvent({
      action: 'archive',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'lagerungsprotokoll',
      entityId: data.id,
      details: { aktion: 'archiviert' },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}
