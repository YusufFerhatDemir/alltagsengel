import Link from 'next/link'
import type { Metadata } from 'next'
import PflegegradCheck from '@/components/PflegegradCheck'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Pflegegrad-Check 2026 — kostenloser Selbsttest',
  description: 'Welcher Pflegegrad steht Ihnen zu? Kostenloser Selbsttest nach dem offiziellen Begutachtungsverfahren (NBA) mit sofortigem Ergebnis. Jetzt prüfen!',
  keywords: ['Pflegegrad Check', 'Pflegegrad Test', 'Pflegegrad berechnen', 'Pflegegrad Rechner 2026', 'NBA Begutachtung', 'Pflegegrad beantragen', 'Pflegegrad Einschätzung'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Pflegegrad-Check — kostenlose Einschätzung in 2 Minuten',
    description: 'Selbsttest nach dem offiziellen Begutachtungsverfahren: 6 Module, sofortiges Ergebnis, Leistungsübersicht (Entlastungsbetrag, Pflegegeld, Pflege-Box).',
    url: 'https://alltagsengel.care/pflegegrad-check',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/pflegegrad-check' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Pflegegrad-Check',
  url: 'https://alltagsengel.care/pflegegrad-check',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  description: 'Kostenloser Pflegegrad-Selbsttest nach der Systematik des offiziellen Begutachtungsinstruments (6 Module, gewichtete Punkte).',
  provider: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
}

// FAQ-Inhalte: speisen sowohl das FAQPage-JSON-LD als auch die sichtbare FAQ-Sektion unten
const faqItems = [
  {
    frage: 'Wie wird der Pflegegrad berechnet?',
    antwort: 'Der Medizinische Dienst bewertet sechs Lebensbereiche (Module) mit unterschiedlicher Gewichtung: Mobilität 10 %, kognitive/kommunikative Fähigkeiten bzw. Verhaltensweisen 15 %, Selbstversorgung 40 %, Umgang mit krankheitsbedingten Anforderungen 20 %, Alltagsleben 15 %. Ab 12,5 Punkten gibt es Pflegegrad 1, ab 27 Pflegegrad 2, ab 47,5 Pflegegrad 3, ab 70 Pflegegrad 4 und ab 90 Pflegegrad 5.',
  },
  {
    frage: 'Welche Leistungen gibt es ab Pflegegrad 1?',
    antwort: 'Bereits ab Pflegegrad 1: 131 € Entlastungsbetrag pro Monat (§45b SGB XI), bis zu 42 € monatlich für Pflegehilfsmittel (§40), Zuschüsse für Wohnraumanpassung und den Hausnotruf. Ab Pflegegrad 2 kommen Pflegegeld und Pflegesachleistungen hinzu.',
  },
  {
    frage: 'Wie beantrage ich einen Pflegegrad?',
    antwort: 'Formlos bei der Pflegekasse (Krankenkasse) anrufen oder schreiben und einen Antrag auf Pflegeleistungen stellen. Danach begutachtet der Medizinische Dienst zu Hause. Alltagsengel unterstützt Sie kostenlos bei Antrag und Vorbereitung.',
  },
  {
    frage: 'Ist der Pflegegrad-Check verbindlich?',
    antwort: 'Nein. Der Check ist eine kostenlose Ersteinschätzung auf Basis Ihrer Angaben. Verbindlich entscheidet die Pflegekasse nach Begutachtung durch den Medizinischen Dienst.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.frage,
    acceptedAnswer: { '@type': 'Answer', text: item.antwort },
  })),
}

export default function PflegegradCheckPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Pflegegrad-Check' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Pflegegrad-Check</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📋</div>
          <h2 className="info-hero-title">Welcher Pflegegrad steht Ihnen zu?</h2>
          <p className="info-hero-sub">
            Kostenlose Ersteinschätzung in 2 Minuten — nach der Systematik des offiziellen
            Begutachtungsverfahrens (6 Module). Sofortiges Ergebnis mit Leistungsübersicht.
          </p>
        </div>

        <PflegegradCheck />

        <section className="info-card" style={{ marginTop: 18 }}>
          <h3>Gut zu wissen</h3>
          <ul className="info-list">
            <li>Schon ab <strong>Pflegegrad 1</strong>: 131 €/Monat Entlastungsbetrag — z.&nbsp;B. für Alltagsbegleitung durch Alltagsengel</li>
            <li>Der Antrag bei der Pflegekasse ist formlos und kostenlos</li>
            <li>Leistungen gelten ab dem Monat der Antragstellung — früh stellen lohnt sich</li>
            <li>Bei Ablehnung ist ein Widerspruch innerhalb eines Monats möglich</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Häufige Fragen zum Pflegegrad-Check</h3>
          {faqItems.map((item, i) => (
            <details key={i} className="info-faq">
              <summary>{item.frage}</summary>
              <p>{item.antwort}</p>
            </details>
          ))}
        </section>

        <section className="info-card">
          <h3>Mehr zum Thema</h3>
          <ul className="info-list">
            <li><Link href="/blog/pflegegrad-beantragen">Ratgeber: Pflegegrad beantragen — Schritt für Schritt</Link></li>
            <li><Link href="/blog/pflegegrad-1-leistungen">Alle Leistungen bei Pflegegrad 1</Link></li>
            <li><Link href="/budgetrechner">Budgetrechner: Ihr Entlastungsbetrag-Restbudget</Link></li>
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung im Detail</Link></li>
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
