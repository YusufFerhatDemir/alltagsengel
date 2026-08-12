import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { deleteVital, updateVital } from '@/lib/vitals/vitals'

/** PATCH — Messung korrigieren (nur Admin: Wert, Zeitpunkt, Notiz). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    const body = await request.json()
    const messung = await updateVital(createAdminClient(), id, auth.ctx.organizationId, {
      wert: body.wert !== undefined ? Number(body.wert) : undefined,
      wertSekundaer: body.wertSekundaer !== undefined && body.wertSekundaer !== null && body.wertSekundaer !== ''
        ? Number(body.wertSekundaer)
        : body.wertSekundaer === undefined ? undefined : null,
      gemessenAm: body.gemessenAm,
      notizen: body.notizen,
    })

    return NextResponse.json({ messung })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

/** DELETE — Fehleingabe entfernen (nur Admin). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    await deleteVital(createAdminClient(), id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
