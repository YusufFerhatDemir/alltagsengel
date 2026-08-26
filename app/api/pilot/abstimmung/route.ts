import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { stimmeMoneyPathAb, abstimmBerichtText } from '@/lib/pilot/reconciliation'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// GET /api/pilot/abstimmung
//
// Track 8 von Phase 8. Geht die Kette Leistung → Rechnung → Versand →
// Zahlung → Zuordnung → Status → Buchhaltung → DATEV → Audit auf?
//
// ‼️ Diese Route REPARIERT NICHTS. ‼️
// Sie liest neun Tabellen mandantengezäunt und hält sie gegeneinander.
// Findet sie eine Abweichung, meldet sie sie — sie gleicht nichts aus.
// Eine Abstimmung, die repariert, verdeckt genau das, was sie finden
// soll.
//
// ?limit=…      Obergrenze je Tabelle. Wird sie erreicht, steht das im
//               Bericht — eine gekappte Abstimmung ist unvollständig,
//               nicht sauber.
// ?format=text  Menschenlesbarer Bericht.
// ═══════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 5000

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const { searchParams } = new URL(req.url)
    const limitRoh = Number(searchParams.get('limit'))
    const limit = Number.isFinite(limitRoh) && limitRoh > 0
      ? Math.min(Math.floor(limitRoh), MAX_LIMIT)
      : undefined

    const bericht = await stimmeMoneyPathAb(createAdminClient(), { organizationId, limit })

    if (searchParams.get('format') === 'text') {
      return new NextResponse(abstimmBerichtText(bericht), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json(bericht, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
}
