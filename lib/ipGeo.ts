/**
 * Gemeinsamer, deduplizierter ipapi.co-Lookup.
 *
 * Vorher riefen VisitorTracker, useTrackVisit und useUserLocation ipapi.co
 * jeweils selbst auf → bis zu 3 identische Requests pro Seitenaufruf
 * (Rate-Limit-Risiko: ipapi.co Free-Tier = 1.000 Calls/Tag).
 *
 * Jetzt: ein In-Flight-Promise pro Page-Load + sessionStorage-Cache
 * über die ganze Session (IP/Stadt ändern sich innerhalb einer Session nicht).
 */

export interface IpGeo {
  ip: string
  city: string
  region: string
  country_name: string
  latitude: number | null
  longitude: number | null
}

const CACHE_KEY = 'ae_ipgeo'

let inFlight: Promise<IpGeo | null> | null = null

export function getIpGeo(timeoutMs = 4000): Promise<IpGeo | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  // Session-Cache: erspart weitere Netz-Calls bei Navigation
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return Promise.resolve(JSON.parse(cached) as IpGeo)
  } catch {}

  if (inFlight) return inFlight

  inFlight = fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(timeoutMs) })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || data.error) return null
      const geo: IpGeo = {
        ip: data.ip || '',
        city: data.city || '',
        region: data.region || '',
        country_name: data.country_name || '',
        latitude: typeof data.latitude === 'number' ? data.latitude : null,
        longitude: typeof data.longitude === 'number' ? data.longitude : null,
      }
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(geo))
      } catch {}
      return geo
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
