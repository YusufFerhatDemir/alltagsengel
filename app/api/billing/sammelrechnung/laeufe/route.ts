import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeLaeufe, ladeLauf, brichLaufAb } from '@/lib/billing/core'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// SAMMELRECHNUNGSLÄUFE — Betriebsstatus
// ═══════════════════════════════════════════════════════════════
//
// GET  ?month=YYYY-MM&limit=  → Liste der Läufe (neueste zuerst)
// GET  ?batchId=<uuid>        → ein Lauf mit allen Gruppen
// POST { batchId, grund }     → laufenden Lauf freigeben
//
// Der POST bricht NICHT die Rechnungserstellung ab — die läuft in einer
// anderen Funktionsinstanz und lässt sich von außen nicht anhalten. Er
// gibt die Sperre frei und markiert den Lauf als abgebrochen, damit der
// nächste Lauf ihn fortsetzen kann. Bereits erstellte Rechnungen bleiben
// unberührt; sie sind Belege, keine Zwischenstände.
//
// Berechtigungen: Lesen mit `abrechnung.lesen` (Buchhaltung, PDL,
// Administration), Freigeben mit `abrechnung.schreiben` — das Freigeben
// erlaubt einem zweiten Lauf zu starten und ist damit eine Handlung, kein
// Blick.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const { searchParams } = new URL(request.url)
    const admin = createAdminClient()

    const batchId = searchParams.get('batchId')
    if (batchId) {
      if (!UUID.test(batchId)) {
        return NextResponse.json({ error: 'batchId ist keine gültige Kennung.' }, { status: 400 })
      }
      // organizationId kommt aus dem Guard, nie aus der Anfrage: sonst
      // wäre die Batch-ID der Schlüssel zu jedem fremden Lauf.
      const lauf = await ladeLauf(admin, { organizationId, batchId })
      if (!lauf) {
        return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
      }
      return NextResponse.json(lauf)
    }

    const monat = searchParams.get('month')
    const periodMonth = monat && /^\d{4}-\d{2}$/.test(monat) ? monat : undefined
    const limitRoh = Number(searchParams.get('limit') || '20')
    const limit = Number.isFinite(limitRoh) ? limitRoh : 20

    const laeufe = await ladeLaeufe(admin, { organizationId, periodMonth, limit })
    return NextResponse.json({ laeufe })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { organizationId, userId } = auth.ctx

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const batchId = typeof body.batchId === 'string' ? body.batchId : ''
    if (!UUID.test(batchId)) {
      return NextResponse.json({ error: 'batchId ist erforderlich.' }, { status: 400 })
    }

    const grund = typeof body.grund === 'string' && body.grund.trim().length > 0
      ? body.grund.trim().slice(0, 500)
      : 'Manuell freigegeben.'

    const admin = createAdminClient()
    const kopf = await brichLaufAb(admin, { organizationId, batchId, actorId: userId, grund })
    if (!kopf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json({ kopf })
  } catch (err) {
    return safeApiError(err, request)
  }
})
