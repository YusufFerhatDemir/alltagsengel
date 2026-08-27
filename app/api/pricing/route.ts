import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { heuteBerlin } from '@/lib/utils/timezone';
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { safeDbError } from '@/lib/utils/api-error'
import { withTracking } from '@/lib/monitoring/tracker'

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

export const GET = withTracking(async function GET(request: Request) {
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
    const today = heuteBerlin()

    // Endkunden-/Engel-Pfad: diese Rollen sind nicht in organization_members
    // gefuehrt. Bewusster Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte
    // Ausnahme) — entscheidend ist, dass der Org-Filter UNBEDINGT greift und
    // nicht mehr an einer Bedingung haengt und uebersprungen werden kann.
    const organizationId = await getActiveOrgIdOrDefault()

    const admin = createAdminClient()
    let query = admin
      .from('service_pricing')
      .select('id, service_type, budget_type, description, hourly_rate, min_hours, billing_unit, valid_from, valid_until, notes')
      .eq('is_active', true)
      .lte('valid_from', today)
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order('service_type', { ascending: true })
      .order('budget_type', { ascending: true })

    query = query.eq('organization_id', organizationId)
    if (serviceType) query = query.eq('service_type', serviceType)
    if (budgetType) query = query.eq('budget_type', budgetType)

    const { data, error } = await query
    if (error) return safeDbError(error)

    return NextResponse.json({ prices: data || [] })
  } catch (err) {
    return safeApiError(err, request)
  }
})
