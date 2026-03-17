'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getCookieConsent } from '@/components/CookieConsent'

export default function VisitorTracker() {
  const pathname = usePathname()

  useEffect(() => {
    const consent = getCookieConsent()
    if (consent === 'rejected') return

    // Jede Seite einmal pro Session tracken
    const key = `visited_${pathname}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    // Single API call — server handles both visitors + visitor_locations
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent || '',
      }),
    }).catch(() => {})
  }, [pathname])

  return null
}
