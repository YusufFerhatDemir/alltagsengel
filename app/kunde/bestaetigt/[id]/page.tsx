import Link from 'next/link'

export default async function BestaetigtPage({ params }: { params: Promise<{ id: string }> }) {
  await params

  return (
    <div className="screen" id="bbestaetigt">
      <div className="confirm-header">
        <div className="confirm-check green">✓</div>
        <div className="confirm-title">Buchung bestätigt!</div>
        <div className="confirm-sub">Anna Müller hat Ihre Anfrage angenommen</div>
      </div>

      <div className="confirm-body">
        <div className="person-row">
          <div className="person-av" style={{ background: 'var(--gold-pale)' }}>👼</div>
          <div>
            <div className="person-name">Anna Müller</div>
            <div className="person-sub">✓ Bestätigt · Unterwegs</div>
          </div>
          <div className="person-chat">💬</div>
        </div>

        <div className="insurance">
          <div className="ins-header">
            <div className="ins-icon">🛡️</div>
            <div>
              <div className="ins-title">Versicherungsschutz aktiv</div>
              <div className="ins-subtitle">Automatisch für diesen Einsatz</div>
            </div>
          </div>
          <div className="ins-features">
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Haftpflicht</strong> — Bis zu 5 Mio. € Deckung</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Unfallversicherung</strong> — Während des gesamten Einsatzes</div></div>
            <div className="ins-feat"><div className="ins-check">✓</div><div className="ins-text"><strong>Sachschäden</strong> — Bis zu 50.000€ abgesichert</div></div>
          </div>
          <div className="ins-footer">Versicherungsnr.: <strong>AE-2026-00847</strong></div>
        </div>

        <div className="detail-card">
          <div className="detail-card-h">Buchungsdetails</div>
          <div className="detail-row"><div className="detail-ic">📅</div><div><div className="detail-lbl">Datum</div><div className="detail-val">01. März 2026</div></div></div>
          <div className="detail-row"><div className="detail-ic">🕐</div><div><div className="detail-lbl">Uhrzeit</div><div className="detail-val">10:00 – 12:00 Uhr</div></div></div>
          <div className="detail-row"><div className="detail-ic">🏠</div><div><div className="detail-lbl">Leistung</div><div className="detail-val">Alltagsbegleitung</div></div></div>
          <div className="detail-row"><div className="detail-ic">💳</div><div><div className="detail-lbl">Zahlung</div><div className="detail-val">§45b · AOK</div></div></div>
          <div className="detail-row"><div className="detail-ic">💰</div><div><div className="detail-lbl">Gesamtbetrag</div><div className="detail-val">69,90€</div></div></div>
        </div>

        <div className="action-grid">
          <button className="action-btn">💬 Chat</button>
          <button className="action-btn">📞 Anrufen</button>
          <button className="action-btn">📅 Kalender</button>
          <Link href="/kunde/home"><button className="action-btn primary">🏠 Home</button></Link>
        </div>
      </div>
    </div>
  )
}
