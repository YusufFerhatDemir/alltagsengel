import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { fuehreTaeglicheAutomatisierungAus } from '@/lib/automation'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

/**
 * POST /api/admin/automatisierung
 *
 * Manueller Auslöser für alle Automatisierungsketten der aktiven
 * Organisation (WS7) — für Tests und um nicht auf den nächtlichen Cron
 * warten zu müssen. Admin-only.
 */
export const POST = withTracking(async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
  }

  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (!quellenDuerfen(quellen, 'system.verwalten')) {
    return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const ergebnis = await fuehreTaeglicheAutomatisierungAus(createAdminClient(), organizationId, user.id)
  return NextResponse.json(ergebnis)
})
