import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// Cookie + localStorage helpers for reading/writing Supabase auth session
// Dual storage ensures persistence even if one storage is cleared (WhatsApp-like behavior)
const STORAGE_KEY = 'sb-nnwyktkqibdjxgimjyuq-auth-token'
const LS_BACKUP_KEY = 'sb-session-backup'
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

function readSessionFromLocalStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(LS_BACKUP_KEY)
  } catch {
    return null
  }
}

function writeSessionCookie(value: string) {
  if (typeof document === 'undefined') return
  const encoded = BASE64_PREFIX + btoa(value)
  const maxAge = 365 * 24 * 60 * 60 // 1 year
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(encoded)}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? '; Secure' : ''}`
}

function writeSessionBackup(value: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_BACKUP_KEY, value)
    }
  } catch { /* ignore */ }
}

function removeSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`
}

function removeSessionBackup() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_BACKUP_KEY)
    }
  } catch { /* ignore */ }
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
        // Custom storage: cookie (primary) + localStorage (backup)
        storage: {
          getItem: (key: string): string | null => {
            if (key === STORAGE_KEY) {
              // Try cookie first, fall back to localStorage backup
              const fromCookie = readSessionFromCookie()
              if (fromCookie) return fromCookie
              const fromLS = readSessionFromLocalStorage()
              if (fromLS) {
                // Restore cookie from localStorage backup
                writeSessionCookie(fromLS)
                return fromLS
              }
              return null
            }
            // Other keys (e.g. PKCE code verifier) → localStorage
            try {
              return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
            } catch {
              return null
            }
          },
          setItem: (key: string, value: string) => {
            if (key === STORAGE_KEY) {
              // Write to BOTH cookie and localStorage for redundancy
              writeSessionCookie(value)
              writeSessionBackup(value)
              return
            }
            try {
              if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
            } catch { /* ignore */ }
          },
          removeItem: (key: string) => {
            if (key === STORAGE_KEY) {
              removeSessionCookie()
              removeSessionBackup()
              return
            }
            try {
              if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
            } catch { /* ignore */ }
          },
        },
        // CRITICAL: Bypass Navigator LockManager completely.
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
          return fn()
        },
      },
    }
  )

  cachedClient = client
  return client
}
