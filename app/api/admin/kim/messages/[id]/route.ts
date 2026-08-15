import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { cancelMessage, getMessage, markMessageRead, queueForSending, updateDraftMessage } from '@/lib/kim/message-service'
import { listKimAttachments } from '@/lib/kim/attachment-service'
import type { CreateKimMessageInput } from '@/lib/kim/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const sb = await createClient()
    const admin = createAdminClient()
    const message = await getMessage(sb, auth.ctx.organizationId, id)
    const attachments = await listKimAttachments(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ ...message, attachments })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('nicht gefunden') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

type PatchBody = { action?: 'update' | 'queue' | 'cancel' | 'mark_read' } & Partial<CreateKimMessageInput>

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const body = (await req.json()) as PatchBody
    const sb = await createClient()
    const action = body.action ?? 'update'

    let result
    if (action === 'queue') {
      result = await queueForSending(sb, auth.ctx.organizationId, id, auth.ctx.userId)
    } else if (action === 'cancel') {
      result = await cancelMessage(sb, auth.ctx.organizationId, id, auth.ctx.userId)
    } else if (action === 'mark_read') {
      result = await markMessageRead(sb, auth.ctx.organizationId, id, auth.ctx.userId)
    } else {
      const { action: _omit, ...patch } = body
      result = await updateDraftMessage(sb, auth.ctx.organizationId, id, auth.ctx.userId, patch)
    }

    return NextResponse.json(result)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('nicht gefunden') ? 404 : msg.includes('Ungültig') || msg.includes('Pflichtfeld') || msg.includes('Nur Entwürfe') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
