import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeOpsAudit, alsCsv, type OpsAuditQuelle } from '@/lib/analytics/opsAudit'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von') || undefined
  const bis = url.searchParams.get('bis') || undefined
  const aktion = url.searchParams.get('aktion') || undefined
  const akteur = url.searchParams.get('akteur') || undefined
  const quelle = (url.searchParams.get('quelle') || undefined) as OpsAuditQuelle | undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 200
  // Export für eine Prüfung (Bereich 14 der Lückenanalyse). Ein höheres
  // Limit als die Bildschirmansicht: eine Prüfung will den Zeitraum
  // vollständig, nicht die ersten 200 Zeilen.
  const alsExport = url.searchParams.get('format') === 'csv'

  try {
    // Admin-Client: billing_audit_trail + ops_aktivitaetslog werden über
    // mehrere Quellen zusammengeführt — organizationId wird explizit gesetzt.
    const supabase = createAdminClient()
    const entries = await ladeOpsAudit(supabase, {
      organizationId: auth.ctx.organizationId,
      von,
      bis,
      aktion,
      akteur,
      quelle,
      limit: alsExport ? undefined : limit,
    })

    if (alsExport) {
      // Wer die Audit-Spur aus dem System trägt, steht selbst in der
      // Audit-Spur — sonst ist der Export die einzige Aktion im System,
      // die keine hinterlässt.
      await logAuditEventOrWarn({
        action: 'data_export',
        actorId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        entityType: 'audit_export',
        details: { von: von ?? null, bis: bis ?? null, quelle: quelle ?? null, anzahl: entries.length },
        request,
      })
      const stand = (bis || von || 'gesamt').replace(/[^0-9A-Za-z-]/g, '')
      return new NextResponse(alsCsv(entries), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-export-${stand}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json(entries)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
