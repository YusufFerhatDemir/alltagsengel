import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

// ═══════════════════════════════════════════════════════════════════════
// HAUSHALTSHILFE — Stadtseiten
//
// Die dritte Strecke neben /alltagsbegleitung/[stadt] (Betreuung) und
// /engel-werden/[stadt] (Recruiting). Sie war die einzige der drei, die
// noch gar nicht existierte.
//
// ABGRENZUNG, DAMIT ES KEIN DOPPELTER INHALT WIRD
// Alltagsbegleitung = Begleitung und Gesellschaft (Arztbesuch, Spaziergang,
// Gespräch). Haushaltshilfe = die Wohnung: putzen, waschen, einkaufen,
// kochen. Beides steht unter demselben Entlastungsbetrag, ist aber eine
// andere Frage — und wird hier auch anders beantwortet. Wer die Seiten
// nebeneinanderlegt, muss zwei verschiedene Texte sehen, sonst kannibalisiert
// die eine die andere.
//
// § 45a: Der Anerkennungsstand wird auf JEDER Seite genannt. Es wird keine
// Abrechnung über die Pflegekasse zugesagt.
// ═══════════════════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  plz: string
  /** Grammatisch nach „in …" verwendbar. */
  description: string
  lat: number
  lng: number
  stadtteile: string[]
  /** Stadtbezogener Satz zum Einsatzgebiet. */
  lokal: string
  /** Zweiter stadtbezogener Satz — stabile öffentliche Merkmale, keine Statistik. */
  schwerpunkt: string
  /** Nur Slugs, die in `cities` stehen — sonst bricht die Nachbarliste. */
  nachbarn: string[]
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
    lat: 50.1109,
    lng: 8.6821,
    stadtteile: ['Bornheim', 'Nordend', 'Sachsenhausen', 'Bockenheim', 'Rödelheim', 'Niederrad'],
    lokal: 'In Frankfurt sind unsere Haushaltshilfen beiderseits des Mains unterwegs — vom Nordend bis Niederrad, mit kurzen Wegen innerhalb des Stadtteils.',
    schwerpunkt: 'Viele Frankfurter Altbauwohnungen haben Treppenhäuser ohne Aufzug. Gerade dann ist der wöchentliche Einkauf die Aufgabe, bei der Unterstützung am schnellsten spürbar wird.',
    nachbarn: ['offenbach', 'bad-homburg', 'neu-isenburg', 'frankfurt-hoechst'],
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  offenbach: {
    name: 'Offenbach am Main',
    region: 'Hessen',
    slug: 'offenbach',
    plz: '63065',
    description: 'Offenbach am Main und Umgebung',
    lat: 50.0956,
    lng: 8.7761,
    stadtteile: ['Bürgel', 'Bieber', 'Rumpenheim', 'Lauterborn', 'Tempelsee'],
    lokal: 'In Offenbach reicht unser Einsatzgebiet vom Kaiserlei im Westen bis nach Bürgel und Rumpenheim am Mainufer.',
    schwerpunkt: 'Offenbach ist eine Stadt der kurzen Wege. Wer im eigenen Stadtteil bleibt, kann Einkauf und Behördengang oft an einem Vormittag erledigen — auch das gehört zur Haushaltshilfe.',
    nachbarn: ['frankfurt', 'neu-isenburg', 'hanau'],
    beratung: 'beim Pflegestützpunkt Offenbach',
  },
  hanau: {
    name: 'Hanau',
    region: 'Hessen',
    slug: 'hanau',
    plz: '63450',
    description: 'Hanau und dem Main-Kinzig-Kreis',
    lat: 50.1328,
    lng: 8.9169,
    stadtteile: ['Steinheim', 'Kesselstadt', 'Großauheim', 'Klein-Auheim', 'Mittelbuchen'],
    lokal: 'In Hanau sind wir in der Kernstadt und in den Stadtteilen unterwegs — von Kesselstadt im Westen bis Großauheim und Klein-Auheim südlich des Mains.',
    schwerpunkt: 'Die Hanauer Stadtteile liegen weit auseinander. Wir planen deshalb feste Bezugspersonen im jeweiligen Stadtteil, damit keine Zeit auf der Straße verlorengeht.',
    nachbarn: ['offenbach', 'maintal', 'frankfurt'],
    beratung: 'beim Pflegestützpunkt des Main-Kinzig-Kreises',
  },
  maintal: {
    name: 'Maintal',
    region: 'Hessen',
    slug: 'maintal',
    plz: '63477',
    description: 'Maintal und dem Main-Kinzig-Kreis',
    lat: 50.1478,
    lng: 8.8331,
    stadtteile: ['Dörnigheim', 'Bischofsheim', 'Hochstadt', 'Wachenbuchen'],
    lokal: 'In Maintal sind wir in allen vier Stadtteilen im Einsatz — von Dörnigheim am Main bis hinauf nach Wachenbuchen.',
    schwerpunkt: 'Maintal ist aus vier eigenständigen Ortschaften zusammengewachsen; jede hat ihre eigene Nahversorgung. Wir richten den Einkauf danach aus, statt quer durch die Stadt zu fahren.',
    nachbarn: ['hanau', 'frankfurt', 'bad-vilbel'],
    beratung: 'beim Pflegestützpunkt Main-Kinzig-Kreis',
  },
  'bad-homburg': {
    name: 'Bad Homburg',
    region: 'Hessen',
    slug: 'bad-homburg',
    plz: '61348',
    description: 'Bad Homburg vor der Höhe und dem Hochtaunuskreis',
    lat: 50.2268,
    lng: 8.6182,
    stadtteile: ['Kirdorf', 'Gonzenheim', 'Dornholzhausen', 'Ober-Erlenbach', 'Ober-Eschbach'],
    lokal: 'In Bad Homburg sind wir von der Kernstadt über Kirdorf und Gonzenheim bis nach Ober-Erlenbach und Ober-Eschbach unterwegs.',
    schwerpunkt: 'Die Hanglagen am Taunusrand machen Einkäufe zu Fuß beschwerlich. Der Transport nach Hause ist hier oft der Teil, bei dem Hilfe den größten Unterschied macht.',
    nachbarn: ['frankfurt', 'eschborn', 'bad-vilbel'],
    beratung: 'beim Pflegestützpunkt Hochtaunuskreis in Bad Homburg',
  },
  'neu-isenburg': {
    name: 'Neu-Isenburg',
    region: 'Hessen',
    slug: 'neu-isenburg',
    plz: '63263',
    description: 'Neu-Isenburg und dem Kreis Offenbach',
    lat: 50.048,
    lng: 8.6947,
    stadtteile: ['Stadtmitte', 'Gravenbruch', 'Zeppelinheim'],
    lokal: 'In Neu-Isenburg sind wir in der Stadtmitte, in Gravenbruch und in Zeppelinheim im Einsatz.',
    schwerpunkt: 'Gravenbruch und Zeppelinheim liegen abseits der Kernstadt. Wer dort wohnt und nicht mehr selbst fährt, ist beim Wocheneinkauf auf Unterstützung angewiesen.',
    nachbarn: ['frankfurt', 'offenbach', 'darmstadt'],
    beratung: 'beim Pflegestützpunkt Kreis Offenbach',
  },
  eschborn: {
    name: 'Eschborn',
    region: 'Hessen',
    slug: 'eschborn',
    plz: '65760',
    description: 'Eschborn und Niederhöchstadt',
    lat: 50.1433,
    lng: 8.5706,
    stadtteile: ['Eschborn-Mitte', 'Niederhöchstadt', 'Camp Phönix Park'],
    lokal: 'In Eschborn sind wir in der Kernstadt und in Niederhöchstadt unterwegs — beide Ortsteile liegen an der S-Bahn.',
    schwerpunkt: 'Eschborn ist tagsüber eine Bürostadt und wird abends ruhig. Wir legen Termine deshalb auch in die Randzeiten, wenn Angehörige nach der Arbeit dabei sein möchten.',
    nachbarn: ['frankfurt-hoechst', 'frankfurt', 'bad-homburg'],
    beratung: 'beim Pflegestützpunkt Main-Taunus-Kreis',
  },
  'frankfurt-hoechst': {
    name: 'Frankfurt-Höchst',
    region: 'Hessen',
    slug: 'frankfurt-hoechst',
    plz: '65929',
    description: 'Frankfurt-Höchst und dem Frankfurter Westen',
    lat: 50.0996,
    lng: 8.543,
    stadtteile: ['Nied', 'Sindlingen', 'Unterliederbach', 'Zeilsheim', 'Sossenheim'],
    lokal: 'Im Frankfurter Westen sind wir von Nied und Sossenheim über Unterliederbach bis nach Sindlingen und Zeilsheim im Einsatz.',
    schwerpunkt: 'Der Frankfurter Westen ist ein Stadtteilgeflecht mit gewachsener Nachbarschaft. Feste Bezugspersonen sind hier besonders wichtig — man kennt sich.',
    nachbarn: ['frankfurt', 'eschborn', 'wiesbaden'],
    beratung: 'beim Pflegestützpunkt Frankfurt am Main',
  },
  darmstadt: {
    name: 'Darmstadt',
    region: 'Hessen',
    slug: 'darmstadt',
    plz: '64283',
    description: 'Darmstadt und Südhessen',
    lat: 49.8728,
    lng: 8.6512,
    stadtteile: ['Bessungen', 'Arheilgen', 'Eberstadt', 'Kranichstein', 'Wixhausen'],
    lokal: 'In Darmstadt sind wir von Arheilgen und Wixhausen im Norden bis Eberstadt im Süden unterwegs.',
    schwerpunkt: 'Zwischen den Darmstädter Stadtteilen liegen echte Entfernungen. Wir binden Bezugspersonen deshalb an den Stadtteil, nicht an die Stadt.',
    nachbarn: ['neu-isenburg', 'frankfurt'],
    beratung: 'beim Pflegestützpunkt Darmstadt',
  },
  wiesbaden: {
    name: 'Wiesbaden',
    region: 'Hessen',
    slug: 'wiesbaden',
    plz: '65183',
    description: 'Wiesbaden und dem Rheingau',
    lat: 50.0782,
    lng: 8.2398,
    stadtteile: ['Biebrich', 'Dotzheim', 'Sonnenberg', 'Bierstadt', 'Schierstein'],
    lokal: 'In Wiesbaden sind wir von Biebrich und Schierstein am Rhein bis hinauf nach Sonnenberg im Einsatz.',
    schwerpunkt: 'Die Landeshauptstadt liegt in einer Tallage mit deutlichen Höhenunterschieden. Wege, die auf der Karte kurz aussehen, sind es zu Fuß oft nicht.',
    nachbarn: ['frankfurt-hoechst', 'frankfurt'],
    beratung: 'beim Pflegestützpunkt Wiesbaden',
  },
  'bad-vilbel': {
    name: 'Bad Vilbel',
    region: 'Hessen',
    slug: 'bad-vilbel',
    plz: '61118',
    description: 'Bad Vilbel und der südlichen Wetterau',
    lat: 50.1786,
    lng: 8.7367,
    stadtteile: ['Dortelweil', 'Massenheim', 'Gronau', 'Heilsberg'],
    lokal: 'In Bad Vilbel sind wir von der Kernstadt an der Nidda über Dortelweil und den Heilsberg bis nach Massenheim unterwegs.',
    schwerpunkt: 'Der Heilsberg liegt deutlich über der Kernstadt. Wer dort wohnt, braucht für den Einkauf entweder ein Auto oder jemanden, der ihn übernimmt.',
    nachbarn: ['frankfurt', 'maintal', 'bad-homburg'],
    beratung: 'beim Pflegestützpunkt Wetteraukreis',
  },
}

