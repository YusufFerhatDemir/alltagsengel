/**
 * Welle-1 Analytics-Wrapper: einheitlicher Event-Layer
 *
 * - GA4 (gtag) als primäre Sink (Web-only, im Capacitor-WebView no-op)
 * - dataLayer für GTM-Konsumenten
 * - Optional Meta/TikTok-Spiegel via lib/tracking.ts (bereits vorhanden)
 *
 * App-Tracking (iOS/Android nativ) folgt in Welle 2 über Firebase. Diese
 * Datei bleibt dann unverändert — sie ist die Web-Schicht.
 */

export type AnalyticsEventName =
  | 'sign_up'
  | 'login'
  | 'pflegebox_order'
  | 'krankenfahrt_booking'
  | 'contact_request'
  | 'phone_click'
  | 'whatsapp_click'
  | 'email_click'
  | 'chat_message_sent'
  | 'page_view_app'
  | 'web_vital'

export interface AnalyticsEventParams {
  [key: string]: string | number | boolean | null | undefined
}

function isNativeAppContext(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor ||
    navigator.userAgent.includes('Capacitor') ||
    (window as any).webkit?.messageHandlers?.bridge
  )
}

function gtagAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).gtag === 'function'
}

/**
 * Zentrales Event-Sending. Schickt das Event an gtag (GA4) UND in den
 * dataLayer. Im Capacitor-WebView wird übersprungen, weil GA4 dort
 * Daten der nativen App verwässert. Welle 2 ersetzt das durch Firebase.
 */
export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}): void {
  if (typeof window === 'undefined') return
  if (isNativeAppContext()) return

  try {
    if (gtagAvailable()) {
      ;(window as any).gtag('event', name, params)
    }
    ;(window as any).dataLayer = (window as any).dataLayer || []
    ;(window as any).dataLayer.push({ event: name, ...params })
  } catch {
    // Niemals den User-Flow brechen, nur weil Analytics scheitert
  }
}

/** Kern-Event-Helfer, damit Aufruferseite keine Strings tippt */
export const Analytics = {
  registration(role: 'kunde' | 'engel' | 'fahrer'): void {
    trackEvent('sign_up', { method: 'email', user_role: role })
  },
  login(role: 'kunde' | 'engel' | 'fahrer' | 'admin'): void {
    trackEvent('login', { method: 'email', user_role: role })
  },
  pflegeboxOrder(value: number, currency = 'EUR'): void {
    trackEvent('pflegebox_order', { value, currency })
  },
  krankenfahrtBooking(value: number, distanceKm: number, currency = 'EUR'): void {
    trackEvent('krankenfahrt_booking', { value, currency, distance_km: distanceKm })
  },
  contact(source: string): void {
    trackEvent('contact_request', { source })
  },
  phoneClick(source: string): void {
    trackEvent('phone_click', { source })
  },
  whatsappClick(source: string): void {
    trackEvent('whatsapp_click', { source })
  },
  emailClick(source: string): void {
    trackEvent('email_click', { source })
  },
  chat(role: 'user' | 'assistant', topic?: string): void {
    trackEvent('chat_message_sent', { role, topic: topic ?? null })
  },
}
