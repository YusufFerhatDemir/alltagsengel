import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { updateMassnahme } from '@/lib/pflege/massnahmen'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const massnahme = await updateMassnahme(admin, id, auth.ctx.organizationId, {
      kategorie: body.kategorie,
      titel: body.titel,
      beschreibung: body.beschreibung,
      ziel: body.ziel,
      haeufigkeit: body.haeufigkeit,
      verantwortlich: body.verantwortlich,
      prioritaet: body.prioritaet,
      status: body.status,
      beginnDatum: body.beginnDatum,
      endeDatum: body.endeDatum,
      ergebnis: body.ergebnis,
      sortierung: body.sortierung,
    })

    return NextResponse.json({ massnahme })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
