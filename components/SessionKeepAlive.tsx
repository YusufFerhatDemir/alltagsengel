'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * SessionKeepAlive — Keeps the auth session alive across app resume/visibility changes.
 * On mobile (Capacitor), when the app goes to background and comes back,
 * the access token may have expired. This component refreshes it automatically.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    const supabase = createClient()

    // Refresh session when app becomes visible again (mobile + desktop)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            // Token is still valid — refresh it proactively to extend lifetime
            supabase.auth.refreshSession()
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Capacitor-specific: listen for app resume event
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const { App } = (window as any).Capacitor.Plugins || {}
      if (App?.addListener) {
        App.addListener('appStateChange', (state: { isActive: boolean }) => {
          if (state.isActive) {
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session) {
                supabase.auth.refreshSession()
              }
            })
          }
        })
      }
    }

    // Periodic refresh every 10 minutes while app is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session) {
            supabase.auth.refreshSession()
          }
        })
      }
    }, 10 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(interval)
    }
  }, [])

  return null
}
