import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listAufgaben, createAufgabe } from '@/lib/ops/aufgaben'
import { logAktivitaet } from '@/lib/ops/aktivitaetslog'
import type { AufgabenStatus, AufgabenKategorie, AufgabenPrioritaet } from '@/lib/ops/types'
import { logger } from '@/lib/logger'
const log = logger.child('api:ops')

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const status = (url.searchParams.get('status') || undefined) as AufgabenStatus | undefined
  const kategorie = (url.searchParams.get('kategorie') || undefined) as AufgabenKategorie | undefined
  const prioritaet = (url.searchParams.get('prioritaet') || undefined) as AufgabenPrioritaet | undefined
  const verantwortlichId = url.searchParams.get('verantwortlich_id') || undefined
  const search = url.searchParams.get('search') || undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  const offset = url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined
  try {
    const data = await listAufgaben(supabase, {
      organizationId: auth.ctx.organizationId,
      status,
      kategorie,
      prioritaet,
      verantwortlichId,
      search,
      limit,
      offset,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createAufgabe(supabase, {
      organizationId: auth.ctx.organizationId,
      data: body,
    })
    await logAktivitaet(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'aufgabe',
      entitaetId: data.id,
      aktion: 'erstellt',
      nachher: data,
      akteurId: auth.ctx.userId,
    }).catch((err) => log.error('Aktivitaetslog (Aufgabe erstellt) fehlgeschlagen', { errorMessage: String(err) }))
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
