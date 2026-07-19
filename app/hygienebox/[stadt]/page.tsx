import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import SpeakableSchema from '@/components/SpeakableSchema'

// ═══════════════════════════════════════════════════════════
// City-specific Pflegebox pages for Rhein-Main area
// ═══════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  plz: string
  description: string
  stadtteile: string[] // reale Stadtteile fürs Liefergebiet (sichtbar + FAQ)
  geo: { lat: number; lng: number } // Stadtzentrum für GeoCoordinates im JSON-LD
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
    stadtteile: ['Bockenheim', 'Bornheim', 'Sachsenhausen', 'Nordend', 'Gallus', 'Höchst'],
    geo: { lat: 50.1109, lng: 8.6821 },
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    plz: '63065',
    description: 'Offenbach am Main und Umgebung',
    stadtteile: ['Bieber', 'Bürgel', 'Rumpenheim', 'Lauterborn', 'Tempelsee'],
    geo: { lat: 50.0956, lng: 8.7761 },
    beratung: 'beim Pflegestützpunkt Offenbach',
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    plz: '65183',
    description: 'Wiesbaden und dem Rheingau',
    stadtteile: ['Biebrich', 'Dotzheim', 'Schierstein', 'Sonnenberg', 'Bierstadt'],
    geo: { lat: 50.0782, lng: 8.2398 },
    beratung: 'beim Pflegestützpunkt Wiesbaden',
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    plz: '64283',
    description: 'Darmstadt und Südhessen',
    stadtteile: ['Arheilgen', 'Eberstadt', 'Bessungen', 'Kranichstein', 'Wixhausen'],
    geo: { lat: 49.8728, lng: 8.6512 },
    beratung: 'beim Pflegestützpunkt Darmstadt',
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    plz: '63450',
    description: 'Hanau und dem Main-Kinzig-Kreis',
    stadtteile: ['Steinheim', 'Großauheim', 'Kesselstadt', 'Klein-Auheim', 'Mittelbuchen'],
    geo: { lat: 50.1264, lng: 8.928 },
    beratung: 'beim Pflegestützpunkt des Main-Kinzig-Kreises',
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    plz: '61348',
    description: 'Bad Homburg und dem Hochtaunuskreis',
    stadtteile: ['Gonzenheim', 'Kirdorf', 'Ober-Erlenbach', 'Ober-Eschbach', 'Dornholzhausen'],
    geo: { lat: 50.2268, lng: 8.6182 },
    beratung: 'beim Pflegestützpunkt Hochtaunuskreis in Bad Homburg',
  },
  mainz: {
    name: 'Mainz',
    region: 'Rheinland-Pfalz',
    slug: 'mainz',
    plz: '55116',
    description: 'Mainz und Rheinhessen',
    stadtteile: ['Gonsenheim', 'Bretzenheim', 'Mombach', 'Hechtsheim', 'Weisenau'],
    geo: { lat: 49.9929, lng: 8.2473 },
    beratung: 'bei den Pflegestützpunkten in Mainz',
  },
  aschaffenburg: {
    name: 'Aschaffenburg',
    region: 'Bayern',
    slug: 'aschaffenburg',
    plz: '63739',
    description: 'Aschaffenburg und dem Bayerischen Untermain',
    stadtteile: ['Damm', 'Leider', 'Nilkheim', 'Schweinheim', 'Obernau'],
    geo: { lat: 49.9769, lng: 9.1582 },
    beratung: 'beim Pflegestützpunkt für Stadt und Landkreis Aschaffenburg',
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    plz: '63263',
    description: 'Neu-Isenburg und Dreieich',
    stadtteile: ['Stadtmitte', 'Gravenbruch', 'Zeppelinheim'],
    geo: { lat: 50.0483, lng: 8.6942 },
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  'friedberg-wetterau': {
    name: 'Friedberg (Wetterau)',
    region: 'Hessen',
    slug: 'friedberg-wetterau',
    plz: '61169',
    description: 'Friedberg und der Wetterau',
    stadtteile: ['Bauernheim', 'Bruchenbrücken', 'Dorheim', 'Ockstadt', 'Ossenheim'],
    geo: { lat: 50.3353, lng: 8.7548 },
    beratung: 'beim Pflegestützpunkt Wetteraukreis in Friedberg',
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    plz: '65929',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
    stadtteile: ['Nied', 'Sindlingen', 'Unterliederbach', 'Zeilsheim', 'Sossenheim'],
    geo: { lat: 50.0996, lng: 8.543 },
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  rodgau: {
    name: 'Rodgau',
    region: 'Hessen',
    slug: 'rodgau',
    plz: '63110',
    description: 'Rodgau und dem Kreis Offenbach',
    stadtteile: ['Jügesheim', 'Nieder-Roden', 'Dudenhofen', 'Hainhausen', 'Weiskirchen'],
    geo: { lat: 50.0247, lng: 8.8853 },
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  giessen: {
    name: 'Gießen',
    region: 'Hessen',
    slug: 'giessen',
    plz: '35390',
    description: 'Gießen und Mittelhessen',
    stadtteile: ['Wieseck', 'Klein-Linden', 'Rödgen', 'Lützellinden', 'Allendorf'],
    geo: { lat: 50.5841, lng: 8.6784 },
    beratung: 'beim Pflegestützpunkt Gießen für Stadt und Landkreis',
  },
  marburg: {
    name: 'Marburg',
    region: 'Hessen',
    slug: 'marburg',
    plz: '35037',
    description: 'Marburg und dem Landkreis Marburg-Biedenkopf',
    stadtteile: ['Wehrda', 'Cappel', 'Marbach', 'Ockershausen', 'Richtsberg'],
    geo: { lat: 50.809, lng: 8.771 },
    beratung: 'beim Pflegestützpunkt Marburg-Biedenkopf',
  },
  kassel: {
    name: 'Kassel',
    region: 'Hessen',
    slug: 'kassel',
    plz: '34117',
    description: 'Kassel und Nordhessen',
    stadtteile: ['Wehlheiden', 'Kirchditmold', 'Bad Wilhelmshöhe', 'Bettenhausen', 'Harleshausen', 'Niederzwehren'],
    geo: { lat: 51.3127, lng: 9.4797 },
    beratung: 'beim Pflegestützpunkt Region Kassel',
  },
  fulda: {
    name: 'Fulda',
    region: 'Hessen',
    slug: 'fulda',
    plz: '36037',
    description: 'Fulda und Osthessen',
    stadtteile: ['Horas', 'Neuenberg', 'Aschenberg', 'Kohlhaus', 'Lehnerz'],
    geo: { lat: 50.5558, lng: 9.6808 },
    beratung: 'beim Pflegestützpunkt Fulda',
  },
  limburg: {
    name: 'Limburg an der Lahn',
    region: 'Hessen',
    slug: 'limburg',
    plz: '65549',
    description: 'Limburg an der Lahn und dem Landkreis Limburg-Weilburg',
    stadtteile: ['Blumenrod', 'Staffel', 'Lindenholzhausen', 'Eschhofen', 'Offheim'],
    geo: { lat: 50.3836, lng: 8.0503 },
    beratung: 'beim Pflegestützpunkt Limburg-Weilburg',
  },
  koeln: {
    name: 'Köln',
    region: 'Nordrhein-Westfalen',
    slug: 'koeln',
    plz: '50667',
    description: 'Köln und dem gesamten Stadtgebiet',
    stadtteile: ['Ehrenfeld', 'Nippes', 'Lindenthal', 'Mülheim', 'Rodenkirchen', 'Porz'],
    geo: { lat: 50.9375, lng: 6.9603 },
    beratung: 'bei der Pflegeberatung der Stadt Köln',
  },
  duesseldorf: {
    name: 'Düsseldorf',
    region: 'Nordrhein-Westfalen',
    slug: 'duesseldorf',
    plz: '40213',
    description: 'Düsseldorf und dem gesamten Stadtgebiet',
    stadtteile: ['Bilk', 'Derendorf', 'Benrath', 'Gerresheim', 'Oberkassel', 'Eller'],
    geo: { lat: 51.2277, lng: 6.7735 },
    beratung: 'bei den Pflegebüros der Landeshauptstadt Düsseldorf',
  },
  essen: {
    name: 'Essen',
    region: 'Nordrhein-Westfalen',
    slug: 'essen',
    plz: '45127',
    description: 'Essen und dem mittleren Ruhrgebiet',
    stadtteile: ['Rüttenscheid', 'Borbeck', 'Steele', 'Altenessen', 'Werden', 'Kettwig'],
    geo: { lat: 51.4556, lng: 7.0116 },
    beratung: 'bei der Pflegeberatung der Stadt Essen',
  },
  dortmund: {
    name: 'Dortmund',
    region: 'Nordrhein-Westfalen',
    slug: 'dortmund',
    plz: '44135',
    description: 'Dortmund und dem östlichen Ruhrgebiet',
    stadtteile: ['Hörde', 'Hombruch', 'Aplerbeck', 'Brackel', 'Eving', 'Mengede'],
    geo: { lat: 51.5136, lng: 7.4653 },
    beratung: 'bei der Pflege- und Wohnberatung Dortmund',
  },
  bonn: {
    name: 'Bonn',
    region: 'Nordrhein-Westfalen',
    slug: 'bonn',
    plz: '53111',
    description: 'Bonn und dem Rhein-Sieg-Kreis',
    stadtteile: ['Bad Godesberg', 'Beuel', 'Poppelsdorf', 'Duisdorf', 'Endenich'],
    geo: { lat: 50.7374, lng: 7.0982 },
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

  // Frankfurt kanonisiert auf die Hauptseite /hygienebox — vermeidet Keyword-Kannibalisierung
  const canonical = city.slug === 'frankfurt'
    ? 'https://alltagsengel.care/hygienebox'
    : `https://alltagsengel.care/hygienebox/${city.slug}`

  return {
    title: `Pflegebox ${city.name} — 0 € Zuzahlung`,
    description: `Kostenlose Pflegebox nach ${city.name}: Handschuhe, Desinfektion, Bettschutz (§40 SGB XI). Bis 42 €/Monat von der Kasse, 0 € Zuzahlung. Jetzt bestellen!`,
    keywords: [
      `Pflegebox ${city.name}`,
      `Pflegehilfsmittel ${city.name}`,
      'Pflegebox bestellen',
      '§40 SGB XI',
      'Pflegebox kostenlos',
      `Hygienebox ${city.name}`,
      '42 Euro Pflegekasse',
      'Pflegehilfsmittel zum Verbrauch',
      `Pflegebox Lieferung ${city.name}`,
      'Einmalhandschuhe Pflege',
      `Alltagsbegleitung ${city.name}`,
      `Krankenfahrt ${city.name}`,
      'Entlastungsbetrag',
      'Pflegeboxen',
    ],
    openGraph: {
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
      title: `Kostenlose Pflegebox ${city.name} — 42€/Monat | Alltagsengel`,
      description: `Pflegehilfsmittel monatlich nach ${city.name} geliefert. 0€ Zuzahlung bei Pflegegrad 1-5. Handschuhe, Desinfektion, Bettschutz.`,
      url: canonical,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    alternates: { canonical },
  }
}

// Ein gemeinsames FAQ-Array pro Stadt — speist das sichtbare FAQ UND das FAQPage-JSON-LD
function buildFaqItems(city: CityData) {
  return [
    {
      frage: `Kann ich eine Pflegebox nach ${city.name} liefern lassen?`,
      antwort: `Ja! Alltagsengel liefert die Pflegebox direkt zu Ihnen nach ${city.name} — auch nach ${city.stadtteile.join(', ')}. Monatlich, kostenlos und ohne Zuzahlung bei anerkanntem Pflegegrad.`,
    },
    {
      frage: 'Wer hat Anspruch auf eine Pflegebox?',
      antwort: 'Jede Person mit anerkanntem Pflegegrad (1–5), die zu Hause gepflegt wird, hat Anspruch auf Pflegehilfsmittel zum Verbrauch im Wert von bis zu 42 € pro Monat nach §40 SGB XI.',
    },
    {
      frage: 'Muss ich für die Pflegebox etwas bezahlen?',
      antwort: 'Nein. Die Pflegekasse übernimmt bis zu 42 € pro Monat für Pflegehilfsmittel zum Verbrauch. Bei Alltagsengel zahlen Sie 0 € Eigenanteil — wir rechnen direkt mit Ihrer Kasse ab.',
    },
    {
      frage: 'Was ist in der Pflegebox enthalten?',
      antwort: 'Die Pflegebox enthält Einmalhandschuhe, Händedesinfektionsmittel, Flächendesinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen — je nach gewählter Box-Variante.',
    },
    {
      frage: 'Wie lange dauert die Lieferung?',
      antwort: `Nach Genehmigung durch die Pflegekasse erhalten Sie Ihre erste Box innerhalb von 3–5 Werktagen nach ${city.name}.`,
    },
    {
      frage: 'Kann ich die Box jederzeit abbestellen?',
      antwort: 'Ja, Sie können die monatliche Lieferung jederzeit pausieren oder abbestellen — ohne Vertragsbindung.',
    },
    {
      frage: 'Was passiert, wenn mein Pflegegrad sich ändert?',
      antwort: 'Der Anspruch besteht bei jedem Pflegegrad (1–5). Nur wenn der Pflegegrad komplett entfällt, endet der Anspruch.',
    },
    {
      frage: 'Muss ich den Antrag selbst stellen?',
      antwort: 'Nein! Alltagsengel übernimmt die komplette Antragstellung bei Ihrer Pflegekasse. Sie müssen nur einmalig eine Vollmacht unterschreiben.',
    },
    {
      frage: `Wo finde ich unabhängige Pflegeberatung in ${city.name}?`,
      antwort: `Trägerneutrale und kostenlose Beratung zu Pflegehilfsmitteln, Pflegegrad und allen weiteren Leistungen erhalten Sie ${city.beratung} sowie bei Ihrer Pflegekasse. Auch wir beraten Sie kostenlos und übernehmen den kompletten Antrag nach §40 SGB XI.`,
    },
    {
      frage: 'Kann ich die Pflegebox mit Entlastungsbetrag und Verhinderungspflege kombinieren?',
      antwort: `Ja — es sind getrennte Budgets. Die Pflegebox läuft über §40 SGB XI (42 €/Monat), der Entlastungsbetrag über §45b (131 €/Monat für Alltagsbegleitung, ab Pflegegrad 1) und die Verhinderungspflege über §39 (bis 3.539 €/Jahr ab Pflegegrad 2). Alle drei können Sie in ${city.name} parallel über Alltagsengel nutzen.`,
    },
  ]
}

function buildJsonLd(city: CityData, faqItems: ReturnType<typeof buildFaqItems>) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: `Pflegebox ${city.name}`,
        description: `Monatliche Pflegehilfsmittel-Box nach §40 SGB XI, direkt nach ${city.name} geliefert. Enthält Einmalhandschuhe, Desinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen.`,
        image: [
          'https://alltagsengel.care/og-image.png',
          'https://alltagsengel.care/icon-512x512.png',
        ],
        brand: { '@type': 'Brand', name: 'Alltagsengel' },
        // sku: Pflicht-Identifier für Google Merchant Listings (gtin/mpn/sku) —
        // identisch zur Root-Seite /hygienebox (gleiches Produkt, alle Städte).
        sku: 'AE-HYGIENEBOX-001',
        offers: [
          {
            '@type': 'Offer',
            name: 'Basis-Box',
            sku: 'AE-HYGIENEBOX-BASIS-001',
            price: '29.90',
            priceCurrency: 'EUR',
            priceValidUntil: '2027-12-31',
            description: 'Grundversorgung mit Pflegehilfsmitteln',
            availability: 'https://schema.org/InStock',
            url: `https://alltagsengel.care/hygienebox/${city.slug}`,
            areaServed: { '@type': 'City', name: city.name },
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'DE',
              // merchantReturnDays nur bei FiniteReturnWindow zulässig
              returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
            },
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'EUR' },
              shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' },
              deliveryTime: {
                '@type': 'ShippingDeliveryTime',
                handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
                transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
              },
            },
          },
          {
            '@type': 'Offer',
            name: 'Komfort-Box',
            sku: 'AE-HYGIENEBOX-KOMFORT-001',
            price: '40.00',
            priceCurrency: 'EUR',
            priceValidUntil: '2027-12-31',
            description: 'Vollständige Versorgung — maximale Kassenerstattung (42€)',
            availability: 'https://schema.org/InStock',
            url: `https://alltagsengel.care/hygienebox/${city.slug}`,
            areaServed: { '@type': 'City', name: city.name },
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'DE',
              // merchantReturnDays nur bei FiniteReturnWindow zulässig
              returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
            },
            shippingDetails: {
              '@type': 'OfferShippingDetails',
              shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'EUR' },
              shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'DE' },
              deliveryTime: {
                '@type': 'ShippingDeliveryTime',
                handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
                transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
              },
            },
          },
        ],
        // areaServed ist keine gültige Product-Property — das Liefergebiet
        // (Stadt + Geo) hängt an den Offers und steht sichtbar im Text.
      },
      {
        '@type': 'Service',
        name: `Pflegebox-Versorgung ${city.name}`,
        description: `Monatliche Versorgung mit Pflegehilfsmitteln zum Verbrauch nach §40 SGB XI in ${city.name} — inklusive Antragstellung und Direktabrechnung mit der Pflegekasse.`,
        image: 'https://alltagsengel.care/og-image.png',
        provider: { '@id': 'https://alltagsengel.care/#localbusiness' },
        areaServed: {
          '@type': 'City',
          name: city.name,
          containedInPlace: { '@type': 'AdministrativeArea', name: city.region },
          geo: { '@type': 'GeoCoordinates', latitude: city.geo.lat, longitude: city.geo.lng },
        },
        serviceType: 'Pflegehilfsmittel-Versorgung §40 SGB XI',
        offers: {
          '@type': 'Offer',
          price: '0.00',
          priceCurrency: 'EUR',
          description: 'Bis 42 €/Monat übernimmt die Pflegekasse (§40 SGB XI) — 0 € Eigenanteil',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqItems.map((f) => ({
          '@type': 'Question',
          name: f.frage,
          acceptedAnswer: { '@type': 'Answer', text: f.antwort },
        })),
      },
      // BreadcrumbList kommt aus <BreadcrumbSchema> (Schema + sichtbare Nav) —
      // hier NICHT duplizieren, sonst zwei widersprüchliche Markups pro Seite.
    ],
  }
}

