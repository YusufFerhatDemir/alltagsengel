'use client'
import { useState, useEffect, useRef } from 'react'

// ═══════════════════════════════════════════════════════════
// PWA INSTALL PROMPT + APP STORE SMART BANNER
// ═══════════════════════════════════════════════════════════
// Erkennt Plattform und zeigt passende Installation:
// - iOS Safari: "Zum Startbildschirm hinzufügen"-Anleitung
// - Android Chrome: Native beforeinstallprompt
// - Fallback: App Store / Play Store Links
// Wird nur einmal gezeigt (localStorage).
// ═══════════════════════════════════════════════════════════

const APP_STORE_URL = 'https://apps.apple.com/app/alltagsengel/id6743440789'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=care.alltagsengel.app'

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'pwa' | null>(null)
  const deferredPrompt = useRef<any>(null)

  useEffect(() => {
    // Nicht in nativer App anzeigen
    const isCapacitor = !!(
      (window as any).Capacitor ||
      navigator.userAgent.includes('Capacitor') ||
      (window as any).webkit?.messageHandlers?.bridge
    )
    if (isCapacitor) return

    // Bereits installiert als PWA?
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Schon mal geschlossen?
    const dismissed = localStorage.getItem('ae_install_dismissed')
    if (dismissed) {
      const dismissedDate = new Date(dismissed)
      const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince < 14) return // 14 Tage warten
    }

    // Plattform erkennen
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    const isAndroid = /Android/.test(ua)

    // beforeinstallprompt abfangen (Chrome/Edge/Samsung)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e
      setPlatform('pwa')
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // iOS: Nach 5 Sekunden zeigen
    if (isIOS) {
      const isStandalone = (navigator as any).standalone
      if (!isStandalone) {
        setTimeout(() => {
          setPlatform('ios')
          setShow(true)
        }, 5000)
      }
    } else if (isAndroid) {
      // Android: Falls kein beforeinstallprompt nach 6s, Play Store zeigen
      setTimeout(() => {
        if (!deferredPrompt.current) {
          setPlatform('android')
          setShow(true)
        }
      }, 6000)
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  function dismiss() {
    setShow(false)
    localStorage.setItem('ae_install_dismissed', new Date().toISOString())
  }

  async function handleInstall() {
    if (platform === 'pwa' && deferredPrompt.current) {
      deferredPrompt.current.prompt()
      const result = await deferredPrompt.current.userChoice
      if (result.outcome === 'accepted') {
        dismiss()
      }
    } else if (platform === 'ios') {
      // Anleitung anzeigen (kann nicht automatisch installieren)
    } else if (platform === 'android') {
      window.open(PLAY_STORE_URL, '_blank')
      dismiss()
    }
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9997,
      animation: 'slideUpBanner 0.4s ease-out',
    }}>
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '0 12px 12px',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #2A2420 0%, #1E1A16 100%)',
          borderRadius: 20,
          padding: '16px 20px',
          border: '1px solid rgba(201, 150, 60, 0.2)',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          {/* App Icon */}
          <img
            src="/icon-192x192.png"
            alt="AlltagsEngel"
            width={52}
            height={52}
            style={{ borderRadius: 14, flexShrink: 0 }}
          />

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
              AlltagsEngel App
            </div>
            {platform === 'ios' ? (
              <div style={{ color: '#8A8279', fontSize: 12, lineHeight: 1.4 }}>
                Tippen Sie auf <span style={{ color: '#C9963C' }}>Teilen</span> ↗ dann <span style={{ color: '#C9963C' }}>&quot;Zum Home-Bildschirm&quot;</span>
              </div>
            ) : (
              <div style={{ color: '#8A8279', fontSize: 12, lineHeight: 1.4 }}>
                Kostenlos installieren — schneller Zugriff
              </div>
            )}
          </div>

          {/* Install Button */}
          {platform !== 'ios' && (
            <button
              onClick={handleInstall}
              style={{
                background: '#C9963C',
                color: '#1A1612',
                border: 'none',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              Installieren
            </button>
          )}

          {/* Close */}
          <button
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: 20,
              cursor: 'pointer',
              padding: '4px 8px',
              flexShrink: 0,
              lineHeight: 1,
            }}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideUpBanner {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}} />
    </div>
  )
}
