import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

// ═══════════════════════════════════════════════════════════════
// WhatsApp-Level Session Persistenz
// ═══════════════════════════════════════════════════════════════
// Einmal anmelden → nie wieder fragen. Genau wie WhatsApp, Instagram, Uber.
//
// Strategie:
// 1. Session wird in Cookie (365 Tage) + localStorage + IndexedDB gespeichert
// 2. Dreifache Redundanz: Wenn eine Storage gelöscht wird, stellen die anderen wieder her
// 3. Auto-Refresh alle paar Minuten → Access Token bleibt immer frisch
// 4. Beim App-Öffnen: sofort Refresh → kein "Session expired"
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'sb-nnwyktkqibdjxgimjyuq-auth-token'
const LS_BACKUP_KEY = 'sb-session-backup'
const IDB_BACKUP_KEY = 'sb-session-idb'
const IDB_DB_NAME = 'alltagsengel-auth'
const IDB_STORE_NAME = 'session'
const BASE64_PREFIX = 'base64-'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 Jahr

// ═══ IndexedDB: Dritte Backup-Ebene (überlebt Cookie- UND localStorage-Löschung) ═══
function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function readSessionFromIDB(): Promise<string | null> {
  const db = await openIDB()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly')
      const store = tx.objectStore(IDB_STORE_NAME)
      const req = store.get(IDB_BACKUP_KEY)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

async function writeSessionToIDB(value: string): Promise<void> {
  const db = await openIDB()
  if (!db) return
  try {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_STORE_NAME)
    store.put(value, IDB_BACKUP_KEY)
  } catch { /* ignore */ }
}

async function removeSessionFromIDB(): Promise<void> {
  const db = await openIDB()
  if (!db) return
  try {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_STORE_NAME)
    store.delete(IDB_BACKUP_KEY)
  } catch { /* ignore */ }
}

// ═══ Cookie Storage ═══
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
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(encoded)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${isSecure ? '; Secure' : ''}`
}

function removeSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`
}

// ═══ localStorage Storage ═══
function readSessionFromLocalStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(LS_BACKUP_KEY)
  } catch {
    return null
  }
}

function writeSessionBackup(value: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_BACKUP_KEY, value)
    }
  } catch { /* ignore */ }
}

function removeSessionBackup() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LS_BACKUP_KEY)
    }
  } catch { /* ignore */ }
}

// ═══ Singleton Supabase Client ═══
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
        // ═══ Triple-Storage: Cookie + localStorage + IndexedDB ═══
        storage: {
          getItem: (key: string): string | null => {
            if (key === STORAGE_KEY) {
              // 1. Try cookie
              const fromCookie = readSessionFromCookie()
              if (fromCookie) return fromCookie
              // 2. Try localStorage
              const fromLS = readSessionFromLocalStorage()
              if (fromLS) {
                writeSessionCookie(fromLS) // Restore cookie
                return fromLS
              }
              // 3. IndexedDB (async, but getItem is sync — handled via initial load)
              // IDB is checked async on app start by SessionKeepAlive
              return null
            }
            try {
              return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
            } catch {
              return null
            }
          },
          setItem: (key: string, value: string) => {
            if (key === STORAGE_KEY) {
              // Write to ALL THREE storages
              writeSessionCookie(value)
              writeSessionBackup(value)
              writeSessionToIDB(value) // async, fire-and-forget
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
              removeSessionFromIDB() // async, fire-and-forget
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

// ═══ Exported für SessionKeepAlive: IDB Recovery ═══
export { readSessionFromIDB, writeSessionToIDB, writeSessionCookie, writeSessionBackup }
