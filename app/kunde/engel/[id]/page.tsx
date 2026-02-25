import Link from 'next/link'

export default async function EngelProfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <div className="screen" id="eprofil">
      <div className="ep-header">
        <div className="ep-nav">
          <Link href="/kunde/home" className="ep-back">‹</Link>
          <div className="ep-actions">
            <div className="ep-action">♡</div>
            <div className="ep-action">…</div>
          </div>
        </div>
        <div className="ep-main">
          <div className="ep-avatar" style={{ background: 'rgba(201,150,60,.12)' }}>👼</div>
          <div>
            <div className="ep-name">Anna Müller</div>
            <div className="ep-role">Zertifizierte Alltagsbegleiterin</div>
            <div className="ep-stars">
              <span className="ep-stars-icons">★★★★★</span>
              <span className="ep-stars-count">4.9 · 127 Bewertungen</span>
            </div>
            <div className="ep-badges">
              <span className="ep-badge light">3 km entfernt</span>
              <span className="ep-badge gold">§45b</span>
            </div>
          </div>
        </div>
      </div>

      <div className="ep-body">
        <div className="stat-row">
          <div className="stat-box"><div className="stat-val">127</div><div className="stat-lbl">Einsätze</div></div>
          <div className="stat-box"><div className="stat-val">4.9</div><div className="stat-lbl">Bewertung</div></div>
          <div className="stat-box"><div className="stat-val">98%</div><div className="stat-lbl">Zufrieden</div></div>
        </div>

        <div className="prof-section">
          <div className="prof-section-hdr">Über mich</div>
          <div className="prof-desc">Seit 5 Jahren begleite ich ältere Menschen mit Herz und Leidenschaft. Ob Arztbesuche, Einkaufen oder einfach ein Spaziergang im Park — ich bin für Sie da. Zertifiziert nach §45b SGB XI.</div>
        </div>

        <div className="prof-section">
          <div className="prof-section-hdr">Leistungen</div>
          <div className="skill-list">
            <span className="skill-tag gold">§45b-fähig</span>
            <span className="skill-tag">Begleitung</span>
            <span className="skill-tag">Einkauf</span>
            <span className="skill-tag">Arztbesuche</span>
            <span className="skill-tag">Haushaltshilfe</span>
            <span className="skill-tag">Freizeitgestaltung</span>
            <span className="skill-tag">Gedächtnistraining</span>
          </div>
        </div>

        <div className="prof-section">
          <div className="prof-section-hdr">Verfügbarkeit</div>
          <div className="avail-row">
            {['Mo','Di','Mi','Do','Fr','Sa','So'].map((day, i) => (
              <div key={day} className={`avail-day${[0,1,2,4].includes(i) ? ' on' : ''}`}>
                <div className="day-name">{day}</div>
                <div className="day-dot"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="prof-section">
          <div className="prof-section-hdr">Bewertungen</div>
          <div className="review-list">
            <div className="review-item">
              <div className="review-top">
                <div className="review-av">👤</div>
                <div><div className="review-name">Helga K.</div><div className="review-stars">★★★★★</div></div>
              </div>
              <div className="review-text">Anna ist wunderbar! Sie hat meine Mutter zum Arzt begleitet und war so geduldig und fürsorglich. Absolut empfehlenswert.</div>
            </div>
            <div className="review-item">
              <div className="review-top">
                <div className="review-av">👤</div>
                <div><div className="review-name">Werner S.</div><div className="review-stars">★★★★★</div></div>
              </div>
              <div className="review-text">Zuverlässig und freundlich. Die Abrechnung über §45b lief reibungslos. Sehr zu empfehlen!</div>
            </div>
          </div>
        </div>

        <div style={{ height: 80 }}></div>
      </div>

      <div className="booking-bar">
        <div className="booking-price">
          <div className="price-val">32€<span style={{ fontSize: 14, fontWeight: 400, color: 'var(--ink4)' }}>/Std.</span></div>
          <div className="price-sub">§45b-fähig</div>
        </div>
        <Link href={`/kunde/buchen/${id}`}><button className="btn-book">JETZT BUCHEN</button></Link>
      </div>
    </div>
  )
}
