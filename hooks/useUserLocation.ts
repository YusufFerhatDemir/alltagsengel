'use client'
import { useState, useEffect } from 'react'

interface LocationResult {
  /** Vollständige Adresse (Straße + Stadt) oder nur Stadt */
  address: string
  /** Stadt / Stadtteil */
  city: string
  /** Koordinaten (falls verfügbar) */
  lat: number | null
  lng: number | null
  /** Quelle: 'gps' | 'ip' | 'fallback' */
  source: 'gps' | 'ip' | 'fallback'
  /** Wird noch geladen? */
  loading: boolean
}

const FALLBACK_CITY = 'Frankfurt am Main'
const FALLBACK: LocationResult = {
  address: FALLBACK_CITY,
  city: FALLBACK_CITY,
  lat: 50.1109,
  lng: 8.6821,
  source: 'fallback',
  loading: false,
}

/**
 * Hook für automatische Standorterkennung.
 *
 * Ablauf (wie Uber):
 * 1. GPS (navigator.geolocation) → genaue Adresse (Straßen-Ebene)
 * 2. IP-Geolocation Fallback → Stadt-Ebene
 * 3. Hardcoded Fallback → "Frankfurt am Main"
 *
 * @param skipGps - GPS überspringen (nur IP verwenden)
 */
export function useUserLocation(skipGps = false): LocationResult {
  const [location, setLocation] = useState<LocationResult>({
    ...FALLBACK,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    async function detect() {
      // 1) GPS ausprobieren
      if (!skipGps && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 5000,
              maximumAge: 300000, // 5 Min Cache
            })
          })

          if (cancelled) return

          const { latitude, longitude } = pos.coords

          // Reverse Geocoding mit Nominatim (OpenStreetMap, kostenlos)
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=de`,
              { headers: { 'User-Agent': 'AlltagsEngel/1.0' } }
            )
            if (res.ok) {
              const data = await res.json()
              const addr = data.address || {}
              const road = addr.road || addr.pedestrian || ''
              const houseNr = addr.house_number || ''
              const plz = addr.postcode || ''
              const city = addr.city || addr.town || addr.village || FALLBACK_CITY
              const suburb = addr.suburb || addr.city_district || ''

              const streetPart = road ? `${road}${houseNr ? ' ' + houseNr : ''}` : ''
              const fullAddress = [streetPart, plz ? `${plz} ${city}` : city]
                .filter(Boolean)
                .join(', ')

              if (!cancelled) {
                setLocation({
                  address: fullAddress,
                  city: suburb ? `${city}-${suburb}` : city,
                  lat: latitude,
                  lng: longitude,
                  source: 'gps',
                  loading: false,
                })
              }
              return
            }
          } catch {
            // Reverse Geocoding fehlgeschlagen → trotzdem Koordinaten nutzen
          }

          if (!cancelled) {
            setLocation({
              address: FALLBACK_CITY,
              city: FALLBACK_CITY,
              lat: latitude,
              lng: longitude,
              source: 'gps',
              loading: false,
            })
          }
          return
        } catch {
          // GPS abgelehnt oder Timeout → weiter zu IP
        }
      }

      // 2) IP-Geolocation Fallback
      if (!cancelled) {
        try {
          const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) })
          if (res.ok) {
            const data = await res.json()
            if (!cancelled && data.city) {
              setLocation({
                address: data.city === 'Frankfurt am Main' || data.city === 'Frankfurt'
                  ? 'Frankfurt am Main'
                  : data.city,
                city: data.city,
                lat: data.latitude || null,
                lng: data.longitude || null,
                source: 'ip',
                loading: false,
              })
              return
            }
          }
        } catch {
          // IP API fehlgeschlagen
        }
      }

      // 3) Hardcoded Fallback
      if (!cancelled) {
        setLocation(FALLBACK)
      }
    }

    detect()
    return () => { cancelled = true }
  }, [skipGps])

  return location
}
