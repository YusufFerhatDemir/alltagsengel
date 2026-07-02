'use client'
import { openCookieSettings } from '@/components/CookieConsent'

/**
 * „Cookie-Einstellungen"-Link für Footer & Datenschutzerklärung.
 * Öffnet den Consent-Banner erneut, damit die Zustimmung jederzeit
 * widerrufen werden kann (DSGVO Art. 7 Abs. 3).
 */
export default function CookieSettingsLink({ style }: { style?: React.CSSProperties }) {
  return (
    <button
      onClick={openCookieSettings}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        textDecoration: 'inherit',
        cursor: 'pointer',
        ...style,
      }}
    >
      Cookie-Einstellungen
    </button>
  )
}
