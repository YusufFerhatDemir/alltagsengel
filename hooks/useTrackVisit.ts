'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserLocation } from '@/hooks/useUserLocation'
import { getCookieConsent } from '@/components/CookieConsent'

type Portal = 'kunde' | 'engel' | 'fahrer' | 'investor' | 'landing'

/**
 * Trackt Besucher-Standorte für die MIS-Analyse.
 * Wird einmal pro Mount und Portal aufgerufen.
 * Speichert: Stadt, Land, Region, Koordinaten, Quelle (GPS/IP/Fallback)
 *
 * DSGVO: läuft NUR bei Cookie-Consent 'accepted' — der Banner kündigt
 * IP-/Standort-Erfassung ausdrücklich als zustimmungspflichtig an.
 */
export function useTrackVisit(portal: Portal) {
  const userLocation = useUserLocation()
  const tracked = useRef(false)
  const [consent, setConsent] = useState<string | null>(null)

  // Consent lesen + auf spätere Zustimmung (Banner-Klick) reagieren
  useEffect(() => {
    setConsent(getCookieConsent())
    const onChange = (e: Event) => setConsent((e as CustomEvent).detail ?? getCookieConsent())
    window.addEventListener('ae_consent_change', onChange)
    return () => window.removeEventListener('ae_consent_change', onChange)
  }, [])

  useEffect(() => {
    if (consent !== 'accepted') return
    if (tracked.current || userLocation.loading) return
    tracked.current = true

    async function track() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // IP + Geo-Details holen (Land, Region)
        let country = ''
        let region = ''
        let ipAddress = ''

        try {
          const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
          if (res.ok) {
            const data = await res.json()
            country = data.country_name || ''
            region = data.region || ''
            ipAddress = data.ip || ''
          }
        } catch {
          // IP API nicht erreichbar
        }

        await supabase.from('visitor_locations').insert({
          user_id: user?.id || null,
          portal,
          city: userLocation.city || null,
          country: country || null,
          region: region || null,
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          source: userLocation.source,
          ip_address: ipAddress || null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          page_path: typeof window !== 'undefined' ? window.location.pathname : null,
        })
      } catch {
        // Tracking-Fehler sind nicht kritisch
      }
    }

    track()
  }, [consent, userLocation.loading, userLocation.city, userLocation.lat, userLocation.lng, userLocation.source, portal])
}
