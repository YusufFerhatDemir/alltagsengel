import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { createDraftMessage, listMessages } from '@/lib/kim/message-service'
import type { KimMessageFilter, CreateKimMessageInput } from '@/lib/kim/types'

export async function GET(req: NextRequest) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const filter: KimMessageFilter = {}
  const direction = url.searchParams.get('direction')
  const status = url.searchParams.get('status')
  const messageType = url.searchParams.get('message_type')
  const search = url.searchParams.get('search')

  if (direction) filter.direction = direction as KimMessageFilter['direction']
  if (status) filter.status = status as KimMessageFilter['status']
  if (messageType) filter.message_type = messageType as KimMessageFilter['message_type']
  if (search) filter.search = search

  try {
    const sb = await createClient()
    const data = await listMessages(sb, auth.ctx.organizationId, filter)
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, req)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json()) as CreateKimMessageInput
    const sb = await createClient()
    const created = await createDraftMessage(sb, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('Pflichtfeld') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
