import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getActiveOrgId } from '@/lib/organizations/server'

/**
 * GET /api/billing/audit
 * Audit-Trail abfragen. Nur für Administratoren.
 * Query-Parameter: entity_type, entity_id, from, to, limit (Standard: 100)
 */
export async function GET(request: Request) {
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

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    // Query-Parameter auslesen
    const { searchParams } = new URL(request.url)
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 1000) : 100

    // Audit-Trail abfragen mit optionalen Filtern
    let query = supabase
      .from('billing_audit_trail')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }
    if (entityId) {
      query = query.eq('entity_id', entityId)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    const { data: entries, error } = await query

    if (error) {
      console.error('Audit-Trail laden fehlgeschlagen:', error)
      return NextResponse.json(
        { error: 'Audit-Trail konnte nicht geladen werden' },
        { status: 500 }
      )
    }

    return NextResponse.json(entries)
  } catch (err) {
    console.error('Unerwarteter Fehler beim Laden des Audit-Trails:', err)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
