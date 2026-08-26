import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { pruefeRechnungFuerPilot, pilotBerichtAlsText } from '@/lib/pilot/rechnung-pilot'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// GET /api/billing/invoices/[id]/pilot
//
// Der Trockenlauf vor dem ersten echten Rechnungsversand: die 16 Punkte
// des Preflights PLUS die drei Pilot-Sperren (zweites und drittes Bein
// der Doppelversand-Prüfung, offene Versandsperre).
//
// Unterschied zu ?/preflight: dort steht die Frage des Regelbetriebs
// („darf dieser Beleg raus?"). Hier steht die Frage des Erstbetriebs
// („darf ausgerechnet DIESER Beleg der erste sein?") — und die ist
// strenger, weil es noch keine Erfahrung gibt, auf die sich eine
// Sichtungsentscheidung stützen könnte.
//
// Diese Route SCHREIBT NICHTS und VERSENDET NICHTS.
//
// ?format=text   Menschenlesbare Fassung ohne vollständige E-Mail-Adresse.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx
    const { id } = await params

    const bericht = await pruefeRechnungFuerPilot(createAdminClient(), {
      invoiceId: id,
      organizationId,
    })

    if (new URL(req.url).searchParams.get('format') === 'text') {
      return new NextResponse(pilotBerichtAlsText(bericht), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json(bericht, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
}
