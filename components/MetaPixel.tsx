'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getCookieConsent } from './CookieConsent'

// ═══════════════════════════════════════════════════════════
// META (FACEBOOK) PIXEL — DSGVO-konform
// ═══════════════════════════════════════════════════════════
// Wird NUR geladen wenn:
// 1. Cookie-Consent erteilt wurde
// 2. Kein Capacitor (native App) erkannt wird
// 3. NEXT_PUBLIC_META_PIXEL_ID gesetzt ist
// ═══════════════════════════════════════════════════════════

const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || ''

export default function MetaPixel() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (!META_PIXEL_ID) return

    // Nicht in Capacitor laden
    const isCapacitor = !!(
      (window as any).Capacitor ||
      navigator.userAgent.includes('Capacitor') ||
      (window as any).webkit?.messageHandlers?.bridge
    )
    if (isCapacitor) return

    // Cookie-Consent prüfen
    const consent = getCookieConsent()
    if (consent === 'accepted') {
      setShouldLoad(true)
      return
    }

    const interval = setInterval(() => {
      if (getCookieConsent() === 'accepted') {
        setShouldLoad(true)
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  if (!shouldLoad || !META_PIXEL_ID) return null

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${META_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}

// ═══ Helper: Conversion Events tracken ═══
export function trackMetaEvent(event: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    ;(window as any).fbq('track', event, params)
  }
}

// Vordefinierte Events für AlltagsEngel:
// trackMetaEvent('Lead')                      → Registrierung
// trackMetaEvent('CompleteRegistration')       → Registrierung abgeschlossen
// trackMetaEvent('Schedule')                   → Buchung erstellt
// trackMetaEvent('Contact')                    → Kontaktformular
// trackMetaEvent('Search', { search_string })  → Engel-Suche
