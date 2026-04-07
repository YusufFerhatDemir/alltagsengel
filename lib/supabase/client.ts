import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Cookie helpers for reading/writing Supabase auth session
const STORAGE_KEY = 'sb-nnwyktkqibdjxgimjyuq-auth-token'
const BASE64_PREFIX = 'base64-'

function readSessionFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${STORAGE_KEY}=([^;]+)`))
  if (!match) return null
  const raw = decodeURIComponent(match[1])
  if (raw.startsWith(BASE64_PREFIX)) {
    try {
      return atob(raw.substring(BASE64_PREFIX.length))
    } catch {
      return null
    }
  }
  return raw
}

function writeSessionCookie(value: string) {
  if (typeof document === 'undefined') return
  const encoded = BASE64_PREFIX + btoa(value)
  const maxAge = 365 * 24 * 60 * 60 // 1 year
  const isSecure = window.location.protocol === 'https:'
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(encoded)}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? '; Secure' : ''}`
}

function removeSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`
}

// Singleton client — same pattern as @supabase/ssr but with explicit cookie handling
let cachedClient: SupabaseClient | null = null

export function createClient() {
  if (cachedClient) return cachedClient

  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        flowType: 'pkce',
        autoRefreshToken: typeof window !== 'undefined',
        storageKey: STORAGE_KEY,
        // Custom storage that reads/writes cookies (matching @supabase/ssr behavior)
        storage: {
          getItem: (key: string): string | null => {
            if (key === STORAGE_KEY) {
              return readSessionFromCookie()
            }
            // Fallback to localStorage for other keys (e.g. PKCE code verifier)
            try {
              return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
            } catch {
              return null
            }
          },
          setItem: (key: string, value: string) => {
            if (key === STORAGE_KEY) {
              writeSessionCookie(value)
              return
            }
            try {
              if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
            } catch { /* ignore */ }
          },
          removeItem: (key: string) => {
            if (key === STORAGE_KEY) {
              removeSessionCookie()
              return
            }
            try {
              if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
            } catch { /* ignore */ }
          },
        },
        // CRITICAL: Bypass Navigator LockManager completely.
        // The @supabase/ssr createBrowserClient initialization hangs because
        // the Navigator Lock is acquired but never released, blocking ALL
        // Supabase operations (auth refresh, queries) on the same origin.
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
          return fn()
        },
      },
    }
  )

  cachedClient = client
  return client
}
