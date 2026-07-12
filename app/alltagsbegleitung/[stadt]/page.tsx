import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import SpeakableSchema from '@/components/SpeakableSchema'

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
  // Lokale, trägerneutrale Pflegeberatung (Pflegestützpunkt bzw. kommunale
  // Beratungsstelle) — mit Präposition, z.B. „beim Pflegestützpunkt X"
  beratung: string
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
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
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
    beratung: 'beim Pflegestützpunkt Offenbach',
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
    beratung: 'beim Pflegestützpunkt Wiesbaden',
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
    beratung: 'beim Pflegestützpunkt Darmstadt',
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
    beratung: 'beim Pflegestützpunkt des Main-Kinzig-Kreises',
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
    beratung: 'beim Pflegestützpunkt Hochtaunuskreis in Bad Homburg',
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
    beratung: 'bei den Pflegestützpunkten in Mainz',
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
    beratung: 'beim Pflegestützpunkt für Stadt und Landkreis Aschaffenburg',
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
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
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
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
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
    beratung: 'beim Pflegestützpunkt Wetteraukreis in Friedberg',
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
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  giessen: {
    name: 'Gießen',
    region: 'Hessen',
    slug: 'giessen',
    description: 'Gießen und Mittelhessen',
    lat: 50.5841,
    lng: 8.6784,
    stadtteile: ['Wieseck', 'Klein-Linden', 'Rödgen', 'Lützellinden', 'Allendorf'],
    lokal: 'In der Universitätsstadt Gießen sind unsere Alltagsbegleiter von Wieseck im Norden bis Klein-Linden und Allendorf im Süden unterwegs — in der Kernstadt ebenso wie in den Lahn-nahen Stadtteilen.',
    nachbarn: ['marburg', 'friedberg-wetterau', 'bad-homburg', 'frankfurt'],
    beratung: 'beim Pflegestützpunkt Gießen für Stadt und Landkreis',
  },
  marburg: {
    name: 'Marburg',
    region: 'Hessen',
    slug: 'marburg',
    description: 'Marburg und dem Landkreis Marburg-Biedenkopf',
    lat: 50.8090,
    lng: 8.7710,
    stadtteile: ['Wehrda', 'Cappel', 'Marbach', 'Ockershausen', 'Richtsberg'],
    lokal: 'In der Universitätsstadt Marburg an der Lahn begleiten wir Sie von der Oberstadt über Ockershausen bis Cappel und Wehrda — auch dort, wo es steil und verwinkelt wird.',
    nachbarn: ['giessen', 'friedberg-wetterau', 'kassel'],
    beratung: 'beim Pflegestützpunkt Marburg-Biedenkopf',
  },
  kassel: {
    name: 'Kassel',
    region: 'Hessen',
    slug: 'kassel',
    description: 'Kassel und Nordhessen',
    lat: 51.3127,
    lng: 9.4797,
    stadtteile: ['Wehlheiden', 'Kirchditmold', 'Bad Wilhelmshöhe', 'Bettenhausen', 'Harleshausen', 'Niederzwehren'],
    lokal: 'In der documenta-Stadt Kassel sind unsere Engel im gesamten Stadtgebiet im Einsatz — von Bad Wilhelmshöhe und Kirchditmold im Westen bis Bettenhausen im Osten.',
    nachbarn: ['giessen', 'marburg', 'fulda'],
    beratung: 'beim Pflegestützpunkt Region Kassel',
  },
  fulda: {
    name: 'Fulda',
    region: 'Hessen',
    slug: 'fulda',
    description: 'Fulda und Osthessen',
    lat: 50.5558,
    lng: 9.6808,
    stadtteile: ['Horas', 'Neuenberg', 'Aschenberg', 'Kohlhaus', 'Lehnerz'],
    lokal: 'In der Barockstadt Fulda sind unsere Alltagsbegleiter von der Innenstadt rund um den Dom bis Aschenberg, Neuenberg und Horas unterwegs.',
    nachbarn: ['kassel', 'giessen', 'hanau'],
    beratung: 'beim Pflegestützpunkt Fulda',
  },
  limburg: {
    name: 'Limburg an der Lahn',
    region: 'Hessen',
    slug: 'limburg',
    description: 'Limburg an der Lahn und dem Landkreis Limburg-Weilburg',
    lat: 50.3836,
    lng: 8.0503,
    stadtteile: ['Blumenrod', 'Staffel', 'Lindenholzhausen', 'Eschhofen', 'Offheim'],
    lokal: 'In der Domstadt Limburg an der Lahn sind wir in der Kernstadt und allen Stadtteilen im Einsatz — von Blumenrod über Staffel bis Lindenholzhausen und Offheim.',
    nachbarn: ['wiesbaden', 'bad-homburg', 'frankfurt'],
    beratung: 'beim Pflegestützpunkt Limburg-Weilburg',
  },
  koeln: {
    name: 'Köln',
    region: 'Nordrhein-Westfalen',
    slug: 'koeln',
    description: 'Köln und dem gesamten Stadtgebiet',
    lat: 50.9375,
    lng: 6.9603,
    stadtteile: ['Ehrenfeld', 'Nippes', 'Lindenthal', 'Mülheim', 'Rodenkirchen', 'Porz'],
    lokal: 'In Köln sind unsere Alltagsbegleiter linksrheinisch wie rechtsrheinisch unterwegs — von Ehrenfeld, Nippes und Lindenthal bis Mülheim, Rodenkirchen und Porz.',
    nachbarn: ['bonn', 'duesseldorf', 'essen'],
    beratung: 'bei der Pflegeberatung der Stadt Köln',
  },
  duesseldorf: {
    name: 'Düsseldorf',
    region: 'Nordrhein-Westfalen',
    slug: 'duesseldorf',
    description: 'Düsseldorf und dem gesamten Stadtgebiet',
    lat: 51.2277,
    lng: 6.7735,
    stadtteile: ['Bilk', 'Derendorf', 'Benrath', 'Gerresheim', 'Oberkassel', 'Eller'],
    lokal: 'In der Landeshauptstadt Düsseldorf begleiten wir Sie auf beiden Rheinseiten — von Bilk und Derendorf über Oberkassel bis Benrath, Gerresheim und Eller.',
    nachbarn: ['koeln', 'essen', 'dortmund'],
    beratung: 'bei den Pflegebüros der Landeshauptstadt Düsseldorf',
  },
  essen: {
    name: 'Essen',
    region: 'Nordrhein-Westfalen',
    slug: 'essen',
    description: 'Essen und dem mittleren Ruhrgebiet',
    lat: 51.4556,
    lng: 7.0116,
    stadtteile: ['Rüttenscheid', 'Borbeck', 'Steele', 'Altenessen', 'Werden', 'Kettwig'],
    lokal: 'In Essen sind unsere Engel vom Norden bis ins Ruhrtal unterwegs — von Altenessen und Borbeck über Rüttenscheid und Steele bis Werden und Kettwig.',
    nachbarn: ['duesseldorf', 'dortmund', 'koeln'],
    beratung: 'bei der Pflegeberatung der Stadt Essen',
  },
  dortmund: {
    name: 'Dortmund',
    region: 'Nordrhein-Westfalen',
    slug: 'dortmund',
    description: 'Dortmund und dem östlichen Ruhrgebiet',
    lat: 51.5136,
    lng: 7.4653,
    stadtteile: ['Hörde', 'Hombruch', 'Aplerbeck', 'Brackel', 'Eving', 'Mengede'],
    lokal: 'In Dortmund sind unsere Alltagsbegleiter in allen Stadtbezirken im Einsatz — von Hörde am Phoenix-See über Hombruch und Aplerbeck bis Eving und Mengede im Norden.',
    nachbarn: ['essen', 'duesseldorf', 'koeln'],
    beratung: 'bei der Pflege- und Wohnberatung Dortmund',
  },
  bonn: {
    name: 'Bonn',
    region: 'Nordrhein-Westfalen',
    slug: 'bonn',
    description: 'Bonn und dem Rhein-Sieg-Kreis',
    lat: 50.7374,
    lng: 7.0982,
    stadtteile: ['Bad Godesberg', 'Beuel', 'Poppelsdorf', 'Duisdorf', 'Endenich'],
    lokal: 'In der Bundesstadt Bonn begleiten wir Sie von der Innenstadt über Poppelsdorf und Endenich bis Beuel und Bad Godesberg.',
    nachbarn: ['koeln', 'duesseldorf', 'essen'],
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
      `Seniorenbetreuung ${city.name}`,
      `Verhinderungspflege ${city.name}`,
      `Pflegebox ${city.name}`,
      `Krankenfahrt ${city.name}`,
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
    {
      frage: `Übernehmen Sie in ${city.name} auch Verhinderungspflege?`,
      antwort: `Ja. Unsere Betreuungskräfte in ${city.name} übernehmen auch stundenweise Verhinderungspflege (§39 SGB XI), wenn Ihre private Pflegeperson ausfällt oder eine Pause braucht. Dafür steht ab Pflegegrad 2 der gemeinsame Jahresbetrag von bis zu 3.539 € pro Jahr bereit — zusätzlich zum Entlastungsbetrag.`,
    },
    {
      frage: `Bieten Sie in ${city.name} auch Pflegebox und Krankenfahrten an?`,
      antwort: `Ja. Neben der Alltagsbegleitung liefern wir die kostenlose Pflegebox (Pflegehilfsmittel bis 42 €/Monat nach §40 SGB XI) nach ${city.name} und vermitteln Krankenfahrten zu Arzt, Klinik und Dialyse — mit Verordnung zahlt die Krankenkasse (§60 SGB V).`,
    },
    {
      frage: `Wo finde ich unabhängige Pflegeberatung in ${city.name}?`,
      antwort: `Trägerneutrale und kostenlose Beratung zu allen Pflegeleistungen erhalten Sie ${city.beratung} sowie bei Ihrer Pflegekasse. Und natürlich beraten auch wir Sie kostenlos zum Entlastungsbetrag, zur Verhinderungspflege und zur Pflegebox — telefonisch oder per Rückruf.`,
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
      // BreadcrumbList kommt aus <BreadcrumbSchema> (Schema + sichtbare Nav) —
      // hier NICHT duplizieren, sonst zwei widersprüchliche Markups pro Seite.
    ],
  }
}