export default async function PflegeboxStadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const faqItems = buildFaqItems(city)
  const jsonLd = buildJsonLd(city, faqItems)
  // Frankfurt kanonisiert bei Krankenfahrten auf die Root-Seite; Alltagsbegleitung
  // ist überall self-canonical — interne Links folgen dem jeweiligen Canonical.
  const alltagsbegleitungHref = `/alltagsbegleitung/${city.slug}`
  const krankenfahrtHref = city.slug === 'frankfurt' ? '/krankenfahrten' : `/krankenfahrten/${city.slug}`

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SpeakableSchema url={city.slug === 'frankfurt' ? '/hygienebox' : `/hygienebox/${city.slug}`} />
      <BreadcrumbSchema items={[{ name: 'Pflegebox', url: '/hygienebox' }, { name: city.name }]} />
      <div className="legal-header">
        <Link href="/hygienebox" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Pflegebox {city.name}</h1>
      </div>
      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📦</div>
          <h2 className="info-hero-title">Kostenlose Pflegebox für {city.name}</h2>
          <p className="info-hero-sub">
            Pflegehilfsmittel monatlich nach {city.description} geliefert — 42 €/Monat von der Pflegekasse, 0 € Eigenanteil
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            {['✓ 0 € Eigenanteil', '✓ Kostenlos ab Pflegegrad 1', '✓ Antrag übernehmen wir', '✓ Jederzeit kündbar'].map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#E8C87E',
                  background: 'rgba(201,150,60,.1)', border: '1px solid rgba(201,150,60,.25)',
                  borderRadius: 999, padding: '6px 12px',
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="info-cta" style={{ marginTop: 4 }}>
          <a href="#bestellen" className="btn-gold" style={{ width: '100%' }}>JETZT PFLEGEBOX BESTELLEN</a>
          <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,.35)', marginTop: 8 }}>
            In 2 Minuten angefragt — ohne Registrierung, ohne Vertragsbindung
          </p>
        </div>

        <section className="info-card">
          <h3>Was ist die Pflegebox?</h3>
          <p>
            Die Pflegebox (auch Hygienebox) enthält Pflegehilfsmittel zum Verbrauch nach § 40 SGB XI.
            Jeder mit einem anerkannten Pflegegrad hat Anspruch auf bis zu 42 € monatlich für
            Verbrauchsmaterialien wie Handschuhe, Desinfektionsmittel und Bettschutz. Wir liefern
            direkt nach {city.name} — kostenlos und ohne Eigenanteil.
          </p>
        </section>

        <section className="info-card">
          <h3>Inhalt der Pflegebox</h3>
          <ul className="info-list">
            <li>Einmalhandschuhe (Latex- oder Nitril-frei)</li>
            <li>Händedesinfektionsmittel</li>
            <li>Flächendesinfektionsmittel</li>
            <li>Bettschutzeinlagen (Einmal-Unterlagen)</li>
            <li>Mundschutz (FFP2 oder OP-Masken)</li>
            <li>Einmal-Schutzschürzen</li>
          </ul>
          <p className="info-price-note">
            Sie können die Zusammenstellung Ihrer Box individuell anpassen — je nach Pflegesituation.
          </p>
        </section>

        <section className="info-card">
          <h3>Kosten &amp; Anspruch</h3>
          <div className="info-price-row">
            <span className="info-price-label">Kassenleistung (§ 40 SGB XI)</span>
            <span className="info-price-val">bis 42 €/Monat</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Ihr Eigenanteil</span>
            <span className="info-price-val">0 €</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Voraussetzung</span>
            <span className="info-price-val">Pflegegrad 1–5</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Lieferung nach {city.name}</span>
            <span className="info-price-val">kostenlos</span>
          </div>
          <p className="info-price-note">
            Seit 2022 beträgt die Pauschale für Pflegehilfsmittel zum Verbrauch 42 € pro Monat.
            Alltagsengel rechnet direkt mit Ihrer Pflegekasse ab — Sie haben keinerlei Aufwand
            und zahlen nichts aus eigener Tasche.
          </p>
        </section>

        <section className="info-card">
          <h3>So bestellen Sie Ihre Pflegebox</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Anfrage senden — unten im Formular oder im Pflegebox-Konfigurator, ohne Registrierung</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wir rufen zurück und bestätigen Ihre Box-Zusammenstellung</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Wir stellen den Antrag bei Ihrer Pflegekasse</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">4</div>
              <div className="info-step-text">Monatliche Lieferung nach {city.name} — fertig!</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Wer hat Anspruch?</h3>
          <ul className="info-list">
            <li>Personen mit anerkanntem Pflegegrad (1, 2, 3, 4 oder 5)</li>
            <li>Pflege findet zu Hause statt (nicht im Pflegeheim)</li>
            <li>Mindestens eine Person ist an der häuslichen Pflege beteiligt</li>
          </ul>
          <p>
            Auch pflegende Angehörige in {city.name} können die Pflegebox für ihre Pflegebedürftigen
            bestellen. Wir helfen beim gesamten Antragsprozess.
          </p>
        </section>

        <section className="info-card">
          <h3>Warum Pflegehilfsmittel zum Verbrauch so wichtig sind</h3>
          <p>
            Wer zu Hause pflegt, verbraucht laufend Material: Einmalhandschuhe schützen bei der
            Körperpflege vor Keimen — in beide Richtungen. Händedesinfektion senkt das
            Infektionsrisiko für Pflegebedürftige, deren Immunsystem oft geschwächt ist.
            Bettschutzeinlagen halten Matratzen hygienisch und ersparen tägliches
            Wäschewaschen. Diese Kosten summieren sich schnell auf 40–50 € im Monat — Geld, das
            die Pflegekasse über die Pauschale nach § 40 SGB XI vollständig übernimmt.
          </p>
          <p style={{ marginTop: 8 }}>
            Trotzdem rufen viele Familien in {city.name} diese Leistung nie ab — oft, weil der
            Antragsweg unbekannt ist oder zu bürokratisch wirkt. Genau das nehmen wir Ihnen ab:
            einmalig Vollmacht unterschreiben, alles Weitere (Antrag, Genehmigung, monatliche
            Abrechnung) übernimmt Alltagsengel. Die Box-Zusammenstellung können Sie jederzeit an
            die aktuelle Pflegesituation anpassen — etwa mehr Bettschutzeinlagen, weniger Masken.
          </p>
        </section>

        <section className="info-card">
          <h3>Lieferung nach {city.name} — auch in Ihren Stadtteil</h3>
          <p>
            Wir liefern die Pflegebox nach {city.description} — auch nach {city.stadtteile.join(', ')}.
            Die Lieferung erfolgt monatlich, versandkostenfrei und direkt an Ihre Haustür.
          </p>
        </section>

        <section className="info-card">
          <h3>Pflegeberatung vor Ort in {city.name}</h3>
          <p>
            Sie sind unsicher, welche Pflegehilfsmittel Ihnen zustehen oder ob ein Pflegegrad
            vorliegt? Trägerneutrale und kostenlose Beratung erhalten Sie {city.beratung} sowie
            direkt bei Ihrer Pflegekasse. Dort bekommen Sie auch Hilfe beim Erstantrag auf einen
            Pflegegrad — die Voraussetzung für die kostenlose Pflegebox.
          </p>
          <p style={{ marginTop: 8 }}>
            Ergänzend beraten wir Sie jederzeit unverbindlich: Wir prüfen, welche Box-Variante zu
            Ihrer Pflegesituation in {city.name} passt, und zeigen Ihnen, welche weiteren Budgets
            Sie kombinieren können — vom Entlastungsbetrag (131 €/Monat) bis zur
            Verhinderungspflege (bis 3.539 €/Jahr).
          </p>
        </section>

        <section className="info-card">
          <h3>Tipps: So holen Familien in {city.name} das Maximum aus der Pflegebox</h3>
          <ul className="info-list">
            <li>Verbrauch realistisch planen: Bei täglicher Körperpflege sind mehr Handschuhe sinnvoll, bei Inkontinenz mehr Bettschutzeinlagen</li>
            <li>Box-Inhalt saisonal anpassen — in Infektionswellen mehr Desinfektionsmittel und Masken</li>
            <li>Anspruch nicht verschenken: Die 42 €-Pauschale gilt pro Monat und lässt sich nicht ansparen</li>
            <li>Bei Krankenhausaufenthalt Lieferung einfach pausieren — ein Anruf genügt</li>
            <li>Auch Angehörige können bestellen: Die Box läuft auf die pflegebedürftige Person, geliefert wird an jede Wunschadresse in {city.name}</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Ihre Vorteile bei Alltagsengel</h3>
          <ul className="info-list">
            <li>0 € Eigenanteil — wir rechnen die volle Pauschale direkt mit der Pflegekasse ab</li>
            <li>Antragstellung und Genehmigung übernehmen wir komplett für Sie</li>
            <li>Monatliche Lieferung pünktlich und versandkostenfrei an Ihre Haustür</li>
            <li>Box-Inhalt jederzeit anpassbar — je nach aktueller Pflegesituation</li>
            <li>Keine Vertragsbindung: pausieren oder kündigen Sie jederzeit</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zur Pflegebox in {city.name}</h3>
          {faqItems.map((f) => (
            <details className="info-faq" key={f.frage}>
              <summary>{f.frage}</summary>
              <p>{f.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card" id="bestellen">
          <h3>Jetzt Pflegebox bestellen</h3>
          <p style={{ marginBottom: 16 }}>
            Lassen Sie sich kostenlos beraten — wir helfen Ihnen, die Pflegebox für {city.name}
            schnell und unkompliziert zu erhalten. Sie möchten die Box selbst zusammenstellen?
            Dann direkt zum <Link href="/pflegebox">Pflegebox-Konfigurator</Link>.
          </p>
          <LeadForm defaultService="Pflegebox" source={`pflegebox-${city.slug}`} />
        </section>

        <section className="info-card">
          <h3>Mehr als die Pflegebox: Ihre Budgets in {city.name} voll ausschöpfen</h3>
          <p>
            Die Pflegebox (42 €/Monat nach §40 SGB XI) ist nur eines von mehreren Budgets, die
            Ihnen zustehen. Zusätzlich können Sie in {city.name} den{' '}
            <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> nutzen — 131 €/Monat ab
            Pflegegrad 1 für <Link href={alltagsbegleitungHref}>Alltagsbegleitung in {city.name}</Link>:
            Einkaufshilfe, Arztbegleitung, Haushalt und Gesellschaft. Fällt Ihre pflegende Person
            aus, übernimmt die <Link href="/verhinderungspflege">Verhinderungspflege</Link> mit bis
            zu 3.539 €/Jahr die Ersatzbetreuung. Alle Töpfe sind kombinierbar — unser{' '}
            <Link href="/budgetrechner">Budgetrechner</Link> zeigt Ihnen Ihren Gesamtanspruch.
          </p>
        </section>

        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <p>Neben der Pflegebox bieten wir in {city.name} auch:</p>
          <ul className="info-list">
            <li><Link href={alltagsbegleitungHref}>Alltagsbegleitung in {city.name}</Link> — 131 €/Monat über Entlastungsbetrag</li>
            <li><Link href={krankenfahrtHref}>Krankenfahrten in {city.name}</Link> — Mit Verordnung zahlt die Kasse</li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege</Link> — Ersatzpflege bis 3.539 €/Jahr (§39 SGB XI)</li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag</Link> — 131 €/Monat ab Pflegegrad 1 (§45b SGB XI)</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Auch in Ihrer Nähe</h3>
          <p>Die Pflegebox liefern wir auch in diese Städte:</p>
          <ul className="info-list">
            {Object.values(cities)
              .filter((c) => c.slug !== city.slug)
              .map((c) => (
                <li key={c.slug}><Link href={`/hygienebox/${c.slug}`}>Pflegebox {c.name}</Link></li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
