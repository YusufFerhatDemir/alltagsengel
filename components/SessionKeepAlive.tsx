'use client'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient, readSessionFromIDB, writeSessionCookie, writeSessionBackup } from '@/lib/supabase/client'

/**
 * SessionKeepAlive — WhatsApp-Level Session-Persistenz
 *
 * Einmal anmelden → nie wieder fragen.
 *
 * Was dieser Komponent macht:
 * 1. Beim App-Start: IndexedDB Recovery (falls Cookie + localStorage gelöscht)
 * 2. onAuthStateChange: Hört auf alle Auth-Events
 * 3. Visibility Change: Sofortiger Token-Refresh wenn App wieder sichtbar
 * 4. Window Focus: Refresh bei Tab-Wechsel
 * 5. Capacitor Resume: Refresh bei nativer App-Rückkehr
 * 6. Periodic: Alle 2 Minuten Token erneuern
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient()

    // ═══ 1. IndexedDB Recovery beim Start ═══
    // Falls Cookie UND localStorage gelöscht wurden (z.B. "Daten löschen" im Browser),
    // stellt IndexedDB die Session wieder her
    async function recoverFromIDB() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) return // Session ist da, alles gut

        // Kein Session → versuche IndexedDB
        const idbSession = await readSessionFromIDB()
        if (idbSession) {
          // Restore to cookie + localStorage
          writeSessionCookie(idbSession)
          writeSessionBackup(idbSession)
          // Parse and set session
          try {
            const parsed = JSON.parse(idbSession)
            if (parsed.refresh_token) {
              const { error } = await supabase.auth.refreshSession({
                refresh_token: parsed.refresh_token,
              })
              if (error) {
                console.warn('[SessionKeepAlive] IDB-Recovery Refresh fehlgeschlagen:', error.message)
                Sentry.captureException(error, { tags: { source: 'SessionKeepAlive.idb_recovery' } })
              } else {
                console.debug('[SessionKeepAlive] Session aus IndexedDB wiederhergestellt')
              }
            }
          } catch (parseErr) {
            console.warn('[SessionKeepAlive] IDB-Session JSON-Parse fehlgeschlagen')
            Sentry.captureException(parseErr, { tags: { source: 'SessionKeepAlive.idb_parse' } })
          }
        }
      } catch (err) {
        console.warn('[SessionKeepAlive] IDB-Recovery Fehler:', err)
        Sentry.captureException(err, { tags: { source: 'SessionKeepAlive.idb_recover_outer' } })
      }
    }
    recoverFromIDB()

    // ═══ Sentry: Initial User-Context setzen (falls bereits eingeloggt) ═══
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.id) {
        Sentry.setUser({ id: user.id }) // nur UUID — kein Email/IP (PII-Schutz)
      }
    }).catch(() => { /* ignore */ })

    // ═══ 2. Auth State Listener ═══
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.debug('[SessionKeepAlive] Token erneuert ✓')
      } else if (event === 'SIGNED_OUT') {
        console.debug('[SessionKeepAlive] Abgemeldet')
        Sentry.setUser(null) // User-Context löschen
      } else if (event === 'SIGNED_IN') {
        console.debug('[SessionKeepAlive] Angemeldet ✓')
        if (session?.user?.id) {
          Sentry.setUser({ id: session.user.id }) // nur UUID — kein Email/IP
        }
      }
    })

    // ═══ 3. Sofortiger Refresh bei Sichtbarkeit ═══
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            supabase.auth.refreshSession().then(({ error }) => {
              if (error) {
                console.warn('[SessionKeepAlive] Visibility refresh fehlgeschlagen:', error.message)
                Sentry.captureException(error, { tags: { source: 'SessionKeepAlive.visibility' } })
              }
            })
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // ═══ 4. Refresh bei Tab-Fokus ═══
    function handleFocus() {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          supabase.auth.refreshSession().then(({ error }) => {
            if (error) {
              console.warn('[SessionKeepAlive] Focus refresh fehlgeschlagen:', error.message)
              Sentry.captureException(error, { tags: { source: 'SessionKeepAlive.focus' } })
            }
          })
        }
      })
    }
    window.addEventListener('focus', handleFocus)

    // ═══ 5. Capacitor App Resume ═══
    let capacitorCleanup: (() => void) | undefined
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const { App } = (window as any).Capacitor.Plugins || {}
      if (App?.addListener) {
        const handle = App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive) {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session) {
                supabase.auth.refreshSession().then(({ error }) => {
                  if (error) {
                    console.warn('[SessionKeepAlive] Capacitor resume refresh fehlgeschlagen:', error.message)
                    Sentry.captureException(error, { tags: { source: 'SessionKeepAlive.capacitor' } })
                  }
                })
              }
            })
          }
        })
        capacitorCleanup = () => handle?.remove?.()
      }
    }

    // ═══ 6. Periodic Refresh: Alle 20 Minuten ═══
    // Access-Token lebt 1h → 20min = 3x Sicherheits-Puffer.
    // 2min war zu aggressiv (Supabase Rate-Limits, unnoetige Requests).
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            supabase.auth.refreshSession().then(({ error }) => {
              if (error) {
                console.warn('[SessionKeepAlive] Periodic refresh fehlgeschlagen:', error.message)
                Sentry.captureException(error, { tags: { source: 'SessionKeepAlive.periodic' } })
              }
            })
          }
        })
      }
    }, 20 * 60 * 1000)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
      capacitorCleanup?.()
    }
  }, [])

  return null
}
