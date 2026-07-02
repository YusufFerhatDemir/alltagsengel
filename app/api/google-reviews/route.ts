import { NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// GOOGLE-REVIEWS API — echte Bewertungen vom Business-Profil
// ═══════════════════════════════════════════════════════════
// Holt Rating + Rezensionen über die Places API (New) und
// cacht sie 6 h in-memory. Ohne konfigurierten GOOGLE_PLACE_ID
// liefert die Route { configured: false } — das Widget zeigt
// dann den "Bewerten Sie uns"-CTA. Es werden NIE erfundene
// Bewertungen ausgeliefert.
//
// Setup (einmalig, sobald das Google Business Profil live ist):
//   GOOGLE_MAPS_API_KEY = API-Key mit Places API (New)
//   GOOGLE_PLACE_ID     = Place-ID des Alltagsengel-Profils
// ═══════════════════════════════════════════════════════════

export const runtime = 'nodejs'

const CACHE_MS = 6 * 60 * 60 * 1000

interface Review {
  author: string
  rating: number
  text: string
  relativeTime: string
}

interface Cached {
  at: number
  data: { configured: boolean; rating?: number; count?: number; reviews?: Review[] }
}

let cache: Cached | null = null

export async function GET() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const placeId = process.env.GOOGLE_PLACE_ID

  if (!apiKey || !placeId) {
    return NextResponse.json({ configured: false }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  }

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=de`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
      },
      next: { revalidate: 21600 },
    })

    if (!res.ok) {
      console.error('[GoogleReviews] Places API Error:', res.status, await res.text())
      // Alten Cache weiterverwenden, falls vorhanden
      if (cache) return NextResponse.json(cache.data)
      return NextResponse.json({ configured: false })
    }

    const place = await res.json()
    const reviews: Review[] = (place.reviews || [])
      .filter((r: any) => r.rating >= 4 && r.text?.text) // nur gute, aussagekräftige Rezensionen zeigen
      .slice(0, 5)
      .map((r: any) => ({
        author: r.authorAttribution?.displayName || 'Google-Nutzer',
        rating: r.rating,
        text: String(r.text.text).slice(0, 320),
        relativeTime: r.relativePublishTimeDescription || '',
      }))

    const data = {
      configured: true,
      rating: place.rating ?? null,
      count: place.userRatingCount ?? 0,
      reviews,
    }
    cache = { at: Date.now(), data }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch (e) {
    console.error('[GoogleReviews] Fehler:', e)
    if (cache) return NextResponse.json(cache.data)
    return NextResponse.json({ configured: false })
  }
}
