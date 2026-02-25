/**
 * PLZ → Koordinat dönüşümü ve mesafe hesaplama
 * zippopotam.us API (ücretsiz, API key gerektirmez)
 */

export async function geocodePLZ(plz: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://api.zippopotam.us/de/${plz}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.places && data.places.length > 0) {
      return {
        lat: parseFloat(data.places[0].latitude),
        lng: parseFloat(data.places[0].longitude),
      }
    }
    return null
  } catch {
    return null
  }
}

/** Haversine formülü ile iki koordinat arası mesafe (km) */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

/** Location string'inden PLZ çıkar (ilk 5 rakam) */
export function extractPLZ(location: string | null): string | null {
  if (!location) return null
  const match = location.match(/\d{5}/)
  return match ? match[0] : null
}
