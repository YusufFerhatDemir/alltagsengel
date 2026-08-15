import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMedAdmin } from '@/lib/medikamente/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import {
  holeMedikament,
  aktualisiereMedikament,
  setzeMedikamentStatus,
} from '@/lib/medikamente/medikamente'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const sb = await createClient()
    const med = await holeMedikament(sb, auth.ctx.organizationId, id)
    if (!med) return NextResponse.json({ error: 'Nicht gefunden.' }, { status: 404 })
    return NextResponse.json(med)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const body = await req.json()
    const sb = await createClient()

    if (body.status && ['aktiv', 'pausiert', 'abgesetzt'].includes(body.status)) {
      const result = await setzeMedikamentStatus(
        sb, auth.ctx.organizationId, id, body.status, body.abgesetzt_grund,
      )

      await logAuditEvent({
        action: 'update',
        actorId: auth.ctx.userId,
        actorName: auth.ctx.name,
        actorRole: auth.ctx.role,
        organizationId: auth.ctx.organizationId,
        entityType: 'medikament',
        entityId: id,
        details: { status: body.status, abgesetzt_grund: body.abgesetzt_grund },
        request: req,
      })

      return NextResponse.json(result)
    }

    const result = await aktualisiereMedikament(sb, auth.ctx.organizationId, id, body)

    await logAuditEvent({
      action: 'update',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'medikament',
      entityId: id,
      details: { geaenderte_felder: Object.keys(body) },
      request: req,
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('Ungültig') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    const sb = await createClient()
    const result = await setzeMedikamentStatus(sb, auth.ctx.organizationId, id, 'abgesetzt', 'Archiviert')

    await logAuditEvent({
      action: 'archive',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'medikament',
      entityId: id,
      details: { aktion: 'archiviert' },
      request: req,
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
