import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LeadForm from '@/components/LeadForm'

// ═══════════════════════════════════════════════════════════
// City-specific Pflegebox pages for Rhein-Main area
// ═══════════════════════════════════════════════════════════

interface CityData {
  name: string
  region: string
  slug: string
  plz: string
  description: string
}

const cities: Record<string, CityData> = {
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
    title: `Pflegebox ${city.name} | Kostenlose Pflegehilfsmittel 42€/Monat — Alltagsengel`,
    description: `Pflegebox in ${city.name} kostenlos bestellen. Pflegehilfsmittel nach §40 SGB XI — Handschuhe, Desinfektionsmittel, Bettschutz. 42€/Monat von der Pflegekasse, 0€ Zuzahlung.`,
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
    ],
    openGraph: {
      title: `Kostenlose Pflegebox ${city.name} — 42€/Monat | Alltagsengel`,
      description: `Pflegehilfsmittel monatlich nach ${city.name} geliefert. 0€ Zuzahlung bei Pflegegrad 1-5. Handschuhe, Desinfektion, Bettschutz.`,
      url: `https://alltagsengel.care/hygienebox/${city.slug}`,
      siteName: 'Alltagsengel',
      locale: 'de_DE',
      type: 'website',
    },
    alternates: { canonical: `https://alltagsengel.care/hygienebox/${city.slug}` },
  }
}

function buildJsonLd(city: CityData) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: `Pflegebox ${city.name}`,
        description: `Monatliche Pflegehilfsmittel-Box nach §40 SGB XI, direkt nach ${city.name} geliefert. Enthält Einmalhandschuhe, Desinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen.`,
        brand: { '@type': 'Brand', name: 'Alltagsengel' },
        offers: [
          {
            '@type': 'Offer',
            name: 'Basis-Box',
            price: '29.90',
            priceCurrency: 'EUR',
            description: 'Grundversorgung mit Pflegehilfsmitteln',
            availability: 'https://schema.org/InStock',
            areaServed: { '@type': 'City', name: city.name },
          },
          {
            '@type': 'Offer',
            name: 'Komfort-Box',
            price: '40.00',
            priceCurrency: 'EUR',
            description: 'Vollständige Versorgung — maximale Kassenerstattung (42€)',
            availability: 'https://schema.org/InStock',
            areaServed: { '@type': 'City', name: city.name },
          },
        ],
        areaServed: { '@type': 'City', name: city.name },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: `Kann ich eine Pflegebox nach ${city.name} liefern lassen?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Ja! Alltagsengel liefert die Pflegebox direkt zu Ihnen nach ${city.name} — monatlich, kostenlos und ohne Zuzahlung bei anerkanntem Pflegegrad.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Wer hat Anspruch auf eine Pflegebox?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Jede Person mit anerkanntem Pflegegrad (1-5), die zu Hause gepflegt wird, hat Anspruch auf Pflegehilfsmittel zum Verbrauch im Wert von bis zu 42€ pro Monat nach §40 SGB XI.',
            },
          },
          {
            '@type': 'Question',
            name: 'Muss ich für die Pflegebox etwas bezahlen?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Nein. Die Pflegekasse übernimmt bis zu 42€ pro Monat für Pflegehilfsmittel zum Verbrauch. Bei Alltagsengel zahlen Sie 0€ Eigenanteil — wir rechnen direkt mit Ihrer Kasse ab.',
            },
          },
          {
            '@type': 'Question',
            name: 'Was ist in der Pflegebox enthalten?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Die Pflegebox enthält Einmalhandschuhe, Händedesinfektionsmittel, Flächendesinfektionsmittel, Bettschutzeinlagen, Mundschutz und Schutzschürzen — je nach gewählter Box-Variante.',
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Startseite', item: 'https://alltagsengel.care' },
          { '@type': 'ListItem', position: 2, name: 'Pflegebox', item: 'https://alltagsengel.care/hygienebox' },
          { '@type': 'ListItem', position: 3, name: `Pflegebox ${city.name}`, item: `https://alltagsengel.care/hygienebox/${city.slug}` },
        ],
      },
    ],
  }
}

export default async function PflegeboxStadtPage({ params }: { params: Promise<{ stadt: string }> }) {
  const { stadt } = await params
  const city = cities[stadt]
  if (!city) notFound()

  const jsonLd = buildJsonLd(city)

  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
              <div className="info-step-text">Registrieren Sie sich kostenlos bei Alltagsengel</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wählen Sie Ihre gewünschte Box-Zusammenstellung</div>
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
          <h3>Häufige Fragen zur Pflegebox in {city.name}</h3>
          <details className="info-faq">
            <summary>Wie lange dauert die Lieferung?</summary>
            <p>Nach Genehmigung durch die Pflegekasse erhalten Sie Ihre erste Box innerhalb von 3–5 Werktagen nach {city.name}.</p>
          </details>
          <details className="info-faq">
            <summary>Kann ich die Box jederzeit abbestellen?</summary>
            <p>Ja, Sie können die monatliche Lieferung jederzeit pausieren oder abbestellen — ohne Vertragsbindung.</p>
          </details>
          <details className="info-faq">
            <summary>Was passiert, wenn mein Pflegegrad sich ändert?</summary>
            <p>Der Anspruch besteht bei jedem Pflegegrad (1–5). Nur wenn der Pflegegrad komplett entfällt, endet der Anspruch.</p>
          </details>
          <details className="info-faq">
            <summary>Muss ich den Antrag selbst stellen?</summary>
            <p>Nein! Alltagsengel übernimmt die komplette Antragstellung bei Ihrer Pflegekasse. Sie müssen nur einmalig eine Vollmacht unterschreiben.</p>
          </details>
        </section>

        <section className="info-card">
          <h3>Jetzt Pflegebox bestellen</h3>
          <p style={{ marginBottom: 16 }}>
            Lassen Sie sich kostenlos beraten — wir helfen Ihnen, die Pflegebox für {city.name}
            schnell und unkompliziert zu erhalten.
          </p>
          <LeadForm defaultService="Pflegebox" source={`pflegebox-${city.slug}`} />
        </section>

        <section className="info-card">
          <h3>Weitere Dienste in {city.name}</h3>
          <p>Neben der Pflegebox bieten wir in {city.name} auch:</p>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung</Link> — 131 €/Monat über Entlastungsbetrag</li>
            <li><Link href="/krankenfahrten">Krankenfahrten</Link> — Mit Verordnung zahlt die Kasse</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
