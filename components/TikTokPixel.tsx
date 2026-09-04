'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'
import { getConsentZustand } from './CookieConsent'
import { darf, type ConsentZustand } from '@/lib/consent/kategorien'

// ═══════════════════════════════════════════════════════════
// TIKTOK PIXEL — DSGVO-konform
// ═══════════════════════════════════════════════════════════
// Wird NUR geladen wenn:
// 1. Cookie-Consent erteilt wurde
// 2. Kein Capacitor (native App) erkannt wird
// 3. NEXT_PUBLIC_TIKTOK_PIXEL_ID gesetzt ist
// ═══════════════════════════════════════════════════════════

const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || ''

export default function TikTokPixel() {
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    if (!TIKTOK_PIXEL_ID) return

    // Nicht in Capacitor laden
    const isCapacitor = !!(
      window.Capacitor ||
      navigator.userAgent.includes('Capacitor') ||
      window.webkit?.messageHandlers?.bridge
    )
    if (isCapacitor) return

    // Cookie-Consent prüfen — bewusster Initial-Check beim Mount.
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

  if (!shouldLoad || !TIKTOK_PIXEL_ID) return null

  return (
    <Script
      id="tiktok-pixel"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          !function (w, d, t) {
            w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
            ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
            ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
            for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
            ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
            ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
            ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;
            ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");
            o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
            var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
            ttq.load('${TIKTOK_PIXEL_ID}');
            ttq.page();
          }(window, document, 'ttq');
        `,
      }}
    />
  )
}

// ═══ Helper: TikTok Events tracken ═══
export function trackTikTokEvent(event: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.ttq) {
    ;window.ttq.track(event, params)
  }
}

// Vordefinierte Events für AlltagsEngel:
// trackTikTokEvent('CompleteRegistration')    → Registrierung
// trackTikTokEvent('PlaceAnOrder')            → Buchung erstellt
// trackTikTokEvent('Contact')                 → Kontaktformular
// trackTikTokEvent('SubmitForm')              → Formular abgeschickt
// trackTikTokEvent('Search', { query })       → Engel-Suche
