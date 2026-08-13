import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { runDunningRun } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'

/**
 * Manueller Mahnlauf fuer die aktive Organisation.
 *
 * Body: { dryRun?: boolean }
 * dryRun=true simuliert nur — es wird nichts geschrieben.
 *
 * Dieselbe Logik laeuft naechtlich ueber /api/cron/mahnlauf.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    let dryRun = false
    try {
      const body = await request.json()
      dryRun = body?.dryRun === true
    } catch {
      // Leerer Body ist erlaubt — dann echter Lauf.
    }

    const admin = createAdminClient()
    const result = await runDunningRun(admin, organizationId, user.id, { dryRun })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
