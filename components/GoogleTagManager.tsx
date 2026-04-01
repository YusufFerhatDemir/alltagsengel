'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getCookieConsent } from './CookieConsent'

const GTM_ID = 'GTM-NPNL3D3Q'

/**
 * Google Tag Manager – NUR im Web-Browser laden, NICHT in der Capacitor iOS/Android App.
 * Zusätzlich wird auf Cookie-Consent gewartet (GDPR/DSGVO-konform).
 */
export default function GoogleTagManager() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    // Prüfe ob wir in Capacitor (native App) laufen
    const isCapacitor = !!(
      (window as any).Capacitor ||
      navigator.userAgent.includes('Capacitor') ||
      (window as any).webkit?.messageHandlers?.bridge
    )

    // GTM nur im normalen Browser laden, NICHT in der App
    if (isCapacitor) {
      console.log('[GTM] Capacitor erkannt – GTM wird NICHT geladen')
      return
    }

    // Prüfe Cookie-Consent
    const consent = getCookieConsent()
    if (consent === 'accepted') {
      setShouldLoad(true)
      return
    }

    // Warte auf Consent-Änderung (falls Nutzer erst später zustimmt)
    const interval = setInterval(() => {
      const currentConsent = getCookieConsent()
      if (currentConsent === 'accepted') {
        setShouldLoad(true)
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  if (!shouldLoad) return null

  return (
    <>
      {/* GTM Script im Head */}
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `,
        }}
      />
      {/* GTM Noscript Fallback */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
