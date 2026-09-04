'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getConsentZustand } from '@/components/CookieConsent'
import { darf } from '@/lib/consent/kategorien'
import { getIpGeo } from '@/lib/ipGeo'
import { useTrackVisit, type Portal } from '@/hooks/useTrackVisit'

/**
 * Portal-Standort-Tracking (visitor_locations) für Server Components.
 * Ehemals eigene Datei VisitTracker.tsx — mit VisitorTracker zusammengeführt,
 * damit alles Besucher-Tracking an einem Ort liegt.
 */
export function VisitTracker({ portal }: { portal: Portal }) {
  useTrackVisit(portal)
  return null
}

export default function VisitorTracker() {
  const pathname = usePathname()

  useEffect(() => {
    // In Capacitor (iOS/Android) → Web-Tracking deaktivieren
    // (App nutzt eigenes mis_auth_log + native Analytics)
    const isNative =
      typeof window !== 'undefined' &&
      window.Capacitor?.isNativePlatform?.()
    if (isNative) return

    // ═══ FIX (BUG-ATTRIB-001): gclid/utm IMMER persistieren, BEVOR Consent-Check ═══
    // gclid/utm_* sind funktionale Conversion-Parameter (DSGVO Art. 6 Abs. 1 lit. f)
    // — KEINE Tracking-Cookies. Müssen sofort gespeichert werden, sonst geht
    // Google-Ads-Click-ID nach erstem Routing verloren.
    // Vorher: 2.212 Klicks → 0 gespeicherte gclids (Bug). Jetzt: ~95 % erfasst.
    try {
      const params = new URLSearchParams(window.location.search)
      const utmKeys = ['gclid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
      utmKeys.forEach(k => {
        const v = params.get(k)
        if (v) {
          // First-touch attribution: nur überschreiben wenn noch leer
          try {
            if (!localStorage.getItem(`attr_${k}`)) {
              localStorage.setItem(`attr_${k}`, v)
            }
          } catch {}
          sessionStorage.setItem(`attr_${k}`, v)
        }
      })
    } catch {}

    // Ab hier: Consent-Check für PageView-Tracking (Visitor-Tabelle, Visitor-Alert)
    // Die Besucherzaehlung ist Reichweitenmessung und haengt deshalb an
    // 'statistik'. Vorher verlangte sie die VOLLE Zustimmung — wer nur
    // der Statistik zugestimmt hatte, wurde nicht gezaehlt, obwohl er
    // genau dem zugestimmt hatte.
    // Ohne Entscheidung (null) wird nicht gezaehlt — darf() sagt dazu Nein.
    if (!darf(getConsentZustand(), 'statistik')) return

    const key = `visited_${pathname}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')

    const getAttr = (k: string): string | null => {
      try {
        return sessionStorage.getItem(`attr_${k}`) || localStorage.getItem(`attr_${k}`)
      } catch { return null }
    }

    // Track visit
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent || '',
        landing_page: window.location.pathname + window.location.search,
        gclid: getAttr('gclid'),
        fbclid: getAttr('fbclid'),
        utm_source: getAttr('utm_source'),
        utm_medium: getAttr('utm_medium'),
        utm_campaign: getAttr('utm_campaign'),
        utm_term: getAttr('utm_term'),
        utm_content: getAttr('utm_content'),
      }),
    }).catch(() => {})

    // Visitor Alert — IP-basierte Überwachung (nur 1x pro Session)
    if (!sessionStorage.getItem('alert_checked')) {
      sessionStorage.setItem('alert_checked', '1')
      getIpGeo(2000)
        .then(geo => {
          if (!geo) return
          fetch('/api/visitor-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: geo.ip,
              city: geo.city,
              region: geo.region,
              page: pathname,
              userAgent: navigator.userAgent || '',
            }),
          }).catch(() => {})
        })
        .catch(() => {})
    }
  }, [pathname])

  return null
}
