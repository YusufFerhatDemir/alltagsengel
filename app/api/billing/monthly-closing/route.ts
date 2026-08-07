import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month im Format YYYY-MM erforderlich.' }, { status: 400 })
    }

    const [year, monthNum] = month.split('-').map(Number)
    const periodStart = `${month}-01`
    const lastDay = new Date(year, monthNum, 0).getDate()
    const periodEnd = `${month}-${String(lastDay).padStart(2, '0')}`
    const admin = createAdminClient()

    const [recordsRes, invoicesRes, closingsRes, paymentsRes] = await Promise.all([
      admin.from('service_records')
        .select('id, client_id, status, date, duration_minutes, amount, budget_type, service_type')
        .gte('date', periodStart).lte('date', periodEnd),
      admin.from('invoices')
        .select('id, client_id, status, total_amount, paid_amount, billing_type, period_start, period_end')
        .eq('organization_id', profile.organization_id)
        .gte('period_start', periodStart).lte('period_end', periodEnd)
        .is('deleted_at', null),
      admin.from('monthly_closings')
        .select('*')
        .eq('year', year).eq('month', monthNum),
      admin.from('payments')
        .select('id, amount_cents, matching_status, payment_date')
        .eq('organization_id', profile.organization_id)
        .gte('payment_date', periodStart).lte('payment_date', periodEnd)
        .is('deleted_at', null),
    ])

    const records = recordsRes.data || []
    const invoices = invoicesRes.data || []
    const closings = closingsRes.data || []
    const payments = paymentsRes.data || []

    const totalRecords = records.length
    const signedRecords = records.filter(r => r.status === 'signed' || r.status === 'invoiced').length
    const draftRecords = records.filter(r => r.status === 'draft' || r.status === 'incomplete').length
    const completeRecords = records.filter(r => r.status === 'complete').length
    const invoicedRecords = records.filter(r => r.status === 'invoiced').length

    const totalInvoices = invoices.length
    const draftInvoices = invoices.filter(i => ['entwurf', 'geprueft', 'draft'].includes(i.status)).length
    const sentInvoices = invoices.filter(i => ['freigegeben', 'uebermittelt', 'quittiert', 'sent'].includes(i.status)).length
    const paidInvoices = invoices.filter(i => ['bezahlt', 'akzeptiert', 'paid'].includes(i.status)).length
    const partialInvoices = invoices.filter(i => ['teilweise_bezahlt', 'partial'].includes(i.status)).length
    const overdueInvoices = invoices.filter(i => ['gekuerzt', 'strittig', 'abgelehnt'].includes(i.status)).length

    const totalInvoicedCents = invoices.reduce((s, i) => s + Math.round(Number(i.total_amount || 0) * 100), 0)
    const totalPaidCents = invoices
      .filter(i => ['bezahlt', 'akzeptiert', 'paid', 'teilweise_bezahlt', 'partial'].includes(i.status))
      .reduce((s, i) => s + Math.round(Number(i.paid_amount || i.total_amount || 0) * 100), 0)
    const totalOpenCents = totalInvoicedCents - totalPaidCents

    const totalPaymentsCents = payments.reduce((s, p) => s + (p.amount_cents || 0), 0)
    const unmatchedPayments = payments.filter(p => p.matching_status === 'nicht_zugeordnet').length

    const closingStatus = closings.length > 0
      ? closings.every(c => c.ampel === 'gruen') ? 'gruen'
        : closings.some(c => c.ampel === 'rot') ? 'rot' : 'gelb'
      : 'gelb'

    const isFinalized = closings.length > 0 && closings.every(c => c.finalized_at != null)

    return NextResponse.json({
      month,
      zeitraum: { von: periodStart, bis: periodEnd },
      einsaetze: {
        gesamt: totalRecords,
        entwurf: draftRecords,
        abgeschlossen: completeRecords,
        unterschrieben: signedRecords,
        abgerechnet: invoicedRecords,
      },
      rechnungen: {
        gesamt: totalInvoices,
        entwurf: draftInvoices,
        versendet: sentInvoices,
        bezahlt: paidInvoices,
        teilbezahlt: partialInvoices,
        probleme: overdueInvoices,
      },
      finanzen: {
        fakturiert_cents: totalInvoicedCents,
        bezahlt_cents: totalPaidCents,
        offen_cents: totalOpenCents,
        zahlungseingaenge_cents: totalPaymentsCents,
        unzugeordnete_zahlungen: unmatchedPayments,
      },
      ampel: closingStatus,
      finalisiert: isFinalized,
      closings,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
