import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

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
  geo: { latitude: number; longitude: number }
  // Lokale, trägerneutrale Pflegeberatung — mit Präposition („beim/bei der …")
  beratung: string
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
    geo: { latitude: 50.1109, longitude: 8.6821 },
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    plz: '63065',
    description: 'Offenbach am Main und Umgebung',
    landmarks: ['Sana Klinikum Offenbach', 'Klinikum Offenbach', 'MVZ Offenbach'],
    geo: { latitude: 50.0956, longitude: 8.7761 },
    beratung: 'beim Pflegestützpunkt Offenbach',
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    plz: '65183',
    description: 'Wiesbaden und dem Rheingau',
    landmarks: ['HSK Wiesbaden', 'St. Josefs-Hospital', 'Asklepios Paulinen Klinik'],
    geo: { latitude: 50.0782, longitude: 8.2398 },
    beratung: 'beim Pflegestützpunkt Wiesbaden',
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    plz: '64283',
    description: 'Darmstadt und Südhessen',
    landmarks: ['Klinikum Darmstadt', 'Alice-Hospital', 'Elisabethenstift'],
    geo: { latitude: 49.8728, longitude: 8.6512 },
    beratung: 'beim Pflegestützpunkt Darmstadt',
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    plz: '63450',
    description: 'Hanau und dem Main-Kinzig-Kreis',
    landmarks: ['Klinikum Hanau', 'St. Vinzenz-Krankenhaus', 'Main-Kinzig-Kliniken'],
    geo: { latitude: 50.1328, longitude: 8.9169 },
    beratung: 'beim Pflegestützpunkt des Main-Kinzig-Kreises',
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    plz: '61348',
    description: 'Bad Homburg und dem Hochtaunuskreis',
    landmarks: ['Hochtaunus-Kliniken', 'Kerckhoff-Klinik', 'Kurpark-Klinik'],
    geo: { latitude: 50.2268, longitude: 8.6182 },
    beratung: 'beim Pflegestützpunkt Hochtaunuskreis in Bad Homburg',
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    plz: '55116',
    description: 'Mainz und Rheinhessen',
    landmarks: ['Universitätsmedizin Mainz', 'Katholisches Klinikum Mainz', 'GPR Klinikum Rüsselsheim'],
    geo: { latitude: 49.9929, longitude: 8.2473 },
    beratung: 'bei den Pflegestützpunkten in Mainz',
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    plz: '63739',
    description: 'Aschaffenburg und dem Bayerischen Untermain',
    landmarks: ['Klinikum Aschaffenburg-Alzenau', 'Hofgartenklinik', 'Frauenklinik am Hasenkopf'],
    geo: { latitude: 49.9769, longitude: 9.1582 },
    beratung: 'beim Pflegestützpunkt für Stadt und Landkreis Aschaffenburg',
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    plz: '65929',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
    landmarks: ['Klinikum Frankfurt Höchst', 'Bürgerhospital', 'Uniklinik Frankfurt'],
    geo: { latitude: 50.1006, longitude: 8.5455 },
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    plz: '63263',
    description: 'Neu-Isenburg und Dreieich',
    landmarks: ['Asklepios Klinik Langen', 'Bürgerhospital Dreieich', 'Klinikum Frankfurt Sachsenhausen'],
    geo: { latitude: 50.0483, longitude: 8.6942 },
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    plz: '61169',
    description: 'Friedberg und der Wetterau',
    landmarks: ['Bürgerhospital Friedberg', 'Hochwaldkrankenhaus Bad Nauheim', 'Kerckhoff-Klinik Bad Nauheim'],
    geo: { latitude: 50.3378, longitude: 8.7554 },
    beratung: 'beim Pflegestützpunkt Wetteraukreis in Friedberg',
  },
  rodgau: {
    name: 'Rodgau',
    region: 'Hessen',
    slug: 'rodgau',
    plz: '63110',
    description: 'Rodgau und dem Kreis Offenbach',
    landmarks: ['Asklepios Klinik Seligenstadt', 'Sana Klinikum Offenbach', 'Klinikum Hanau'],
    geo: { latitude: 50.0333, longitude: 8.8833 },
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  giessen: {
    name: 'Gießen',
    region: 'Hessen',
    slug: 'giessen',
    plz: '35390',
    description: 'Gießen und Mittelhessen',
    landmarks: ['Universitätsklinikum Gießen (UKGM)', 'Evangelisches Krankenhaus Mittelhessen', 'Vitos Klinikum Gießen-Marburg'],
    geo: { latitude: 50.5841, longitude: 8.6784 },
    beratung: 'beim Pflegestützpunkt Gießen für Stadt und Landkreis',
  },
  marburg: {
    name: 'Marburg',
    region: 'Hessen',
    slug: 'marburg',
    plz: '35037',
    description: 'Marburg und dem Landkreis Marburg-Biedenkopf',
    landmarks: ['Universitätsklinikum Marburg (UKGM)', 'Diakonie-Krankenhaus Marburg-Wehrda'],
    geo: { latitude: 50.809, longitude: 8.771 },
    beratung: 'beim Pflegestützpunkt Marburg-Biedenkopf',
  },
  kassel: {
    name: 'Kassel',
    region: 'Hessen',
    slug: 'kassel',
    plz: '34117',
    description: 'Kassel und Nordhessen',
    landmarks: ['Klinikum Kassel', 'Marienkrankenhaus Kassel', 'AGAPLESION Diakonie Kliniken Kassel', 'Elisabeth-Krankenhaus Kassel'],
    geo: { latitude: 51.3127, longitude: 9.4797 },
    beratung: 'beim Pflegestützpunkt Region Kassel',
  },
  fulda: {
    name: 'Fulda',
    region: 'Hessen',
    slug: 'fulda',
    plz: '36037',
    description: 'Fulda und Osthessen',
    landmarks: ['Klinikum Fulda', 'Herz-Jesu-Krankenhaus Fulda'],
    geo: { latitude: 50.5558, longitude: 9.6808 },
    beratung: 'beim Pflegestützpunkt Fulda',
  },
  limburg: {
    name: 'Limburg an der Lahn',
    region: 'Hessen',
    slug: 'limburg',
    plz: '65549',
    description: 'Limburg an der Lahn und dem Landkreis Limburg-Weilburg',
    landmarks: ['St. Vincenz-Krankenhaus Limburg'],
    geo: { latitude: 50.3836, longitude: 8.0503 },
    beratung: 'beim Pflegestützpunkt Limburg-Weilburg',
  },
  koeln: {
    name: 'Köln',
    region: 'Nordrhein-Westfalen',
    slug: 'koeln',
    plz: '50667',
    description: 'Köln und dem gesamten Stadtgebiet',
    landmarks: ['Uniklinik Köln', 'Krankenhaus Köln-Merheim', 'St. Marien-Hospital Köln', 'Eduardus-Krankenhaus'],
    geo: { latitude: 50.9375, longitude: 6.9603 },
    beratung: 'bei der Pflegeberatung der Stadt Köln',
  },
  duesseldorf: {
    name: 'Düsseldorf',
    region: 'Nordrhein-Westfalen',
    slug: 'duesseldorf',
    plz: '40213',
    description: 'Düsseldorf und dem gesamten Stadtgebiet',
    landmarks: ['Universitätsklinikum Düsseldorf', 'Florence-Nightingale-Krankenhaus', 'Marien Hospital Düsseldorf', 'Evangelisches Krankenhaus Düsseldorf'],
    geo: { latitude: 51.2277, longitude: 6.7735 },
    beratung: 'bei den Pflegebüros der Landeshauptstadt Düsseldorf',
  },
  essen: {
    name: 'Essen',
    region: 'Nordrhein-Westfalen',
    slug: 'essen',
    plz: '45127',
    description: 'Essen und dem mittleren Ruhrgebiet',
    landmarks: ['Universitätsklinikum Essen', 'Alfried Krupp Krankenhaus', 'Elisabeth-Krankenhaus Essen', 'Kliniken Essen-Mitte'],
    geo: { latitude: 51.4556, longitude: 7.0116 },
    beratung: 'bei der Pflegeberatung der Stadt Essen',
  },
  dortmund: {
    name: 'Dortmund',
    region: 'Nordrhein-Westfalen',
    slug: 'dortmund',
    plz: '44135',
    description: 'Dortmund und dem östlichen Ruhrgebiet',
    landmarks: ['Klinikum Dortmund', 'St.-Johannes-Hospital Dortmund', 'Knappschaftskrankenhaus Dortmund', 'Hüttenhospital Dortmund'],
    geo: { latitude: 51.5136, longitude: 7.4653 },
    beratung: 'bei der Pflege- und Wohnberatung Dortmund',
  },
  bonn: {
    name: 'Bonn',
    region: 'Nordrhein-Westfalen',
    slug: 'bonn',
    plz: '53111',
    description: 'Bonn und dem Rhein-Sieg-Kreis',
    landmarks: ['Universitätsklinikum Bonn', 'Johanniter-Krankenhaus Bonn', 'GFO Kliniken Bonn', 'Helios Klinikum Bonn/Rhein-Sieg'],
    geo: { latitude: 50.7374, longitude: 7.0982 },
    beratung: 'bei der Pflegeberatung der Bundesstadt Bonn',
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
    title: `Krankenfahrt ${city.name} buchen`,
    description: `Krankenfahrt ${city.name}: Arzt-, Dialyse- & Klinikfahrten. Mit Verordnung zahlt die Kasse (§60 SGB V). Jetzt pünktliche Fahrt buchen!`,
    keywords: [
      `Krankenfahrt ${city.name}`,
      `Krankenfahrten ${city.name}`,
      `Krankenfahrt buchen ${city.name}`,
      `Krankenfahrt bestellen ${city.name}`,
      `Patientenfahrdienst ${city.name}`,
      'Krankenfahrt Verordnung',
      '§60 SGB V',
      `Krankentransport ${city.name}`,
      'Krankentransport Kostenübernahme',
      `Dialysefahrt ${city.name}`,
      `Arztfahrt ${city.name}`,
      `Arztfahrt Senioren ${city.name}`,
      'Krankenfahrt Krankenkasse',
      `Fahrdienst ${city.name}`,
      `Alltagsbegleitung ${city.name}`,
      `Pflegebox ${city.name}`,
      'Entlastungsbetrag',
      'Arztbegleitung Senioren',
    ],
    openGraph: {
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
      title: `Krankenfahrt ${city.name} — zuverlässig zum Arzt | Alltagsengel`,
      description: `Krankenfahrten in ${city.name} buchen. Mit Kassenverordnung (§60 SGB V) oder als Selbstzahler. Pünktlich, sicher, freundlich.`,
      // og:url muss dem Canonical entsprechen (Frankfurt → Hauptseite)
      url:
        city.slug === 'frankfurt'
          ? 'https://alltagsengel.care/krankenfahrten'
          : `https://alltagsengel.care/krankenfahrten/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    // Frankfurt kanonisiert auf die Hauptseite (Kannibalisierung vermeiden);
    // alle anderen Städte (inkl. frankfurt-hoechst) bleiben self-canonical.
    alternates: {
      canonical:
        city.slug === 'frankfurt'
          ? 'https://alltagsengel.care/krankenfahrten'
          : `https://alltagsengel.care/krankenfahrten/${city.slug}`,
    },
  }
}

