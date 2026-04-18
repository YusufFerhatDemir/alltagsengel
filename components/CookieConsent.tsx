'use client'
import { useState, useEffect } from 'react'

declare global {
  interface Window {
    gtag: (...args: any[]) => void
  }
}

const CONSENT_KEY = 'ae_cookie_consent'

type ConsentStatus = 'accepted' | 'rejected' | null

export function getCookieConsent(): ConsentStatus {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CONSENT_KEY) as ConsentStatus
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      // Small delay so it doesn't flash on load
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted')
    setVisible(false)
    // Google Consent Mode v2: Consent sofort auf granted aktualisieren
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'ad_storage': 'granted',
        'ad_user_data': 'granted',
        'ad_personalization': 'granted',
        'analytics_storage': 'granted',
      })
    }
  }

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'rejected')
    setVisible(false)
    // Consent bleibt auf denied (Default aus GoogleTagManager.tsx)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 99999,
      background: 'linear-gradient(135deg, #1E1B17 0%, #252119 100%)',
      borderTop: '1px solid rgba(201,150,60,0.3)',
      padding: '16px 20px',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
      animation: 'slideUp 0.4s ease-out',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          {/* Cookie Icon */}
          <div style={{ fontSize: 28, flexShrink: 0, marginTop: 2 }}>🍪</div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              color: '#F7F2EA',
              fontFamily: "'Jost', sans-serif",
            }}>
              Wir verwenden Cookies, um Ihnen die bestmögliche Erfahrung auf unserer Website zu bieten und unsere Dienste zu verbessern.{' '}
              <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C9963C',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 14,
                  textDecoration: 'underline',
                  fontFamily: "'Jost', sans-serif",
                }}
              >
                {showDetails ? 'Weniger anzeigen' : 'Mehr erfahren'}
              </button>
            </p>

            {showDetails && (
              <div style={{
                marginTop: 10,
                padding: 12,
                background: 'rgba(201,150,60,0.06)',
                borderRadius: 8,
                border: '1px solid rgba(201,150,60,0.12)',
                fontSize: 13,
                lineHeight: 1.6,
                color: 'rgba(247,242,234,0.75)',
              }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: '#C9963C' }}>Notwendige Cookies:</strong> Diese sind für den Betrieb der Website erforderlich (z.B. Anmeldung, Sicherheit, Warenkorb). Werden auch ohne Zustimmung gesetzt.
                </p>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: '#C9963C' }}>Analyse & Besuchertracking:</strong> Erfasst Ihre IP-Adresse, ungefähren Standort (Stadt, Region, Land) und Browser-Informationen. Eingesetzte Dienste: <em>Supabase</em> (Datenspeicherung, EU), <em>ipapi.co</em> (Standortbestimmung) und <em>Google Analytics/Ads</em>.
                </p>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: '#C9963C' }}>Marketing:</strong> Meta (Facebook/Instagram) und TikTok Pixel zur Messung von Kampagnen-Erfolg und Retargeting.
                </p>
                <p style={{ margin: 0 }}>
                  Sie können Ihre Zustimmung jederzeit über den Link „Cookie-Einstellungen" im Footer widerrufen. Details in unserer{' '}
                  <a href="/datenschutz" style={{ color: '#C9963C', textDecoration: 'underline' }}>Datenschutzerklärung</a>.
                </p>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{
            display: 'flex',
            gap: 8,
            flexShrink: 0,
            alignSelf: 'center',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handleReject}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid rgba(201,150,60,0.3)',
                background: 'transparent',
                color: 'rgba(247,242,234,0.7)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: "'Jost', sans-serif",
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'rgba(201,150,60,0.5)'
                e.currentTarget.style.color = '#F7F2EA'
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'rgba(201,150,60,0.3)'
                e.currentTarget.style.color = 'rgba(247,242,234,0.7)'
              }}
            >
              Nur Notwendige
            </button>
            <button
              onClick={handleAccept}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #C9963C 0%, #B8862F 100%)',
                color: '#1A1612',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Jost', sans-serif",
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(201,150,60,0.3)',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #D4A54A 0%, #C9963C 100%)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #C9963C 0%, #B8862F 100%)'
              }}
            >
              Alle akzeptieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
