import type { Metadata } from 'next'
import Link from 'next/link'
import Icon3D from '@/components/Icon3D'
import AppMockup from '@/components/AppMockup'
import VisitTracker from '@/components/VisitTracker'
import LeadForm from '@/components/LeadForm'

const FAQS = [
  {
    q: 'Was kostet mich die Pflege-Box?',
    a: 'Nichts. Bei anerkanntem Pflegegrad (1–5) übernimmt die Pflegekasse nach §40 SGB XI bis zu 42 € pro Monat. Ihr Eigenanteil: 0 €. Bestellt wird bequem über die App, die Abrechnung läuft direkt mit der Kasse.',
  },
  {
    q: 'Brauche ich einen Pflegegrad für die Pflege-Box?',
    a: 'Ja — für die Kostenübernahme nach §40 SGB XI ist mindestens Pflegegrad 1 nötig. Noch keinen Pflegegrad? Sprechen Sie uns an, wir erklären den Weg zum Antrag bei der Pflegekasse.',
  },
  {
    q: 'Was ist in der Pflege-Box enthalten?',
    a: 'Pflegehilfsmittel zum Verbrauch: Einmalhandschuhe, Hand- und Flächendesinfektion, Bettschutzeinlagen, Mund-Nasen-Schutz und Schutzschürzen. Den genauen Inhalt sehen Sie in der App und können ihn passend zum Bedarf zusammenstellen.',
  },
  {
    q: 'Wie schnell wird die Pflege-Box geliefert?',
    a: 'Nach erfolgter Genehmigung durch die Kasse erfolgt die erste Lieferung innerhalb weniger Werktage direkt nach Hause. Danach monatlich automatisch — ohne dass Sie etwas tun müssen.',
  },
  {
    q: 'Wer bezahlt die Krankenfahrt?',
    a: 'Mit ärztlicher Verordnung übernimmt in der Regel die Krankenkasse nach §60 SGB V die Kosten (es kann eine gesetzliche Zuzahlung von 10 % anfallen, mindestens 5 €, höchstens 10 € pro Fahrt). Ohne Verordnung können Sie als Selbstzahler buchen — beide Wege gehen direkt in der App.',
  },
  {
    q: 'Muss ich für die Krankenfahrt eine Verordnung haben?',
    a: 'Nein. Die Verordnung wird benötigt, damit die Kasse zahlt. Ohne Verordnung fahren wir Sie trotzdem — als Selbstzahler. Verordnung haben Sie? Einfach als Foto oder PDF in der App hochladen, wir kümmern uns um den Rest.',
  },
  {
    q: 'In welchem Gebiet seid ihr unterwegs?',
    a: 'Frankfurt am Main und das gesamte Rhein-Main-Gebiet. Krankenfahrten werden über unser Partnernetz an qualifizierte Fahrer vergeben.',
  },
  {
    q: 'Wie melde ich mich an?',
    a: 'Kostenlos und in 2 Minuten: Tippen Sie auf „Jetzt starten", geben Sie Name, E-Mail und PLZ ein — fertig. Keine Vorauszahlung, keine Bindung, jederzeit kündbar.',
  },
]

