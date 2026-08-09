import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireMedAdmin } from '@/lib/medikamente/api-auth'
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireMedAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const sb = await createClient()
    const created = await erstelleMedikament(sb, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('Pflichtfeld') || msg.includes('Ungültig') || msg.includes('muss') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