// EIN Array pro Stadt für sichtbare FAQ-Sektion UND FAQPage-Schema — beides muss aus
// derselben Quelle kommen (Google-Richtlinie: nur sichtbar gerenderte FAQs auszeichnen).
function buildFaqs(city: CityData): { q: string; a: string }[] {
  return [
    {
      q: `Wie buche ich eine Krankenfahrt in ${city.name}?`,
      a: `Registrieren Sie sich bei Alltagsengel, wählen Sie "Krankenfahrt" und geben Sie Start- und Zieladresse in ${city.name} ein. Sie erhalten sofort ein Angebot.`,
    },
    {
      q: 'Wer zahlt die Krankenfahrt?',
      a: 'Mit einer ärztlichen Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V. Ohne Verordnung können Sie als Selbstzahler buchen.',
    },
    {
      q: `Welche Kliniken in ${city.name} werden angefahren?`,
      a: `Wir fahren alle Kliniken und Arztpraxen in ${city.name} an, darunter ${city.landmarks.join(', ')}.`,
    },
    {
      q: 'Brauche ich eine Verordnung für die Krankenfahrt?',
      a: 'Für die Kostenübernahme durch die Krankenkasse ja. Bei Serienbehandlungen (Dialyse, Chemotherapie, Bestrahlung) mit Pflegegrad 3+ wird die Verordnung oft genehmigt. Ohne Verordnung fahren wir Sie gerne als Selbstzahler.',
    },
    {
      q: 'Wie schnell kann ich eine Fahrt buchen?',
      a: 'In der Regel können wir Fahrten innerhalb von 24 Stunden vermitteln. Für regelmäßige Fahrten (z.B. Dialyse) legen wir einen Serienplan an.',
    },
    {
      q: 'Fahren Sie auch am Wochenende?',
      a: `Ja, wir vermitteln Krankenfahrten in ${city.name} auch samstags und an Feiertagen — mit geringem Zuschlag.`,
    },
    {
      q: 'Kann eine Begleitperson mitfahren?',
      a: 'Ja, eine Begleitperson kann in den meisten Fällen kostenlos mitfahren. Bitte geben Sie dies bei der Buchung an.',
    },
    {
      q: 'Brauche ich die Verordnung vor der Buchung?',
      a: 'Idealerweise ja. Sie können aber auch vorab buchen und die Verordnung nachreichen. Ohne Verordnung fahren wir als Selbstzahler.',
    },
    {
      q: `Wo finde ich unabhängige Pflegeberatung in ${city.name}?`,
      a: `Trägerneutrale und kostenlose Beratung zu Pflegeleistungen und zur Kostenübernahme von Krankenfahrten erhalten Sie ${city.beratung} sowie bei Ihrer Kranken- und Pflegekasse. Auch wir beraten Sie kostenlos, ob Ihre Fahrt verordnungsfähig ist.`,
    },
    {
      q: `Kann mich ein Alltagsbegleiter zum Arzt in ${city.name} begleiten?`,
      a: `Ja. Unsere Alltagsbegleiter in ${city.name} begleiten Sie in die Praxis, warten mit Ihnen und helfen beim Gespräch mit dem Arzt. Diese Arztbegleitung können Sie über den Entlastungsbetrag (131 €/Monat nach §45b SGB XI) finanzieren — die Fahrt selbst läuft mit Verordnung über die Krankenkasse.`,
    },
  ]
}

