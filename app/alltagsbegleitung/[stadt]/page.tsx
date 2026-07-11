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
  description: string
  // Stadtmittelpunkt (öffentliche Geodaten) für Service.areaServed
  lat: number
  lng: number
  // Echte Stadtteile — sichtbar gerendert + in FAQ integriert
  stadtteile: string[]
  // Stadtspezifischer Satz für Fließtext & FAQ (nur stabile öffentliche Fakten)
  lokal: string
  // Slugs benachbarter Städte für „Auch in Ihrer Nähe"
  nachbarn: string[]
}

export const dynamicParams = true

const cities: Record<string, CityData> = {
  frankfurt: {
    name: 'Frankfurt am Main',
    region: 'Hessen',
    slug: 'frankfurt',
    description: 'Frankfurt am Main und dem gesamten Stadtgebiet',
    lat: 50.1109,
    lng: 8.6821,
    stadtteile: ['Bornheim', 'Nordend', 'Sachsenhausen', 'Bockenheim', 'Rödelheim', 'Niederrad'],
    lokal: 'Unsere Alltagsbegleiter sind beiderseits des Mains im gesamten Frankfurter Stadtgebiet unterwegs — mit kurzen Anfahrtswegen und flexiblen Terminen.',
    nachbarn: ['offenbach', 'bad-homburg', 'neu-isenburg', 'frankfurt-hoechst'],
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    description: 'Offenbach am Main und Umgebung',
    lat: 50.0956,
    lng: 8.7761,
    stadtteile: ['Bürgel', 'Bieber', 'Rumpenheim', 'Lauterborn', 'Tempelsee'],
    lokal: 'In Offenbach sind wir vom Kaiserlei im Westen bis Bürgel und Rumpenheim am Mainufer im Einsatz.',
    nachbarn: ['frankfurt', 'neu-isenburg', 'rodgau', 'hanau'],
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    description: 'Wiesbaden und dem Rheingau',
    lat: 50.0782,
    lng: 8.2398,
    stadtteile: ['Biebrich', 'Dotzheim', 'Sonnenberg', 'Bierstadt', 'Schierstein'],
    lokal: 'In der Landeshauptstadt Wiesbaden begleiten wir Sie von Biebrich am Rhein bis hinauf nach Sonnenberg.',
    nachbarn: ['mainz', 'frankfurt-hoechst', 'frankfurt'],
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    description: 'Darmstadt und Südhessen',
    lat: 49.8728,
    lng: 8.6512,
    stadtteile: ['Bessungen', 'Arheilgen', 'Eberstadt', 'Kranichstein', 'Wixhausen'],
    lokal: 'In der Wissenschaftsstadt Darmstadt sind unsere Engel von Arheilgen im Norden bis Eberstadt im Süden unterwegs.',
    nachbarn: ['frankfurt', 'neu-isenburg', 'rodgau'],
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    description: 'Hanau und dem Main-Kinzig-Kreis',
    lat: 50.1328,
    lng: 8.9169,
    stadtteile: ['Steinheim', 'Kesselstadt', 'Großauheim', 'Klein-Auheim', 'Mittelbuchen'],
    lokal: 'In der Brüder-Grimm-Stadt Hanau kommen wir zu Ihnen — von Kesselstadt bis Steinheim und Großauheim südlich des Mains.',
    nachbarn: ['offenbach', 'rodgau', 'frankfurt', 'aschaffenburg'],
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    description: 'Bad Homburg und dem Hochtaunuskreis',
    lat: 50.2268,
    lng: 8.6182,
    stadtteile: ['Kirdorf', 'Gonzenheim', 'Dornholzhausen', 'Ober-Erlenbach', 'Ober-Eschbach'],
    lokal: 'In der Kurstadt Bad Homburg vor der Höhe sind wir von Kirdorf bis Ober-Erlenbach für Sie im Einsatz.',
    nachbarn: ['frankfurt', 'friedberg-wetterau', 'frankfurt-hoechst'],
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    description: 'Mainz und Rheinhessen',
    lat: 49.9929,
    lng: 8.2473,
    stadtteile: ['Gonsenheim', 'Mombach', 'Bretzenheim', 'Hechtsheim', 'Neustadt', 'Oberstadt'],
    lokal: 'In der rheinland-pfälzischen Landeshauptstadt Mainz begleiten wir Sie von der Neustadt bis Gonsenheim und Hechtsheim.',
    nachbarn: ['wiesbaden', 'frankfurt', 'frankfurt-hoechst'],
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    description: 'Aschaffenburg und dem Bayerischen Untermain',
    lat: 49.9757,
    lng: 9.1478,
    stadtteile: ['Damm', 'Nilkheim', 'Schweinheim', 'Obernau', 'Leider'],
    lokal: 'In Aschaffenburg am Bayerischen Untermain sind wir von Damm bis Schweinheim und Obernau unterwegs.',
    nachbarn: ['hanau', 'rodgau', 'offenbach'],
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
    lat: 50.0996,
    lng: 8.543,
    stadtteile: ['Nied', 'Sindlingen', 'Unterliederbach', 'Zeilsheim', 'Sossenheim'],
    lokal: 'Im Frankfurter Westen sind wir rund um die Höchster Altstadt sowie in den Nachbarstadtteilen im Einsatz.',
    nachbarn: ['frankfurt', 'wiesbaden', 'mainz'],
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    description: 'Neu-Isenburg und Dreieich',
    lat: 50.048,
    lng: 8.6947,
    stadtteile: ['Stadtmitte', 'Gravenbruch', 'Zeppelinheim'],
    lokal: 'In Neu-Isenburg erreichen unsere Engel Sie schnell — von der Stadtmitte bis Gravenbruch und Zeppelinheim.',
    nachbarn: ['frankfurt', 'offenbach', 'darmstadt', 'rodgau'],
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    description: 'Friedberg und der Wetterau',
    lat: 50.3372,
    lng: 8.7548,
    stadtteile: ['Ockstadt', 'Dorheim', 'Bauernheim', 'Bruchenbrücken', 'Ossenheim'],
    lokal: 'In der Kreisstadt Friedberg (Wetterau) sind wir in der Kernstadt und allen Ortsteilen bis Ockstadt und Dorheim im Einsatz.',
    nachbarn: ['bad-homburg', 'frankfurt', 'hanau'],
  },
  rodgau: {
    name: 'Rodgau',
    region: 'Hessen',
    slug: 'rodgau',
    description: 'Rodgau und dem Kreis Offenbach',
    lat: 50.0333,
    lng: 8.8833,
    stadtteile: ['Jügesheim', 'Dudenhofen', 'Weiskirchen', 'Hainhausen', 'Nieder-Roden'],
    lokal: 'In Rodgau sind wir in allen fünf Stadtteilen unterwegs — von Weiskirchen bis Nieder-Roden.',
    nachbarn: ['offenbach', 'hanau', 'neu-isenburg'],
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
    title: `Alltagsbegleitung ${city.name}`,
    description: `Alltagsbegleitung in ${city.name} — auch in ${city.stadtteile[0]} & ${city.stadtteile[1]}. 131 €/Monat über den Entlastungsbetrag (§45b SGB XI). Jetzt kostenlos beraten lassen.`,
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
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
      title: `Alltagsbegleitung ${city.name} — 131€/Monat von der Pflegekasse`,
      description: `Professionelle Alltagsbegleitung in ${city.name}. Abrechnung direkt über den Entlastungsbetrag §45b. Versichert und zertifiziert.`,
      // og:url muss dem Canonical entsprechen — jede Stadtseite (inkl. Frankfurt)
      // zeigt auf sich selbst. Die Hauptseite /alltagsbegleitung ist die
      // regionsweite Pillar-Seite, die Stadtseite die lokale Landing-Page.
      url: `https://alltagsengel.care/alltagsbegleitung/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    alternates: {
      // Jede Stadtseite self-canonical — auch Frankfurt hat eine eigene URL.
      canonical: `https://alltagsengel.care/alltagsbegleitung/${city.slug}`,
    },
  }
}

