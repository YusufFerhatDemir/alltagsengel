import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// City-specific Alltagsbegleitung pages for Rhein-Main area
// ═══════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  plz: string
  description: string
}

export const dynamicParams = true

const cities: Record<string, CityData> = {
  frankfurt: {
    name: 'Frankfurt am Main',
    region: 'Hessen',
    slug: 'frankfurt',
    plz: '60311',
    description: 'Frankfurt am Main und dem gesamten Stadtgebiet',
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    plz: '63065',
    description: 'Offenbach am Main und Umgebung',
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    plz: '65183',
    description: 'Wiesbaden und dem Rheingau',
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    plz: '64283',
    description: 'Darmstadt und Südhessen',
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    plz: '63450',
    description: 'Hanau und dem Main-Kinzig-Kreis',
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    plz: '61348',
    description: 'Bad Homburg und dem Hochtaunuskreis',
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    plz: '55116',
    description: 'Mainz und Rheinhessen',
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    plz: '63739',
    description: 'Aschaffenburg und dem Bayerischen Untermain',
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    plz: '65929',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    plz: '63263',
    description: 'Neu-Isenburg und Dreieich',
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    plz: '61169',
    description: 'Friedberg und der Wetterau',
  },
  rodgau: {
    name: 'Rodgau',
    region: 'Hessen',
    slug: 'rodgau',
    plz: '63110',
    description: 'Rodgau und dem Kreis Offenbach',
  },
}

export function generateStaticParams() {
  return Object.keys(cities).map((stadt) => ({ stadt }))
}

export async function generateMetadata({ params }: { params: Promise<{ stadt: string }> }): Promise<Metadata> {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) return {}

  return {
    title: `Alltagsbegleitung ${city.name} | 131€ Entlastungsbetrag — Alltagsengel`,
    description: `Zertifizierte Alltagsbegleitung in ${city.name}. 131€/Monat über den Entlastungsbetrag (§45b SGB XI). Einkaufshilfe, Arztbegleitung, Haushaltshilfe — jetzt kostenlos buchen.`,
    keywords: [
      `Alltagsbegleitung ${city.name}`,
      'Entlastungsbetrag',
      '§45b SGB XI',
      'Alltagsbegleiter',
      'Pflegegrad',
      `Betreuung ${city.name}`,
      `Haushaltshilfe ${city.name}`,
      '131 Euro Pflegekasse',
      `Seniorenhilfe ${city.name}`,
      `Pflegedienst ${city.name}`,
    ],
    openGraph: {
      title: `Alltagsbegleitung ${city.name} — 131€/Monat von der Pflegekasse`,
      description: `Professionelle Alltagsbegleitung in ${city.name}. Abrechnung direkt über den Entlastungsbetrag §45b. Versichert und zertifiziert.`,
      url: `https://alltagsengel.care/alltagsbegleitung/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    alternates: { canonical: `https://alltagsengel.care/alltagsbegleitung/${city.slug}` },
  }
}

