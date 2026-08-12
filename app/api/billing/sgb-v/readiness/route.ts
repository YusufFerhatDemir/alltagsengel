import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ermittleSgbVReadiness } from '@/lib/abrechnung/sgb-v/readiness'
import type { SgbVFormat } from '@/lib/abrechnung/sgb-v/versionen'
import { monatBerlin } from '@/lib/utils/timezone';

/**
 * GET /api/billing/sgb-v/readiness?monat=2026-08&format=edifact_slga_slla
 *
 * Blocker-Übersicht für die Abrechnung nach § 302 SGB V — getrennt in intern
 * lösbare und extern zu beschaffende Voraussetzungen.
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
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
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/readiness] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
