import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSigAdmin } from '@/lib/signaturen/api-auth'
import { listeSignaturen, fordereSignaturAn } from '@/lib/signaturen/signaturen'
import { SIGNATUR_STATUS_WERTE, type SignaturStatus } from '@/lib/signaturen/types'
import { withTracking } from '@/lib/monitoring/tracker'

// Dienstschluessel plus Fence im Code — Begruendung siehe
// app/api/admin/signaturen/dokumente/route.ts.

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireSigAdmin('lesen')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const dokument_id = url.searchParams.get('dokument_id') || undefined
  const status = url.searchParams.get('status') || undefined
  const signatar_id = url.searchParams.get('signatar_id') || undefined

  try {
    const signaturen = await listeSignaturen(
      createAdminClient(),
      auth.ctx.organizationId,
      auth.ctx.sichtbareTypen,
      {
        dokument_id,
        status: status && SIGNATUR_STATUS_WERTE.includes(status as SignaturStatus)
          ? (status as SignaturStatus)
          : undefined,
        signatar_id,
      },
    )
    return NextResponse.json(signaturen)
  } catch (err) {
    return safeApiError(err, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireSigAdmin('schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const signatur = await fordereSignaturAn(
      createAdminClient(),
      auth.ctx.organizationId,
      auth.ctx.userId,
      body,
      auth.ctx.sichtbareTypen,
    )
    return NextResponse.json(signatur, { status: 201 })
  } catch (err) {
    return safeApiError(err, req)
  }
})
