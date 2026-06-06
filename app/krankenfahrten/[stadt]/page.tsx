import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// City-specific Krankenfahrten pages for Rhein-Main area
// ═══════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  plz: string
  description: string
  landmarks: string[]
}

export const dynamicParams = true

const cities: Record<string, CityData> = {
  frankfurt: {
    name: 'Frankfurt am Main',
    region: 'Hessen',
    slug: 'frankfurt',
    plz: '60311',
    description: 'Frankfurt am Main und dem gesamten Stadtgebiet',
    landmarks: ['Universitätsklinikum Frankfurt', 'Bürgerhospital Frankfurt', 'Krankenhaus Nordwest', 'Klinikum Frankfurt Höchst', 'Hospital zum Heiligen Geist'],
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    plz: '63065',
    description: 'Offenbach am Main und Umgebung',
    landmarks: ['Sana Klinikum Offenbach', 'Klinikum Offenbach', 'MVZ Offenbach'],
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    plz: '65183',
    description: 'Wiesbaden und dem Rheingau',
    landmarks: ['HSK Wiesbaden', 'St. Josefs-Hospital', 'Asklepios Paulinen Klinik'],
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    plz: '64283',
    description: 'Darmstadt und Südhessen',
    landmarks: ['Klinikum Darmstadt', 'Alice-Hospital', 'Elisabethenstift'],
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    plz: '63450',
    description: 'Hanau und dem Main-Kinzig-Kreis',
    landmarks: ['Klinikum Hanau', 'St. Vinzenz-Krankenhaus', 'Main-Kinzig-Kliniken'],
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    plz: '61348',
    description: 'Bad Homburg und dem Hochtaunuskreis',
    landmarks: ['Hochtaunus-Kliniken', 'Kerckhoff-Klinik', 'Kurpark-Klinik'],
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    plz: '55116',
    description: 'Mainz und Rheinhessen',
    landmarks: ['Universitätsmedizin Mainz', 'Katholisches Klinikum Mainz', 'GPR Klinikum Rüsselsheim'],
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    plz: '63739',
    description: 'Aschaffenburg und dem Bayerischen Untermain',
    landmarks: ['Klinikum Aschaffenburg-Alzenau', 'Hofgartenklinik', 'Frauenklinik am Hasenkopf'],
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    plz: '65929',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
    landmarks: ['Klinikum Frankfurt Höchst', 'Bürgerhospital', 'Uniklinik Frankfurt'],
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    plz: '63263',
    description: 'Neu-Isenburg und Dreieich',
    landmarks: ['Asklepios Klinik Langen', 'Bürgerhospital Dreieich', 'Klinikum Frankfurt Sachsenhausen'],
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    plz: '61169',
    description: 'Friedberg und der Wetterau',
    landmarks: ['Bürgerhospital Friedberg', 'Hochwaldkrankenhaus Bad Nauheim', 'Kerckhoff-Klinik Bad Nauheim'],
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
    title: `Krankenfahrt ${city.name} buchen | Mit Verordnung oder Selbstzahler — Alltagsengel`,
    description: `Krankenfahrt in ${city.name} buchen. Mit ärztlicher Verordnung zahlt die Krankenkasse (§60 SGB V). Arztfahrten, Dialysefahrten, Klinikfahrten — zuverlässig und pünktlich.`,
    keywords: [
      `Krankenfahrt ${city.name}`,
      `Krankenfahrt buchen ${city.name}`,
      `Patientenfahrdienst ${city.name}`,
      'Krankenfahrt Verordnung',
      '§60 SGB V',
      `Krankentransport ${city.name}`,
      `Dialysefahrt ${city.name}`,
      `Arztfahrt ${city.name}`,
      'Krankenfahrt Krankenkasse',
      `Fahrdienst ${city.name}`,
    ],
    openGraph: {
      title: `Krankenfahrt ${city.name} — zuverlässig zum Arzt | Alltagsengel`,
      description: `Krankenfahrten in ${city.name} buchen. Mit Kassenverordnung (§60 SGB V) oder als Selbstzahler. Pünktlich, sicher, freundlich.`,
      url: `https://alltagsengel.care/krankenfahrten/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    alternates: { canonical: `https://alltagsengel.care/krankenfahrten/${city.slug}` },
  }
}

function buildJsonLd(city: CityData) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: `Krankenfahrt ${city.name}`,
        description: `Krankenfahrten in ${city.name}. Sichere und pünktliche Fahrten zu Arzt, Klinik, Dialyse und Therapie. Mit ärztlicher Verordnung über die Krankenkasse abrechenbar (§60 SGB V).`,
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
          geo: { '@type': 'GeoCoordinates', latitude: 50.1109, longitude: 8.6821 },
          areaServed: [
            { '@type': 'City', name: city.name },
            { '@type': 'City', name: 'Frankfurt am Main' },
          ],
          priceRange: '€€',
        },
        areaServed: { '@type': 'City', name: city.name },
        serviceType: 'Krankenfahrt / Patientenfahrdienst',
        offers: {
          '@type': 'Offer',
          price: '15.00',
          priceCurrency: 'EUR',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '15.00',
            priceCurrency: 'EUR',
            unitText: 'Fahrt (Mindestpreis)',
          },
          description: 'Mit Verordnung über Krankenkasse §60 SGB V oder als Selbstzahler',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Wie buche ich eine Krankenfahrt in ${city.name}?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Registrieren Sie sich bei Alltagsengel, wählen Sie "Krankenfahrt" und geben Sie Start- und Zieladresse in ${city.name} ein. Sie erhalten sofort ein Angebot.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Wer zahlt die Krankenfahrt?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Mit einer ärztlichen Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V. Ohne Verordnung können Sie als Selbstzahler buchen.',
            },
          },
          {
            '@type': 'Question',
            name: `Welche Kliniken in ${city.name} werden angefahren?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Wir fahren alle Kliniken und Arztpraxen in ${city.name} an, darunter ${city.landmarks.join(', ')}.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Brauche ich eine Verordnung für die Krankenfahrt?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Für die Kostenübernahme durch die Krankenkasse ja. Bei Serienbehandlungen (Dialyse, Chemotherapie, Bestrahlung) mit Pflegegrad 3+ wird die Verordnung oft genehmigt. Ohne Verordnung fahren wir Sie gerne als Selbstzahler.',
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://alltagsengel.care' },
          { '@type': 'ListItem', position: 2, name: 'Krankenfahrten', item: 'https://alltagsengel.care/krankenfahrten' },
          { '@type': 'ListItem', position: 3, name: `Krankenfahrt ${city.name}`, item: `https://alltagsengel.care/krankenfahrten/${city.slug}` },
        ],
      },
    ],
  }
}