// Eine Quelle für sichtbare FAQ UND FAQPage-JSON-LD (Google-Richtlinie:
// Structured-Data-FAQs müssen sichtbar auf der Seite stehen)
function buildFaqs(city: CityData): { frage: string; antwort: string }[] {
  return [
    {
      frage: `Was kostet Alltagsbegleitung in ${city.name}?`,
      antwort: `Die Alltagsbegleitung in ${city.name} kostet ab 32 € pro Stunde. Mit dem Entlastungsbetrag (§45b SGB XI) stehen Ihnen 131 € monatlich zu, die direkt mit der Pflegekasse abgerechnet werden — Sie zahlen nichts aus eigener Tasche.`,
    },
    {
      frage: 'Wer hat Anspruch auf den Entlastungsbetrag?',
      antwort: 'Jede Person mit anerkanntem Pflegegrad (1–5) hat Anspruch auf den Entlastungsbetrag von 131 € monatlich nach §45b SGB XI. Auch mit Pflegegrad 1 können Sie Alltagsbegleitung über den Entlastungsbetrag finanzieren.',
    },
    {
      frage: `Wie buche ich Alltagsbegleitung in ${city.name}?`,
      antwort: `Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie einen Engel in ${city.name} und buchen Sie Termine. Die Abrechnung mit der Pflegekasse übernehmen wir für Sie.`,
    },
    {
      frage: 'Welche Aufgaben übernimmt ein Alltagsbegleiter?',
      antwort: 'Unsere Alltagsbegleiter helfen bei Einkäufen, Arztbesuchen, Behördengängen, Spaziergängen, Kochen, Haushalt und leisten Gesellschaft. Keine medizinische Pflege, sondern praktische Alltagshilfe und psychosoziale Betreuung.',
    },
    {
      frage: 'Verfällt der Entlastungsbetrag?',
      antwort: 'Ja, nicht genutzte Beträge verfallen am 30. Juni des Folgejahres. Daher lohnt es sich, den Entlastungsbetrag regelmäßig für Alltagsbegleitung zu nutzen. Rückwirkende Beantragung ist möglich.',
    },
    {
      frage: `Kommen die Alltagsbegleiter auch in meinen Stadtteil von ${city.name}?`,
      antwort: `Ja. ${city.lokal} Zu unseren Einsatzgebieten zählen unter anderem ${city.stadtteile.join(', ')} — und auf Wunsch auch die nähere Umgebung.`,
    },
  ]
}

