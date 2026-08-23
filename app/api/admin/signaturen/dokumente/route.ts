import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireSigAdmin } from '@/lib/signaturen/api-auth'
import { listeDokumente, erstelleDokument } from '@/lib/signaturen/signaturen'
import { SIGNATUR_DOKUMENT_TYPEN, type SignaturDokumentTyp } from '@/lib/signaturen/types'

export async function GET(req: NextRequest) {
  const auth = await requireSigAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const dokument_typ = url.searchParams.get('dokument_typ') || undefined

  try {
    const supabase = await createClient()
    const dokumente = await listeDokumente(supabase, auth.ctx.organizationId, {
      dokument_typ: dokument_typ && SIGNATUR_DOKUMENT_TYPEN.includes(dokument_typ as SignaturDokumentTyp) ? dokument_typ as SignaturDokumentTyp : undefined,
    })
    return NextResponse.json(dokumente)
  } catch (err) {
    return safeApiError(err, req)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSigAdmin('einsatz.schreiben')
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
