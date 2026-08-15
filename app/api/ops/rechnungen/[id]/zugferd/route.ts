import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateZugferdPdf } from '@/lib/billing/xrechnung'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { organizationId: orgId } = auth.ctx
  const { id: invoiceId } = await params

  try {
    const admin = createAdminClient()

    const { data: inv } = await admin
      .from('invoices')
      .select('invoice_number_formatted, invoice_number')
      .eq('id', invoiceId)
      .eq('organization_id', orgId)
      .single()

    if (!inv) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }
    const nr = inv.invoice_number_formatted || inv.invoice_number || invoiceId
    const filename = `ZUGFeRD_${nr.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`

    // Load existing PDF from storage
    const storagePath = `invoice-packages/${invoiceId}.pdf`
    const { data: signedUrl, error: urlErr } = await admin.storage
      .from('service-proofs')
      .createSignedUrl(storagePath, 120)

    if (urlErr || !signedUrl?.signedUrl) {
      return NextResponse.json(
        { error: 'PDF nicht gefunden — bitte zuerst ein PDF erstellen.' },
        { status: 404 },
      )
    }

    const pdfRes = await fetch(signedUrl.signedUrl)
    if (!pdfRes.ok) {
      return NextResponse.json(
        { error: 'PDF konnte nicht geladen werden.' },
        { status: 500 },
      )
    }
    const existingPdfBytes = new Uint8Array(await pdfRes.arrayBuffer())

    const zugferdBytes = await generateZugferdPdf(admin, invoiceId, orgId, existingPdfBytes)

    return new NextResponse(zugferdBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    console.error('[zugferd] Fehler:', err)
    return NextResponse.json(
      { error: err.message || 'ZUGFeRD-Generierung fehlgeschlagen' },
      { status: 500 },
    )
  }
}
