import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Rate Limiter: max 10 Tracking-Requests pro IP pro Minute
const trackRateLimit = new Map<string, { count: number; resetAt: number }>()

function checkTrackRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = trackRateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    trackRateLimit.set(ip, { count: 1, resetAt: now + 60000 })
    return true
  }
  if (entry.count >= 10) return false
  entry.count++
  return true
}

// Aufräumen alle 5 Minuten
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of trackRateLimit.entries()) {
    if (now > entry.resetAt) trackRateLimit.delete(key)
  }
}, 300000)

// Cache für IP-Geo-Daten (vermeidet doppelte API-Aufrufe)
const geoCache = new Map<string, { data: GeoData; ts: number }>()
const GEO_CACHE_TTL = 3600000 // 1 Stunde

interface GeoData {
  postal_code?: string
  isp?: string
  org?: string
  district?: string
  latitude?: number
  longitude?: number
  city?: string
  region?: string
  country?: string
  timezone?: string
}

async function getDetailedGeo(ip: string): Promise<GeoData | null> {
  if (ip === 'unknown' || ip === '127.0.0.1') return null

  // Cache prüfen
  const cached = geoCache.get(ip)
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
    return cached.data
  }

  try {
    // ip-api.com — kostenlos, 45 Anfragen/Min, kein API-Key nötig
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,isp,org`,
      { signal: AbortSignal.timeout(3000) } // 3s Timeout
    )

    if (!res.ok) return null

    const data = await res.json()
    if (data.status !== 'success') return null

    const geo: GeoData = {
      postal_code: data.zip || undefined,
      isp: data.isp || undefined,
      org: data.org || undefined,
      district: data.district || undefined,
      latitude: data.lat || undefined,
      longitude: data.lon || undefined,
      city: data.city || undefined,
      region: data.regionName || undefined,
      country: data.countryCode || undefined,
      timezone: data.timezone || undefined,
    }

    // Cache speichern
    geoCache.set(ip, { data: geo, ts: Date.now() })

    // Cache aufräumen (max 500 Einträge)
    if (geoCache.size > 500) {
      const oldest = [...geoCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
      for (let i = 0; i < 100; i++) geoCache.delete(oldest[i][0])
    }

    return geo
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    // IP aus Header lesen (Vercel / Cloudflare)
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // Rate Limiting
    if (!checkTrackRateLimit(ip)) {
      return NextResponse.json({ ok: true }) // Stille Ablehnung
    }

    const body = await req.json()

    // Input-Validierung
    if (typeof body.page !== 'string' || body.page.length > 500) {
      return NextResponse.json({ ok: true })
    }

    const supabase = createAdminClient()

    // Vercel Geo-Header (Basis)
    const vercelCountry = req.headers.get('x-vercel-ip-country') || ''
    const vercelCity = decodeURIComponent(req.headers.get('x-vercel-ip-city') || '')
    const vercelRegion = req.headers.get('x-vercel-ip-country-region') || ''
    const vercelLat = req.headers.get('x-vercel-ip-latitude')
    const vercelLng = req.headers.get('x-vercel-ip-longitude')

    // Detaillierte Geo-Daten von ip-api.com (PLZ, ISP, Stadtteil)
    const detailedGeo = await getDetailedGeo(ip)

    // Beste verfügbare Daten verwenden (ip-api > Vercel)
    const country = detailedGeo?.country || vercelCountry
    const city = detailedGeo?.city || vercelCity
    const region = detailedGeo?.region || vercelRegion
    const lat = detailedGeo?.latitude || (vercelLat ? parseFloat(vercelLat) : null)
    const lng = detailedGeo?.longitude || (vercelLng ? parseFloat(vercelLng) : null)

    // 1) visitors-Tabelle (erweitert mit PLZ, ISP, Stadtteil)
    await supabase.from('visitors').insert({
      ip,
      country,
      city,
      region,
      postal_code: detailedGeo?.postal_code || null,
      isp: detailedGeo?.isp || null,
      org: detailedGeo?.org || null,
      district: detailedGeo?.district || null,
      latitude: lat || null,
      longitude: lng || null,
      timezone: detailedGeo?.timezone || null,
      user_agent: req.headers.get('user-agent') || '',
      referrer: body.referrer || '',
      page: body.page || '/',
    })

    // 2) visitor_locations befüllen (für MIS Analytics)
    const pagePath = body.page || '/'
    let portal = 'landing'
    if (pagePath.startsWith('/kunde')) portal = 'kunde'
    else if (pagePath.startsWith('/engel')) portal = 'engel'
    else if (pagePath.startsWith('/fahrer')) portal = 'fahrer'
    else if (pagePath.startsWith('/investor')) portal = 'investor'
    else if (pagePath.startsWith('/mis')) portal = 'admin'

    await supabase.from('visitor_locations').insert({
      portal,
      city: city || null,
      country: country || null,
      region: region || null,
      latitude: lat || null,
      longitude: lng || null,
      source: detailedGeo ? 'ip-api' : (vercelLat ? 'vercel' : 'ip'),
      ip_address: ip !== 'unknown' ? ip : null,
      user_agent: req.headers.get('user-agent') || null,
      page_path: pagePath,
    })

    // 3) Visitor-Alert für überwachte Gebiete (Frankfurt Nordend, Stadtallendorf, etc.)
    const watchedPostalCodes = ['60318', '60320', '60322', '35260', '36304', '35037']
    const watchedCities = ['stadtallendorf', 'alsfeld', 'marburg', 'nordend']
    const postalCode = detailedGeo?.postal_code || ''
    const cityLower = (city || '').toLowerCase()
    const districtLower = (detailedGeo?.district || '').toLowerCase()

    const isWatched =
      watchedPostalCodes.includes(postalCode) ||
      watchedCities.some(w => cityLower.includes(w) || districtLower.includes(w))

    if (isWatched) {
      // Trigger visitor-alert im Hintergrund
      const alertUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://alltagsengel.care'}/api/visitor-alert`
      fetch(alertUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          city: city || detailedGeo?.district || '',
          region,
          page: pagePath,
          userAgent: req.headers.get('user-agent') || '',
          postalCode,
          isp: detailedGeo?.isp || '',
          district: detailedGeo?.district || '',
        }),
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
