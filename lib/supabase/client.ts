import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        // CRITICAL FIX: Bypass Navigator LockManager completely.
        // The default Supabase lock implementation acquires an exclusive lock
        // that NEVER releases if the page/tab holds it, blocking ALL subsequent
        // Supabase requests (auth refresh, queries, etc.) on the same origin.
        // Solution: Skip locking entirely — safe for single-tab usage.
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
          return fn()
        },
      },
    }
  )
}
