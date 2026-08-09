import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound } from '@/lib/wunden/wunden'
import { listWoundPhotos, uploadWoundPhoto } from '@/lib/wunden/fotos'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const fotos = await listWoundPhotos(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ fotos })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
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

    const foto = await uploadWoundPhoto(admin, {
      organizationId,
      woundId: id,
      assessmentId: formData.get('assessmentId')?.toString() || null,
      aufgenommenVon: userId,
      aufgenommenAm: formData.get('aufgenommenAm')?.toString() || null,
      bemerkung: formData.get('bemerkung')?.toString() || null,
      datei: { name: file.name, type: file.type, arrayBuffer: await file.arrayBuffer() },
    })

    return NextResponse.json({ foto })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
