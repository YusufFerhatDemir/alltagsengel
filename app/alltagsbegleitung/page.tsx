import Link from 'next/link'
import type { Metadata } from 'next'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'

export const metadata: Metadata = {
  title: 'Alltagsbegleitung Frankfurt | 131€ Entlastungsbetrag nutzen — Alltagsengel',
  description: 'Zertifizierte Alltagsbegleitung in Frankfurt am Main. 131€/Monat über den Entlastungsbetrag (§45b SGB XI). Einkaufshilfe, Arztbegleitung, Haushaltshilfe — jetzt kostenlos buchen.',
  keywords: ['Alltagsbegleitung Frankfurt', 'Entlastungsbetrag', '§45b SGB XI', 'Alltagsbegleiter', 'Pflegegrad', 'Betreuung Frankfurt', 'Haushaltshilfe Frankfurt', '131 Euro Pflegekasse'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Alltagsbegleitung Frankfurt — 131€/Monat von der Pflegekasse',
    description: 'Professionelle Alltagsbegleitung in Frankfurt. Abrechnung direkt über den Entlastungsbetrag §45b. Versichert und zertifiziert.',
    url: 'https://alltagsengel.care/alltagsbegleitung',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/alltagsbegleitung' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Alltagsbegleitung Frankfurt',
  description: 'Zertifizierte Alltagsbegleitung nach §45a SGB XI in Frankfurt am Main. Haushaltshilfe, Arztbegleitung, Einkaufshilfe und psychosoziale Betreuung.',
  image: 'https://alltagsengel.care/og-image.png',
  provider: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    address: { '@type': 'PostalAddress', addressLocality: 'Frankfurt am Main', addressRegion: 'Hessen', addressCountry: 'DE' },
  },
  areaServed: [
    { '@type': 'City', name: 'Frankfurt am Main' },
    { '@type': 'City', name: 'Offenbach am Main' },
    { '@type': 'City', name: 'Darmstadt' },
    { '@type': 'City', name: 'Wiesbaden' },
    { '@type': 'City', name: 'Mainz' },
    { '@type': 'City', name: 'Hanau' },
    { '@type': 'City', name: 'Bad Homburg' },
    { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
  ],
  serviceType: 'Alltagsbegleitung',
  offers: {
    '@type': 'Offer',
    price: '32.00',
    priceCurrency: 'EUR',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: '32.00', priceCurrency: 'EUR', unitText: 'Stunde' },
    description: '131€/Monat über Entlastungsbetrag §45b SGB XI abrechenbar',
  },
}

export default function AlltagsbegleitungPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Alltagsbegleitung' }]} />
      <HowToSchema
        name="Alltagsbegleitung über Alltagsengel buchen"
        description="So buchen Sie eine zertifizierte Alltagsbegleitung über den Entlastungsbetrag (§45b SGB XI, 131€/Monat) bei Alltagsengel in Frankfurt & Rhein-Main."
        totalTime="PT5M"
        steps={[
          { name: 'Kostenlos registrieren', text: 'Erstellen Sie ein kostenloses Konto bei Alltagsengel — in der App oder auf alltagsengel.care.', url: '/auth/register' },
          { name: 'Pflegegrad angeben', text: 'Geben Sie Ihren Pflegegrad (1–5) an. Mit Pflegegrad stehen Ihnen 131€/Monat Entlastungsbetrag zu.' },
          { name: 'Engel in Ihrer Nähe finden', text: 'Wählen Sie einen zertifizierten Alltagsbegleiter in Ihrer Nähe aus. Alle Engel sind versichert und geprüft.' },
          { name: 'Termin buchen', text: 'Buchen Sie einen Termin — die Abrechnung erfolgt direkt über den Entlastungsbetrag §45b mit Ihrer Pflegekasse.' },
        ]}
      />
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
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Versicherungsschutz</span>
            <span className="info-price-val">inklusive</span>
          </div>
          <p className="info-price-note">
            Mit dem Entlastungsbetrag (§ 45b SGB XI) stehen Ihnen 131 € monatlich zu, die direkt
            mit der Pflegekasse abgerechnet werden. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch?</h3>
          <p>
            Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag
            von 131 € monatlich. Damit können Sie Alltagsbegleitung über Alltagsengel buchen —
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
            <Link href="/auth/register?role=engel" className="btn-ghost" style={{ width: '100%' }}>ALS ENGEL REGISTRIEREN</Link>
          </div>
        </section>

        <section className="info-card">
          <h3>Kostenlose Beratung anfragen</h3>
          <p style={{ marginBottom: 16 }}>
            Sie haben Fragen zur Alltagsbegleitung oder zum Entlastungsbetrag?
            Hinterlassen Sie Ihre Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="alltagsbegleitung" />
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL FINDEN</Link>
        </div>

        <section className="info-card">
          <h3>Alltagsbegleitung in Ihrer Stadt</h3>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung/frankfurt">Alltagsbegleitung Frankfurt am Main</Link></li>
            <li><Link href="/alltagsbegleitung/offenbach">Alltagsbegleitung Offenbach am Main</Link></li>
            <li><Link href="/alltagsbegleitung/wiesbaden">Alltagsbegleitung Wiesbaden</Link></li>
            <li><Link href="/alltagsbegleitung/darmstadt">Alltagsbegleitung Darmstadt</Link></li>
            <li><Link href="/alltagsbegleitung/hanau">Alltagsbegleitung Hanau</Link></li>
            <li><Link href="/alltagsbegleitung/bad-homburg">Alltagsbegleitung Bad Homburg</Link></li>
            <li><Link href="/alltagsbegleitung/mainz">Alltagsbegleitung Mainz</Link></li>
            <li><Link href="/alltagsbegleitung/aschaffenburg">Alltagsbegleitung Aschaffenburg</Link></li>
            <li><Link href="/alltagsbegleitung/frankfurt-hoechst">Alltagsbegleitung Frankfurt-Höchst</Link></li>
            <li><Link href="/alltagsbegleitung/neu-isenburg">Alltagsbegleitung Neu-Isenburg</Link></li>
            <li><Link href="/alltagsbegleitung/friedberg-wetterau">Alltagsbegleitung Friedberg (Wetterau)</Link></li>
            <li><Link href="/alltagsbegleitung/rodgau">Alltagsbegleitung Rodgau</Link></li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Weitere Leistungen</h3>
          <ul className="info-list">
            <li><Link href="/hygienebox">Pflegebox — kostenlose Pflegehilfsmittel (42€/Monat)</Link></li>
            <li><Link href="/krankenfahrten">Krankenfahrten — sicher zum Arzt (§60 SGB V)</Link></li>
            <li><Link href="/finanzierung">Finanzierung — bis zu 5.111 €/Jahr, nach Pflegegrad erklärt</Link></li>
            <li><Link href="/blog/entlastungsbetrag-45b">Ratgeber: Entlastungsbetrag §45b richtig nutzen</Link></li>
            <li><Link href="/jobs">Jobs — Teil des Alltagsengel-Teams werden</Link></li>
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