export function generateStaticParams() {
  return Object.keys(cities).map((stadt) => ({ stadt }))
}

const HINWEIS_ANERKENNUNG =
  'Alltagsengel befindet sich aktuell im Anerkennungsverfahren nach § 45a SGB XI. '
  + 'Nach erfolgter Anerkennung können berechtigte Pflegebedürftige Leistungen über den '
  + 'Entlastungsbetrag nach § 45b SGB XI abrechnen.'

export async function generateMetadata(
  { params }: { params: Promise<{ stadt: string }> },
): Promise<Metadata> {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) return {}

  // Frankfurt kanonisiert auf die Hauptseite /haushaltshilfe — dieselbe
  // Regel wie bei /hygienebox und /krankenfahrten. Sonst konkurrieren
  // Hauptseite, Stadtseite UND der Blogartikel `haushaltshilfe-frankfurt`
  // um dasselbe Keyword.
  const canonical = city.slug === 'frankfurt'
    ? 'https://alltagsengel.care/haushaltshilfe'
    : `https://alltagsengel.care/haushaltshilfe/${city.slug}`

  return {
    title: `Haushaltshilfe ${city.name} — Reinigung, Wäsche, Einkauf`,
    description:
      `Haushaltshilfe in ${city.name} — auch in ${city.stadtteile[0]} & ${city.stadtteile[1]}. `
      + `Reinigung, Wäsche, Einkauf und Kochen durch geschulte Kräfte. `
      + `Entlastungsbetrag 131 €/Monat nach §45b SGB XI. Jetzt unverbindlich vormerken.`,
    keywords: [
      `Haushaltshilfe ${city.name}`,
      `Haushaltshilfe ${city.name} Pflegegrad`,
      `Putzhilfe Senioren ${city.name}`,
      `Reinigungshilfe ${city.name}`,
      `Wäscheservice ${city.name}`,
      `Einkaufshilfe ${city.name}`,
      'Entlastungsbetrag',
      '131 Euro Pflegekasse',
      '§45b SGB XI',
      `Alltagsbegleitung ${city.name}`,
    ],
    alternates: { canonical },
    openGraph: {
      title: `Haushaltshilfe ${city.name} — Reinigung, Wäsche, Einkauf | Alltagsengel`,
      description:
        `Unterstützung im Haushalt in ${city.name}: Reinigung, Wäsche, Einkauf, Kochen. `
        + `Feste Bezugsperson, versichert.`,
      url: canonical,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
      images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    },
  }
}

