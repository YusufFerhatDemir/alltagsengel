import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { updateKimAddress, verifyKimAddress } from '@/lib/kim/address-book-service'
import { resolveOrgProvider } from '@/lib/kim/provider-config-service'
import type { CreateKimAddressInput } from '@/lib/kim/address-book-service'
import { withTracking } from '@/lib/monitoring/tracker'

type PatchBody = { action?: 'update' | 'verify' } & Partial<CreateKimAddressInput> & { is_active?: boolean }

export const PATCH = withTracking(async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const body = (await req.json()) as PatchBody
    const sb = await createClient()

    if (body.action === 'verify') {
      const provider = await resolveOrgProvider(sb, auth.ctx.organizationId)
      const verification = await verifyKimAddress(sb, provider, auth.ctx.organizationId, id, auth.ctx.userId)
      return NextResponse.json(verification)
    }

    const { action: _omit, ...patch } = body
    const updated = await updateKimAddress(sb, auth.ctx.organizationId, id, auth.ctx.userId, patch)
    return NextResponse.json(updated)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('nicht gefunden') ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
})
