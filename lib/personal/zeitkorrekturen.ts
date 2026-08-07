import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonalZeitkorrektur } from './types'

export interface ListZeitkorrekturenFilter {
  organizationId: string
  arbeitszeitId?: string
  caregiverId?: string
  limit?: number
}

export async function listZeitkorrekturen(supabase: SupabaseClient, filter: ListZeitkorrekturenFilter): Promise<PersonalZeitkorrektur[]> {
  let query = supabase
    .from('personal_zeitkorrekturen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.arbeitszeitId) query = query.eq('arbeitszeit_id', filter.arbeitszeitId)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.limit) query = query.limit(filter.limit)

  const { data, error } = await query
  if (error) throw new Error(`Zeitkorrekturen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalZeitkorrektur[]
}