function buildJsonLd(city: CityData, faqs: { frage: string; antwort: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: `Alltagsbegleitung ${city.name}`,
        description: `Zertifizierte Alltagsbegleitung nach §45a SGB XI in ${city.name}. Haushaltshilfe, Arztbegleitung, Einkaufshilfe und psychosoziale Betreuung.`,
        image: 'https://alltagsengel.care/og-image.png',
        // Referenz auf das LocalBusiness aus dem Root-Layout (keine Duplikate)
        provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
        areaServed: {
          '@type': 'City',
          name: city.name,
          containedInPlace: { '@type': 'AdministrativeArea', name: city.region },
          geo: { '@type': 'GeoCoordinates', latitude: city.lat, longitude: city.lng },
        },
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
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.frage,
          acceptedAnswer: { '@type': 'Answer', text: faq.antwort },
        })),
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

  const faqs = buildFaqs(city)
  const jsonLd = buildJsonLd(city, faqs)

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
          <h3>Alltagsbegleitung in {city.name} — auch in Ihrem Stadtteil</h3>
          <p>{city.lokal}</p>
          <p style={{ marginTop: 8 }}>
            Einsatzgebiete unter anderem: {city.stadtteile.join(', ')} — sowie alle weiteren
            Stadtteile und die nähere Umgebung.
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
          {faqs.map((faq) => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
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
            <Link href="/engel-werden" className="btn-ghost" style={{ width: '100%' }}>ALS ENGEL REGISTRIEREN</Link>
          </div>
        </section>

        <div className="info-cta">
          <Link href="/choose" className="btn-gold" style={{ width: '100%' }}>JETZT ENGEL IN {city.name.toUpperCase()} FINDEN</Link>
        </div>

        <section className="info-card">
          <h3>Auch in Ihrer Nähe</h3>
          <p>Alltagsbegleitung bieten wir auch in diesen Städten an:</p>
          <ul className="info-list">
            {city.nachbarn.map((slug) => (
              <li key={slug}><Link href={`/alltagsbegleitung/${slug}`}>Alltagsbegleitung {cities[slug].name}</Link></li>
            ))}
          </ul>
        </section>

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
