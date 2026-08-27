import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateXRechnungXml } from '@/lib/billing/xrechnung'
import { logAuditEvent } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId: orgId } = auth.ctx
  const { id: invoiceId } = await params

  try {
    const admin = createAdminClient()
    const xml = await generateXRechnungXml(admin, invoiceId, orgId)

    // organization_id-Filter auch hier (Defense-in-Depth): diese Query dient
    // nur der Dateinamens-Anzeige, aber generateXRechnungXml() oben wirft
    // bereits bei fremder Org — ohne Filter würde ein leerer Treffer sonst
    // still auf die invoiceId zurückfallen statt korrekt zu scopen.
    const { data: inv } = await admin
      .from('invoices')
      .select('invoice_number_formatted, invoice_number')
      .eq('id', invoiceId)
      .eq('organization_id', orgId)
      .single()
    const nr = inv?.invoice_number_formatted || inv?.invoice_number || invoiceId
    const filename = `XRechnung_${nr.replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`

    await logAuditEvent({
      action: 'download',
      actorId: auth.ctx.userId,
      organizationId: orgId,
      actorRole: auth.ctx.role,
      actorName: auth.ctx.name,
      entityType: 'invoice',
      entityId: invoiceId,
      details: { format: 'xrechnung-xml', filename },
      request: req,
    })

    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return safeApiError(err, req)
  }
})
