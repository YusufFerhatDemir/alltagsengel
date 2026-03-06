import Link from 'next/link'
import Icon3D from '@/components/Icon3D'

export default function SplashPage() {
  return (
    <div className="screen" id="splash">
      <div className="sp-glow"></div>
      <div className="sp-inner">
        <div style={{ marginBottom: 26 }}>
          <Icon3D size={140} float />
        </div>
        <div className="sp-word">ALLTAGSENGEL</div>
        <div className="sp-tag">Mit Herz für dich da</div>
        <div className="sp-ug">Premium Alltagsbegleitung</div>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <Link href="/choose"><button className="btn-gold">JETZT STARTEN</button></Link>
          <Link href="/auth/login"><button className="btn-ghost">Ich habe bereits ein Konto</button></Link>
        </div>
      </div>
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">100%</div><div className="trust-lbl">Versichert</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">§45b</div><div className="trust-lbl">Integriert</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">24/7</div><div className="trust-lbl">Verfügbar</div></div>
        </div>
      </div>

      {/* ── Scroll-Bereich: Mission, Services, Preise, FAQ ── */}
      <div className="lp-sections">

        {/* Mission */}
        <section className="lp-section">
          <div className="lp-badge">Unsere Mission</div>
          <h2 className="lp-h2">Würdevolle Unterstützung im Alltag</h2>
          <p className="lp-text">
            Alltagsengel verbindet pflegebedürftige Menschen mit zertifizierten Alltagsbegleitern —
            versichert, nach § 45a SGB XI qualifiziert und über den Entlastungsbetrag (§ 45b)
            abrechenbar. Keine versteckten Kosten, keine Wartezeiten.
          </p>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">🛡️</div>
              <h4>Versichert</h4>
              <p>Jeder Einsatz ist haftpflichtversichert</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">✅</div>
              <h4>Zertifiziert</h4>
              <p>Alle Engel nach § 45a SGB XI qualifiziert</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">💳</div>
              <h4>§ 45b fähig</h4>
              <p>Direkte Abrechnung mit der Pflegekasse</p>
            </div>
          </div>
        </section>

        {/* Dienstleistungen */}
        <section className="lp-section">
          <div className="lp-badge">Unsere Leistungen</div>
          <h2 className="lp-h2">Alles aus einer Hand</h2>
          <div className="lp-services">
            <Link href="/alltagsbegleitung" className="lp-service-card">
              <div className="lp-svc-icon">💛</div>
              <h4>Alltagsbegleitung</h4>
              <p>Haushaltsnahe Hilfen, Begleitung, psychosoziale Betreuung</p>
              <span className="lp-svc-price">ab 32 €/Std.</span>
            </Link>
            <Link href="/krankenfahrten" className="lp-service-card">
              <div className="lp-svc-icon">🚗</div>
              <h4>Krankenfahrten</h4>
              <p>Sichere Fahrten zu Ärzten, Kliniken und Therapien</p>
              <span className="lp-svc-price">ab 0,35 €/km</span>
            </Link>
            <Link href="/hygienebox" className="lp-service-card">
              <div className="lp-svc-icon">📦</div>
              <h4>Hygienebox</h4>
              <p>Monatliche Pflegehilfsmittel — bis 40 € von der Kasse</p>
              <span className="lp-svc-price">ab 29,90 €/Mon.</span>
            </Link>
          </div>
        </section>

        {/* Preistransparenz */}
        <section className="lp-section">
          <div className="lp-badge">Preise</div>
          <h2 className="lp-h2">Transparent &amp; fair</h2>
          <p className="lp-text">
            Mit dem Entlastungsbetrag (§ 45b) stehen Ihnen 125 € monatlich zu.
            Nicht genutztes Budget verfällt am 30.06. des Folgejahres — nutzen Sie es!
          </p>
          <div className="lp-price-cards">
            <div className="lp-price-card">
              <div className="lp-pc-name">Entlastungsbetrag</div>
              <div className="lp-pc-val">125 €</div>
              <div className="lp-pc-per">pro Monat</div>
              <p>Ab Pflegegrad 1 — direkt mit Kasse abrechenbar</p>
            </div>
            <div className="lp-price-card featured">
              <div className="lp-pc-name">Hygienebox</div>
              <div className="lp-pc-val">0 €</div>
              <div className="lp-pc-per">Eigenanteil</div>
              <p>Bis 40 €/Monat von der Pflegekasse übernommen</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-section">
          <div className="lp-badge">Häufige Fragen</div>
          <h2 className="lp-h2">FAQ</h2>
          <div className="lp-faq">
            <details className="lp-faq-item">
              <summary>Was ist der Entlastungsbetrag nach § 45b?</summary>
              <p>
                Jede Person mit anerkanntem Pflegegrad (1–5) erhält monatlich 125 € zur Entlastung
                im Alltag. Dieser Betrag kann für unsere Alltagsbegleitung genutzt und direkt mit
                der Pflegekasse abgerechnet werden.
              </p>
            </details>
            <details className="lp-faq-item">
              <summary>Wer kann Alltagsengel nutzen?</summary>
              <p>
                Alle Personen mit Pflegegrad 1–5 sowie deren Angehörige. Auch ohne Pflegegrad
                können Sie unsere Dienste als Selbstzahler nutzen.
              </p>
            </details>
            <details className="lp-faq-item">
              <summary>Sind die Alltagsbegleiter qualifiziert?</summary>
              <p>
                Ja, alle unsere Engel sind nach § 45a SGB XI zertifiziert und versichert.
                Wir prüfen Qualifikationen und Führungszeugnisse vor der Zulassung.
              </p>
            </details>
            <details className="lp-faq-item">
              <summary>Wie funktioniert die Abrechnung?</summary>
              <p>
                Sie buchen einen Engel über die Plattform. Nach dem Einsatz erstellen wir eine
                Rechnung, die direkt bei Ihrer Pflegekasse eingereicht wird. Für Sie entstehen
                keine Vorauszahlungen.
              </p>
            </details>
            <details className="lp-faq-item">
              <summary>Was kostet die Hygienebox?</summary>
              <p>
                Die Hygienebox ist für Personen ab Pflegegrad 1 kostenlos — die Pflegekasse
                übernimmt bis zu 40 € monatlich. Wir kümmern uns um den Antrag und die Lieferung.
              </p>
            </details>
            <details className="lp-faq-item">
              <summary>Kann ich als Alltagsbegleiter arbeiten?</summary>
              <p>
                Ja! Registrieren Sie sich als Engel, laden Sie Ihre Qualifikation hoch und erhalten
                Sie bundesweit Aufträge. Versicherungsschutz inklusive.
              </p>
            </details>
          </div>
        </section>

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">ALLTAGSENGEL</div>
          <div className="lp-footer-sub">Mit Herz für dich da</div>
          <div className="lp-footer-links">
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
          </div>
          <div className="lp-footer-copy">
            © 2026 Alltagsengel UG — Frankfurt am Main
          </div>
        </footer>
      </div>
    </div>
  )
}
