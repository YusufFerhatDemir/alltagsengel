'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getCookieConsent } from '@/components/CookieConsent'
import { createClient } from '@/lib/supabase/client'

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

    // 1) Original /api/track Endpoint (visitors-Tabelle)
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
      }),
    }).catch(() => {})

    // 2) Auch visitor_locations befüllen (für MIS Analytics)
    trackVisitorLocation(pathname)
  }, [pathname])

  return null
}

async function trackVisitorLocation(pagePath: string) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // IP + Geo-Details holen
    let country = ''
    let city = ''
    let region = ''
    let ipAddress = ''
    let lat: number | null = null
    let lng: number | null = null
    let source = 'fallback'

    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const data = await res.json()
        country = data.country_name || ''
        city = data.city || ''
        region = data.region || ''
        ipAddress = data.ip || ''
        lat = data.latitude || null
        lng = data.longitude || null
        source = 'ip'
      }
    } catch {
      // IP API nicht erreichbar — Fallback
      city = 'Frankfurt am Main'
      country = 'Germany'
      lat = 50.1109
      lng = 8.6821
    }

    // Portal aus Pfad bestimmen
    let portal = 'landing'
    if (pagePath.startsWith('/kunde')) portal = 'kunde'
    else if (pagePath.startsWith('/engel')) portal = 'engel'
    else if (pagePath.startsWith('/fahrer')) portal = 'fahrer'
    else if (pagePath.startsWith('/investor')) portal = 'investor'
    else if (pagePath.startsWith('/mis')) portal = 'admin'

    await supabase.from('visitor_locations').insert({
      user_id: user?.id || null,
      portal,
      city: city || null,
      country: country || null,
      region: region || null,
      latitude: lat,
      longitude: lng,
      source,
      ip_address: ipAddress || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      page_path: pagePath,
    })
  } catch {
    // Tracking-Fehler sind nicht kritisch
  }
}
