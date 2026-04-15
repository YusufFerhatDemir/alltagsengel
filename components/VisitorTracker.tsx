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

    // ═══ UTM + gclid aus URL extrahieren und in sessionStorage speichern ═══
    // Google Ads Click-ID (gclid) erlaubt Conversion-Attribution
    try {
      const params = new URLSearchParams(window.location.search)
      const utmKeys = ['gclid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      utmKeys.forEach(k => {
        const v = params.get(k)
        if (v) {
          // Persist first-touch attribution (30 Tage)
          sessionStorage.setItem(`attr_${k}`, v)
          try { localStorage.setItem(`attr_${k}`, v) } catch {}
        }
      })
    } catch {}

    const getAttr = (k: string): string | null => {
      try {
        return sessionStorage.getItem(`attr_${k}`) || localStorage.getItem(`attr_${k}`)
      } catch { return null }
    }

    // Track visit
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent || '',
        landing_page: window.location.pathname + window.location.search,
        gclid: getAttr('gclid'),
        fbclid: getAttr('fbclid'),
        utm_source: getAttr('utm_source'),
        utm_medium: getAttr('utm_medium'),
        utm_campaign: getAttr('utm_campaign'),
        utm_term: getAttr('utm_term'),
        utm_content: getAttr('utm_content'),
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
