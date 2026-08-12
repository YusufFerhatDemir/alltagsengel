import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/rechnungen/[id]/pdf
 *
 * Liefert dem angemeldeten Kunden eine FRISCH signierte URL zu seinem
 * Rechnungs-PDF.
 *
 * Hintergrund: `invoice_packages.pdf_url` enthaelt eine signierte Storage-URL
 * mit 30 Tagen Laufzeit. Das Kundenportal hat diese gespeicherte URL bisher
 * direkt geoeffnet — nach Ablauf war der Download schlicht kaputt. Diese Route
 * signiert stattdessen bei jedem Aufruf neu.
 *
 * Zugriff: nur die eigene Rechnung (clients.user_id = auth.uid()) oder ein
 * Administrator.
 */
export async function GET(
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
    const isAdmin = !!profile && ['admin', 'superadmin'].includes(profile.role)

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
    if (!isAdmin && client?.user_id !== user.id) {
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
      .createSignedUrl(storagePath, 60 * 10) // 10 Minuten reichen zum Download

    if (signErr || !signed?.signedUrl) {
      console.error('[rechnungen/pdf] Signierung fehlgeschlagen:', signErr?.message)
      return NextResponse.json({ error: 'PDF konnte nicht bereitgestellt werden.' }, { status: 500 })
    }

    return NextResponse.json({
      pdf_url: signed.signedUrl,
      page_count: pkg.page_count,
      generated_at: pkg.generated_at,
      invoice_number: invoice.invoice_number_formatted || invoice.invoice_number,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[rechnungen/pdf] Fehler:', message)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
