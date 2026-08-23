import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { sucheDokumente } from '@/lib/akten/suche'
import type { DokumentKategorie, DokumentStatus, DokumentTyp } from '@/lib/akten/types'

export async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const tagsRaw = params.get('tags')
    const admin = createAdminClient()

    const treffer = await sucheDokumente(admin, {
      organizationId,
      suchtext: params.get('suchtext') ?? undefined,
      clientId: params.get('clientId') ?? undefined,
      caregiverId: params.get('caregiverId') ?? undefined,
      dokumentTyp: (params.get('dokumentTyp') as DokumentTyp) ?? undefined,
      kategorie: (params.get('kategorie') as DokumentKategorie) ?? undefined,
      status: (params.get('status') as DokumentStatus) ?? undefined,
      tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      von: params.get('von') ?? undefined,
      bis: params.get('bis') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    })

    return NextResponse.json({ treffer })
  } catch (err) {
    return safeApiError(err, request)
  }
}
