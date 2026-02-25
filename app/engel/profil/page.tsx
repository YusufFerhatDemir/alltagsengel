'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function MeinProfilPage() {
  const [settings, setSettings] = useState({
    sofort: true,
    push: true,
    kasse: false,
  })

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div className="screen" id="mprofil">
      <div className="mp-header">
        <div className="mp-nav">
          <Link href="/engel/home" className="mp-back">‹</Link>
          <div className="mp-title">Mein Profil</div>
        </div>
        <div className="mp-main">
          <div className="mp-avatar">👼</div>
          <div>
            <div className="mp-name">Anna Müller</div>
            <div className="mp-sub">Zertifizierte Alltagsbegleiterin</div>
            <div className="mp-chips">
              <span className="mp-chip light">Berlin</span>
              <span className="mp-chip gold">§45b</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mp-body">
        <div className="earn-card">
          <div className="earn-top">
            <div>
              <div className="earn-label">Gesamtverdienst</div>
              <div className="earn-val">4.680€</div>
              <div className="earn-change">+12% gegenüber letztem Monat</div>
            </div>
            <div className="earn-btn">Auszahlen</div>
          </div>
        </div>

        <div className="section-label">Einstellungen</div>
        <div className="settings-card">
          <div className="setting-row">
            <div><div className="setting-main">Sofort-Buchung</div><div className="setting-sub">Aufträge automatisch annehmen</div></div>
            <div className={`toggle${settings.sofort ? ' on' : ''}`} onClick={() => toggle('sofort')}></div>
          </div>
          <div className="setting-row">
            <div><div className="setting-main">Push-Benachrichtigungen</div><div className="setting-sub">Neue Anfragen sofort erhalten</div></div>
            <div className={`toggle${settings.push ? ' on' : ''}`} onClick={() => toggle('push')}></div>
          </div>
          <div className="setting-row">
            <div><div className="setting-main">§45b Aufträge</div><div className="setting-sub">Nur Kassenaufträge anzeigen</div></div>
            <div className={`toggle${settings.kasse ? ' on' : ''}`} onClick={() => toggle('kasse')}></div>
          </div>
        </div>

        <div className="section-label">Dokumente & Zertifikate</div>
        <div className="docs-card">
          <div className="setting-row"><div><div className="setting-main">📄 §45b Zertifikat</div><div className="setting-sub" style={{ color: 'var(--green)' }}>✓ Verifiziert</div></div></div>
          <div className="setting-row"><div><div className="setting-main">📄 Erste-Hilfe-Nachweis</div><div className="setting-sub" style={{ color: 'var(--green)' }}>✓ Verifiziert</div></div></div>
          <div className="setting-row"><div><div className="setting-main">📄 Polizeiliches Führungszeugnis</div><div className="setting-sub" style={{ color: 'var(--gold)' }}>⏳ Wird geprüft</div></div></div>
          <div className="setting-row"><div><div className="setting-main">📄 Versicherungsnachweis</div><div className="setting-sub" style={{ color: 'var(--green)' }}>✓ Automatisch</div></div></div>
        </div>

        <div style={{ height: 80 }}></div>
      </div>
    </div>
  )
}