export default async function KrankenfahrtStadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const jsonLd = buildJsonLd(city)

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="legal-header">
        <Link href="/krankenfahrten" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Krankenfahrt {city.name}</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🚗</div>
          <h2 className="info-hero-title">Krankenfahrten in {city.name}</h2>
          <p className="info-hero-sub">
            Sicher und pünktlich zum Arzt in {city.description} — mit Verordnung zahlt die Krankenkasse
          </p>
        </div>

        <section className="info-card">
          <h3>Krankenfahrt in {city.name} buchen</h3>
          <p>
            Sie brauchen eine Krankenfahrt in {city.name}? Alltagsengel vermittelt qualifizierte
            Fahrer für Arztfahrten, Dialysefahrten, Klinikfahrten und Therapiefahrten. Unsere
            Fahrer kennen sich in {city.description} bestens aus und bringen Sie sicher und
            pünktlich ans Ziel.
          </p>
        </section>

        <section className="info-card">
          <h3>Kliniken &amp; Praxen in {city.name}</h3>
          <p>Wir fahren unter anderem zu:</p>
          <ul className="info-list">
            {city.landmarks.map((l) => (
              <li key={l}>{l}</li>
            ))}
            <li>Alle niedergelassenen Ärzte und Fachärzte</li>
            <li>Dialysezentren und Therapieeinrichtungen</li>
            <li>Reha-Kliniken und Tageskliniken</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Fahrtarten</h3>
          <ul className="info-list">
            <li><strong>Sitzend-Fahrten:</strong> Für mobile Patienten ohne besondere Hilfsmittel</li>
            <li><strong>Tragestuhl-Fahrten:</strong> Für gehbehinderte Patienten (z.B. Treppen)</li>
            <li><strong>Rollstuhl-Fahrten:</strong> Für Rollstuhlfahrer mit barrierefreiem Fahrzeug</li>
            <li><strong>Liegend-Fahrten:</strong> Für bettlägerige Patienten auf Trage</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Kosten &amp; Abrechnung</h3>
          <div className="info-price-row">
            <span className="info-price-label">Mit Verordnung (§ 60 SGB V)</span>
            <span className="info-price-val">Krankenkasse zahlt</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Selbstzahler (sitzend)</span>
            <span className="info-price-val">ab 15 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Zuzahlung (gesetzlich)</span>
            <span className="info-price-val">max. 10 €</span>
          </div>
          <p className="info-price-note">
            Mit einer ärztlichen Verordnung übernimmt die Krankenkasse die Kosten für Krankenfahrten
            nach § 60 SGB V. Die Zuzahlung beträgt maximal 10 € pro Fahrt. Wir rechnen direkt mit
            Ihrer Kasse ab — Sie haben keinen Aufwand.
          </p>
        </section>

        <section className="info-card">
          <h3>Wer bekommt eine Verordnung?</h3>
          <ul className="info-list">
            <li>Pflegegrad 3 und höher (bei Serienbehandlungen automatisch)</li>
            <li>Pflegegrad 4–5 (generell für alle Fahrten)</li>
            <li>Schwerbehinderte (Merkzeichen aG, Bl, H)</li>
            <li>Dialyse-Patienten, Chemotherapie, Bestrahlung</li>
            <li>Stationäre Aufnahme oder Entlassung</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>So buchen Sie</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Registrieren Sie sich kostenlos bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Geben Sie Start- und Zieladresse in {city.name} ein</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Wählen Sie Termin und Fahrtart (sitzend, Rollstuhl etc.)</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">4</div>
              <div className="info-step-text">Wir bestätigen — Abrechnung über Kasse oder Selbstzahler</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Kostenlose Beratung anfragen</h3>
          <p style={{ marginBottom: 16 }}>
            Fragen zur Krankenfahrt in {city.name}? Wir beraten Sie kostenlos — hinterlassen Sie
            einfach Ihre Nummer.
          </p>
          <LeadForm defaultService="Krankenfahrt" source={`krankenfahrt-${city.slug}`} />
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zu Krankenfahrten in {city.name}</h3>
          <details className="info-faq">
            <summary>Wie schnell kann ich eine Fahrt buchen?</summary>
            <p>In der Regel können wir Fahrten innerhalb von 24 Stunden vermitteln. Für regelmäßige Fahrten (z.B. Dialyse) legen wir einen Serienplan an.</p>
          </details>
          <details className="info-faq">
            <summary>Fahren Sie auch am Wochenende?</summary>
            <p>Ja, wir vermitteln Krankenfahrten in {city.name} auch samstags und an Feiertagen — mit geringem Zuschlag.</p>
          </details>
          <details className="info-faq">
            <summary>Kann eine Begleitperson mitfahren?</summary>
            <p>Ja, eine Begleitperson kann in den meisten Fällen kostenlos mitfahren. Bitte geben Sie dies bei der Buchung an.</p>
          </details>
          <details className="info-faq">
            <summary>Brauche ich die Verordnung vor der Buchung?</summary>
            <p>Idealerweise ja. Sie können aber auch vorab buchen und die Verordnung nachreichen. Ohne Verordnung fahren wir als Selbstzahler.</p>
          </details>
        </section>

        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <p>Neben Krankenfahrten bieten wir in {city.name} auch:</p>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung</Link> — 131 €/Monat über Entlastungsbetrag</li>
            <li><Link href="/hygienebox">Pflegebox</Link> — Kostenlose Pflegehilfsmittel (42 €/Monat)</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
