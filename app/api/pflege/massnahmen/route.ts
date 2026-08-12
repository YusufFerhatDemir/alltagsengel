import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createMassnahme, listMassnahmen } from '@/lib/pflege/massnahmen'
import type { MassnahmeKategorie, MassnahmeStatus } from '@/lib/pflege/types'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const massnahmen = await listMassnahmen(admin, {
      organizationId: auth.ctx.organizationId,
      planId: params.get('planId') ?? undefined,
      kategorie: (params.get('kategorie') as MassnahmeKategorie) ?? undefined,
      status: (params.get('status') as MassnahmeStatus) ?? undefined,
    })

    return NextResponse.json({ massnahmen })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    if (!body.planId || !body.kategorie || !body.titel) {
      return NextResponse.json({ error: 'planId, kategorie und titel sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const massnahme = await createMassnahme(admin, {
      organizationId,
      planId: body.planId,
      kategorie: body.kategorie,
      titel: body.titel,
      beschreibung: body.beschreibung ?? null,
      ziel: body.ziel ?? null,
      haeufigkeit: body.haeufigkeit ?? null,
      verantwortlich: body.verantwortlich ?? null,
      prioritaet: body.prioritaet,
      beginnDatum: body.beginnDatum ?? null,
      endeDatum: body.endeDatum ?? null,
      sortierung: body.sortierung,
      erstelltVon: userId,
    })

    return NextResponse.json({ massnahme })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
