import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createInvoiceDraft } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateInvoiceRequest {
  clientId: string
  periodMonth: string   // YYYY-MM
  budgetType?: string   // wenn leer: alle Budget-Typen einzeln abrechnen
}

interface InvoiceResult {
  invoiceId: string
  invoiceNumber: string
  totalAmountCents: number
  lineCount: number
  alreadyExists: boolean
  budgetType: string
}

// ---------------------------------------------------------------------------
// POST /api/billing/invoices/create
// ---------------------------------------------------------------------------

/**
 * Erzeugt Rechnungsentwuerfe ueber die Billing-Engine.
 *
 * Sicherheitsgarantien:
 * - Auth: Nur eingeloggte Administratoren
 * - Org-Fence: Client muss zur Organisation des Users gehoeren
 * - Idempotenz: Doppelte Aufrufe geben bestehende Rechnung zurueck
 * - Atomizitaet: Engine erstellt Rechnung + Positionen + Audit-Trail
 * - Keine Browser-Betraege: Preise kommen aus service_records (DB)
 */
export async function POST(request: Request) {
  try {
    // ── 1. Auth-Pruefung ──────────────────────────────────────────────
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Nicht autorisiert. Bitte erneut anmelden.' },
        { status: 401 }
      )
    }

    // ── 2. Rollen-Pruefung ────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Benutzerprofil nicht gefunden.' },
        { status: 403 }
      )
    }

    if (!['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Nur fuer Administratoren.' },
        { status: 403 }
      )
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const orgId = await getActiveOrgId()
    if (!orgId) {
      return NextResponse.json(
        { error: 'Keine Organisation zugewiesen.' },
        { status: 403 }
      )
    }

    // ── 3. Request-Body parsen ────────────────────────────────────────
    let body: CreateInvoiceRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Ungueltiger Request-Body.' },
        { status: 400 }
      )
    }

    const { clientId, periodMonth, budgetType } = body

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json(
        { error: 'clientId ist erforderlich.' },
        { status: 400 }
      )
    }

    if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
      return NextResponse.json(
        { error: 'periodMonth muss im Format YYYY-MM sein.' },
        { status: 400 }
      )
    }

    // ── 4. Client-Zugehoerigkeit pruefen (Org-Fence) ─────────────────
    const admin = createAdminClient()

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('id, organization_id')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Klient nicht gefunden.' },
        { status: 404 }
      )
    }

    if (client.organization_id !== orgId) {
      return NextResponse.json(
        { error: 'Klient gehoert nicht zu Ihrer Organisation.' },
        { status: 403 }
      )
    }

    // ── 5. Budget-Typen ermitteln ────────────────────────────────────
    const [year, month] = periodMonth.split('-').map(Number)
    const periodStart = `${periodMonth}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const periodEnd = `${periodMonth}-${String(lastDay).padStart(2, '0')}`

    let budgetTypes: string[]

    if (budgetType) {
      // Expliziter Budget-Typ
      budgetTypes = [budgetType]
    } else {
      // Alle Budget-Typen mit abrechenbaren Leistungen ermitteln
      const { data: records, error: recError } = await admin
        .from('service_records')
        .select('budget_type')
        .eq('client_id', clientId)
        .in('status', ['signed', 'complete'])
        .gte('date', periodStart)
        .lte('date', periodEnd)

      if (recError) {
        return safeApiError(recError, request)
      }

      if (!records || records.length === 0) {
        return NextResponse.json(
          { error: 'Keine abrechenbaren Leistungen fuer diesen Zeitraum.' },
          { status: 404 }
        )
      }

      budgetTypes = [...new Set(records.map(r => r.budget_type).filter(Boolean))] as string[]

      if (budgetTypes.length === 0) {
        // Fallback: alle als 'entlastung' behandeln
        budgetTypes = ['entlastung']
      }
    }

    // ── 6. Rechnungen erstellen (pro Budget-Typ) ─────────────────────
    const results: InvoiceResult[] = []
    const warnings: string[] = []

    for (const bt of budgetTypes) {
      try {
        const result = await createInvoiceDraft(admin, {
          clientId,
          periodMonth,
          budgetType: bt,
          actorId: user.id,
        })

        results.push({
          invoiceId: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          totalAmountCents: result.totalAmountCents,
          lineCount: result.lineCount,
          alreadyExists: result.alreadyExists,
          budgetType: bt,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`Budget-Typ "${bt}": ${msg}`)
      }
    }

    if (results.length === 0 && warnings.length > 0) {
      return NextResponse.json(
        {
          error: 'Keine Rechnungen erstellt.',
          warnings,
        },
        { status: 400 }
      )
    }

    // ── 7. Erfolg ────────────────────────────────────────────────────
    return NextResponse.json({
      invoices: results,
      warnings: warnings.length > 0 ? warnings : undefined,
      count: results.length,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
