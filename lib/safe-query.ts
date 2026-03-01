import type { SupabaseClient } from '@supabase/supabase-js'

/* ── UUID Validation ── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id)
}

/* ── Error Logger ── */
export function logError(context: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error)
  console.error(`[AlltagsEngel] ${context}:`, msg)
  // Future: send to Sentry / LogRocket / PostHog
}

/* ── Query Status ── */
export type QueryStatus = 'ok' | 'not_found' | 'error' | 'invalid_id'

export interface SafeQueryResult<T> {
  data: T | null
  status: QueryStatus
}

/* ── Safe Single Query (Server) ── */
export async function safeSingleQuery<T>(
  supabase: SupabaseClient,
  table: string,
  id: string,
  options?: {
    select?: string
    column?: string
  }
): Promise<SafeQueryResult<T>> {
  if (!isValidUUID(id)) {
    logError(`safeSingleQuery(${table})`, `Invalid UUID: ${id}`)
    return { data: null, status: 'invalid_id' }
  }

  try {
    const col = options?.column || 'id'
    const sel = options?.select || '*'
    const { data, error } = await supabase
      .from(table)
      .select(sel)
      .eq(col, id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Row not found
        return { data: null, status: 'not_found' }
      }
      logError(`safeSingleQuery(${table})`, error.message)
      return { data: null, status: 'error' }
    }

    return { data: data as T, status: 'ok' }
  } catch (err) {
    logError(`safeSingleQuery(${table})`, err)
    return { data: null, status: 'error' }
  }
}
