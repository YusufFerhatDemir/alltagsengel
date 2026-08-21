import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { logger } from '@/lib/logger'
const log = logger.child('admin/biografiebogen')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'beruflicher_werdegang', 'familienstand', 'wichtige_bezugspersonen', 'lebensereignisse',
  'gewohnheiten_tagesablauf', 'vorlieben', 'abneigungen', 'glaubensrichtung_werte',
  'hobbies_interessen', 'haustiere', 'biografische_besonderheiten', 'gesperrt',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Biografiebogen eines Klienten (null, wenn noch nicht angelegt). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { clientId } = await params

  try {
    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id, first_name, last_name')
      .eq('id', clientId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('biografiebogen')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      log.error('Laden fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ client, bogen: data ?? null })
  } catch (e) {
    return safeApiError(e, _req)
  }
}

/** PUT — Biografiebogen anlegen oder aktualisieren (Upsert über client_id). */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { clientId } = await params

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }
    const eingabe = nurErlaubteFelder(body)

    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const { data: bestehend } = await admin
      .from('biografiebogen')
      .select('id')
      .eq('client_id', clientId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (bestehend) {
      const { error } = await admin
        .from('biografiebogen')
        .update(eingabe)
        .eq('id', bestehend.id)
        .eq('organization_id', auth.ctx.organizationId)
      if (error) {
        log.error('Update fehlgeschlagen', { errorMessage: error.message })
        return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
      }

      // Audit-Log: archive/unarchive vs. normales Update
      const auditAction = eingabe.gesperrt === true ? 'archive' : eingabe.gesperrt === false ? 'update' : 'update'
      await logAuditEvent({
        action: auditAction,
        actorId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        entityType: 'biografiebogen',
        entityId: bestehend.id,
        details: { clientId, geaenderteFelder: Object.keys(eingabe) },
        request: req,
      }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

      return NextResponse.json({ erfolg: true, id: bestehend.id })
    }

    const { data, error } = await admin
      .from('biografiebogen')
      .insert({ ...eingabe, client_id: clientId, organization_id: auth.ctx.organizationId, erstellt_von: auth.ctx.userId })
      .select('id')
      .single()
    if (error) {
      log.error('Anlegen fehlgeschlagen', { errorMessage: error.message })
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      entityType: 'biografiebogen',
      entityId: data.id,
      details: { clientId, felder: Object.keys(eingabe) },
      request: req,
    }).catch(err => log.errorWithException('Audit-Log fehlgeschlagen', err))

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    return safeApiError(e, req)
  }
}
