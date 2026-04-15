'use client'

import { useEffect } from 'react'

/**
 * ServiceWorkerRegister — PWA Service Worker (nur Web)
 *
 * In Capacitor (iOS/Android) sind Service Worker NICHT unterstützt
 * → würde nur Fehler im Log produzieren ohne Funktion.
 * Daher: nur registrieren wenn NICHT in Capacitor.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // In Capacitor (iOS/Android) → KEIN Service Worker
    const isNative =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.()

    if (isNative) return

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err)
      })
    }
  }, [])

  return null
}
