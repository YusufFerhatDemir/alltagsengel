'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * SessionKeepAlive — Keeps the auth session alive across app resume/visibility changes.
 * On mobile (Capacitor/PWA), when the app goes to background and comes back,
 * the access token may have expired. This component refreshes it automatically.
 *
 * Also listens for auth state changes to handle token refresh events properly.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient()

    // ═══ Auth State Listener: Handle all auth events (login, logout, token refresh) ═══
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        // Session was refreshed — cookie + localStorage are auto-updated by custom storage
        console.debug('[SessionKeepAlive] Token refreshed')
      } else if (event === 'SIGNED_OUT') {
        console.debug('[SessionKeepAlive] User signed out')
      }
    })

    // ═══ Visibility Change: Refresh session when app becomes visible ═══
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            // Token still valid — refresh proactively to extend lifetime
            supabase.auth.refreshSession()
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // ═══ Focus: Also refresh on window focus (e.g. switching browser tabs) ═══
    function handleFocus() {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          supabase.auth.refreshSession()
        }
      })
    }
    window.addEventListener('focus', handleFocus)

    // ═══ Capacitor: Listen for native app resume event ═══
    let capacitorCleanup: (() => void) | undefined
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const { App } = (window as any).Capacitor.Plugins || {}
      if (App?.addListener) {
        const handle = App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive) {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session) {
                supabase.auth.refreshSession()
              }
            })
          }
        })
        capacitorCleanup = () => handle?.remove?.()
      }
    }

    // ═══ Periodic Refresh: Every 4 minutes while app is active ═══
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            supabase.auth.refreshSession()
          }
        })
      }
    }, 4 * 60 * 1000) // 4 Minuten statt 10

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
