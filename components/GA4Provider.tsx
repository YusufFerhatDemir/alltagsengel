'use client'

import { useEffect, useState } from 'react'
import { GoogleAnalytics } from '@next/third-parties/google'
import { getCookieConsent } from './CookieConsent'

const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || ''

function isNativeAppContext(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor ||
    navigator.userAgent.includes('Capacitor') ||
    (window as any).webkit?.messageHandlers?.bridge
  )
}

export default function GA4Provider() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (!GA4_MEASUREMENT_ID) return
    if (isNativeAppContext()) return

    const consent = getCookieConsent()
    if (consent === 'accepted') {
      setEnabled(true)
      return
    }

    const interval = setInterval(() => {
      if (getCookieConsent() === 'accepted') {
        setEnabled(true)
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  if (!enabled || !GA4_MEASUREMENT_ID) return null
  return <GoogleAnalytics gaId={GA4_MEASUREMENT_ID} />
}
