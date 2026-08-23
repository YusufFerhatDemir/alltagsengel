import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  isValidInvoiceStatus,
  validateTransition,
  getAllowedTransitions,
  logBillingAction,
  type InvoiceStatus,
} from '@/lib/billing/core'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * POST /api/billing/invoices/[id]/status
 *
 * Statuswechsel einer Rechnung entlang der Statusmaschine.
 *
 * Diese Route schliesst die Luecke im Rechnungs-Workflow: eine neu erzeugte
 * Rechnung steht auf 'entwurf', `freezeInvoice()` verlangt aber 'geprueft'.
 * Ohne den Zwischenschritt "Prüfen" war das Festschreiben aus der Oberflaeche
 * nicht erreichbar.
 *
 * Body: { status: InvoiceStatus, reason?: string }
 *
 * Storno laeuft NICHT hierueber — dafuer gibt es /cancel, weil dort zusaetzlich
 * ein Stornobeleg mit negativen Betraegen erzeugt werden muss.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response
  const { userId, organizationId } = auth.ctx

  try {
    const { id } = await params

    const body = await request.json().catch(() => null)
    const target = typeof body?.status === 'string' ? body.status : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined

    if (!isValidInvoiceStatus(target)) {
      return NextResponse.json({ error: `Unbekannter Zielstatus '${target}'.` }, { status: 400 })
    }
    if (target === 'storniert') {
      return NextResponse.json(
        { error: 'Storno bitte über /api/billing/invoices/[id]/cancel — nur dort entsteht ein Stornobeleg.' },
        { status: 400 }
      )
    }

    // Der Admin-Client umgeht RLS (BYPASSRLS) — Mandantenzugehoerigkeit
    // deshalb explizit pruefen.
    const admin = createAdminClient()
    const { data: invoice, error: loadError } = await admin
      .from('invoices')
      .select('id, status, invoice_number, invoice_number_formatted, organization_id, deleted_at')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (loadError || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }
    if (invoice.deleted_at) {
      return NextResponse.json({ error: 'Rechnung ist gelöscht.' }, { status: 400 })
    }

    const current = invoice.status as string
    if (current === target) {
      return NextResponse.json({ id, status: target, unchanged: true })
    }
    if (!isValidInvoiceStatus(current)) {
      return NextResponse.json(
        { error: `Rechnung hat den Legacy-Status '${current}' und kann hier nicht umgestellt werden.` },
        { status: 400 }
      )
    }

    validateTransition(current, target as InvoiceStatus)

    const { error: updError } = await admin
      .from('invoices')
      .update({ status: target })
      .eq('id', id)
      .eq('status', current) // Race-Schutz: nur vom erwarteten Ausgangsstatus
    if (updError) {
      return safeApiError(updError)
    }

    await logBillingAction(admin, {
      entityType: 'invoice',
      organizationId,
      entityId: id,
      action: `status_${target}`,
      previousState: { status: current },
      newState: { status: target },
      reason,
      actorId: userId,
    })

    return NextResponse.json({
      id,
      status: target,
      previousStatus: current,
      allowedNext: getAllowedTransitions(target as InvoiceStatus),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
