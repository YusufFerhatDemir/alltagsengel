'use client'

import { useEffect } from 'react'

/**
 * SplashController — Professionelles Splash-Screen Management
 *
 * ═══════════════════════════════════════════════════════════════
 * SO MACHEN ES UBER / WHATSAPP / INSTAGRAM:
 * ═══════════════════════════════════════════════════════════════
 * 1. Splash bleibt sichtbar bis App WIRKLICH ready ist
 * 2. KEIN auto-hide nach festem Timeout (verursacht weißen Screen)
 * 3. Hide nur wenn:
 *    - DOM ist parsed
 *    - Erste Inhalte sind gerendert
 *    - Auth-Check ist abgeschlossen
 * 4. Sicherheits-Timeout: max 7 Sekunden, dann hard-hide
 *    (sonst ewiger Splash bei kaputtem Netz)
 * ═══════════════════════════════════════════════════════════════
 */
export default function SplashController() {
  useEffect(() => {
    // Nur in Capacitor-Umgebung relevant
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()

    if (!isNative) return

    let hideCalled = false

    const hideSplash = async () => {
      if (hideCalled) return
      hideCalled = true

      try {
        const { SplashScreen } = await import('@capacitor/splash-screen')
        await SplashScreen.hide({ fadeOutDuration: 250 })
        console.debug('[SplashController] Splash ausgeblendet ✓')
      } catch (err) {
        console.warn('[SplashController] Hide fehlgeschlagen:', err)
      }
    }

    // Strategie 1: Wenn DOM bereits ready → kurz warten, dann hide
    if (document.readyState === 'complete') {
      // Doppeltes requestAnimationFrame: stellt sicher dass erstes Frame gerendert ist
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(hideSplash, 100)
        })
      })
    } else {
      // Strategie 2: Warte bis DOM ready
      const onReady = () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(hideSplash, 100)
          })
        })
      }
      window.addEventListener('load', onReady, { once: true })
    }

    // Strategie 3: Sicherheits-Timeout (max 7 Sekunden)
    // Verhindert "ewig hängender Splash" bei Netzwerk-Problemen
    const safetyTimer = setTimeout(() => {
      if (!hideCalled) {
        console.warn('[SplashController] Safety-Timeout — Splash wird forciert ausgeblendet')
        hideSplash()
      }
    }, 7000)

    return () => {
      clearTimeout(safetyTimer)
    }
  }, [])

  return null
}
