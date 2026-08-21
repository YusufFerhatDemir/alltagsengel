import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import {
  createPayment,
  allocatePayment,
  isValidInvoiceStatus,
  isTerminalStatus,
  type InvoiceStatus,
  type PaymentMethod,
  type PayerType,
} from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { heuteBerlin } from '@/lib/utils/timezone'

/**
 * POST /api/billing/invoices/[id]/zahlung
 *
 * Zahlung direkt auf eine Rechnung verbuchen: legt den Zahlungseingang an und
 * ordnet ihn in einem Schritt dieser Rechnung zu. Die Rechnung geht dadurch
 * auf 'bezahlt' (Vollzahlung) bzw. 'teilweise_bezahlt' (Teilzahlung) —
 * das erledigt allocatePayment.
 *
 * Body: {
 *   amountCents?: number   // Default: offener Betrag der Rechnung
 *   paymentDate?: string   // YYYY-MM-DD, Default: heute (Europe/Berlin)
 *   paymentMethod?: string // Default 'ueberweisung'
 *   payerType?: string     // Default 'kunde'
 *   payerName?: string
 *   bankReference?: string
 *   notes?: string
 * }
 *
 * Nur fuer Administratoren, mit Org-Fence.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Leerer Body ist erlaubt — dann Vollzahlung auf den offenen Betrag.
    }

    // Org-Fence: der Admin-Client umgeht RLS (BYPASSRLS).
    const admin = createAdminClient()

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, invoice_number, invoice_number_formatted, status, total_amount, paid_amount, client_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    if (isValidInvoiceStatus(invoice.status) && isTerminalStatus(invoice.status as InvoiceStatus)) {
      return NextResponse.json(
        { error: `Rechnung ist im Endstatus "${invoice.status}" — keine Zahlung mehr buchbar.` },
        { status: 409 }
      )
    }

    const totalCents = Math.round(Number(invoice.total_amount || 0) * 100)
    const paidCents = Math.round(Number(invoice.paid_amount || 0) * 100)
    const openCents = totalCents - paidCents

    if (openCents <= 0) {
      return NextResponse.json({ error: 'Rechnung ist bereits vollstaendig bezahlt.' }, { status: 409 })
    }

    const amountCents = body.amountCents != null ? Math.round(Number(body.amountCents)) : openCents

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents muss eine positive Zahl sein.' }, { status: 400 })
    }
    if (amountCents > openCents) {
      return NextResponse.json(
        { error: `Betrag (${(amountCents / 100).toFixed(2)} €) übersteigt den offenen Betrag (${(openCents / 100).toFixed(2)} €).` },
        { status: 400 }
      )
    }

    const paymentDate = typeof body.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate)
      ? body.paymentDate
      : heuteBerlin()

    const rechnungsnummer = invoice.invoice_number_formatted || invoice.invoice_number || invoice.id.slice(0, 8)

    const payment = await createPayment(admin, {
      organizationId,
      paymentDate,
      amountCents,
      paymentMethod: (body.paymentMethod as PaymentMethod) || 'ueberweisung',
      payerType: (body.payerType as PayerType) || 'kunde',
      payerName: (body.payerName as string) || undefined,
      bankReference: (body.bankReference as string) || undefined,
      verwendungszweck: `Rechnung ${rechnungsnummer}`,
      notes: (body.notes as string) || undefined,
      actorId: user.id,
      // Kein Auto-Matching: zugeordnet wird ausschliesslich hier, explizit auf
      // diese Rechnung. Mit Auto-Matching hat createPayment die Zahlung bei
      // einer Vollzahlung selbst zugeordnet (Verwendungszweck traegt die
      // Rechnungsnummer = 50 Punkte, Betrag passt = 30 Punkte, Schwelle 70),
      // und die folgende explizite Zuordnung scheiterte dann an der
      // Ueberzahlungspruefung — HTTP 500 bei korrekt verbuchter Zahlung.
      autoMatch: false,
    })

    await allocatePayment(admin, {
      paymentId: payment.paymentId,
      allocations: [{ invoiceId: invoice.id, amountCents }],
      actorId: user.id,
    })

    const neuBezahltCents = paidCents + amountCents
    const neuerStatus = neuBezahltCents >= totalCents ? 'bezahlt' : 'teilweise_bezahlt'

    return NextResponse.json({
      ok: true,
      paymentId: payment.paymentId,
      amountCents,
      paymentDate,
      invoiceStatus: neuerStatus,
      offenCents: Math.max(0, totalCents - neuBezahltCents),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