function buildJsonLd(city: CityData) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: `Alltagsbegleitung ${city.name}`,
        description: `Zertifizierte Alltagsbegleitung nach §45a SGB XI in ${city.name}. Haushaltshilfe, Arztbegleitung, Einkaufshilfe und psychosoziale Betreuung.`,
        provider: {
          '@type': 'LocalBusiness',
          '@id': 'https://alltagsengel.care/#organization',
          name: 'Alltagsengel',
          url: 'https://alltagsengel.care',
          telephone: '+4969348757690',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'Neue Mainzer Straße 66-68',
            postalCode: '60311',
            addressLocality: 'Frankfurt am Main',
            addressRegion: 'Hessen',
            addressCountry: 'DE',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: 50.1109,
            longitude: 8.6821,
          },
          areaServed: [
            { '@type': 'City', name: city.name },
            { '@type': 'City', name: 'Frankfurt am Main' },
          ],
          priceRange: '€€',
        },
        areaServed: { '@type': 'City', name: city.name },
        serviceType: 'Alltagsbegleitung',
        offers: {
          '@type': 'Offer',
          price: '32.00',
          priceCurrency: 'EUR',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '32.00',
            priceCurrency: 'EUR',
            unitText: 'Stunde',
          },
          description: '131€/Monat über Entlastungsbetrag §45b SGB XI abrechenbar',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Was kostet Alltagsbegleitung in ${city.name}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Die Alltagsbegleitung in ${city.name} kostet ab 32 € pro Stunde. Mit dem Entlastungsbetrag (§45b SGB XI) stehen Ihnen 131 € monatlich zu, die direkt mit der Pflegekasse abgerechnet werden — Sie zahlen nichts aus eigener Tasche.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Wer hat Anspruch auf den Entlastungsbetrag?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag von 131 € monatlich nach §45b SGB XI. Auch mit Pflegegrad 1 können Sie Alltagsbegleitung über den Entlastungsbetrag finanzieren.',
            },
          },
          {
            '@type': 'Question',
            name: `Wie buche ich Alltagsbegleitung in ${city.name}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie einen Engel in ${city.name} und buchen Sie Termine. Die Abrechnung mit der Pflegekasse übernehmen wir für Sie.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Welche Aufgaben übernimmt ein Alltagsbegleiter?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Unsere Alltagsbegleiter helfen bei Einkäufen, Arztbesuchen, Behördengängen, Spaziergängen, Kochen, Haushalt und leisten Gesellschaft. Keine medizinische Pflege, sondern praktische Alltagshilfe und psychosoziale Betreuung.',
            },
          },
          {
            '@type': 'Question',
            name: 'Verfällt der Entlastungsbetrag?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Ja, nicht genutzte Beträge verfallen am 30. Juni des Folgejahres. Daher lohnt es sich, den Entlastungsbetrag regelmäßig für Alltagsbegleitung zu nutzen. Rückwirkende Beantragung ist möglich.',
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://alltagsengel.care' },
          { '@type': 'ListItem', position: 2, name: 'Alltagsbegleitung', item: 'https://alltagsengel.care/alltagsbegleitung' },
          { '@type': 'ListItem', position: 3, name: `Alltagsbegleitung ${city.name}`, item: `https://alltagsengel.care/alltagsbegleitung/${city.slug}` },
        ],
      },
    ],
  }
}

