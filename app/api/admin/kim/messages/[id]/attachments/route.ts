import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { getMessage } from '@/lib/kim/message-service'
import { uploadKimAttachment } from '@/lib/kim/attachment-service'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const sb = await createClient()
    const message = await getMessage(sb, auth.ctx.organizationId, id)
    if (message.status !== 'entwurf') {
      return NextResponse.json({ error: 'Anhänge können nur an Entwürfe angehängt werden.' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Keine Datei übermittelt.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const created = await uploadKimAttachment(admin, {
      organizationId: auth.ctx.organizationId,
      messageId: id,
      actorId: auth.ctx.userId,
      datei: { name: file.name, type: file.type, arrayBuffer: await file.arrayBuffer() },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('nicht erlaubt') || msg.includes('größer') || msg.includes('leer') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
})
