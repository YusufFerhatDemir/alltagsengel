import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { RECHNUNGS_PDF_URL_TTL_SEKUNDEN } from '@/lib/pdf/rechnung-paket'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('rechnungen/pdf')

/**
 * GET /api/rechnungen/[id]/pdf
 *
 * Liefert dem angemeldeten Kunden eine FRISCH signierte URL zu seinem
 * Rechnungs-PDF.
 *
 * Hintergrund: `invoice_packages.pdf_url` enthaelt eine signierte Storage-URL.
 * Das Kundenportal hat diese gespeicherte URL bisher direkt geoeffnet — nach
 * Ablauf war der Download schlicht kaputt. Diese Route signiert stattdessen
 * bei jedem Aufruf neu, nach Eigentuemer- bzw. Organisationspruefung. Die
 * gespeicherte URL ist deshalb nur noch eine „PDF existiert"-Marke und
 * bewusst kurzlebig (RECHNUNGS_PDF_URL_TTL_SEKUNDEN).
 *
 * Zugriff: nur die eigene Rechnung (clients.user_id = auth.uid()) oder ein
 * Administrator.
 */
export const GET = withTracking(async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    const isAdmin = !!profile && rolleDarf(profile.role, 'abrechnung.lesen')

    // Der Admin-Client umgeht RLS — die Eigentuemerpruefung passiert deshalb
    // hier explizit ueber clients.user_id.
    const admin = createAdminClient()

    const { data: invoice, error: invErr } = await admin
      .from('invoices')
      .select('id, invoice_number, invoice_number_formatted, client_id, client:clients(user_id)')
      .eq('id', invoiceId)
      .is('deleted_at', null)
      .maybeSingle()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    const client = Array.isArray(invoice.client) ? invoice.client[0] : invoice.client

    if (isAdmin) {
      const orgId = await getActiveOrgId()
      if (!orgId) {
        return NextResponse.json({ error: 'Keine Organisation zugeordnet.' }, { status: 403 })
      }
      const { data: orgCheck } = await admin
        .from('invoices')
        .select('id')
        .eq('id', invoiceId)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (!orgCheck) {
        return NextResponse.json({ error: 'Kein Zugriff auf diese Rechnung.' }, { status: 403 })
      }
    } else if (client?.user_id !== user.id) {
      return NextResponse.json({ error: 'Kein Zugriff auf diese Rechnung.' }, { status: 403 })
    }

    const { data: pkg } = await admin
      .from('invoice_packages')
      .select('pdf_url, page_count, generated_at')
      .eq('invoice_id', invoiceId)
      .maybeSingle()

    if (!pkg?.pdf_url) {
      return NextResponse.json(
        { error: 'Für diese Rechnung liegt noch kein PDF vor.' },
        { status: 404 }
      )
    }

    // Storage-Pfad ist deterministisch (s. generate-pdf) — damit muss die
    // abgelaufene URL nicht geparst werden.
    const storagePath = `invoice-packages/${invoiceId}.pdf`
    const { data: signed, error: signErr } = await admin.storage
      .from('service-proofs')
      .createSignedUrl(storagePath, RECHNUNGS_PDF_URL_TTL_SEKUNDEN)

    if (signErr || !signed?.signedUrl) {
      log.error('Signierung fehlgeschlagen', { errorMessage: signErr?.message })
      return NextResponse.json({ error: 'PDF konnte nicht bereitgestellt werden.' }, { status: 500 })
    }

    return NextResponse.json({
      pdf_url: signed.signedUrl,
      page_count: pkg.page_count,
      generated_at: pkg.generated_at,
      invoice_number: invoice.invoice_number_formatted || invoice.invoice_number,
    })
  } catch (err) {
    return safeApiError(err, _request)
  }
})
