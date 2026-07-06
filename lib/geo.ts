// ═══════════════════════════════════════════════════════════
// GEO — reine Hilfsfunktionen für Standort-Prüfung (Check-in/Check-out).
// Serverseitiges Pendant zu native/src/lib/geo.ts (identische Logik) —
// wird von app/api/native/geo-events/route.ts genutzt, um die Distanz
// zur hinterlegten approved_locations-Adresse zu berechnen.
// ═══════════════════════════════════════════════════════════

const EARTH_RADIUS_M = 6371000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Haversine-Distanz zwischen zwei Koordinaten in Metern. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

export interface RadiusCheck {
  distanceM: number
  withinRadius: boolean
}

/** Prüft, ob eine Position innerhalb des erlaubten Radius um einen Zielpunkt liegt. */
export function checkWithinRadius(
  lat: number,
  lng: number,
  targetLat: number,
  targetLng: number,
  radiusM: number = 150
): RadiusCheck {
  const distanceM = haversineDistanceMeters(lat, lng, targetLat, targetLng)
  return { distanceM: Math.round(distanceM), withinRadius: distanceM <= radiusM }
}