const jsonLdServices = [
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': 'https://alltagsengel.care/#service-pflegebox',
    name: 'Pflege-Box (Pflegehilfsmittel-Box nach §40 SGB XI)',
    description: 'Monatliche Lieferung von Pflegehilfsmitteln zum Verbrauch (Handschuhe, Desinfektion, Bettschutz, Masken, Schürzen). Bis zu 42 € pro Monat von der Pflegekasse übernommen — 0 € Eigenanteil bei anerkanntem Pflegegrad.',
    provider: { '@id': 'https://alltagsengel.care/#organization' },
    serviceType: 'Pflegehilfsmittel-Box',
    areaServed: [
      { '@type': 'City', name: 'Frankfurt am Main' },
      { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
    ],
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description: 'Eigenanteil 0 € — Abrechnung über die Pflegekasse nach §40 SGB XI bei Pflegegrad 1–5.',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': 'https://alltagsengel.care/#service-krankenfahrt',
    name: 'Krankenfahrt-Vermittlung (Frankfurt & Rhein-Main)',
    description: 'Sichere Krankenfahrten zu Arzt, Klinik, Dialyse und Therapie — mit ärztlicher Verordnung über die Krankenkasse abrechenbar (§60 SGB V) oder als Selbstzahler buchbar.',
    provider: { '@id': 'https://alltagsengel.care/#organization' },
    serviceType: 'Krankenfahrt / Patientenfahrdienst',
    areaServed: [
      { '@type': 'City', name: 'Frankfurt am Main' },
      { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
    ],
  },
]

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export const metadata: Metadata = {
  alternates: { canonical: 'https://alltagsengel.care/' },
}

export default function SplashPage() {
  return (
    <div className="screen" id="splash">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdServices[0]) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdServices[1]) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }}
      />

      <VisitTracker portal="landing" />

      {/* ── Sticky CTA Bar — immer sichtbar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'linear-gradient(180deg, transparent 0%, rgba(20,18,16,0.95) 30%, #141210 100%)',
        padding: '20px 16px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, color: '#C9963C', fontWeight: 600, marginBottom: 8 }}>
          Pflege-Box: 0 € Eigenanteil über die Pflegekasse
        </div>
        <Link href="/choose">
          <button className="btn-gold" style={{ width: '100%', maxWidth: 340, fontSize: 16, padding: '14px 0' }}>
            KOSTENLOS REGISTRIEREN
          </button>
        </Link>
      </div>

      {/* ── HERO ── */}
      <div className="sp-glow"></div>
      <div className="sp-inner">
        <div style={{ marginBottom: 26 }}>
          <Icon3D size={140} float />
        </div>
        <h1 className="sp-word">ALLTAGSENGEL</h1>
        <p className="sp-tag">Pflege-Box &amp; Krankenfahrt</p>
        <p className="sp-ug">Frankfurt · Rhein-Main · über die App</p>
        <div className="gold-div"></div>
        <div className="sp-btns">
          <Link href="/choose"><button className="btn-gold">JETZT STARTEN</button></Link>
          <Link href="/auth/login"><button className="btn-ghost">Ich habe bereits ein Konto</button></Link>
        </div>
      </div>
      <div className="sp-trust">
        <div className="trust-row">
          <div className="trust-item"><div className="trust-val">0 €</div><div className="trust-lbl">Eigenanteil</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">§40</div><div className="trust-lbl">SGB XI</div></div>
          <div className="trust-sep"></div>
          <div className="trust-item"><div className="trust-val">Rhein-Main</div><div className="trust-lbl">Region</div></div>
        </div>
      </div>

      {/* ── Scroll-Bereich ── */}
      <div className="lp-sections">

        {/* ─── Klar in 5 Sekunden: Was Alltagsengel ist ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Alltagsengel auf einen Blick</div>
          <h2 className="lp-h2">Zwei Dinge, einfach geregelt</h2>
          <p className="lp-text">
            Alltagsengel ist kein medizinischer Dienst. Wir kümmern uns um zwei Dinge,
            die pflegebedürftige Menschen und ihre Angehörigen wirklich entlasten:
            die monatliche Pflege-Box und sichere Krankenfahrten — beides direkt in der App,
            beides über die Kasse abrechenbar.
          </p>
        </section>

        {/* ─── ANGEBOT 1: Pflege-Box ─── */}
        <section className="lp-section">
          <div className="lp-badge">Angebot 1 · Pflege-Box</div>
          <h2 className="lp-h2">Pflegehilfsmittel kostenlos von der Pflegekasse</h2>
          <p className="lp-text">
            Bei Pflegegrad 1–5 zahlt Ihre Pflegekasse nach <strong>§40 SGB XI</strong> bis zu
            <strong> 42 €</strong> pro Monat für Pflegehilfsmittel zum Verbrauch.
            Ihr Eigenanteil: <strong>0 €</strong>. Sie wählen den Inhalt in der App,
            wir kümmern uns um den Antrag und die monatliche Lieferung nach Hause.
          </p>
          <div className="lp-price-cards">
            <div className="lp-price-card featured">
              <div className="lp-pc-name">Ihr Eigenanteil</div>
              <div className="lp-pc-val">0 €</div>
              <div className="lp-pc-per">pro Monat</div>
              <p>Bis zu 42 € monatlich von der Pflegekasse — direkt abgerechnet, kein Vorstrecken.</p>
            </div>
            <div className="lp-price-card">
              <div className="lp-pc-name">Inhalt nach Bedarf</div>
              <div className="lp-pc-val" style={{ fontSize: 22 }}>Handschuhe · Desinfektion · Bettschutz · Masken · Schürzen</div>
              <div className="lp-pc-per" style={{ marginTop: 10 }}>in der App zusammenstellbar</div>
            </div>
          </div>
          <div className="sp-btns" style={{ marginTop: 22 }}>
            <Link href="/hygienebox"><button className="btn-ghost">Pflege-Box im Detail ansehen</button></Link>
          </div>
        </section>

        {/* ─── ANGEBOT 2: Krankenfahrten ─── */}
        <section className="lp-section">
          <div className="lp-badge">Angebot 2 · Krankenfahrt</div>
          <h2 className="lp-h2">Sicher zu Arzt, Therapie &amp; Klinik</h2>
          <p className="lp-text">
            Mit ärztlicher Verordnung übernimmt die Krankenkasse nach <strong>§60 SGB V</strong> die Kosten
            (gesetzliche Zuzahlung von 10 %, mindestens 5 €, höchstens 10 € pro Fahrt möglich).
            Keine Verordnung? Sie buchen die Fahrt als <strong>Selbstzahler</strong> —
            der Preis hängt von Region, Fahrtart und Hilfebedarf ab und wird vor der Buchung in der App
            transparent angezeigt.
          </p>
          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-text"><strong>Fahrt buchen</strong><br />Datum, Ziel &amp; Hilfebedarf</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-text"><strong>Verordnung hochladen</strong><br />Als Foto oder PDF in der App</div>
            </div>
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-text"><strong>Abgeholt werden</strong><br />Fahrer kommt pünktlich</div>
            </div>
          </div>
          <div className="sp-btns" style={{ marginTop: 22 }}>
            <Link href="/krankenfahrten"><button className="btn-ghost">Krankenfahrt im Detail ansehen</button></Link>
          </div>
        </section>

        {/* ─── So funktioniert die App ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">So funktioniert&apos;s</div>
          <h2 className="lp-h2">Eine App. Zwei Lösungen.</h2>
          <p className="lp-text">
            Pflege-Box bestellen, Krankenfahrt buchen, Verordnung hochladen, mit der Kasse abrechnen —
            alles in einer App. Ohne Papierkram, ohne Telefon-Schleifen.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 8px' }}>
            <AppMockup size={260} />
          </div>
        </section>

        {/* ─── Lead-Formular: Kostenlose Beratung ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Persönliche Beratung</div>
          <h2 className="lp-h2">Jetzt kostenlos beraten lassen</h2>
          <p className="lp-text" style={{ marginBottom: 24 }}>
            Sie haben Fragen zur Pflege-Box oder zu Krankenfahrten?
            Hinterlassen Sie Ihre Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm />
        </section>

        {/* ─── Trust / Fakten (keine erfundenen Testimonials) ─── */}
        <section className="lp-section">
          <div className="lp-badge">Warum Alltagsengel</div>
          <h2 className="lp-h2">Klare gesetzliche Grundlage</h2>
          <div className="lp-values">
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="6" y="6" width="28" height="28" rx="2" />
                  <path d="M13 14h14M13 20h14M13 26h10" />
                </svg>
              </div>
              <h4>§40 SGB XI · Pflege-Box</h4>
              <p>Pflegehilfsmittel zum Verbrauch — bis 42 € pro Monat von der Pflegekasse.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <rect x="4" y="12" width="32" height="16" rx="2" />
                  <path d="M8 28v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3m12 3v3c0 1 .5 2 2 2h2c1.5 0 2-1 2-2v-3M4 18h32" />
                </svg>
              </div>
              <h4>§60 SGB V · Krankenfahrt</h4>
              <p>Mit ärztlicher Verordnung übernimmt die Krankenkasse die Fahrtkosten.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 4c-7 4-12 4-14 4 0 12 4 22 14 28 10-6 14-16 14-28-2 0-7 0-14-4z" />
                  <path d="M15 20l4 4 7-8" />
                </svg>
              </div>
              <h4>Region Rhein-Main</h4>
              <p>Sitz in Frankfurt am Main · Auslieferung &amp; Fahrten im gesamten Rhein-Main-Gebiet.</p>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="lp-section">
          <div className="lp-badge">Häufige Fragen</div>
          <h2 className="lp-h2">Antworten ohne Umwege</h2>
          <div className="lp-faq">
            {FAQS.map((f, i) => (
              <details key={i} className="lp-faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─── Soziales Engagement ─── */}
        <section className="lp-section" style={{ textAlign: 'center' }}>
          <div className="lp-badge">Soziales Engagement</div>
          <h2 className="lp-h2">Mit jeder Buchung helfen wir</h2>
          <p className="lp-text">
            Von jeder Buchung fließt <strong>1 €</strong> direkt in unsere Hilfskasse
            für Kinder und Familien in Not. Wir unterstützen Schulen, Kinder mit
            Behinderung oder Pflegestufe und bedürftige Familien in der Region — ohne
            Umwege, ohne Verwaltungskosten.
          </p>
          <div className="lp-values" style={{ marginTop: 20 }}>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 35s-13-8-13-18a7 7 0 0 1 13-4 7 7 0 0 1 13 4c0 10-13 18-13 18z" />
                </svg>
              </div>
              <h4>1 € pro Buchung</h4>
              <p>Jede Pflege-Box und jede Krankenfahrt hilft automatisch mit.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <circle cx="14" cy="14" r="5" />
                  <circle cx="26" cy="14" r="5" />
                  <circle cx="20" cy="26" r="5" />
                  <path d="M14 19v2M26 19v2M17 24h6" />
                </svg>
              </div>
              <h4>Direkt vor Ort</h4>
              <p>Für Schulen, Kinder mit Behinderung und Familien, die Hilfe brauchen.</p>
            </div>
            <div className="lp-value-item">
              <div className="lp-value-icon">
                <svg viewBox="0 0 40 40" width="40" height="40" style={{ fill: 'none', stroke: '#C9963C', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                  <path d="M20 4v8M4 20h8M28 20h8M20 28v8" />
                  <circle cx="20" cy="20" r="8" />
                  <path d="M17 20l2 2 4-4" />
                </svg>
              </div>
              <h4>100 % transparent</h4>
              <p>Wir verwalten die Spenden selbst und legen offen, wohin jeder Euro geht.</p>
            </div>
          </div>
        </section>

        {/* ─── Ratgeber-Teaser ─── */}
        <section className="lp-section">
          <div className="lp-badge">Ratgeber</div>
          <h2 className="lp-h2">Wissen rund um Pflege &amp; Entlastung</h2>
          <p className="lp-text">
            Kostenlose Artikel zu Pflegegrad, Entlastungsbetrag, Krankenfahrt-Kostenübernahme
            und mehr — verständlich erklärt, mit praktischen Tipps.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: 16,
            marginTop: 20,
          }}>
            {[
              { slug: 'entlastungsbetrag-45b', title: 'Entlastungsbetrag §45b — 131 €/Monat', cat: 'Finanzierung' },
              { slug: 'pflegebox-kostenlos-bestellen', title: 'Pflegebox kostenlos bestellen', cat: 'Finanzierung' },
              { slug: 'krankenfahrt-buchen-frankfurt', title: 'Krankenfahrt buchen Frankfurt', cat: 'Services' },
              { slug: 'pflegegrad-beantragen', title: 'Pflegegrad beantragen — Anleitung', cat: 'Pflegegrad' },
            ].map(a => (
              <Link key={a.slug} href={`/blog/${a.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'border-color 0.3s',
                }}>
                  <div style={{ color: '#C9963C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    {a.cat}
                  </div>
                  <div style={{ color: '#F5F0E8', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                    {a.title}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="sp-btns" style={{ marginTop: 22 }}>
            <Link href="/blog"><button className="btn-ghost">Alle Ratgeber-Artikel ansehen →</button></Link>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="lp-section lp-cta-section">
          <h2 className="lp-h2">Pflege-Box sichern. Fahrt buchen. In 2 Minuten.</h2>
          <p className="lp-text">
            Registrierung kostenlos &amp; unverbindlich. Keine Vorauszahlung, keine Bindung.
            Bestellen Sie Ihre Pflege-Box oder buchen Sie eine Fahrt direkt in der App.
          </p>
          <div className="sp-btns" style={{ marginTop: 20 }}>
            <Link href="/choose"><button className="btn-gold">JETZT KOSTENLOS REGISTRIEREN</button></Link>
          </div>
        </section>

        {/* Spacer für Sticky CTA Bar */}
        <div style={{ height: 100 }} />

        {/* ─── Footer ─── */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">ALLTAGSENGEL</div>
          <div className="lp-footer-sub">Pflege-Box &amp; Krankenfahrt · Frankfurt &amp; Rhein-Main</div>
          <div className="lp-footer-links">
            <Link href="/hygienebox">Pflege-Box</Link>
            <Link href="/krankenfahrten">Krankenfahrt</Link>
            <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
            <Link href="/engel-werden">Engel werden</Link>
            <Link href="/blog">Ratgeber</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/kontakt">Kontakt</Link>
          </div>
          <div className="lp-footer-links" style={{ marginTop: 4 }}>
            <Link href="/impressum">Impressum</Link>
            <Link href="/datenschutz">Datenschutz</Link>
            <Link href="/agb">AGB</Link>
          </div>
          <div className="lp-footer-copy">
            © 2026 Alltagsengel UG (haftungsbeschränkt) — Frankfurt am Main
          </div>
        </footer>
      </div>
    </div>
  )
}
