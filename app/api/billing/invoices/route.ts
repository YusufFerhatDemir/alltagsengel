import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logger } from '@/lib/logger'
import { euroZuCent } from '@/lib/geld'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('billing/invoices')

/**
 * GET /api/billing/invoices
 *
 * Rechnungsliste des aktiven Mandanten fuer die Betriebssystem-Oberflaechen.
 *
 * Query-Parameter:
 *   ?creditable=1   nur Rechnungen, die noch storniert oder gutgeschrieben
 *                   werden koennen (keine Storno-/Gutschrift-Rechnungen,
 *                   nicht storniert, Restbetrag > 0)
 *   ?search=        Freitext auf Rechnungsnummer / Klientenname
 *   ?status=        Filter auf Rechnungsstatus
 *   ?limit=         max. 500, Default 100
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  const url = new URL(request.url)
  const creditableOnly = url.searchParams.get('creditable') === '1'
  const search = (url.searchParams.get('search') || '').trim().toLowerCase()
  const status = url.searchParams.get('status')
  const limitParam = Number(url.searchParams.get('limit') || '100')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100

  const admin = createAdminClient()

  let query = admin
    .from('invoices')
    .select(`
      id, invoice_number, invoice_number_formatted, client_id, status,
      period_start, period_end, total_amount, budget_amount, private_amount, paid_amount,
      correction_of, correction_type, frozen_at, transmission_status, created_at,
      client:clients(first_name, last_name, insurance_name),
      invoice_packages(pdf_url, generated_at)
    `)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (creditableOnly) {
    // Korrekturbelege selbst sind keine Basis fuer weitere Korrekturen.
    query = query.is('correction_type', null).neq('status', 'storniert')
  }

  const { data, error } = await query
  if (error) {
    log.error('Ladefehler', { errorMessage: error.message })
    return NextResponse.json({ error: 'Rechnungen konnten nicht geladen werden.' }, { status: 500 })
  }

  const invoices = data || []
  const invoiceIds = invoices.map(i => i.id)

  // Bereits vergebene Gutschriften in EINER Abfrage holen — sonst waere das
  // eine N+1-Abfrage ueber die gesamte Rechnungsliste.
  const creditedByInvoice = new Map<string, number>()
  if (invoiceIds.length > 0) {
    const { data: credits } = await admin
      .from('invoice_corrections')
      .select('original_invoice_id, original_amount_cents, corrected_amount_cents')
      .eq('organization_id', organizationId)
      .eq('correction_type', 'gutschrift')
      .in('original_invoice_id', invoiceIds)
      .is('deleted_at', null)

    for (const c of credits || []) {
      const orig = c.original_amount_cents || 0
      const credited = orig - (c.corrected_amount_cents ?? orig)
      creditedByInvoice.set(
        c.original_invoice_id,
        (creditedByInvoice.get(c.original_invoice_id) || 0) + credited
      )
    }
  }

  const rows = invoices.map(inv => {
    const client = Array.isArray(inv.client) ? inv.client[0] : inv.client
    const pkg = Array.isArray(inv.invoice_packages) ? inv.invoice_packages[0] : inv.invoice_packages
    // invoices.total_amount steht in EURO (nicht Cent) — deshalb hier *100.
    const totalCents = euroZuCent(inv.total_amount || 0)
    const creditedCents = creditedByInvoice.get(inv.id) || 0

    return {
      id: inv.id,
      invoice_number: inv.invoice_number_formatted || inv.invoice_number || '—',
      client_id: inv.client_id,
      client_name: [client?.first_name, client?.last_name].filter(Boolean).join(' ') || '—',
      insurance_name: client?.insurance_name ?? null,
      status: inv.status,
      period_start: inv.period_start,
      period_end: inv.period_end,
      total_amount: Number(inv.total_amount || 0),
      budget_amount: Number(inv.budget_amount || 0),
      private_amount: Number(inv.private_amount || 0),
      paid_amount: Number(inv.paid_amount || 0),
      correction_of: inv.correction_of,
      correction_type: inv.correction_type,
      frozen: !!inv.frozen_at,
      transmission_status: inv.transmission_status,
      created_at: inv.created_at,
      // pdf_url ist eine signierte URL mit Ablaufdatum — die Oberflaeche zeigt
      // deshalb nur, DASS ein Paket existiert, und laesst es bei Bedarf neu
      // erzeugen, statt einen ggf. abgelaufenen Link anzubieten.
      has_pdf: !!pkg?.pdf_url,
      pdf_generated_at: pkg?.generated_at ?? null,
      total_cents: totalCents,
      credited_cents: creditedCents,
      remaining_creditable_cents: Math.max(0, totalCents - creditedCents),
    }
  })

  const filtered = rows.filter(r => {
    if (creditableOnly && r.remaining_creditable_cents <= 0) return false
    if (!search) return true
    return r.invoice_number.toLowerCase().includes(search)
      || r.client_name.toLowerCase().includes(search)
  })

  return NextResponse.json({ rows: filtered })
})
