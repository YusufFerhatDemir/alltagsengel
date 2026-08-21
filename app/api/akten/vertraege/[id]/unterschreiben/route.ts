import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { vertragUnterschreiben } from '@/lib/akten/vertraege'
import type { SignaturTyp } from '@/lib/akten/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    if (!body.unterschriebenVon || !body.signaturTyp) {
      return NextResponse.json({ error: 'unterschriebenVon und signaturTyp sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const vertrag = await vertragUnterschreiben(admin, id, organizationId, {
      unterschriebenVon: body.unterschriebenVon,
      signaturTyp: body.signaturTyp as SignaturTyp,
      signaturDaten: body.signaturDaten ?? null,
      unterschriftDatum: body.unterschriftDatum,
      actorId: userId,
      actorRole: role,
    })

    return NextResponse.json({ vertrag })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
