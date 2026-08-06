import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/billing/tariffs
 * Liste aller aktiven Tarife. Authentifizierung erforderlich, kein Admin nötig.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { data: tariffs, error } = await supabase
      .from('billing_tariffs')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Tarife laden fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Tarife konnten nicht geladen werden' }, { status: 500 })
    }

    return NextResponse.json(tariffs)
  } catch (err) {
    console.error('Unerwarteter Fehler beim Laden der Tarife:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/**
 * POST /api/billing/tariffs
 * Neuen Tarif anlegen. Nur für Administratoren.
 */
export async function POST(request: Request) {
  try {
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

    // Tarif-Daten aus dem Request-Body lesen
    const body = await request.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 })
    }

    // Admin-Client für den Insert verwenden (RLS erfordert Admin)
    const admin = createAdminClient()
    const { data: tariff, error } = await admin
      .from('billing_tariffs')
      .insert(body)
      .select()
      .single()

    if (error) {
      console.error('Tarif anlegen fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Tarif konnte nicht angelegt werden' }, { status: 500 })
    }

    return NextResponse.json(tariff, { status: 201 })
  } catch (err) {
    console.error('Unerwarteter Fehler beim Anlegen des Tarifs:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
