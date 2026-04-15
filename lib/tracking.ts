/**
 * Google Ads Conversion Tracking — Direct gtag() calls
 *
 * Conversion-Aktionen direkt über gtag() gesendet.
 * Kein GTM-Tag-Setup nötig — die Events werden sofort an Google Ads gemeldet.
 *
 * Google Ads Account: AW-18061588897
 * Conversion Actions:
 *   - Registrierung: AW-18061588897/f8HXCJuQvJgcEKHzt6RD (Wert: 110 EUR)
 *   - Buchung:       AW-18061588897/QXYmCJ6QvJgcEKHzt6RD (Wert: 50 EUR)
 */

declare global {
  interface Window {
    dataLayer: Array<Record<string, any>>
    gtag: (...args: any[]) => void
    fbq: (...args: any[]) => void
    ttq: { track: (...args: any[]) => void }
  }
}

// ═══ Meta (Facebook) Pixel Helper ═══
function fbEvent(event: string, params?: Record<string, any>) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  window.fbq('track', event, params)
}

// ═══ TikTok Pixel Helper ═══
function ttEvent(event: string, params?: Record<string, any>) {
  if (typeof window === 'undefined' || !window.ttq?.track) return
  window.ttq.track(event, params)
}

// ═══ Google Ads Conversion IDs ═══
const GOOGLE_ADS_ID = 'AW-18061588897'
const CONVERSION_LABELS = {
  registration: 'f8HXCJuQvJgcEKHzt6RD',  // Registrierung → 110 EUR
  booking:      'QXYmCJ6QvJgcEKHzt6RD',  // Buchung (Abonnieren) → 50 EUR
} as const

// ═══ Helpers ═══
function pushEvent(event: string, data?: Record<string, any>) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...data })
}

/** Liest gclid / wbraid / gbraid aus Session- oder LocalStorage (persistiert 30 Tage) */
function getAttributionData() {
  if (typeof window === 'undefined') return {}
  const get = (k: string): string | null => {
    try {
      return sessionStorage.getItem(`attr_${k}`) || localStorage.getItem(`attr_${k}`) || null
    } catch {
      return null
    }
  }
  const gclid = get('gclid')
  return gclid ? { gclid } : {}
}

function gtagConversion(label: string, value?: number, currency = 'EUR', userData?: { email?: string; phone?: string }) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  const attribution = getAttributionData()

  // Enhanced Conversions: Hashed User-Data verbessert Attribution trotz ITP (iOS Safari)
  // Google Ads hasht Email/Phone automatisch, wenn sie als "normalisierte" Strings übergeben werden
  const conversionData: Record<string, any> = {
    send_to: `${GOOGLE_ADS_ID}/${label}`,
    value: value ?? 0,
    currency,
    ...attribution, // fügt gclid hinzu, falls vorhanden
  }

  if (userData?.email) {
    conversionData.email = userData.email.trim().toLowerCase()
  }
  if (userData?.phone) {
    conversionData.phone_number = userData.phone.replace(/\D/g, '')
  }

  window.gtag('event', 'conversion', conversionData)

  // Offline-Conversion-Fallback: Server-seitig über /api/track-conversion senden (auch wenn gtag blockiert wird)
  try {
    fetch('/api/track-conversion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        value: value ?? 0,
        currency,
        gclid: attribution.gclid || null,
        email: userData?.email || null,
        phone: userData?.phone || null,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {}
}

// ═══ Tracking Functions ═══

/** Neuer Benutzer hat sich registriert */
export function trackRegistration(role: 'kunde' | 'engel' | 'fahrer') {
  // Google Ads Conversion — Registrierung
  gtagConversion(CONVERSION_LABELS.registration, 110.0, 'EUR')

  // GTM dataLayer (für GA4 etc.)
  pushEvent('registration', {
    user_role: role,
    conversion_type: 'signup',
  })

  // Meta Pixel
  fbEvent('CompleteRegistration', { value: 110, currency: 'EUR', content_name: role })

  // TikTok Pixel
  ttEvent('CompleteRegistration', { value: 110, currency: 'EUR' })
}

/** Buchung erstellt (Alltagsbegleitung, Krankenfahrt, etc.) */
export function trackBooking(data: {
  service: string
  duration: number
  isFlexible: boolean
  totalPrice: number
}) {
  // Google Ads Conversion — Buchung / Abonnieren
  gtagConversion(CONVERSION_LABELS.booking, data.totalPrice || 50.0, 'EUR')

  // GTM dataLayer
  pushEvent('booking_created', {
    service_type: data.service,
    duration_hours: data.duration,
    is_flexible: data.isFlexible,
    value: data.totalPrice,
    currency: 'EUR',
    conversion_type: 'booking',
  })

  // Meta Pixel
  fbEvent('Schedule', { value: data.totalPrice, currency: 'EUR', content_name: data.service })

  // TikTok Pixel
  ttEvent('PlaceAnOrder', { value: data.totalPrice, currency: 'EUR' })
}

/** Pflegebox / Hygienebox bestellt */
export function trackPflegeboxOrder(boxType: 'basis' | 'komfort') {
  const value = boxType === 'komfort' ? 40 : 29.9

  // Pflegebox → auch als Buchung/Abonnieren Conversion melden
  gtagConversion(CONVERSION_LABELS.booking, value, 'EUR')

  pushEvent('pflegebox_order', {
    box_type: boxType,
    value,
    currency: 'EUR',
    conversion_type: 'pflegebox',
  })
}

/** Krankenfahrt gebucht */
export function trackKrankenfahrt(data: {
  distance: number
  vehicleType: string
  totalPrice: number
}) {
  // Krankenfahrt → auch als Buchung/Abonnieren Conversion melden
  gtagConversion(CONVERSION_LABELS.booking, data.totalPrice, 'EUR')

  pushEvent('krankenfahrt_booked', {
    distance_km: data.distance,
    vehicle_type: data.vehicleType,
    value: data.totalPrice,
    currency: 'EUR',
    conversion_type: 'krankenfahrt',
  })
}

/** Kontaktformular / Rückruf angefordert */
export function trackContactRequest(source: string) {
  pushEvent('contact_request', {
    source,
    conversion_type: 'lead',
  })

  // Meta Pixel
  fbEvent('Contact', { content_name: source })

  // TikTok Pixel
  ttEvent('Contact', { content_name: source })
}

/** Landing Page aufgerufen (für Ads Attribution) */
export function trackLandingPageView(source: string, campaign?: string) {
  pushEvent('landing_page_view', {
    traffic_source: source,
    campaign: campaign || 'organic',
  })
}

/** Telefonnummer angeklickt */
export function trackPhoneClick() {
  pushEvent('phone_click', {
    conversion_type: 'phone_lead',
  })
}
