import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { createKimAddress, listKimAddresses } from '@/lib/kim/address-book-service'
import type { CreateKimAddressInput } from '@/lib/kim/address-book-service'
import type { KimAddressType } from '@/lib/kim/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const addressType = url.searchParams.get('address_type')
  const isActiveParam = url.searchParams.get('is_active')
  const search = url.searchParams.get('search')

  try {
    const sb = await createClient()
    const data = await listKimAddresses(sb, auth.ctx.organizationId, {
      address_type: addressType ? (addressType as KimAddressType) : undefined,
      is_active: isActiveParam ? isActiveParam === 'true' : undefined,
      search: search ?? undefined,
    })
    return NextResponse.json(data)
  } catch (e) {
    return safeApiError(e, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireKimAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const body = (await req.json()) as CreateKimAddressInput
    const sb = await createClient()
    const created = await createKimAddress(sb, auth.ctx.organizationId, auth.ctx.userId, body)
    return NextResponse.json(created, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    const status = msg.includes('Pflichtfeld') || msg.includes('bereits') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
})
