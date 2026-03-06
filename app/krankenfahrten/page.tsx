import Link from 'next/link'

export default function KrankenfahrtenPage() {
  return (
    <div className="screen info-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Krankenfahrten</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🚗</div>
          <h2 className="info-hero-title">Krankenfahrten-Vermittlung</h2>
          <p className="info-hero-sub">Sicher und zuverlässig zum Arzt — über Alltagsengel vermittelt</p>
        </div>

        <section className="info-card">
          <h3>Was sind Krankenfahrten?</h3>
          <p>
            Krankenfahrten sind Fahrten zu medizinischen Behandlungen, die von der Krankenkasse
            genehmigt oder verordnet werden. Wir vermitteln qualifizierte Fahrer, die Sie sicher
            und pünktlich zu Ihren Arztterminen bringen.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen</h3>
          <ul className="info-list">
            <li>Fahrten zu Ärzten, Kliniken und Therapien</li>
            <li>Begleitung für mobilitätseingeschränkte Personen</li>
            <li>Pünktliche Abholung und Rückfahrt</li>
            <li>Abrechnung über Verordnung möglich</li>
            <li>Bundesweite Verfügbarkeit</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Preise</h3>
          <div className="info-price-row">
            <span className="info-price-label">Grundpreis pro Fahrt</span>
            <span className="info-price-val">ab 0,35 €/km</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Wartezeit (pro 15 Min.)</span>
            <span className="info-price-val">5,00 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Begleitperson</span>
            <span className="info-price-val">kostenfrei</span>
          </div>
          <p className="info-price-note">
            Bei ärztlicher Verordnung übernimmt die Krankenkasse die Kosten ganz oder teilweise.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich als Kunde bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Buchen Sie eine Krankenfahrt mit Datum und Ziel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Ein Fahrer wird Ihnen zugeteilt und holt Sie ab</div>
            </div>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose">
            <button className="btn-gold" style={{ width: '100%' }}>JETZT FAHRT BUCHEN</button>
          </Link>
        </div>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
