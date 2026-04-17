'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IconInfo } from '@/components/Icons'

/**
 * Engel-Info-Banner
 *
 * Kurzerklärung direkt im Engel-Bereich: was wir machen, wie der Ablauf ist,
 * wie Datenschutz gehandhabt wird und wo die ausführliche Info zu finden ist.
 *
 * Verhalten:
 * - Beim ersten Aufruf sichtbar (expanded).
 * - Nach Klick auf "Verstanden" dismissed → localStorage merkt sich das.
 * - Ausgeblendet auf Register-Seite (dort ohnehin eigene Info).
 * - Link auf /engel/info bleibt als dauerhafter Einstieg erhalten.
 */
export default function EngelInfoBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // localStorage ist client-only → erst nach Hydration prüfen,
  // sonst gibt's Hydration-Mismatch
  useEffect(() => {
    setHydrated(true)
    try {
      const dismissed = localStorage.getItem('engel-info-banner-dismissed')
      if (dismissed !== '1') setVisible(true)
    } catch {
      // Private-Mode / Storage gesperrt → einfach anzeigen
      setVisible(true)
    }
  }, [])

  // Auf Register-Seite nicht anzeigen (eigene Onboarding-Info)
  // und auf der Info-Seite selbst (redundant)
  const hideOnPaths = ['/engel/register', '/engel/info']
  if (hideOnPaths.includes(pathname)) return null
  if (!hydrated || !visible) return null

  function dismiss() {
    try {
      localStorage.setItem('engel-info-banner-dismissed', '1')
    } catch {
      // ignorieren
    }
    setVisible(false)
  }

  return (
    <div
      className="engel-info-banner"
      role="region"
      aria-label="Hinweis zum Ablauf und Datenschutz"
    >
      <div className="engel-info-banner-head">
        <div className="engel-info-banner-icon" aria-hidden="true">
          <IconInfo size={18} />
        </div>
        <div className="engel-info-banner-title">
          So läuft&#39;s bei AlltagsEngel
        </div>
      </div>

      <ul className="engel-info-banner-steps">
        <li>
          <span className="step-num">1</span>
          <div>
            <strong>Dokumente hochladen</strong> — Ausweis, Führungszeugnis,
            Qualifizierung. Wir prüfen und verifizieren.
          </div>
        </li>
        <li>
          <span className="step-num">2</span>
          <div>
            <strong>Online gehen</strong> — Kund:innen in deiner Nähe sehen
            dich, senden Anfragen. Du entscheidest, was du annimmst.
          </div>
        </li>
        <li>
          <span className="step-num">3</span>
          <div>
            <strong>Einsatz &amp; Abrechnung</strong> — Nach dem Termin
            rechnen wir §45b direkt mit der Pflegekasse ab, du bekommst deine
            Vergütung aufs Konto.
          </div>
        </li>
      </ul>

      <div className="engel-info-banner-meta">
        <span>
          🔒 <strong>Datenschutz:</strong> Deine Daten werden DSGVO-konform
          verarbeitet und nur für die Vermittlung genutzt.
        </span>
      </div>

      <div className="engel-info-banner-actions">
        <Link href="/engel/info" className="engel-info-banner-link">
          Details &amp; Versicherung →
        </Link>
        <button
          type="button"
          className="engel-info-banner-dismiss"
          onClick={dismiss}
          aria-label="Hinweis ausblenden"
        >
          Verstanden
        </button>
      </div>
    </div>
  )
}
