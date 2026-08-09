'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

// ═══ LAZY-LOADED CLIENT COMPONENTS ═══
// Next.js 16: dynamic() mit { ssr: false } ist nur in Client Components erlaubt.
// Daher werden alle nicht-kritischen UI- und Tracking-Komponenten hier gebündelt.
const VisitorTracker = dynamic(() => import('@/components/VisitorTracker'), { ssr: false })
const CookieConsent = dynamic(() => import('@/components/CookieConsent'), { ssr: false })
const ServiceWorkerRegister = dynamic(() => import('@/components/ServiceWorkerRegister'), { ssr: false })
const PushProvider = dynamic(() => import('@/components/PushProvider'), { ssr: false })
const NativePushProvider = dynamic(() => import('@/components/NativePushProvider'), { ssr: false })
const WebVitalsReporter = dynamic(() => import('@/components/WebVitalsReporter'), { ssr: false })
const MetaPixel = dynamic(() => import('@/components/MetaPixel'), { ssr: false })
const TikTokPixel = dynamic(() => import('@/components/TikTokPixel'), { ssr: false })
const SessionKeepAlive = dynamic(() => import('@/components/SessionKeepAlive'), { ssr: false })
const SplashController = dynamic(() => import('@/components/SplashController'), { ssr: false })
const CapacitorLinkInterceptor = dynamic(() => import('@/components/CapacitorLinkInterceptor'), { ssr: false })
const WhatsAppButton = dynamic(() => import('@/components/WhatsAppButton'), { ssr: false })
const CallbackWidget = dynamic(() => import('@/components/CallbackWidget'), { ssr: false })
const BeratungsChat = dynamic(() => import('@/components/BeratungsChat'), { ssr: false })
const InstallPrompt = dynamic(() => import('@/components/InstallPrompt'), { ssr: false })

export default function ClientSideProviders() {
  const pathname = usePathname()

  // DiPA "Digitaler PflegeCoach": tracker- und werbefrei (DiPAV Anlage 2).
  // Es bleiben nur funktionale Provider (Session, ServiceWorker, Push für
  // Erinnerungen, Capacitor-Links) — KEINE Pixel, KEIN Marketing-Widget,
  // kein Cookie-Banner (es werden dort keine Tracking-Cookies gesetzt).
  if (pathname.startsWith('/pflegecoach')) {
    return (
      <>
        <SessionKeepAlive />
        <CapacitorLinkInterceptor />
        <ServiceWorkerRegister />
        <PushProvider />
        <NativePushProvider />
      </>
    )
  }

  return (
    <>
      <WebVitalsReporter />
      <MetaPixel />
      <TikTokPixel />
      <VisitorTracker />
      <SessionKeepAlive />
      <SplashController />
      <CapacitorLinkInterceptor />
      <WhatsAppButton />
      <CallbackWidget />
      <BeratungsChat />
      <InstallPrompt />
      <CookieConsent />
      <ServiceWorkerRegister />
      <PushProvider />
      <NativePushProvider />
    </>
  )
}
