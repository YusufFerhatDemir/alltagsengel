import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { createAnamnese, listAnamnesen } from '@/lib/pflege/anamnesen'
import type { AnamneseStatus, AnamneseTyp } from '@/lib/pflege/types'

export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const anamnesen = await listAnamnesen(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      anamneseTyp: (params.get('anamneseTyp') as AnamneseTyp) ?? undefined,
      status: (params.get('status') as AnamneseStatus) ?? undefined,
    })

    return NextResponse.json({ anamnesen })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId, role } = auth.ctx

    const body = await request.json()
    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId ist ein Pflichtfeld.' }, { status: 400 })
    }

    const { clientId, anamneseDatum, anamneseTyp, erhobenVon, erhobenRolle, ...felder } = body

    const admin = createAdminClient()
    const anamnese = await createAnamnese(admin, {
      organizationId,
      clientId,
      anamneseDatum,
      anamneseTyp,
      erhobenVon: erhobenVon ?? userId,
      erhobenRolle: erhobenRolle ?? role,
      erstelltVon: userId,
      ...felder,
    })

    return NextResponse.json({ anamnese })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
