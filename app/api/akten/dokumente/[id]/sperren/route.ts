import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { lockDokument, unlockDokument } from '@/lib/akten/dokumente'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId, role } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    if (body.gesperrt === false) {
      const dokument = await unlockDokument(admin, id, organizationId, userId, role)
      return NextResponse.json({ dokument })
    }

    if (!body.grund) {
      return NextResponse.json({ error: 'Sperrgrund ist Pflicht.' }, { status: 400 })
    }
    const dokument = await lockDokument(admin, id, organizationId, body.grund, userId, role)
    return NextResponse.json({ dokument })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
}
