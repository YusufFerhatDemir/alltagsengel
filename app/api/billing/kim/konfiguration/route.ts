import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeKonfigurationen, erstelleKonfiguration } from '@/lib/kim/config'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/kim/konfiguration
 * POST /api/billing/kim/konfiguration
 *
 * Reine Stammdatenverwaltung für KIM-Postfach-Konfigurationen. Es findet
 * KEINE Verbindung zu einem Postfach oder Provider statt — nur Speichern/
 * Auflisten (s. lib/kim/config.ts).
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const admin = createAdminClient()
    const data = await ladeKonfigurationen(admin, organizationId)
    return NextResponse.json(data)
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId, userId } = auth.ctx

  try {
    const body = await request.json()
    const admin = createAdminClient()
    const data = await erstelleKonfiguration(admin, organizationId, body, userId)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
