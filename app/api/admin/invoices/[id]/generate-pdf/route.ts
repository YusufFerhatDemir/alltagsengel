import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'
import { erzeugeRechnungsPaket, RechnungsPaketError } from '@/lib/pdf/rechnung-paket'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/invoices/[id]/generate-pdf
// ═══════════════════════════════════════════════════════════════
// Baut ein mehrseitiges Belegpaket für eine Rechnung:
//   Seite 1: Belegübersicht (Belegnr., Klient, Zeitraum, Summe,
//            Liste der invoice_items) — bei Bedarf mehrseitig
//   je Seite: ein zugrunde liegender service_record mit Details +
//            eingebetteten Unterschrift-Bildern (service_signatures)
//
// Der eigentliche Aufbau liegt in lib/pdf/rechnung-paket.ts, damit der
// Rechnungsversand (lib/billing/versand/rechnung-versand.ts) dieselben
// Bytes ohne HTTP-Umweg erzeugen kann. Diese Route ist nur Auth +
// Audit-Trail um erzeugeRechnungsPaket() herum.
// ═══════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { userId, organizationId: orgId } = auth.ctx

  try {
    const { id: invoiceId } = await params
    const admin = createAdminClient()

    const paket = await erzeugeRechnungsPaket(admin, {
      invoiceId,
      organizationId: orgId,
      generatedBy: userId,
    })

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId: orgId,
      entityType: 'invoice_package',
      entityId: invoiceId,
      details: {
        invoice_number: paket.invoiceNumber,
        document_kind: paket.belegart,
        page_count: paket.pageCount,
        checksum: paket.checksum,
      },
      request: req,
    })

    return NextResponse.json({
      pdf_url: paket.pdfUrl,
      page_count: paket.pageCount,
      checksum: paket.checksum,
    })
  } catch (err) {
    if (err instanceof RechnungsPaketError && err.status === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    return safeApiError(err, req)
  }
})
