import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { camtPilotLauf, pilotBerichtText } from '@/lib/pilot/camt-pilot'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// POST /api/pilot/camt-dry-run
//
// Track 5 von Phase 8. Nimmt eine echte CAMT-Datei entgegen und sagt
// vollständig, was ein scharfer Import täte — ohne irgendetwas zu tun.
//
// ‼️ Diese Route BUCHT NICHT. ‼️
// Sie ruft `camtPilotLauf()`, und der läuft fest gegen `PILOT_QUELLE`
// (CAMT_IMPORT_MODE=DRY_RUN). Steht die Umgebungsvariable auf LIVE,
// ändert das an DIESER Route nichts — der Bericht meldet den
// Umgebungsstand nur zusätzlich als Warnung.
//
// Warum POST, obwohl nichts geschrieben wird: die Datei muss in den
// Rumpf. Ein Kontoauszug gehört nicht in eine URL — weder in einen
// Query-String noch in ein Server-Log.
//
// ?format=text   Menschenlesbarer Bericht zum Ausdrucken. Enthält
//                KEINE vollständige IBAN und keine fremde
//                Mandantenkennung.
// ═══════════════════════════════════════════════════════════════

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Obergrenze der Datei. Ein camt.053 eines Monats liegt weit darunter. */
const MAX_BYTES = 10 * 1024 * 1024

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const form = await req.formData()
    const datei = form.get('datei')
    if (!(datei instanceof File)) {
      return NextResponse.json(
        { error: 'Es wurde keine Datei übergeben. Feldname: "datei".' },
        { status: 400 },
      )
    }
    if (datei.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Die Datei ist grösser als ${MAX_BYTES / 1024 / 1024} MB.` },
        { status: 413 },
      )
    }

    const xmlInhalt = await datei.text()
    const bericht = await camtPilotLauf(createAdminClient(), {
      organizationId,
      dateiname: datei.name || 'unbenannt.xml',
      xmlInhalt,
      // Nur zur Berichterstattung — beeinflusst den Lauf nicht.
      umgebung: process.env as Record<string, string | undefined>,
    })

    const { searchParams } = new URL(req.url)
    if (searchParams.get('format') === 'text') {
      return new NextResponse(pilotBerichtText(bericht), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }

    return NextResponse.json(bericht, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return safeApiError(e, req)
  }
})
