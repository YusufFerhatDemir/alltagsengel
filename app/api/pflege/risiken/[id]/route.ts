import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { deaktiviereRisiko, updateRisiko } from '@/lib/pflege/risiken'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const risiko = await updateRisiko(admin, id, auth.ctx.organizationId, {
      risikoTyp: body.risikoTyp,
      bezeichnung: body.bezeichnung,
      beschreibung: body.beschreibung,
      schweregrad: body.schweregrad,
      massnahmen: body.massnahmen,
      aktiv: body.aktiv,
      erkanntAm: body.erkanntAm,
      naechstePruefung: body.naechstePruefung,
    })

    return NextResponse.json({ risiko })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

/** Soft-Delete: aktiv=false. Das Risiko bleibt für die Historie erhalten. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const risiko = await deaktiviereRisiko(admin, id, auth.ctx.organizationId)

    return NextResponse.json({ risiko })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
