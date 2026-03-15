import { createClient } from '@/lib/supabase/server'

// Simple in-memory cache (2 min TTL)
let flagCache: { flags: Record<string, FeatureFlag>; ts: number } | null = null
const FLAG_CACHE_TTL = 2 * 60 * 1000

export interface FeatureFlag {
  flag_name: string
  enabled: boolean
  rollout_percentage: number
  rollout_strategy: 'all' | 'percentage' | 'users' | 'date_range'
  allowed_users: string[]
  effective_from: string | null
  effective_to: string | null
}

async function loadFlags(): Promise<Record<string, FeatureFlag>> {
  if (flagCache && Date.now() - flagCache.ts < FLAG_CACHE_TTL) {
    return flagCache.flags
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('kf_feature_flags')
    .select('flag_name, enabled, rollout_percentage, rollout_strategy, allowed_users, effective_from, effective_to')

  const flags: Record<string, FeatureFlag> = {}
  for (const f of data || []) {
    flags[f.flag_name] = f as FeatureFlag
  }

  flagCache = { flags, ts: Date.now() }
  return flags
}

/** Invalidate feature flag cache */
export function invalidateFlagCache() {
  flagCache = null
}

/** Check if a feature flag is enabled */
export async function isFeatureEnabled(
  flagName: string,
  userId?: string
): Promise<boolean> {
  const flags = await loadFlags()
  const flag = flags[flagName]

  if (!flag || !flag.enabled) return false

  const now = new Date()

  // Date range check
  if (flag.effective_from && new Date(flag.effective_from) > now) return false
  if (flag.effective_to && new Date(flag.effective_to) < now) return false

  switch (flag.rollout_strategy) {
    case 'all':
      return true

    case 'percentage':
      if (!userId) return flag.rollout_percentage >= 50
      // Deterministic hash for consistent user experience
      const hash = simpleHash(userId + flagName)
      return (hash % 100) < flag.rollout_percentage

    case 'users':
      return userId ? flag.allowed_users.includes(userId) : false

    case 'date_range':
      return true // already checked above

    default:
      return flag.enabled
  }
}

/** Get all flags as a map (for admin UI) */
export async function getAllFlags(): Promise<Record<string, FeatureFlag>> {
  return loadFlags()
}

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash)
}
