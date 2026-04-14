'use client'
import { useEffect } from 'react'
import Script from 'next/script'
import { getCookieConsent } from './CookieConsent'

const GTM_ID = 'GTM-NPNL3D3Q'
const GOOGLE_ADS_ID = 'AW-18061588897'

/**
 * Google Tag Manager + Google Ads Conversion Tracking
 *
 * DSGVO-konform mit Google Consent Mode v2:
 * - gtag.js wird IMMER und SOFORT (auch im SSR) geladen, damit
 *   Google den Tag bei jedem Crawl verifizieren kann.
 * - Default Consent = denied (Setup in layout.tsx <head>)
 * - Nach Cookie-Akzeptierung → Consent auf granted aktualisiert
 * - In Capacitor (native App) wird gtag/gtm trotzdem geladen,
 *   feuert aber keine Conversions, weil tracking.ts nichts sendet
 *   solange kein Web-Kontext. (Vorher: komplett ausgeschaltet -
 *   das verhinderte aber, dass Google den Tag im SSR-HTML findet.)
 *
 * Hintergrund: Vorher war das gesamte JSX hinter useEffect+useState
 * versteckt. Bedeutet: SSR rendert "null" -> Google Bot findet
 * keinen Tag -> "Tag falsch konfiguriert" -> Conversions fehlten.
 */
export default function GoogleTagManager() {
  useEffect(() => {
    // Prüfe ob Consent bereits vorhanden ist und aktualisiere
    const consent = getCookieConsent()
    if (consent === 'accepted') {
      updateConsentToGranted()
    }

    // Warte auf Consent-Änderung (falls Nutzer erst später zustimmt)
    const interval = setInterval(() => {
      const currentConsent = getCookieConsent()
      if (currentConsent === 'accepted') {
        updateConsentToGranted()
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <>
      {/* Google Tag (gtag.js) für Google Ads Conversion Tracking
          Consent Mode v2 Default wird in layout.tsx gesetzt (vor diesem Script) */}
      <Script
        id="gtag-script"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
      />
      <Script
        id="gtag-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ADS_ID}', {
              'allow_enhanced_conversions': true
            });
          `,
        }}
      />

      {/* 3. GTM Script */}
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

/**
 * Consent auf "granted" aktualisieren — wird aufgerufen wenn der Nutzer
 * Cookies akzeptiert. Erlaubt Google Ads Conversion-Tracking und Analytics.
 */
function updateConsentToGranted() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    // gtag noch nicht geladen — warte kurz
    setTimeout(() => updateConsentToGranted(), 500)
    return
  }

  window.gtag('consent', 'update', {
    'ad_storage': 'granted',
    'ad_user_data': 'granted',
    'ad_personalization': 'granted',
    'analytics_storage': 'granted',
  })
  console.log('[GTM] Consent aktualisiert → granted (Nutzer hat Cookies akzeptiert)')
}
