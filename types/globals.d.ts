// ═══════════════════════════════════════════════════════════════
// Globale Typ-Erweiterungen fuer Browser-APIs
//
// Erweitert Window und Navigator um Typen fuer externe SDKs, die
// zur Laufzeit vorhanden sein koennen (Capacitor, iOS Safari,
// IE-Legacy).  Wird per tsconfig.json automatisch erfasst.
// ═══════════════════════════════════════════════════════════════

interface Window {
  /** Capacitor-Bridge (vorhanden wenn die App in einer nativen Huelle laeuft). */
  Capacitor?: {
    isNativePlatform?(): boolean
    getPlatform?(): string
    Plugins?: Record<string, { addListener?: (...args: unknown[]) => unknown; [key: string]: unknown }>
  }
  /** WebKit Message Handlers (iOS WKWebView / Capacitor-iOS). */
  webkit?: {
    messageHandlers?: {
      bridge?: unknown
    }
  }
  /** IE/Legacy-Edge MediaStream (benutzt zur Plattform-Erkennung). */
  MSStream?: unknown
}

interface Navigator {
  /** iOS Safari: true wenn als Home-Screen-App geoeffnet. */
  standalone?: boolean
}
