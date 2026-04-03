/**
 * Google Ads & GTM Conversion Tracking
 *
 * Events werden über GTM dataLayer gepusht.
 * In GTM müssen die entsprechenden Tags konfiguriert werden:
 * - Google Ads Conversion Tag (registration, booking, pflegebox_order)
 * - Google Analytics 4 Events
 */

declare global {
  interface Window {
    dataLayer: Array<Record<string, any>>
  }
}

function pushEvent(event: string, data?: Record<string, any>) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push({ event, ...data })
}

/** Neuer Benutzer hat sich registriert */
export function trackRegistration(role: 'kunde' | 'engel' | 'fahrer') {
  pushEvent('registration', {
    user_role: role,
    conversion_type: 'signup',
  })
}

/** Buchung erstellt */
export function trackBooking(data: {
  service: string
  duration: number
  isFlexible: boolean
  totalPrice: number
}) {
  pushEvent('booking_created', {
    service_type: data.service,
    duration_hours: data.duration,
    is_flexible: data.isFlexible,
    value: data.totalPrice,
    currency: 'EUR',
    conversion_type: 'booking',
  })
}

/** Pflegebox / Hygienebox bestellt */
export function trackPflegeboxOrder(boxType: 'basis' | 'komfort') {
  pushEvent('pflegebox_order', {
    box_type: boxType,
    value: boxType === 'komfort' ? 40 : 29.9,
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
