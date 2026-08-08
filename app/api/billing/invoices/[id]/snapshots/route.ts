import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/billing/invoices/[id]/snapshots
 * Alle Snapshots einer Rechnung (Versionshistorie).
 * Authentifizierung erforderlich, kein Admin nötig.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth-Prüfung
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    // Pruefen ob die Rechnung existiert
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    }

    // Snapshots laden, nach Version sortiert
    const { data: snapshots, error } = await supabase
      .from('invoice_snapshots')
      .select('*')
      .eq('invoice_id', id)
      .order('version', { ascending: true })

    if (error) {
      console.error('Snapshots laden fehlgeschlagen:', error)
      return NextResponse.json(
        { error: 'Snapshots konnten nicht geladen werden' },
        { status: 500 }
      )
    }

    return NextResponse.json(snapshots)
  } catch (err) {
    console.error('Unerwarteter Fehler beim Laden der Snapshots:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
