'use client'

import { useEffect } from 'react'

function isNativeAppContext(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    window.Capacitor?.isNativePlatform?.() ||
    window.Capacitor ||
    navigator.userAgent.includes('Capacitor') ||
    window.webkit?.messageHandlers?.bridge
  )
}

interface VitalMetric {
  name: string
  value: number
  id: string
  rating?: 'good' | 'needs-improvement' | 'poor'
  delta?: number
}

function sendBeacon(metric: VitalMetric) {
  if (typeof window === 'undefined') return
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    rating: metric.rating ?? null,
    delta: metric.delta ?? null,
    path: window.location.pathname,
    ts: Date.now(),
  })
  try {
    const url = '/api/analytics/vitals'
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(url, blob)
    } else {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // niemals den User-Flow stören
  }
}

export default function WebVitalsReporter() {
  useEffect(() => {
    if (isNativeAppContext()) return
    let cancelled = false

    ;(async () => {
      try {
        const { onCLS, onINP, onLCP, onFCP, onTTFB } = await import('web-vitals')
        if (cancelled) return
        onCLS(sendBeacon)
        onINP(sendBeacon)
        onLCP(sendBeacon)
        onFCP(sendBeacon)
        onTTFB(sendBeacon)
      } catch {
        // Paket noch nicht installiert oder Modul-Fehler → still ignorieren
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
