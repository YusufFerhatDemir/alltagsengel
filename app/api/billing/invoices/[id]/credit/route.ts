import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createCreditNote } from '@/lib/billing/core'

/**
 * POST /api/billing/invoices/[id]/credit
 * Gutschrift erstellen. Nur fuer Administratoren.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth-Pruefung
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

    // Gutschrift-Daten aus dem Body
    const body = await request.json()
    if (!body?.amountCents || typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return NextResponse.json(
        { error: 'Gültiger Betrag in Cent (amountCents) ist erforderlich' },
        { status: 400 }
      )
    }
    if (!body?.reason || typeof body.reason !== 'string') {
      return NextResponse.json(
        { error: 'Gutschriftgrund (reason) ist erforderlich' },
        { status: 400 }
      )
    }

    // Admin-Client fuer die eigentlichen Operationen
    const admin = createAdminClient()
    const result = await createCreditNote(admin, id, body.amountCents, body.reason, user.id)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/credit] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
