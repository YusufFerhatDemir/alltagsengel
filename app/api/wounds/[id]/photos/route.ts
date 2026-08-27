import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound } from '@/lib/wunden/wunden'
import { listWoundPhotos, uploadWoundPhoto } from '@/lib/wunden/fotos'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const fotos = await listWoundPhotos(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ fotos })
  } catch (err) {
    return safeApiError(err, _request)
  }
})

export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Datei ist Pflichtfeld.' }, { status: 400 })
    }

    // assessmentId muss zu GENAU dieser Wunde gehören (kein Cross-Referenzieren).
    const assessmentId = formData.get('assessmentId')?.toString() || null
    if (assessmentId) {
      const { data: assessment } = await admin
        .from('wound_assessments')
        .select('id')
        .eq('id', assessmentId)
        .eq('wound_id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!assessment) {
        return NextResponse.json({ error: 'Assessment gehört nicht zu dieser Wunde.' }, { status: 400 })
      }
    }

    const foto = await uploadWoundPhoto(admin, {
      organizationId,
      woundId: id,
      assessmentId,
      aufgenommenVon: userId,
      aufgenommenAm: formData.get('aufgenommenAm')?.toString() || null,
      bemerkung: formData.get('bemerkung')?.toString() || null,
      datei: { name: file.name, type: file.type, arrayBuffer: await file.arrayBuffer() },
    })

    return NextResponse.json({ foto })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
