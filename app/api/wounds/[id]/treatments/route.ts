import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound } from '@/lib/wunden/wunden'
import { createTreatment, listTreatments, naechsterVwTermin } from '@/lib/wunden/behandlungen'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const behandlungen = await listTreatments(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ behandlungen, naechsterVw: naechsterVwTermin(behandlungen) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const body = await request.json()
    if (!body.massnahme) {
      return NextResponse.json({ error: 'massnahme ist Pflichtfeld.' }, { status: 400 })
    }

    const behandlung = await createTreatment(admin, {
      organizationId,
      woundId: id,
      durchgefuehrtVon: userId,
      durchgefuehrtAm: body.durchgefuehrtAm ?? null,
      massnahme: body.massnahme,
      wundreinigung: body.wundreinigung ?? null,
      materialien: body.materialien ?? [],
      schmerzmittelGegeben: body.schmerzmittelGegeben ?? false,
      besonderheiten: body.besonderheiten ?? null,
      naechsterVwAm: body.naechsterVwAm ?? null,
    })

    return NextResponse.json({ behandlung })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
