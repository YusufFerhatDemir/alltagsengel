import Link from 'next/link'

export default async function EngelBestaetigtPage({ params }: { params: Promise<{ id: string }> }) {
  await params

  return (
    <div className="screen" id="ebestaetigt">
      <div className="confirm-header">
        <div className="confirm-check gold">✓</div>
        <div className="confirm-title">Auftrag angenommen!</div>
        <div className="confirm-sub">Sie haben den Einsatz bei Maria Schmidt bestätigt</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ background: 'var(--cream2)' }}>👤</div>
          <div>
            <div className="person-name">Maria Schmidt</div>
            <div className="person-sub">✓ Verifiziert · Stammkundin</div>
          </div>
          <div className="person-chat">💬</div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon">🛡️</div>
            <div>
              <div className="ins-title">Ihr Schutz ist aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Berufshaftpflicht</strong> — Voller Schutz während des Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Unfallversicherung</strong> — Hin- und Rückweg inklusive</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Rechtsschutz</strong> — Im Einsatzfall abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-E-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Einsatzdetails</div>
          <div className="detail-row"><div className="detail-ic">📅</div><div><div className="detail-lbl">Datum</div><div className="detail-val">01. März 2026</div></div></div>
          <div className="detail-row"><div className="detail-ic">🕐</div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">10:00 – 12:00 Uhr</div></div></div>
          <div className="detail-row"><div className="detail-ic">🏠</div><div><div className="detail-lbl">Leistung</div><div className="detail-val">Alltagsbegleitung</div></div></div>
          <div className="detail-row"><div className="detail-ic">💰</div><div><div className="detail-lbl">Vergütung</div><div className="detail-val">64,00€</div></div></div>
          <div className="detail-row"><div className="detail-ic">💳</div><div><div className="detail-lbl">Abrechnung</div><div className="detail-val">§45b · AOK</div></div></div>
        </div>

        <div className="action-grid">
          <button className="action-btn">💬 Chat</button>
          <button className="action-btn">📍 Navigation</button>
          <button className="action-btn">📅 Kalender</button>
          <Link href="/engel/home"><button className="action-btn primary">🏠 Dashboard</button></Link>
        </div>
      </div>
    </div>
  )
}
