import { createClient } from '@/lib/supabase/server'

/** Prüft, ob ein Feature für die Org im aktuellen Plan freigeschaltet ist. */
export async function checkFeature(orgId: string, feature: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_subscriptions')
    .select('features')
    .eq('organization_id', orgId)
    .maybeSingle()

  return !!(data?.features as Record<string, unknown> | null)?.[feature]
}

/** Prüft, ob die Org unter ihrem Klienten-Limit (max_klienten) liegt. */
export async function checkClientLimit(
  orgId: string
): Promise<{ allowed: boolean; current: number; max: number | null }> {
  const supabase = await createClient()

  const [{ data: sub }, { count }] = await Promise.all([
    supabase.from('organization_subscriptions').select('features').eq('organization_id', orgId).maybeSingle(),
    supabase.from('clients').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
  ])

  const max = (sub?.features as Record<string, unknown> | null)?.max_klienten as number | null | undefined
  const current = count ?? 0

  return { allowed: max == null || current < max, current, max: max ?? null }
}
