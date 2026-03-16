import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        // Custom lock to avoid Navigator LockManager timeout issues
        // (stuck locks from service workers or other tabs can block ALL requests)
        lock: (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
          // Try Navigator LockManager first, fall back to no-op if it fails
          if (typeof navigator !== 'undefined' && navigator.locks) {
            return navigator.locks.request(
              name,
              { mode: 'exclusive', ifAvailable: true },
              async (lock) => {
                if (lock) {
                  return fn()
                } else {
                  // Lock not available — run without lock (safe for single-tab usage)
                  return fn()
                }
              }
            )
          }
          // No LockManager (SSR, older browsers) — just run
          return fn()
        },
      },
    }
  )
}
