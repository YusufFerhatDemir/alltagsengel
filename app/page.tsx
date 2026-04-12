import Link from 'next/link'
import Icon3D from '@/components/Icon3D'
import AppMockup from '@/components/AppMockup'
import VisitTracker from '@/components/VisitTracker'
import SocialProof from '@/components/SocialProof'

export default function SplashPage() {
  return (
    <div className="screen" id="splash">
      <VisitTracker portal="landing" />
      {/* ── Sticky CTA Bar — immer sichtbar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'linear-gradient(180deg, transparent 0%, rgba(20,18,16,0.95) 30%, #141210 100%)',
        padding: '20px 16px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#C9963C', fontWeight: 600, marginBottom: 8 }}>
          131€/Monat von der Pflegekasse — jetzt sichern
        </div>
        <Link href="/choose">
          <button className="btn-gold" style={{ width: '100%', maxWidth: 340, fontSize: 16, padding: '14px 0' }}>
            KOSTENLOS REGISTRIEREN
          </button>
        </Link>
      </div>
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

        {/* App Vorschau */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">So funktioniert&apos;s</div>
          <h2 className="lp-h2">Ihre App für den Alltag</h2>
          <p className="lp-text">
            Finden Sie zertifizierte Alltagsbegleiter in Ihrer Nähe, buchen Sie direkt
            und rechnen Sie bequem über Ihre Pflegekasse ab.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 8px' }}>
            <AppMockup size={260} />
          </div>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-text"><strong>Engel finden</strong><br />Nach Umkreis &amp; Leistung filtern</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-text"><strong>Direkt buchen</strong><br />Termin, Dauer &amp; Zahlung wählen</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-text"><strong>Kasse abrechnen</strong><br />Wir übernehmen die Abrechnung</div>
            </div>
          </div>
        </section>

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
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M8 12c0-2 1-4 3-4h18c2 0 3 2 3 4v10c0 2-1 4-3 4H11c-2 0-3-2-3-4v-10z" />
                  <path d="M20 16v8m-8-8v8" />
                  <circle cx="20" cy="8" r="1.5" fill="#C9963C" />
                </svg>
              </div>
              <h4>Versichert</h4>
              <p>Jeder Einsatz ist haftpflichtversichert</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="20" cy="20" r="16" />
                  <path d="M14 20l3 3 8-8" />
                </svg>
              </div>
              <h4>Zertifiziert</h4>
              <p>Alle Engel nach § 45a SGB XI qualifiziert</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="6" y="6" width="28" height="28" rx="2" />
                  <path d="M13 10v24m14-24v24M10 16h20M10 24h20" />
                </svg>
              </div>
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
              <div className="lp-svc-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 8c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6z" />
                  <path d="M12 26c0-3 2-6 4-7.5h8c2 1.5 4 4.5 4 7.5v5H12v-5z" />
                  <path d="M14 18l-4 4m0-4l4 4" />
                </svg>
              </div>
              <h4>Alltagsbegleitung</h4>
              <p>Haushaltsnahe Hilfen, Begleitung, psychosoziale Betreuung</p>
              <span className="lp-svc-price">ab 32 €/Std.</span>
            </Link>
            <Link href="/krankenfahrten" className="lp-service-card">
              <div className="lp-svc-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="4" y="12" width="32" height="16" rx="2" />
                  <path d="M8 28v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3m12 3v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3M4 18h32m6-6h-4v4h-4v-4h-4" />
                </svg>
              </div>
              <h4>Krankenfahrten</h4>
              <p>Sichere Fahrten zu Ärzten, Kliniken und Therapien</p>
              <span className="lp-svc-price">Preis nach Region &amp; Fahrtart</span>
            </Link>
            <Link href="/hygienebox" className="lp-service-card">
              <div className="lp-svc-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="8" y="10" width="24" height="24" rx="1" />
                  <path d="M14 16h12M14 22h12M14 28h12" />
                  <circle cx="32" cy="15" r="3" fill="#C9963C" />
                </svg>
              </div>
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
            Mit dem Entlastungsbetrag (§ 45b) stehen Ihnen 131 € monatlich zu.
            Nicht genutztes Budget verfällt am 30.06. des Folgejahres — nutzen Sie es!
          </p>
          <div className="lp-price-cards">
            <div className="lp-price-card">
              <div className="lp-pc-name">Entlastungsbetrag</div>
              <div className="lp-pc-val">131 €</div>
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
                Jede Person mit anerkanntem Pflegegrad (1–5) erhält monatlich 131 € zur Entlastung
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

        {/* Testimonials / Social Proof — Enhanced */}
        <SocialProof />

        {/* CTA */}
        <section className="lp-section lp-cta-section">
          <h2 className="lp-h2">Jetzt starten — kostenlos &amp; unverbindlich</h2>
          <p className="lp-text">
            Registrieren Sie sich in 2 Minuten und finden Sie einen Engel in Ihrer Nähe.
            Keine Vorauszahlung, keine Bindung.
          </p>
          <div className="sp-btns" style={{ marginTop: 20 }}>
            <Link href="/choose"><button className="btn-gold">JETZT REGISTRIEREN</button></Link>
          </div>
          <div className="lp-cta-stats">
            <div className="lp-cta-stat"><strong>500+</strong><span>Engel deutschlandweit</span></div>
            <div className="lp-cta-stat"><strong>4,9</strong><span>Durchschnittsbewertung</span></div>
            <div className="lp-cta-stat"><strong>0 €</strong><span>Registrierungskosten</span></div>
          </div>
        </section>

        {/* Spacer für Sticky CTA Bar */}
        <div style={{ height: 100 }} />

        {/* Footer */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">ALLTAGSENGEL</div>
          <div className="lp-footer-sub">Mit Herz für dich da</div>
          <div className="lp-footer-links">
            <Link href="/blog">Ratgeber</Link>
            <Link href="/faq">FAQ</Link>
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
