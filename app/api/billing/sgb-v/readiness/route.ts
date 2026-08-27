import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ermittleSgbVReadiness } from '@/lib/abrechnung/sgb-v/readiness'
import type { SgbVFormat } from '@/lib/abrechnung/sgb-v/versionen'
import { monatBerlin } from '@/lib/utils/timezone';
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/sgb-v/readiness?monat=2026-08&format=edifact_slga_slla
 *
 * Blocker-Übersicht für die Abrechnung nach § 302 SGB V — getrennt in intern
 * lösbare und extern zu beschaffende Voraussetzungen.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const url = new URL(request.url)
    const monat = url.searchParams.get('monat') || monatBerlin()
    if (!/^\d{4}-\d{2}$/.test(monat)) {
      return NextResponse.json({ error: 'Parameter monat muss JJJJ-MM sein.' }, { status: 400 })
    }

    const formatParam = url.searchParams.get('format')
    const format: SgbVFormat =
      formatParam === 'xml_hkp' ? 'xml_hkp' : 'edifact_slga_slla'

    const admin = createAdminClient()
    const ergebnis = await ermittleSgbVReadiness(admin, organizationId, monat, format)

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
