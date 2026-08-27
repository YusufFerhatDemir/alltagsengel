/**
 * /api/billing/dta/fristen
 *
 * GET:  Überfällige Fristen + anstehende Wiedervorlagen
 * POST: Fristenprüfung manuell auslösen (Eskalation + Abgelaufen-Markierung)
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  pruefeUeberfaelligeFristen,
  escaliereUeberfaellige,
} from '@/lib/abrechnung/fristen-manager'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const uebersicht = await pruefeUeberfaelligeFristen(admin, organizationId)

    return NextResponse.json(uebersicht)
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    const ergebnis = await escaliereUeberfaellige(admin, organizationId, userId)

    return NextResponse.json({
      ...ergebnis,
      nachricht: `${ergebnis.eskaliert} Fristen eskaliert, ${ergebnis.abgelaufen} als abgelaufen markiert.`,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
