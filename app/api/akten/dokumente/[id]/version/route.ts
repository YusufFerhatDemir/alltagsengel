import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { addDokumentVersion, getDokument, uploadDokumentDatei } from '@/lib/akten/dokumente'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const admin = createAdminClient()
    const existing = await getDokument(admin, id, organizationId)
    if (!existing) return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Datei ist Pflichtfeld.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const datei = await uploadDokumentDatei(admin, {
      organizationId,
      clientId: existing.client_id,
      caregiverId: existing.caregiver_id,
      datei: { name: file.name, type: file.type, arrayBuffer },
    })

    const dokument = await addDokumentVersion(admin, {
      dokumentId: id,
      organizationId,
      datei,
      aenderungsgrund: formData.get('aenderungsgrund')?.toString(),
      actorId: userId,
      actorRole: role,
    })

    return NextResponse.json({ dokument })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