export default async function StadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const faqs = buildFaqs(city)
  const jsonLd = buildJsonLd(city, faqs)
  // Frankfurt kanonisiert bei Krankenfahrten & Pflegebox auf die Root-Seiten —
  // interne Links folgen dem Canonical, alle anderen Städte verlinken die Stadtseite.
  const krankenfahrtHref = city.slug === 'frankfurt' ? '/krankenfahrten' : `/krankenfahrten/${city.slug}`
  const pflegeboxHref = city.slug === 'frankfurt' ? '/hygienebox' : `/hygienebox/${city.slug}`

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SpeakableSchema url={`/alltagsbegleitung/${city.slug}`} />
      <BreadcrumbSchema items={[{ name: 'Alltagsbegleitung', url: '/alltagsbegleitung' }, { name: city.name }]} />
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
          <h3>Für wen ist Alltagsbegleitung in {city.name} gedacht?</h3>
          <p>
            Unsere Kunden in {city.name} sind so unterschiedlich wie ihre Lebenssituationen: Senioren,
            die nach einem Krankenhausaufenthalt vorübergehend Unterstützung brauchen. Menschen mit
            beginnender Demenz, deren Angehörige tagsüber arbeiten. Alleinstehende, denen vor allem
            die Gesellschaft fehlt — ein Gesprächspartner beim Kaffee, eine Begleitung beim
            Spaziergang. Und pflegende Angehörige, die sich regelmäßige Entlastung wünschen, um
            selbst gesund zu bleiben.
          </p>
          <p style={{ marginTop: 8 }}>
            Alle unsere Engel sind nach § 45a SGB XI geschult, unterliegen einer
            Qualitätsprüfung und sind während jedes Einsatzes versichert. Sie erhalten feste
            Bezugspersonen statt wechselnder Kräfte — gerade bei Demenz ist diese Kontinuität
            entscheidend.
          </p>
        </section>

        <section className="info-card">
          <h3>Verhinderungspflege in {city.name} — wenn Angehörige eine Pause brauchen</h3>
          <p>
            Sie pflegen ein Familienmitglied in {city.name} und brauchen Urlaub, einen freien
            Nachmittag oder fallen krankheitsbedingt aus? Unsere Betreuungskräfte übernehmen die
            <strong> stundenweise Verhinderungspflege</strong> (§39 SGB XI). Ab Pflegegrad 2 stellt
            die Pflegekasse dafür den gemeinsamen Jahresbetrag von bis zu <strong>3.539 € pro Jahr </strong>
            bereit — seit dem 01.07.2025 ohne Vorpflegezeit und flexibel mit der Kurzzeitpflege
            kombinierbar. Bei Einsätzen unter 8 Stunden am Tag läuft Ihr Pflegegeld ungekürzt weiter.
          </p>
          <p style={{ marginTop: 8 }}>
            Zusammen mit dem <Link href="/entlastungsbetrag">Entlastungsbetrag</Link> (131 €/Monat)
            stehen Ihnen so bis zu 5.111 € pro Jahr zur Verfügung — mehr dazu auf unserer Seite zur{' '}
            <Link href="/verhinderungspflege">Verhinderungspflege</Link> und im{' '}
            <Link href="/budgetrechner">Budgetrechner</Link>.
          </p>
        </section>

        <section className="info-card">
          <h3>So läuft Ihr erster Einsatz in {city.name} ab</h3>
          <p>
            Nach Ihrer Anfrage melden wir uns innerhalb eines Werktags und besprechen, welche
            Unterstützung Sie sich wünschen — vom wöchentlichen Einkauf über Arztbegleitung bis
            zur mehrstündigen Betreuung. Anschließend schlagen wir Ihnen einen Engel aus {city.name}
            {' '}oder der direkten Umgebung vor, der zu Ihren Bedürfnissen passt. Beim ersten Termin
            lernen Sie sich in Ruhe kennen: Ihr Alltagsbegleiter verschafft sich einen Überblick,
            klärt Abläufe und Schlüsselfragen und nimmt sich Zeit für Ihre Wünsche.
          </p>
          <p style={{ marginTop: 8 }}>
            Danach kommen die Termine in dem Rhythmus, den Sie festlegen — wöchentlich, mehrmals
            pro Woche oder flexibel nach Bedarf. Sie behalten immer dieselbe Bezugsperson, und
            wenn einmal etwas dazwischenkommt, lassen sich Termine unkompliziert verschieben.
            Die Abrechnung mit der Pflegekasse läuft im Hintergrund vollständig über uns — Sie
            erhalten keine Rechnung, solange der Entlastungsbetrag den Einsatz deckt.
          </p>
        </section>

        <section className="info-card">
          <h3>Pflegeberatung vor Ort in {city.name}</h3>
          <p>
            Sie sind unsicher, welche Leistungen Ihnen zustehen? Trägerneutrale und kostenlose
            Beratung zu Pflegegrad, Entlastungsbetrag und allen weiteren Pflegeleistungen erhalten
            Sie {city.beratung} sowie direkt bei Ihrer Pflege- und Krankenkasse. Dort bekommen Sie
            auch Unterstützung bei Anträgen und beim Widerspruch gegen eine Pflegegrad-Einstufung.
          </p>
          <p style={{ marginTop: 8 }}>
            Ergänzend beraten wir Sie jederzeit kostenlos und unverbindlich: Wir prüfen mit Ihnen,
            ob der Entlastungsbetrag (131 €/Monat), die Verhinderungspflege (bis 3.539 €/Jahr) oder
            die Pflegebox (42 €/Monat) für Ihre Situation in {city.name} passen — und übernehmen
            anschließend die komplette Abwicklung mit der Kasse.
          </p>
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
            <li><Link href={krankenfahrtHref}>Krankenfahrten in {city.name}</Link> — Mit Verordnung zahlt die Krankenkasse (§60 SGB V)</li>
            <li><Link href={pflegeboxHref}>Pflegebox für {city.name}</Link> — Kostenlose Pflegehilfsmittel (42 €/Monat nach §40 SGB XI)</li>
            <li><Link href="/verhinderungspflege">Verhinderungspflege</Link> — Ersatzpflege bis 3.539 €/Jahr (§39 SGB XI)</li>
            <li><Link href="/entlastungsbetrag">Entlastungsbetrag</Link> — 131 €/Monat ab Pflegegrad 1 (§45b SGB XI)</li>
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
          <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
          <Link href="/verhinderungspflege">Verhinderungspflege</Link>
          <Link href="/finanzierung">Finanzierung</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/impressum">Impressum</Link>
          <Link href="/datenschutz">Datenschutz</Link>
          <Link href="/agb">AGB</Link>
        </div>
      </div>
    </div>
  )
}
