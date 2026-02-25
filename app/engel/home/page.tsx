'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon3D from '@/components/Icon3D'

export default function EngelHomePage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)

  return (
    <div className="screen" id="ehome">
      <div className="ed-header">
        <div className="ed-toprow">
          <div className="ed-logo">
            <Icon3D size={28} />
            <div className="ed-wordmark">ENGEL</div>
          </div>
          <div className="online-toggle" onClick={() => setIsOnline(!isOnline)}>
            <div className={`online-indicator${isOnline ? '' : ' off'}`}></div>
            <div className="online-label">{isOnline ? 'Online' : 'Offline'}</div>
          </div>
        </div>
        <div className="ed-greet">Willkommen zurück</div>
        <div className="ed-name">Anna Müller</div>
        <div className="ed-stats">
          <div className="ed-stat"><div className="stat-val">1.240€</div><div className="stat-lbl">Diesen Monat</div></div>
          <div className="ed-stat"><div className="stat-val">127</div><div className="stat-lbl">Einsätze</div></div>
          <div className="ed-stat"><div className="stat-val">4.9</div><div className="stat-lbl">Bewertung</div></div>
        </div>
      </div>

      <div className="ed-body">
        <div className="section-label">Neue Anfragen</div>
        <div className="req-card new">
          <div className="req-badge">NEU</div>
          <div className="req-top">
            <div className="req-av">👤</div>
            <div>
              <div className="req-name">Maria Schmidt</div>
              <div className="req-type">Alltagsbegleitung</div>
            </div>
          </div>
          <div className="req-grid">
            <div className="req-info"><div className="req-info-lbl">Datum</div><div className="req-info-val">01.03.2026</div></div>
            <div className="req-info"><div className="req-info-lbl">Uhrzeit</div><div className="req-info-val">10:00</div></div>
            <div className="req-info"><div className="req-info-lbl">Dauer</div><div className="req-info-val">2 Std.</div></div>
            <div className="req-info"><div className="req-info-lbl">Vergütung</div><div className="req-info-val">64,00€</div></div>
          </div>
          <div className="req-note">💳 <strong>§45b-Buchung</strong> — Abrechnung direkt über Pflegekasse (AOK). Versicherungsschutz automatisch aktiv.</div>
          <div className="req-btns">
            <div className="req-btn decline">Ablehnen</div>
            <div className="req-btn accept" onClick={() => router.push('/engel/bestaetigt/demo')}>Annehmen</div>
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 22 }}>Kommende Einsätze</div>
        <div className="upcoming-list">
          <div className="upcoming-item">
            <div className="upcoming-av" style={{ background: 'var(--gold-pale)' }}>👤</div>
            <div><div className="upcoming-name">Helga Kowalski</div><div className="upcoming-sub">Arztbesuch · Morgen, 14:00</div></div>
            <div className="upcoming-end"><div className="upcoming-price">48,00€</div><div className="upcoming-status" style={{ color: 'var(--green)' }}>Bestätigt</div></div>
          </div>
          <div className="upcoming-item">
            <div className="upcoming-av" style={{ background: 'var(--green-pale)' }}>👤</div>
            <div><div className="upcoming-name">Werner Braun</div><div className="upcoming-sub">Einkauf · Fr, 09:30</div></div>
            <div className="upcoming-end"><div className="upcoming-price">32,00€</div><div className="upcoming-status" style={{ color: 'var(--gold)' }}>Ausstehend</div></div>
          </div>
          <div className="upcoming-item">
            <div className="upcoming-av" style={{ background: 'var(--cream2)' }}>👤</div>
            <div><div className="upcoming-name">Ingrid Hoffman</div><div className="upcoming-sub">Begleitung · Sa, 11:00</div></div>
            <div className="upcoming-end"><div className="upcoming-price">64,00€</div><div className="upcoming-status" style={{ color: 'var(--green)' }}>Bestätigt</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
