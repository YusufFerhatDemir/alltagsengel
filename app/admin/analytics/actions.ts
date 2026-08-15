'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

async function requireAnalyticsAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  return { supabase, organizationId }
}

export interface AnalyticsPageView {
  id: string
  user_id: string | null
  path: string
  page_label: string
  viewed_at: string
  screen_width: number | null
  profile?: { first_name: string; last_name: string; role: string; email: string } | null
}

export interface AnalyticsVisitor {
  id: number
  ip: string
  country: string
  city: string
  region: string
  user_agent: string
  referrer: string
  page: string
  created_at: string
}

export interface AnalyticsData {
  views: AnalyticsPageView[]
  visitors: AnalyticsVisitor[]
}

export async function loadAnalyticsData(dateFilter: 'today' | '7d' | '30d' | 'all'): Promise<AnalyticsData> {
  const { supabase, organizationId } = await requireAnalyticsAdmin()

  // --- page_views mit org-Filter ---
  let query = supabase
    .from('page_views')
    .select('*, profile:profiles!page_views_user_id_fkey(first_name, last_name, role, email)')
    .eq('organization_id', organizationId)
    .order('viewed_at', { ascending: false })
    .limit(500)

  if (dateFilter !== 'all') {
    const now = new Date()
    let from: Date
    if (dateFilter === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (dateFilter === '7d') {
      from = new Date(now.getTime() - 7 * 86400000)
    } else {
      from = new Date(now.getTime() - 30 * 86400000)
    }
    query = query.gte('viewed_at', from.toISOString())
  }

  const { data: viewsData, error: viewsError } = await query
  if (viewsError) {
    console.error('[Analytics] page_views load error:', viewsError.message)
  }

  // --- visitors mit org-Filter ---
  let vQuery = supabase
    .from('visitors')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (dateFilter !== 'all') {
    const now = new Date()
    let from: Date
    if (dateFilter === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (dateFilter === '7d') {
      from = new Date(now.getTime() - 7 * 86400000)
    } else {
      from = new Date(now.getTime() - 30 * 86400000)
    }
    vQuery = vQuery.gte('created_at', from.toISOString())
  }

  const { data: visitorsData } = await vQuery

  return {
    views: (viewsData as AnalyticsPageView[]) || [],
    visitors: (visitorsData as AnalyticsVisitor[]) || [],
  }
}