export default async function StadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const jsonLd = buildJsonLd(city)

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Alltagsbegleitung {city.name}</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Alltagsbegleitung in {city.name}</h2>
          <p className="info-hero-sub">
            Zertifizierte Alltagsbegleiter in {city.description} — versichert und über den Entlastungsbetrag abrechenbar
          </p>
        </div>

        <section className="info-card">
          <h3>Was ist Alltagsbegleitung?</h3>
          <p>
            Alltagsbegleitung umfasst Unterstützung bei alltäglichen Aufgaben für pflegebedürftige Menschen
            und deren Angehörige. Unsere zertifizierten Alltagsbegleiter (Engel) in {city.name} helfen im
            Haushalt, bei Besorgungen, bei Arztbesuchen und leisten Gesellschaft — professionell,
            versichert und nach § 45a SGB XI zertifiziert.
          </p>
        </section>

        <section className="info-card">
          <h3>Unsere Leistungen in {city.name}</h3>
          <ul className="info-list">
            <li>Haushaltsnahe Hilfen (Einkaufen, Kochen, Putzen)</li>
            <li>Begleitung zu Arztterminen und Behörden</li>
            <li>Spaziergänge und Freizeitgestaltung</li>
            <li>Psychosoziale Betreuung und Gespräche</li>
            <li>Antragshilfen bei Pflegekasse und Behörden</li>
            <li>Unterstützung bei der Tagesstrukturierung</li>
            <li>Apothekenbesuche und Rezeptabholung</li>
            <li>Gedächtnistraining und geistige Aktivierung</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Preise &amp; Kostenübernahme</h3>
          <div className="info-price-row">
            <span className="info-price-label">Stundensatz</span>
            <span className="info-price-val">ab 32,00 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Pflegehilfsmittel (§ 40)</span>
            <span className="info-price-val">42 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Versicherungsschutz</span>
            <span className="info-price-val">inklusive</span>
          </div>
          <p className="info-price-note">
            Mit dem Entlastungsbetrag (§ 45b SGB XI) stehen Ihnen 131 € monatlich zu, die direkt
            mit der Pflegekasse abgerechnet werden. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres. Wir übernehmen die komplette Abrechnung für Sie.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch?</h3>
          <p>
            Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag
            von 131 € monatlich. Damit können Sie Alltagsbegleitung in {city.name} über Alltagsengel
            buchen — ohne eigene Zuzahlung. Auch ohne Pflegegrad können Sie unsere Dienste als
            Selbstzahler nutzen.
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
              <div className="info-step-text">Wählen Sie einen Engel in {city.name} aus</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Buchen Sie Termine — Abrechnung über § 45b</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Kostenlose Beratung anfragen</h3>
          <p style={{ marginBottom: 16 }}>
            Sie haben Fragen zur Alltagsbegleitung in {city.name} oder zum Entlastungsbetrag?
            Hinterlassen Sie Ihre Nummer — wir rufen Sie zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source={`alltagsbegleitung-${city.slug}`} />
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zur Alltagsbegleitung in {city.name}</h3>
          <details className="info-faq">
            <summary>Was kostet Alltagsbegleitung in {city.name}?</summary>
            <p>Ab 32 € pro Stunde. Mit dem Entlastungsbetrag (§45b) stehen Ihnen 131 € monatlich zu, die direkt mit der Pflegekasse abgerechnet werden — Sie zahlen nichts aus eigener Tasche.</p>
          </details>
          <details className="info-faq">
            <summary>Wer hat Anspruch auf den Entlastungsbetrag?</summary>
            <p>Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf 131 € monatlich nach §45b SGB XI. Auch mit Pflegegrad 1 können Sie Alltagsbegleitung finanzieren.</p>
          </details>
          <details className="info-faq">
            <summary>Wie buche ich Alltagsbegleitung in {city.name}?</summary>
            <p>Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie einen Engel in {city.name} und buchen Sie Termine. Die Abrechnung übernehmen wir.</p>
          </details>
          <details className="info-faq">
            <summary>Welche Aufgaben übernimmt ein Alltagsbegleiter?</summary>
            <p>Einkäufe, Arztbesuche, Behördengänge, Spaziergänge, Kochen, Haushalt und Gesellschaft leisten. Keine medizinische Pflege — praktische Alltagshilfe und psychosoziale Betreuung.</p>
          </details>
          <details className="info-faq">
            <summary>Verfällt der Entlastungsbetrag?</summary>
            <p>Ja, nicht genutzte Beträge verfallen am 30. Juni des Folgejahres. Daher lohnt es sich, den Entlastungsbetrag regelmäßig zu nutzen. Rückwirkende Beantragung ist möglich.</p>
          </details>
        </section>

        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <p>Neben Alltagsbegleitung bieten wir in {city.name} auch:</p>
          <ul className="info-list">
            <li><Link href="/krankenfahrten">Krankenfahrten</Link> — Mit Verordnung zahlt die Krankenkasse (§60 SGB V)</li>
            <li><Link href="/hygienebox">Pflegebox</Link> — Kostenlose Pflegehilfsmittel (42 €/Monat nach §40 SGB XI)</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Für Alltagsbegleiter (Engel) in {city.name}</h3>
          <p>
            Sie möchten als Alltagsbegleiter in {city.name} tätig werden? Bei Alltagsengel arbeiten Sie
            selbstständig, erhalten Aufträge in Ihrer Region und sind über unsere Plattform versichert.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link href="/engel-werden">
              <button className="btn-ghost" style={{ width: '100%' }}>ALS ENGEL REGISTRIEREN</button>
            </Link>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose">
            <button className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL IN {city.name.toUpperCase()} FINDEN</button>
          </Link>
        </div>

        <div className="legal-footer-nav">
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/krankenfahrten">Krankenfahrten</Link>
          <Link href="/hygienebox">Pflegebox</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
