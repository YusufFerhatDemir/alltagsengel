"use client"

import { useEffect } from "react"

/**
 * CapacitorLinkInterceptor
 *
 * Verhindert, dass Links in der nativen iOS/Android-App Safari/Chrome öffnen.
 * Alle same-origin Links (z.B. /admin, /app, /) bleiben in der WebView.
 * Nur explizit externe Links (mailto:, tel:, andere Domains) öffnen extern.
 *
 * Profi-Pattern wie bei WhatsApp/Instagram: Native App = ein geschlossener
 * Kontext, aus dem nur bewusst externe Inhalte nach draußen führen.
 */
export default function CapacitorLinkInterceptor() {
  useEffect(() => {
    if (typeof window === "undefined") return

    // Nur in Capacitor-App aktivieren (nicht im normalen Browser)
    const isNative =
      typeof (window as any).Capacitor !== "undefined" &&
      (window as any).Capacitor?.isNativePlatform?.()

    if (!isNative) return

    const ownHosts = new Set<string>([
      "alltagsengel.care",
      "www.alltagsengel.care",
      window.location.hostname,
    ])

    const isExternalScheme = (href: string) => {
      const lower = href.toLowerCase()
      return (
        lower.startsWith("mailto:") ||
        lower.startsWith("tel:") ||
        lower.startsWith("sms:") ||
        lower.startsWith("whatsapp:") ||
        lower.startsWith("itms-apps:") ||
        lower.startsWith("market:")
      )
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      // Nächstes <a>-Element in der DOM-Hierarchie finden
      const anchor = target.closest("a") as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return

      // Externe Schemes (mailto:, tel:, WhatsApp, App Store) normal behandeln
      if (isExternalScheme(href)) {
        return
      }

      // Anker-Links (#section) normal behandeln
      if (href.startsWith("#")) {
        return
      }

      // Same-origin Links: in-app navigieren, nicht Safari öffnen
      let url: URL
      try {
        url = new URL(href, window.location.origin)
      } catch {
        return
      }

      const isSameOrigin = ownHosts.has(url.hostname)

      if (isSameOrigin) {
        // Verhindere target="_blank" → Safari. Bleibe in der WebView.
        if (
          anchor.target === "_blank" ||
          anchor.hasAttribute("rel") === false
        ) {
          e.preventDefault()
          window.location.href = url.pathname + url.search + url.hash
        }
        return
      }

      // Echte externe Domain (z.B. google.com) → extern öffnen (Standard-Verhalten)
      // Nur diese wenigen Fälle verlassen die App – wie bei WhatsApp/Insta.
    }

    document.addEventListener("click", handleClick, true)

    // window.open() abfangen und in der App behalten, wenn same-origin
    const originalOpen = window.open.bind(window)
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      if (typeof url === "string" && !isExternalScheme(url)) {
        try {
          const parsed = new URL(url, window.location.origin)
          if (ownHosts.has(parsed.hostname)) {
            window.location.href =
              parsed.pathname + parsed.search + parsed.hash
            return null
          }
        } catch {
          // ignore
        }
      }
      return originalOpen(url as string, target, features)
    }) as typeof window.open

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.open = originalOpen
    }
  }, [])

  return null
}
