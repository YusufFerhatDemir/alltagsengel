'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getCookieConsent } from '@/components/CookieConsent'

export default function VisitorTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // Nur tracken wenn Cookie-Consent erteilt wurde oder noch nicht entschieden
    const consent = getCookieConsent()
    if (consent === 'rejected') return

    // Jede Seite einmal pro Session tracken
    const key = `visited_${pathname}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
      }),
    }).catch(() => {})
  }, [pathname])

  return null
}