// Ein gemeinsames FAQ-Array je Stadt — speist das sichtbare FAQ UND das
// FAQPage-JSON-LD. Zwei Quellen wären zwei Wahrheiten.
function faqsFuer(city: CityData) {
  return [
    {
      frage: `Was macht eine Haushaltshilfe in ${city.name} konkret?`,
      antwort:
        `Reinigung der Wohnung, Wäsche waschen und bügeln, Einkaufen, Kochen, Spülen, `
        + `Müll entsorgen und Botengänge wie Apotheke oder Post. Nicht dazu gehören `
        + `medizinische Leistungen — dafür ist ein Pflegedienst zuständig.`,
    },
    {
      frage: `Was kostet Haushaltshilfe in ${city.name}?`,
      antwort:
        `Die Haushaltshilfe kostet ab 32 € pro Stunde. Pflegebedürftigen mit Pflegegrad steht `
        + `nach § 45b SGB XI grundsätzlich ein monatlicher Entlastungsbetrag von 131 € zur `
        + `Verfügung — bereits ab Pflegegrad 1. ${HINWEIS_ANERKENNUNG} `
        + `Zu Ihren Finanzierungswegen beraten wir Sie vorab kostenlos.`,
    },
    {
      frage: 'Brauche ich einen Pflegegrad?',
      antwort:
        `Nein. Unsere Haushaltshilfe in ${city.name} steht auch Menschen ohne Pflegegrad offen — `
        + `dann als Selbstzahler. Ein Pflegegrad ist nur für die Nutzung des Entlastungsbetrags `
        + `nach § 45b SGB XI erforderlich.`,
    },
    {
      frage: 'Kommt immer dieselbe Person?',
      antwort:
        `Ja, das ist unser Anspruch. Sie erhalten eine feste Bezugsperson statt wechselnder `
        + `Kräfte. Wer regelmäßig in Ihre Wohnung kommt, soll ein bekanntes Gesicht sein — und `
        + `wissen, wo bei Ihnen was steht.`,
    },
    {
      frage: `In welchen Stadtteilen von ${city.name} sind Sie unterwegs?`,
      antwort:
        `Unter anderem in ${city.stadtteile.join(', ')}. ${city.lokal} `
        + `Steht Ihr Stadtteil nicht dabei, fragen Sie einfach nach — wir bauen das `
        + `Einsatzgebiet laufend aus.`,
    },
    {
      frage: 'Kann ich Haushaltshilfe steuerlich absetzen?',
      antwort:
        `Haushaltsnahe Dienstleistungen sind nach § 35a EStG mit 20 % der Arbeitskosten `
        + `absetzbar, höchstens 4.000 € im Jahr. Voraussetzung ist eine Rechnung und die `
        + `Zahlung per Überweisung — Barzahlung erkennt das Finanzamt nicht an. `
        + `Verbindlich klärt das Ihr Steuerberater oder Ihr Finanzamt.`,
    },
    {
      frage: 'Wo bekomme ich unabhängige Beratung?',
      antwort:
        `Trägerneutrale und kostenlose Beratung zu allen Pflegeleistungen erhalten Sie `
        + `${city.beratung} sowie bei Ihrer Pflegekasse. Natürlich beraten auch wir Sie `
        + `kostenlos — telefonisch oder per Rückruf.`,
    },
  ]
}

