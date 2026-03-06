import Link from 'next/link'

export default function AlltagsbegleitungPage() {
  return (
    <div className="screen info-screen">
      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Alltagsbegleitung</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Alltagsbegleitung nach § 45a SGB XI</h2>
          <p className="info-hero-sub">Zertifizierte Begleiter für Ihren Alltag — versichert und über den Entlastungsbetrag abrechenbar</p>
        </div>

        <section className="info-card">
          <h3>Was ist Alltagsbegleitung?</h3>
          <p>
            Alltagsbegleitung umfasst Unterstützung bei alltäglichen Aufgaben für pflegebedürftige Menschen
            und deren Angehörige. Unsere zertifizierten Alltagsbegleiter (Engel) helfen im Haushalt, bei
            Besorgungen, bei Arztbesuchen und leisten Gesellschaft.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen</h3>
          <ul className="info-list">
            <li>Haushaltsnahe Hilfen (Einkaufen, Kochen, Putzen)</li>
            <li>Begleitung zu Arztterminen und Behörden</li>
            <li>Spaziergänge und Freizeitgestaltung</li>
            <li>Psychosoziale Betreuung und Gespräche</li>
            <li>Antragshilfen bei Pflegekasse und Behörden</li>
            <li>Unterstützung bei der Tagesstrukturierung</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Preise</h3>
          <div className="info-price-row">
            <span className="info-price-label">Stundensatz</span>
            <span className="info-price-val">ab 32,00 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b)</span>
            <span className="info-price-val">125 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Versicherungsschutz</span>
            <span className="info-price-val">inklusive</span>
          </div>
          <p className="info-price-note">
            Mit dem Entlastungsbetrag (§ 45b SGB XI) stehen Ihnen 125 € monatlich zu, die direkt
            mit der Pflegekasse abgerechnet werden. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch?</h3>
          <p>
            Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag
            von 125 € monatlich. Damit können Sie Alltagsbegleitung über Alltagsengel buchen —
            ohne eigene Zuzahlung.
          </p>
        </section>

        <section className="info-card">
          <h3>So funktioniert&apos;s</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich kostenlos bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wählen Sie einen Engel in Ihrer Nähe aus</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Buchen Sie Termine — Abrechnung über § 45b</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Für Alltagsbegleiter (Engel)</h3>
          <p>
            Sie möchten als Alltagsbegleiter tätig werden? Bei Alltagsengel arbeiten Sie selbstständig,
            erhalten bundesweit Aufträge und sind über unsere Plattform versichert.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link href="/auth/register?role=engel">
              <button className="btn-ghost" style={{ width: '100%' }}>ALS ENGEL REGISTRIEREN</button>
            </Link>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose">
            <button className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL FINDEN</button>
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
