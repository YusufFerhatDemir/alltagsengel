import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { erstelleMonatsabschluss } from '@/lib/abrechnung/monatsabschluss'
import { safeApiError } from '@/lib/api/error-sanitizer'

import { euroZuCent } from '@/lib/geld'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
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
        .select('id, client_id, status, proof_status, billing_status, date, duration_minutes, amount, budget_type, service_type')
        .eq('organization_id', organizationId)
        .gte('date', periodStart).lte('date', periodEnd),
      admin.from('invoices')
        .select('id, client_id, status, total_amount, paid_amount, billing_type, period_start, period_end')
        .eq('organization_id', organizationId)
        .gte('period_start', periodStart).lte('period_end', periodEnd)
        .is('deleted_at', null),
      admin.from('monthly_closings')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('year', year).eq('month', monthNum),
      admin.from('payments')
        .select('id, amount_cents, matching_status, payment_date')
        .eq('organization_id', organizationId)
        .gte('payment_date', periodStart).lte('payment_date', periodEnd)
        .is('deleted_at', null),
    ])

    // Storno wird getrennt ausgewiesen und zaehlt nicht mehr als
    // unterschriebene bzw. abgerechnete Leistung: 'STORNIERT' hat kein
    // Gegenstueck im status-Werteset, ein Widerruf bleibt deshalb auf
    // 'signed'/'invoiced' stehen und erschien in dieser Uebersicht als
    // erbrachte, abgerechnete Leistung. Die Ampel des Monatsabschlusses
    // haengt an diesen Zahlen.
    const alleRecords = recordsRes.data || []
    const records = ohneStornierte(alleRecords)
    const stornierteRecords = alleRecords.length - records.length
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

    const totalInvoicedCents = invoices.reduce((s, i) => s + euroZuCent(i.total_amount || 0), 0)
    const totalPaidCents = invoices
      .filter(i => ['bezahlt', 'akzeptiert', 'paid', 'teilweise_bezahlt', 'partial'].includes(i.status))
      .reduce((s, i) => s + euroZuCent(i.paid_amount || i.total_amount || 0), 0)
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
        storniert: stornierteRecords,
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
    return safeApiError(err, request)
  }
})

/**
 * POST /api/billing/monthly-closing
 *
 * Fuehrt den Monatsabschluss aus: sammelt je genehmigter Verordnung die
 * Leistungen des Monats, prueft Unterschrift und Abtretungserklaerung,
 * gruppiert nach Kostentraeger und schreibt monthly_closings je Klient.
 *
 * Diese Route schliesst eine Luecke im operativen Kernprozess: die Engine
 * lib/abrechnung/monatsabschluss.erstelleMonatsabschluss() existierte, hatte
 * aber KEINEN einzigen Aufrufer. monthly_closings wird ausschliesslich dort
 * geschrieben — der Monatsabschluss war damit ueber UI wie API gar nicht
 * ausloesbar, und /api/billing/monthly-closing bot nur ein GET auf eine
 * dauerhaft leere Tabelle.
 *
 * Body: { month: 'YYYY-MM', bundesland: string, dryRun?: boolean }
 *
 * dryRun=true rechnet alles durch, schreibt aber nichts — gedacht fuer die
 * Vorschau vor dem echten Abschluss.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { month, bundesland, dryRun } = body as {
      month?: string; bundesland?: string; dryRun?: boolean
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'month im Format YYYY-MM erforderlich.' }, { status: 400 })
    }
    // Bewusst keine Vorbelegung: ohne Bundesland zoege die Preissuche
    // landesfremde Saetze. Die Engine wirft sonst selbst.
    if (!bundesland) {
      return NextResponse.json(
        { error: 'bundesland erforderlich (Katalogcode, z. B. "hessen").' },
        { status: 400 },
      )
    }

    const ergebnis = await erstelleMonatsabschluss(month, createAdminClient(), {
      bundesland,
      organizationId,
      dryRun: dryRun === true,
    })

    return NextResponse.json({ modus: dryRun === true ? 'vorschau' : 'abschluss', ...ergebnis })
  } catch (err) {
    return safeApiError(err, request)
  }
})
