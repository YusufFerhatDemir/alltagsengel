import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSigAdmin } from '@/lib/signaturen/api-auth'
import { listeSignaturen, fordereSignaturAn } from '@/lib/signaturen/signaturen'
import { SIGNATUR_STATUS_WERTE, type SignaturStatus } from '@/lib/signaturen/types'

export async function GET(req: NextRequest) {
  const auth = await requireSigAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const dokument_id = url.searchParams.get('dokument_id') || undefined
  const status = url.searchParams.get('status') || undefined
  const signatar_id = url.searchParams.get('signatar_id') || undefined

  try {
    const supabase = await createClient()
    const signaturen = await listeSignaturen(supabase, auth.ctx.organizationId, {
      dokument_id,
      status: status && SIGNATUR_STATUS_WERTE.includes(status as SignaturStatus) ? status as SignaturStatus : undefined,
      signatar_id,
    })
    return NextResponse.json(signaturen)
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
    const signatur = await fordereSignaturAn(supabase, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(signatur, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('Pflichtfeld') || msg.includes('muss') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
