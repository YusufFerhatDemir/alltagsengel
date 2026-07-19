import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ═══════════════════════════════════════════════════════════════
// GET /api/pricing
// ═══════════════════════════════════════════════════════════════
// Zentrale Preisauskunft aus service_pricing — die EINE Quelle der
// Wahrheit statt hardcodierter Preise. Wird von der Native App und
// dem Admin-Dashboard genutzt.
//
// Query-Parameter (optional):
//   service_type=alltagsbegleitung   → nur ein Leistungstyp
//   budget_type=entlastung           → nur ein Budget-Topf
//
// Antwort: { prices: [{ service_type, budget_type, description,
//   hourly_rate, min_hours, billing_unit, valid_from, valid_until }] }
//
// Auth: eingeloggter Web-User (Cookie) ODER Native-App-Bearer-Token.
// Es werden nur aktive, aktuell gültige Preise geliefert.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    // ── Auth: Bearer-Token (Native App) oder Cookie-Session (Web) ──
    let authorized = false

    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const admin = createAdminClient()
      const { data: { user } } = await admin.auth.getUser(token)
      if (user) authorized = true
    }

    if (!authorized) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) authorized = true
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    // ── Aktive, heute gültige Preise laden (service_role: einheitlich
    //    für Web + Native, RLS-Policy erlaubt ohnehin auth-Lesezugriff) ──
    const url = new URL(request.url)
    const serviceType = url.searchParams.get('service_type')
    const budgetType = url.searchParams.get('budget_type')
    const today = new Date().toISOString().slice(0, 10)

    const admin = createAdminClient()
    let query = admin
      .from('service_pricing')
      .select('id, service_type, budget_type, description, hourly_rate, min_hours, billing_unit, valid_from, valid_until, notes')
      .eq('is_active', true)
      .lte('valid_from', today)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order('service_type', { ascending: true })
      .order('budget_type', { ascending: true })

    if (serviceType) query = query.eq('service_type', serviceType)
    if (budgetType) query = query.eq('budget_type', budgetType)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ prices: data || [] })
  } catch (err: any) {
    console.error('[api/pricing] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: err.message || 'Unerwarteter Fehler' }, { status: 500 })
  }
}
