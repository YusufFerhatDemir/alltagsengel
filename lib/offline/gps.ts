// ═══════════════════════════════════════════════════════════════
// GPS-Adapter — Block 20 (Native Features)
// ═══════════════════════════════════════════════════════════════
// Geprüft (12.08.2026): @capacitor/geolocation ist NICHT in
// package.json installiert. Genau wie bei lib/offline/kamera.ts wurde
// bewusst KEIN `npm install` durchgeführt (neue native Abhängigkeit).
//
// Statt eines Platzhalters mit erfundenen Koordinaten liefert diese
// Datei eine ECHTE Implementierung über die Standard-Web-Geolocation-
// API (`navigator.geolocation`) — dieselbe API, die bereits in
// app/admin/records/new/page.tsx für die GPS-Erfassung genutzt wird.
// Sie funktioniert auch in der Capacitor-WKWebView (App = Live-Website
// im WebView, siehe Memory "ios-app-capacitor-remote"), solange die
// iOS/Android-Standortberechtigung erteilt ist — dafür ist keine
// zusätzliche native Abhängigkeit nötig.
//
// EINMAL-Messung (kein Dauertracking), analog dem bestehenden Server-
// Pendant app/api/native/geo-events (das allerdings Bearer-Token-Auth
// für die separate Expo-Bridge nutzt, nicht Cookie-Session — ein
// Cookie-basiertes Pendant für die Capacitor-WebView-App existiert noch
// nicht und ist NICHT Teil dieser Datei; sie liefert nur die reine
// Erfassung + Client-seitige Radius-Prüfung, die Übertragung bleibt
// Aufgabe der jeweiligen UI-Seite, z. B. lib/touren/ für Tour-Check-ins).
// ═══════════════════════════════════════════════════════════════

import { checkWithinRadius, type RadiusCheck } from '@/lib/geo'

export interface PositionErfassung {
  lat: number
  lng: number
  genauigkeit_m: number | null
  erfasst_am: number
}

export interface GpsAdapter {
  istNativ: boolean
  aktuellePosition(timeoutMs?: number): Promise<PositionErfassung>
}

/** Erkennt, ob die App aktuell in einer Capacitor-Hülle läuft (informativ, kein Verhalten). */
export function laeuftInCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

/**
 * Web-Geolocation-Adapter: einzige Implementierung, solange
 * @capacitor/geolocation nicht installiert ist. Nutzt echte
 * Browser-/WebView-Koordinaten, keine Simulation.
 */
export class WebGeolocationAdapter implements GpsAdapter {
  readonly istNativ = false

  aktuellePosition(timeoutMs = 10_000): Promise<PositionErfassung> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation-API nicht verfügbar (kein Browser-/WebView-Kontext).'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            genauigkeit_m: pos.coords.accuracy ?? null,
            erfasst_am: pos.timestamp,
          })
        },
        err => reject(new Error(`Standort konnte nicht ermittelt werden: ${err.message}`)),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      )
    })
  }
}

/**
 * Factory: liefert den aktuell verfügbaren GPS-Adapter. Sobald
 * @capacitor/geolocation installiert ist, hier eine zweite
 * Implementierung ergänzen und je nach `laeuftInCapacitor()` auswählen.
 */
export function erstelleGpsAdapter(): GpsAdapter {
  return new WebGeolocationAdapter()
}

/** Client-seitige Radius-Prüfung — reine Weiterreichung von lib/geo.ts. */
export function pruefePositionInnerhalbRadius(
  position: PositionErfassung,
  zielLat: number,
  zielLng: number,
  radiusM = 150,
): RadiusCheck {
  return checkWithinRadius(position.lat, position.lng, zielLat, zielLng, radiusM)
}