function buildJsonLd(city: CityData, faqs: { q: string; a: string }[]) {
  // Frankfurt kanonisiert auf die Hauptseite — Schema-URLs folgen dem Canonical.
  const canonicalUrl =
    city.slug === 'frankfurt'
      ? 'https://alltagsengel.care/krankenfahrten'
      : `https://alltagsengel.care/krankenfahrten/${city.slug}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Speakable: Hero-Titel + -Untertitel für Sprachassistenten & AI-Crawler
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.info-hero-title', '.info-hero-sub'],
        },
      },
      {
        '@type': 'HowTo',
        name: `Krankenfahrt in ${city.name} buchen`,
        description: `So bestellen Sie eine Krankenfahrt in ${city.name} über Alltagsengel — mit Verordnung (Krankenkasse zahlt nach §60 SGB V) oder als Selbstzahler.`,
        totalTime: 'PT2M',
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Kostenlos registrieren', text: 'Erstellen Sie ein kostenloses Konto bei Alltagsengel in der App oder auf alltagsengel.care.', url: 'https://alltagsengel.care/auth/register' },
          { '@type': 'HowToStep', position: 2, name: 'Adresse und Termin angeben', text: `Geben Sie Start- und Zieladresse in ${city.name} sowie Datum und Uhrzeit ein.` },
          { '@type': 'HowToStep', position: 3, name: 'Fahrtart wählen', text: 'Wählen Sie sitzend, Rollstuhl oder Tragestuhl — der passende Fahrzeugtyp wird automatisch ausgewählt.' },
          { '@type': 'HowToStep', position: 4, name: 'Bestätigung erhalten', text: 'Wir bestätigen die Fahrt. Die Abrechnung läuft über die Krankenkasse (mit Verordnung) oder als Selbstzahler.' },
        ],
      },
      {
        '@type': 'Service',
        name: `Krankenfahrt ${city.name}`,
        description: `Krankenfahrten in ${city.name}. Sichere und pünktliche Fahrten zu Arzt, Klinik, Dialyse und Therapie. Mit ärztlicher Verordnung über die Krankenkasse abrechenbar (§60 SGB V).`,
        image: 'https://alltagsengel.care/og-image.png',
        provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
        areaServed: {
          '@type': 'City',
          name: city.name,
          geo: {
            '@type': 'GeoCoordinates',
            latitude: city.geo.latitude,
            longitude: city.geo.longitude,
          },
        },
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
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      // BreadcrumbList kommt aus <BreadcrumbSchema> (Schema + sichtbare Nav) —
      // hier NICHT duplizieren, sonst zwei widersprüchliche Markups pro Seite.
    ],
  }
}

export default async function KrankenfahrtStadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const faqs = buildFaqs(city)
  const jsonLd = buildJsonLd(city, faqs)
  // Frankfurt kanonisiert bei Alltagsbegleitung NICHT (self-canonical), bei
  // Pflegebox auf die Root-Seite — interne Links folgen dem jeweiligen Canonical.
  const alltagsbegleitungHref = `/alltagsbegleitung/${city.slug}`
  const pflegeboxHref = city.slug === 'frankfurt' ? '/hygienebox' : `/hygienebox/${city.slug}`

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Krankenfahrten', url: '/krankenfahrten' }, { name: city.name }]} />
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
          <h3>Krankenfahrt oder Krankentransport — was brauchen Sie?</h3>
          <p>
            Wer im normalen Auto sitzen kann, braucht eine <strong>Krankenfahrt</strong> — genau
            das vermittelt Alltagsengel in {city.name}. Ein <strong>qualifizierter
            Krankentransport</strong> (KTW) ist nur nötig, wenn unterwegs medizinisch-fachliche
            Betreuung oder eine liegende Beförderung erforderlich ist; die{' '}
            <strong>Rettungsfahrt</strong> läuft ausschließlich über die 112. Für die
            Kostenübernahme gilt in allen Fällen §60 SGB V — entscheidend ist, welches
            Beförderungsmittel der Arzt auf dem Muster 4 ankreuzt. Die ausführliche{' '}
            <Link href="/krankenfahrten">Vergleichstabelle Krankenfahrt vs. Krankentransport vs.
            Rettungsfahrt</Link> finden Sie auf unserer Übersichtsseite.
          </p>
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
          <h3>So kommen Sie an die Verordnung (Muster 4)</h3>
          <p>
            Die Verordnung einer Krankenbeförderung — das sogenannte <strong>Muster 4</strong> —
            stellt Ihr behandelnder Arzt aus. Sprechen Sie ihn direkt beim Termin darauf an oder
            lassen Sie sich das Formular von der Praxis vorbereiten. Bei Serienbehandlungen wie
            Dialyse, Chemotherapie oder Bestrahlung gilt eine Verordnung für die gesamte
            Behandlungsserie; mit Pflegegrad 4 oder 5 sowie den Merkzeichen aG, Bl oder H gelten
            Fahrten zu ambulanten Behandlungen generell als genehmigt. Bei Pflegegrad 3 muss
            zusätzlich eine dauerhafte Mobilitätseinschränkung vorliegen.
          </p>
          <p style={{ marginTop: 8 }}>
            Unsicher, ob Ihre Fahrt in {city.name} verordnungsfähig ist? Rufen Sie uns an — wir
            klären das vorab kostenlos mit Ihnen und erklären den Weg zur Genehmigung durch die
            Krankenkasse.
          </p>
        </section>

        <section className="info-card">
          <h3>Serienfahrten: Dialyse, Chemo &amp; Reha in {city.name}</h3>
          <p>
            Wer regelmäßig behandelt wird, braucht Verlässlichkeit: Für Dialyse-Patienten und
            onkologische Behandlungen legen wir in {city.name} feste Serienpläne an — gleiche
            Abholzeit, möglichst derselbe Fahrer, automatische Terminverwaltung. Verschiebt sich
            ein Behandlungstermin, passen wir die Fahrt einfach an. So müssen weder Sie noch Ihre
            Angehörigen jede einzelne Fahrt neu organisieren, und die Abrechnung mit der
            Krankenkasse läuft für die gesamte Serie über uns.
          </p>
        </section>

        <section className="info-card">
          <h3>Arztbegleitung statt nur Fahrt: Alltagsbegleitung in {city.name}</h3>
          <p>
            Viele unserer Kunden in {city.name} kombinieren die Krankenfahrt mit einer
            <strong> Arztbegleitung durch einen Alltagsbegleiter</strong>: Der Engel holt Sie zu Hause
            ab, begleitet Sie in die Praxis, wartet mit Ihnen und bringt Sie sicher zurück. Diese
            Begleitung finanzieren Sie über den <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> —
            131 €/Monat, die jeder Person mit Pflegegrad 1–5 nach §45b SGB XI zustehen. Fällt Ihre
            pflegende Person aus, greift zusätzlich die{' '}
            <Link href="/verhinderungspflege">Verhinderungspflege</Link> mit bis zu 3.539 €/Jahr.
          </p>
        </section>

        <section className="info-card">
          <h3>Darauf können Sie sich verlassen</h3>
          <ul className="info-list">
            <li>Pünktliche Abholung an der Haustür — inklusive Hilfe beim Ein- und Aussteigen</li>
            <li>Geprüfte, freundliche Fahrer mit Erfahrung im Patiententransport</li>
            <li>Begleitung bis zur Anmeldung in Praxis oder Klinik auf Wunsch</li>
            <li>Rückfahrt flexibel — wir warten oder holen Sie nach der Behandlung wieder ab</li>
            <li>Transparente Preise ohne versteckte Kosten, Abrechnung direkt mit der Kasse</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Pflegeberatung vor Ort in {city.name}</h3>
          <p>
            Fragen zur Kostenübernahme, zum Pflegegrad oder zu weiteren Leistungen der Pflege-
            und Krankenkasse? Trägerneutrale und kostenlose Beratung erhalten Sie {city.beratung}{' '}
            sowie direkt bei Ihrer Kasse. Dort bekommen Sie auch Unterstützung, wenn eine
            Verordnung abgelehnt wurde und Sie Widerspruch einlegen möchten.
          </p>
          <p style={{ marginTop: 8 }}>
            Ergänzend prüfen wir kostenlos mit Ihnen, ob Ihre Fahrt in {city.name} verordnungsfähig
            ist, und erklären Schritt für Schritt den Weg zum Muster 4 — damit die Krankenkasse
            die Kosten nach §60 SGB V übernimmt und Sie nur die gesetzliche Zuzahlung tragen.
          </p>
        </section>

        <section className="info-card">
          <h3>Gut vorbereitet: Checkliste für Ihre Krankenfahrt in {city.name}</h3>
          <ul className="info-list">
            <li>Verordnung (Muster 4) und Versichertenkarte bereitlegen</li>
            <li>Einweisungs- oder Terminunterlagen der Klinik bzw. Praxis mitnehmen</li>
            <li>Bei Rollstuhl oder Rollator: Hilfsmittel bei der Buchung angeben</li>
            <li>Begleitperson anmelden — sie fährt in der Regel kostenlos mit</li>
            <li>Rückfahrt gleich mitplanen: Wir warten oder holen Sie nach der Behandlung ab</li>
            <li>Bei Serienterminen (Dialyse, Chemo): einmal buchen, wir übernehmen den Serienplan</li>
          </ul>
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
          {faqs.map((f) => (
            <details key={f.q} className="info-faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <p>Neben Krankenfahrten bieten wir in {city.name} auch:</p>
          <ul className="info-list">
            <li><Link href={alltagsbegleitungHref}>Alltagsbegleitung in {city.name}</Link> — 131 €/Monat über Entlastungsbetrag</li>
            <li><Link href={pflegeboxHref}>Pflegebox für {city.name}</Link> — Kostenlose Pflegehilfsmittel (42 €/Monat)</li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege</Link> — Ersatzpflege bis 3.539 €/Jahr (§39 SGB XI)</li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag</Link> — 131 €/Monat ab Pflegegrad 1 (§45b SGB XI)</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Ratgeber zum Weiterlesen:{' '}
            <Link href="/blog/krankenfahrt-beantragen">Krankenfahrt beantragen</Link>,{' '}
            <Link href="/blog/zuzahlung-krankenfahrt">Zuzahlung bei Krankenfahrten</Link> und{' '}
            <Link href="/blog/krankenfahrt-kostenuebernahme">Wann zahlt die Krankenkasse?</Link>
          </p>
        </section>

        <section className="info-card">
          <h3>Auch in Ihrer Nähe</h3>
          <p>Krankenfahrten bieten wir auch in diesen Städten an:</p>
          <ul className="info-list">
            {Object.values(cities)
              .filter((c) => c.slug !== city.slug)
              .map((c) => (
                <li key={c.slug}><Link href={`/krankenfahrten/${c.slug}`}>Krankenfahrt {c.name}</Link></li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
