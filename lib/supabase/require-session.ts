import type { User } from '@supabase/supabase-js'
import { createClient } from './client'

// ═══════════════════════════════════════════════════════════════
// requireUser — Robuster Session-Check mit Retry-Logik
// ═══════════════════════════════════════════════════════════════
//
// WARUM existiert das?
//
// Direkt nach `signInWithPassword()` + `window.location.href = '/...'`
// läuft auf der neuen Seite useEffect → loadData() → supabase.auth.getUser().
// `getUser()` ist ein Server-Call der den JWT bei Supabase verifiziert.
// Bei ~1 von 10 Logins schlägt dieser Call transient fehl, weil:
//   1. Cookie/IndexedDB-Storage noch nicht 100% zwischen Tabs synchronisiert ist
//   2. Netzwerk kurz wackelt (mobile Senioren-Geräte, schwache Verbindung)
//   3. Supabase-Edge-Cache 1-2 Sekunden braucht bis JWT akzeptiert wird
//   4. iOS Capacitor WebView ein paar ms braucht bis Cookies an fetch() gehen
//
// Vorher: getUser() → null → router.push('/auth/login') → Nutzer rausgeworfen.
// Bei Reload geht's, weil die Session bis dahin stabil ist.
//
// Strategie (3 Versuche, exponential backoff):
//   1. Direkter getUser()
//   2. Bei null: 300ms warten, Session-Refresh, dann getUser()
//   3. Bei null: 800ms warten, getUser()
//   4. Erst dann redirect — mit dem Wissen, dass es wirklich keine Session gibt
//
// Total: max ~1.1s zusätzliche Wartezeit im worst case (1-von-10-Fall).
// Im normalen Fall: gar keine extra Latenz, Versuch 1 reicht.
// ═══════════════════════════════════════════════════════════════

interface RouterLike {
  push: (url: string) => void
}

export interface RequireUserOptions {
  /** Pfad zum Re-Direct nach erfolgreichem Re-Login. Default: keine Angabe. */
  redirectTo?: string
  /** Bei true wird kein Login-Redirect ausgelöst, sondern null zurückgegeben. */
  silent?: boolean
}

export async function requireUser(
  router: RouterLike,
  options: RequireUserOptions = {}
): Promise<User | null> {
  const supabase = createClient()
  const loginUrl = options.redirectTo
    ? `/auth/login?redirectTo=${encodeURIComponent(options.redirectTo)}`
    : '/auth/login'

  // ═══ Versuch 1: Direkter getUser() ═══
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (user && !error) return user
  } catch {
    // Netzwerkfehler — weiter zum Retry, nicht aufgeben
  }

  // ═══ Versuch 2: 300ms Wartezeit + Session-Refresh + getUser() ═══
  // 300ms reichen, damit SessionKeepAlive sein IndexedDB-Recovery durchführt
  // und der Cookie-Storage in iOS-WebView komplett propagiert ist.
  await sleep(300)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Lokal vorhanden, aber Server-Verify schlug fehl → Refresh erzwingen
      try { await supabase.auth.refreshSession() } catch { /* weiter */ }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) return user
    } else {
      // Keine lokale Session → letzter Refresh-Versuch (z.B. via Refresh-Token aus IDB)
      try {
        const { data: refreshData } = await supabase.auth.refreshSession()
        if (refreshData.session) {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) return user
        }
      } catch { /* weiter */ }
    }
  } catch {
    // weiter
  }

  // ═══ Versuch 3: Letzter Backoff nach 800ms ═══
  await sleep(800)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return user
  } catch {
    // weiter
  }

  // ═══ Alle 3 Versuche gescheitert → echte Auth-Lücke ═══
  if (!options.silent) {
    router.push(loginUrl)
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
