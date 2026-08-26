import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erstellePrePilotSnapshot, snapshotAlsText } from '@/lib/pilot/pre-pilot-snapshot'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// GET /api/pilot/snapshot
//
// Der Zustand, gegen den ein erster echter Geldvorgang liefe: welcher
// Commit läuft, welche Datenbank hängt daran, welche Schalter stehen wie.
//
// Diese Route SCHREIBT NICHTS und gibt KEINE Geheimnisse aus — von
// RESEND_API_KEY und CRON_SECRET steht dort nur, OB sie gesetzt sind.
//
// ?format=text   Menschenlesbare Fassung, Zeile 1 trägt das Urteil.
// ?git=…&origin=…&ci=…
//                Werte, die zur Laufzeit nicht messbar sind. Sie erscheinen
//                im Bericht als 'gemeldet', nie als 'gemessen' — wer sie
//                mitschickt, behauptet etwas, das diese Route nicht prüfen
//                kann, und der Bericht sagt das auch so.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const { searchParams } = new URL(req.url)
    const ciRoh = searchParams.get('ci')
    const ciStatus = ciRoh === 'gruen' || ciRoh === 'rot' ? ciRoh : ciRoh ? 'unbekannt' : undefined

    const snapshot = await erstellePrePilotSnapshot(createAdminClient(), {
      organizationId,
      gemeldet: {
        gitHead: searchParams.get('git') ?? undefined,
        originMain: searchParams.get('origin') ?? undefined,
        ciStatus,
        ciLauf: searchParams.get('ciLauf') ?? undefined,
      },
    })

    if (searchParams.get('format') === 'text') {
      return new NextResponse(snapshotAlsText(snapshot), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
}
