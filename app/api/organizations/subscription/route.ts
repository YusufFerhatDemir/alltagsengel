import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/organizations/subscription
 * Abo-Stand der aktiven Organisation (für die Billing-UI in den Einstellungen).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const orgId = await getActiveOrgId()
  const admin = createAdminClient()

  const [{ data: organization }, { data: subscription }] = await Promise.all([
    admin.from('organizations').select('id, name, billing_plan').eq('id', orgId).maybeSingle(),
    admin
      .from('organization_subscriptions')
      .select('plan, status, current_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('organization_id', orgId)
      .maybeSingle(),
  ])

  return NextResponse.json({ orgId, organization, subscription })
}
