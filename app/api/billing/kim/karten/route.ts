import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeKarten, erstelleKarte } from '@/lib/kim/karten'

/**
 * GET /api/billing/kim/karten
 * POST /api/billing/kim/karten
 *
 * Verwaltungsschicht für eHBA/SMC-B-Zuordnungen. KEINE Kartenkommunikation
 * (s. lib/kim/karten.ts) — nur Speichern/Auflisten der Zuordnung.
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const admin = createAdminClient()
    const data = await ladeKarten(admin, organizationId)
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
    const data = await erstelleKarte(admin, organizationId, body, userId)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
