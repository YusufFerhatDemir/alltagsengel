'use client'
import { useState, useEffect } from 'react'

// ═══════════════════════════════════════════════════════════
// WHATSAPP FLOATING CHAT BUTTON
// ═══════════════════════════════════════════════════════════
// Zeigt einen schwebenden WhatsApp-Button auf allen Seiten.
// Öffnet WhatsApp mit vorgefüllter Nachricht.
// Wird NICHT in der nativen App (Capacitor) angezeigt.
// ═══════════════════════════════════════════════════════════

const WHATSAPP_NUMBER = '491783382825' // AlltagsEngel Nummer
const DEFAULT_MESSAGE = 'Hallo! Ich interessiere mich für AlltagsEngel und hätte gerne mehr Informationen.'

export default function WhatsAppButton() {
  const [visible, setVisible] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    // Auch in Capacitor (native App) anzeigen — WhatsApp-Kontakt soll immer verfügbar sein
    // Nach 3 Sekunden einblenden (nicht sofort)
    const timer = setTimeout(() => setVisible(true), 3000)

    // Tooltip nach 8 Sekunden zeigen
    const tooltipTimer = setTimeout(() => {
      setShowTooltip(true)
      // Tooltip nach 5 Sekunden wieder ausblenden
      setTimeout(() => setShowTooltip(false), 5000)
    }, 8000)

    // Modal-Event-Listener: Ausblenden wenn ein Modal (Onboarding, Buchung, etc.) offen ist
    const handleModalChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setModalOpen(Boolean(detail?.open))
    }
    window.addEventListener('app:modal-change', handleModalChange)

    return () => {
      clearTimeout(timer)
      clearTimeout(tooltipTimer)
      window.removeEventListener('app:modal-change', handleModalChange)
    }
  }, [])

  if (!visible || modalOpen) return null

  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`

  return (
    <>
      {/* Tooltip */}
      {showTooltip && (
        <div style={{
          position: 'fixed',
          bottom: 90,
          right: 20,
          zIndex: 9998,
          background: '#fff',
          color: '#1A1612',
          padding: '10px 16px',
          borderRadius: '12px 12px 4px 12px',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          maxWidth: 220,
          animation: 'fadeInUp 0.3s ease-out',
        }}>
          Fragen? Schreiben Sie uns auf WhatsApp!
        </div>
      )}

      {/* WhatsApp Button */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp Chat"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 20,
          zIndex: 9998,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#25D366',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(37, 211, 102, 0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          animation: 'fadeInUp 0.4s ease-out',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 24px rgba(37, 211, 102, 0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(37, 211, 102, 0.4)'
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
      </a>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </>
  )
}
