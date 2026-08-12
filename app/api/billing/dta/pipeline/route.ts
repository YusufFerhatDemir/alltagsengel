/**
 * /api/billing/dta/pipeline
 *
 * GET:  Pipeline-Status (alle Läufe mit aktuellem Schritt)
 * POST: Pipeline-Verarbeitung manuell auslösen
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  holePipelineStatus,
  pruefeUndVerarbeitePipeline,
} from '@/lib/abrechnung/pipeline-orchestrator'

export async function GET() {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const status = await holePipelineStatus(admin, organizationId)

    return NextResponse.json(status)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    let body: { autoFreigabe?: boolean } = {}
    try {
      body = await request.json()
    } catch {
      // Kein Body → Standardoptionen
    }

    const admin = createAdminClient()
    const ergebnis = await pruefeUndVerarbeitePipeline(
      admin, organizationId, userId,
      { autoFreigabe: body.autoFreigabe ?? false },
    )

    return NextResponse.json(ergebnis)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
