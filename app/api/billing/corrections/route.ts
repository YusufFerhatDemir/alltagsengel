import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logger } from '@/lib/logger'
const log = logger.child('billing/corrections')

/**
 * GET /api/billing/corrections
 *
 * Liste aller Korrekturen (Storno, Teilstorno, Korrektur, Gutschrift) des
 * aktiven Mandanten inkl. Kennzahlen fuer die Uebersicht.
 *
 * Query-Parameter:
 *   ?type=storno|teilstorno|korrektur|gutschrift   Filter auf Korrekturart
 *   ?status=entwurf|freigegeben|uebermittelt|verarbeitet
 *   ?limit=200 (max. 500)
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const status = url.searchParams.get('status')
  const limitParam = Number(url.searchParams.get('limit') || '200')
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 200

  const admin = createAdminClient()

  let query = admin
    .from('invoice_corrections')
    .select(`
      id, correction_type, status, reason, reason_code,
      original_amount_cents, corrected_amount_cents, difference_cents,
      created_at, approved_at,
      original:invoices!invoice_corrections_original_invoice_id_fkey(
        id, invoice_number, invoice_number_formatted, status, period_start, period_end,
        client:clients(first_name, last_name)
      ),
      correction:invoices!invoice_corrections_correction_invoice_id_fkey(
        id, invoice_number, invoice_number_formatted, status, total_amount, frozen_at
      )
    `)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) query = query.eq('correction_type', type)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    log.error('Ladefehler', { errorMessage: error.message })
    return NextResponse.json({ error: 'Korrekturen konnten nicht geladen werden.' }, { status: 500 })
  }

  const rows = (data || []).map((r) => {
    const original = Array.isArray(r.original) ? r.original[0] : r.original
    const correction = Array.isArray(r.correction) ? r.correction[0] : r.correction
    const client = original?.client
      ? (Array.isArray(original.client) ? original.client[0] : original.client)
      : null

    return {
      id: r.id,
      correction_type: r.correction_type,
      status: r.status,
      reason: r.reason || '',
      reason_code: r.reason_code,
      original_amount_cents: r.original_amount_cents || 0,
      corrected_amount_cents: r.corrected_amount_cents || 0,
      difference_cents: r.difference_cents || 0,
      created_at: r.created_at,
      approved_at: r.approved_at,
      original_invoice_id: original?.id ?? null,
      original_invoice_number: original?.invoice_number_formatted || original?.invoice_number || '—',
      original_invoice_status: original?.status ?? null,
      period_start: original?.period_start ?? null,
      period_end: original?.period_end ?? null,
      client_name: [client?.first_name, client?.last_name].filter(Boolean).join(' ') || '—',
      correction_invoice_id: correction?.id ?? null,
      correction_invoice_number: correction?.invoice_number_formatted || correction?.invoice_number || '—',
      correction_invoice_status: correction?.status ?? null,
      correction_invoice_frozen: !!correction?.frozen_at,
    }
  })

  // Kennzahlen: Gutschriften und Stornos werden getrennt ausgewiesen, weil sie
  // buchhalterisch unterschiedlich behandelt werden (Gutschrift mindert den
  // Umsatz, Storno hebt die Rechnung vollstaendig auf).
  const sumDiff = (predicate: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(predicate).reduce((s, r) => s + r.difference_cents, 0)

  const kpi = {
    gesamt: rows.length,
    entwuerfe: rows.filter(r => r.status === 'entwurf').length,
    gutschriften: rows.filter(r => r.correction_type === 'gutschrift').length,
    gutschriften_cents: sumDiff(r => r.correction_type === 'gutschrift'),
    stornos: rows.filter(r => r.correction_type === 'storno' || r.correction_type === 'teilstorno').length,
    stornos_cents: sumDiff(r => r.correction_type === 'storno' || r.correction_type === 'teilstorno'),
    korrekturen: rows.filter(r => r.correction_type === 'korrektur').length,
    korrekturen_cents: sumDiff(r => r.correction_type === 'korrektur'),
    differenz_cents: rows.reduce((s, r) => s + r.difference_cents, 0),
  }

  return NextResponse.json({ rows, kpi })
}
