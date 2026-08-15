import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { getActiveProviderConfig, listProviderConfigs, setActiveProviderConfig } from '@/lib/kim/provider-config-service'
import type { SetProviderConfigInput } from '@/lib/kim/provider-config-service'

export async function GET() {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  try {
    const sb = await createClient()
    const [active, all] = await Promise.all([
      getActiveProviderConfig(sb, auth.ctx.organizationId),
      listProviderConfigs(sb, auth.ctx.organizationId),
    ])
    return NextResponse.json({ active, all })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json()) as SetProviderConfigInput
    if (!body.provider_type) {
      return NextResponse.json({ error: 'Pflichtfeld: provider_type.' }, { status: 400 })
    }
    const sb = await createClient()
    const config = await setActiveProviderConfig(sb, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(config)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
