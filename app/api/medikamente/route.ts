import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireMedAdmin } from '@/lib/medikamente/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import {
  listeMedikamente,
  erstelleMedikament,
} from '@/lib/medikamente/medikamente'
import type { MedikamentFilter } from '@/lib/medikamente/types'

export async function GET(req: NextRequest) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const filter: MedikamentFilter = {}
  const clientId = url.searchParams.get('client_id')
  const status = url.searchParams.get('status')
  const kategorie = url.searchParams.get('kategorie')

  if (clientId) filter.client_id = clientId
  if (status) filter.status = status as MedikamentFilter['status']
  if (kategorie) filter.kategorie = kategorie as MedikamentFilter['kategorie']

  try {
    const sb = await createClient()
    const data = await listeMedikamente(sb, auth.ctx.organizationId, filter)
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, req)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const sb = await createClient()

    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await sb
      .from('clients')
      .select('id')
      .eq('id', body.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const created = await erstelleMedikament(sb, auth.ctx.organizationId, auth.ctx.userId, body)

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'medikament',
      entityId: created.id,
      details: { client_id: body.client_id, medikament_name: body.medikament_name },
      request: req,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('Pflichtfeld') || msg.includes('Ungültig') || msg.includes('muss') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
