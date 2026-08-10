import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSigAdmin } from '@/lib/signaturen/api-auth'
import { listeDokumente, erstelleDokument } from '@/lib/signaturen/signaturen'

export async function GET(req: NextRequest) {
  const auth = await requireSigAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const dokument_typ = url.searchParams.get('dokument_typ') || undefined

  try {
    const supabase = await createClient()
    const dokumente = await listeDokumente(supabase, auth.ctx.organizationId, {
      dokument_typ: dokument_typ as any,
    })
    return NextResponse.json(dokumente)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSigAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const supabase = await createClient()
    const dokument = await erstelleDokument(supabase, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(dokument, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('Pflichtfeld') || msg.includes('Ungültig') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