export default async function HaushaltshilfeStadtPage(
  { params }: { params: Promise<{ stadt: string }> },
) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const faqs = faqsFuer(city)
  const canonical = city.slug === 'frankfurt'
    ? 'https://alltagsengel.care/haushaltshilfe'
    : `https://alltagsengel.care/haushaltshilfe/${city.slug}`

  const alltagsbegleitungHref = city.slug === 'frankfurt'
    ? '/alltagsbegleitung'
    : `/alltagsbegleitung/${city.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: `Haushaltshilfe ${city.name}`,
        serviceType: 'Haushaltshilfe',
        description:
          `Unterstützung im Haushalt in ${city.name}: Reinigung, Wäsche, Einkauf, Kochen `
          + `und Botengänge durch geschulte Kräfte.`,
        provider: {
          '@type': 'Organization',
          name: 'Alltagsengel',
          url: 'https://alltagsengel.care',
        },
        areaServed: {
          '@type': 'City',
          name: city.name,
          geo: {
            '@type': 'GeoCoordinates',
            latitude: city.lat,
            longitude: city.lng,
          },
        },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'EUR',
          price: '32',
          description: 'Haushaltshilfe ab 32 € pro Stunde',
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonical}#faq`,
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.frage,
          acceptedAnswer: { '@type': 'Answer', text: f.antwort },
        })),
      },
    ],
  }

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[
        { name: 'Haushaltshilfe', url: '/haushaltshilfe' },
        { name: city.name },
      ]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">&#8249;</Link>
        <h1 className="legal-title">Haushaltshilfe {city.name}</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">💛</div>
          <h2 className="info-hero-title">Haushaltshilfe in {city.name}</h2>
          <p className="info-hero-sub">
            Reinigung, Wäsche, Einkauf und Kochen in {city.description} — versichert,
            zuverlässig und mit fester Bezugsperson
          </p>
        </div>

        {/* ── Abgrenzung ───────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Was eine Haushaltshilfe übernimmt — und was nicht</h3>
          <p>
            Eine Haushaltshilfe kümmert sich um die Wohnung und die Versorgung: Sie putzt,
            wäscht, kauft ein und kocht. Sie ist keine Pflegekraft und übernimmt keine
            medizinischen Aufgaben — kein Verbandwechsel, keine Medikamentengabe, keine
            Körperpflege.
          </p>
          <p style={{ marginTop: 8 }}>
            Wenn es Ihnen eher um Begleitung geht — zum Arzt, zum Spaziergang, zum Gespräch —,
            ist unsere <Link href={alltagsbegleitungHref}>Alltagsbegleitung in {city.name}</Link>{' '}
            das passende Angebot. Viele Kundinnen und Kunden kombinieren beides in einem Termin.
          </p>
        </section>

        {/* ── Leistungen ───────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Unsere Leistungen im Haushalt</h3>
          <ul className="info-list">
            <li><strong>Reinigung</strong> — Staubsaugen, Wischen, Bad und Küche, Fenster nach Absprache</li>
            <li><strong>Wäsche</strong> — Waschen, Trocknen, Bügeln, Bettwäsche wechseln</li>
            <li><strong>Einkauf</strong> — Wocheneinkauf, Getränkekisten, Verräumen in der Wohnung</li>
            <li><strong>Küche</strong> — Kochen nach Ihren Wünschen, Spülen, Vorräte im Blick behalten</li>
            <li><strong>Ordnung</strong> — Müll und Altpapier entsorgen, Post sortieren, Blumen gießen</li>
            <li><strong>Botengänge</strong> — Apotheke, Post, Reinigung, Rezept abholen</li>
          </ul>
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--ink3)' }}>
            Was genau gebraucht wird, besprechen wir vorab in Ruhe. Es gibt kein festes Paket,
            das Sie abnehmen müssen.
          </p>
        </section>

        {/* ── Einsatzgebiet ────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Einsatzgebiet in {city.name}</h3>
          <p>{city.lokal}</p>
          <p style={{ marginTop: 8 }}>{city.schwerpunkt}</p>
          <ul className="info-list" style={{ marginTop: 10 }}>
            {city.stadtteile.map(t => <li key={t}>{t}</li>)}
          </ul>
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--ink3)' }}>
            Ihr Stadtteil ist nicht dabei? Fragen Sie trotzdem an — wir bauen das Einsatzgebiet
            laufend aus, und Ihre Anfrage zeigt uns, wo der Bedarf ist.
          </p>
        </section>

        {/* ── Kosten und Finanzierung ──────────────────────────────── */}
        <section className="info-card">
          <h3>Kosten und Finanzierung</h3>
          <div className="info-price-row">
            <span className="info-price-label">Haushaltshilfe</span>
            <span className="info-price-val">ab 32 €/Std.</span>
          </div>
          <div className="info-price-row">
            <span className="info-price-label">Entlastungsbetrag (§ 45b SGB XI)</span>
            <span className="info-price-val">131 €/Monat</span>
          </div>
          <p className="info-price-note">
            Pflegebedürftigen mit Pflegegrad steht der Entlastungsbetrag grundsätzlich zur
            Verfügung, bereits ab Pflegegrad 1. Nicht genutzte Beträge verfallen am 30. Juni
            des Folgejahres. <strong>{HINWEIS_ANERKENNUNG}</strong>
          </p>
          <p style={{ marginTop: 10 }}>
            Unabhängig davon sind haushaltsnahe Dienstleistungen nach § 35a EStG mit 20 % der
            Arbeitskosten steuerlich absetzbar (höchstens 4.000 € im Jahr) — vorausgesetzt, es
            gibt eine Rechnung und Sie zahlen per Überweisung.
          </p>
          <p style={{ marginTop: 10, fontSize: 14 }}>
            Mehr dazu auf unseren Seiten zum{' '}
            <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>, zur{' '}
            <Link href="/finanzierung">Finanzierung</Link> und im{' '}
            <Link href="/budgetrechner">Budgetrechner</Link>.
          </p>
        </section>

        {/* ── Warteliste ───────────────────────────────────────────── */}
        <section className="info-card" style={{ borderLeft: '3px solid #C9963C' }}>
          <h3>Jetzt unverbindlich vormerken</h3>
          <p>
            Wir bauen unser Angebot in {city.name} weiter aus. Lassen Sie sich kostenlos
            vormerken — wir melden uns, sobald wir bei Ihnen starten können. Es entsteht kein
            Vertrag und keine Zahlungspflicht.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/warteliste" className="btn-gold" style={{ width: '100%' }}>
              JETZT UNVERBINDLICH VORMERKEN
            </Link>
          </div>
        </section>

        {/* ── Beratung ─────────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Rückruf vereinbaren</h3>
          <p style={{ marginBottom: 16 }}>
            Sie haben Fragen zur Haushaltshilfe in {city.name} oder zum Entlastungsbetrag?
            Hinterlassen Sie Ihre Nummer — wir rufen zurück, kostenlos und unverbindlich.
          </p>
          <LeadForm defaultService="Haushaltshilfe" source={`haushaltshilfe-${city.slug}`} />
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Häufige Fragen zur Haushaltshilfe in {city.name}</h3>
          {faqs.map(faq => (
            <details className="info-faq" key={faq.frage}>
              <summary>{faq.frage}</summary>
              <p>{faq.antwort}</p>
            </details>
          ))}
        </section>

        {/* ── Recruiting ───────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Als Haushaltshilfe in {city.name} arbeiten</h3>
          <p>
            Wir suchen laufend zuverlässige Menschen in {city.name} und Umgebung. Eine
            pflegerische Ausbildung ist nicht nötig — Sorgfalt und Verlässlichkeit zählen mehr.
            Du bestimmst selbst, wie viele Stunden du übernimmst.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href={`/engel-werden/${city.slug}`} className="btn-ghost" style={{ width: '100%' }}>
              ALS ENGEL IN {city.name.toUpperCase()} BEWERBEN
            </Link>
          </div>
        </section>

        {/* ── Weitere Dienste ──────────────────────────────────────── */}
        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <ul className="info-list">
            <li>
              <Link href={alltagsbegleitungHref}>Alltagsbegleitung in {city.name}</Link>
              {' '}— Begleitung, Gesellschaft, Arztbesuche
            </li>
            <li>
              <Link href={city.slug === 'frankfurt' ? '/krankenfahrten' : `/krankenfahrten/${city.slug}`}>
                Krankenfahrten in {city.name}
              </Link>
              {' '}— mit Verordnung zahlt die Krankenkasse (§ 60 SGB V)
            </li>
            <li>
              <Link href={city.slug === 'frankfurt' ? '/hygienebox' : `/hygienebox/${city.slug}`}>
                Pflegebox für {city.name}
              </Link>
              {' '}— Pflegehilfsmittel, 42 €/Monat nach § 40 SGB XI
            </li>
            <li>
              <Link href="/verhinderungspflege">Verhinderungspflege</Link>
              {' '}— Ersatzpflege bis 3.539 €/Jahr (§ 39 SGB XI)
            </li>
          </ul>
        </section>

        {/* ── Nachbarstädte ────────────────────────────────────────── */}
        <section className="info-card">
          <h3>Auch in Ihrer Nähe</h3>
          <p>Haushaltshilfe bieten wir auch in diesen Städten an:</p>
          <ul className="info-list">
            {city.nachbarn
              // Fail-closed gegen tote Links: ein Slug, der nicht in `cities`
              // steht, würde beim Rendern auf undefined.name laufen und die
              // ganze Seite mitnehmen.
              .filter(slug => cities[slug])
              .map(slug => (
                <li key={slug}>
                  <Link href={`/haushaltshilfe/${slug}`}>Haushaltshilfe {cities[slug].name}</Link>
                </li>
              ))}
          </ul>
        </section>

        <div className="legal-footer-nav">
          <Link href="/haushaltshilfe">Haushaltshilfe</Link>
          <Link href="/alltagsbegleitung">Alltagsbegleitung</Link>
          <Link href="/warteliste">Warteliste</Link>
          <Link href="/entlastungsbetrag">Entlastungsbetrag</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/impressum">Impressum</Link>
        </div>
      </div>
    </div>
  )
}
