'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getConsentZustand } from './CookieConsent'
import { darf, type ConsentZustand } from '@/lib/consent/kategorien'

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
      window.Capacitor ||
      navigator.userAgent.includes('Capacitor') ||
      window.webkit?.messageHandlers?.bridge
    )
    if (isCapacitor) return

    // Cookie-Consent prüfen
    // Marketing-Pixel haengen an der Kategorie 'marketing' — nicht mehr
    // an einer Gesamtzustimmung. Wer nur der Statistik zugestimmt hat,
    // bekommt sie nicht.
    if (darf(getConsentZustand(), 'marketing')) {
      setShouldLoad(true)
      return
    }

    // Event-basiert statt Polling
    const handleConsent = (e: Event) => {
      // Der Ereignis-Inhalt ist seit der Kategorien-Umstellung der
      // vollstaendige Zustand, nicht mehr die Zeichenkette 'accepted'.
      // Ein Vergleich auf 'accepted' waere toter Code und der Pixel
      // wuerde nach der Zustimmung nie nachgeladen.
      if (darf((e as CustomEvent).detail as ConsentZustand | null, 'marketing')) setShouldLoad(true)
    }
    window.addEventListener('ae_consent_change', handleConsent)

    return () => window.removeEventListener('ae_consent_change', handleConsent)
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
  if (typeof window !== 'undefined' && window.fbq) {
    ;window.fbq('track', event, params)
  }
}

// Vordefinierte Events für AlltagsEngel:
// trackMetaEvent('Lead')                      → Registrierung
// trackMetaEvent('CompleteRegistration')       → Registrierung abgeschlossen
// trackMetaEvent('Schedule')                   → Buchung erstellt
// trackMetaEvent('Contact')                    → Kontaktformular
// trackMetaEvent('Search', { search_string })  → Engel-Suche
