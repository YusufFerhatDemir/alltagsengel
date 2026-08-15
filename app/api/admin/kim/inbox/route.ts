import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { listMessages } from '@/lib/kim/message-service'
import { fetchAndStoreInbound } from '@/lib/kim/inbox-service'
import { resolveOrgProvider } from '@/lib/kim/provider-config-service'

export async function GET(req: NextRequest) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')

  try {
    const sb = await createClient()
    const data = await listMessages(sb, auth.ctx.organizationId, {
      direction: 'inbound',
      status: status ? (status as 'entwurf' | 'wartend' | 'gesendet' | 'zugestellt' | 'gelesen' | 'fehler' | 'storniert') : undefined,
      search: search ?? undefined,
    })
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Ruft neue Nachrichten vom aktiven Provider ab ("Postfach abrufen"). */
export async function POST() {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  try {
    const sb = await createClient()
    const admin = createAdminClient()
    const provider = await resolveOrgProvider(sb, auth.ctx.organizationId)
    const summary = await fetchAndStoreInbound(admin, provider, auth.ctx.organizationId)
    return NextResponse.json(summary)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
