'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getCookieConsent } from '@/components/CookieConsent'

export default function VisitorTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // In Capacitor (iOS/Android) → Web-Tracking deaktivieren
    // (App nutzt eigenes mis_auth_log + native Analytics)
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()
    if (isNative) return

    const consent = getCookieConsent()
    // DSGVO: Only track if EXPLICITLY accepted, not if decision is pending (null)
    if (consent !== 'accepted') return

    const key = `visited_${pathname}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    // Track visit
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent || '',
      }),
    }).catch(() => {})

    // Visitor Alert — IP-basierte Überwachung (nur 1x pro Session)
    if (!sessionStorage.getItem('alert_checked')) {
      sessionStorage.setItem('alert_checked', '1')
      fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
        .then(r => r.json())
        .then(geo => {
          fetch('/api/visitor-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: geo.ip || '',
              city: geo.city || '',
              region: geo.region || '',
              page: pathname,
              userAgent: navigator.userAgent || '',
            }),
          }).catch(() => {})
        })
        .catch(() => {})
    }
  }, [pathname])

  return null
}
