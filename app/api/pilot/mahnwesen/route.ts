import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { mahnwesenDryRun, mahnDryRunBerichtText } from '@/lib/pilot/mahnwesen-dryrun'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// GET /api/pilot/mahnwesen
//
// Track 7 von Phase 8. Was täte der Mahnlauf heute mit dem ECHTEN
// Bestand — Rechnung für Rechnung, mit Begründung?
//
// ‼️ Diese Route VERSCHICKT NICHTS. ‼️
// Sie erhöht keine Mahnstufe, bucht keine Gebühr und legt keine Zeile
// in der Warteschlange an. Sie ruft `pruefeMahnbarkeit()` — dieselbe
// Prüfung, die `advanceDunning()` vor jeder Eskalation fährt — und
// übersetzt deren Ergebnis in vier Urteile.
//
// ?ids=…,…      Nur diese Rechnungen prüfen.
// ?limit=…      Obergrenze, wenn die Liste selbst ermittelt wird.
// ?format=text  Menschenlesbarer Bericht.
// ═══════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LIMIT = 500

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const { searchParams } = new URL(req.url)
    const idsRoh = searchParams.get('ids')
    const invoiceIds = idsRoh
      ? idsRoh.split(',').map(s => s.trim()).filter(Boolean)
      : undefined

    const limitRoh = Number(searchParams.get('limit'))
    const limit = Number.isFinite(limitRoh) && limitRoh > 0
      ? Math.min(Math.floor(limitRoh), MAX_LIMIT)
      : undefined

    const bericht = await mahnwesenDryRun(createAdminClient(), {
      organizationId, invoiceIds, limit,
    })

    if (searchParams.get('format') === 'text') {
      return new NextResponse(mahnDryRunBerichtText(bericht), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
    return NextResponse.json(bericht, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
}
