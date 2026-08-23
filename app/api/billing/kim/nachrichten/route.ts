import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeNachrichten, erstelleEntwurf, type KimNachrichtStatus } from '@/lib/kim/nachrichten'

/**
 * GET /api/billing/kim/nachrichten?status=entwurf
 * POST /api/billing/kim/nachrichten
 *
 * Warteschlangen-Verwaltung. Legt nur Entwürfe an — der eigentliche Versand
 * läuft ausschliesslich über POST .../[id]/versenden, der ausnahmslos
 * abweist (s. lib/kim/versand.ts).
 */
const GUELTIGE_STATUS: KimNachrichtStatus[] = ['entwurf', 'wartend', 'gesperrt']

export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const url = new URL(request.url)
    const statusParam = url.searchParams.get('status')
    const status = statusParam && GUELTIGE_STATUS.includes(statusParam as KimNachrichtStatus)
      ? (statusParam as KimNachrichtStatus)
      : undefined

    const admin = createAdminClient()
    const data = await ladeNachrichten(admin, organizationId, status)
    return NextResponse.json(data)
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId, userId } = auth.ctx

  try {
    const body = await request.json()
    const admin = createAdminClient()
    const data = await erstelleEntwurf(admin, organizationId, body, userId)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
