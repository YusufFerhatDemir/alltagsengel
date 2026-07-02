import Link from 'next/link'
import type { Metadata } from 'next'
import BudgetRechner from '@/components/BudgetRechner'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Entlastungsbetrag-Rechner 2026 | Restbudget sofort berechnen — Alltagsengel',
  description: 'Kostenloser Budgetrechner: Wie viel Entlastungsbetrag (131€/Monat, §45b SGB XI) steht Ihnen noch zu? Restbudget, Übertrag und Umwandlungsanspruch in 10 Sekunden berechnen.',
  keywords: ['Entlastungsbetrag Rechner', 'Entlastungsbetrag 2026', '131 Euro Pflegekasse', 'Restbudget Entlastungsbetrag', '§45b SGB XI Rechner', 'Umwandlungsanspruch', 'Pflegegrad Budget'],
  openGraph: {
    title: 'Entlastungsbetrag-Rechner — Ihr ungenutztes Pflegebudget in 10 Sekunden',
    description: 'Berechnen Sie sofort, wie viel von Ihren 131€/Monat Entlastungsbetrag noch ungenutzt ist — inkl. Übertrag und Umwandlungsanspruch.',
    url: 'https://alltagsengel.care/budgetrechner',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/budgetrechner' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Entlastungsbetrag-Rechner',
  url: 'https://alltagsengel.care/budgetrechner',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  description: 'Kostenloser Rechner für den Entlastungsbetrag nach §45b SGB XI: Restbudget, Vorjahres-Übertrag und Umwandlungsanspruch sofort berechnen.',
  provider: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Wie hoch ist der Entlastungsbetrag 2026?',
      acceptedAnswer: { '@type': 'Answer', text: 'Der Entlastungsbetrag nach §45b SGB XI beträgt 131 € pro Monat (1.572 € pro Jahr) und steht allen Pflegebedürftigen mit Pflegegrad 1 bis 5 zu.' },
    },
    {
      '@type': 'Question',
      name: 'Verfällt der Entlastungsbetrag?',
      acceptedAnswer: { '@type': 'Answer', text: 'Nicht genutzte Beträge sammeln sich innerhalb des Kalenderjahres an und können ins Folgejahr übertragen werden. Der Übertrag verfällt jedoch am 30. Juni des Folgejahres.' },
    },
    {
      '@type': 'Question',
      name: 'Was ist der Umwandlungsanspruch?',
      acceptedAnswer: { '@type': 'Answer', text: 'Bei Pflegegrad 2 bis 5 können bis zu 40 % der Pflegesachleistung zusätzlich für anerkannte Angebote zur Unterstützung im Alltag eingesetzt werden (§45a Abs. 4 SGB XI) — je nach Pflegegrad bis zu 919 € pro Monat zusätzlich.' },
    },
    {
      '@type': 'Question',
      name: 'Muss ich den Entlastungsbetrag beantragen?',
      acceptedAnswer: { '@type': 'Answer', text: 'Nein, ein Antrag ist nicht nötig. Sie reichen die Rechnungen anerkannter Anbieter wie Alltagsengel bei Ihrer Pflegekasse ein — oder wir rechnen per Abtretungserklärung direkt mit der Kasse ab.' },
    },
  ],
}

export default function BudgetrechnerPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Budgetrechner' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Budgetrechner</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">🧮</div>
          <h2 className="info-hero-title">Wie viel Pflegebudget verschenken Sie?</h2>
          <p className="info-hero-sub">
            131 € stehen Ihnen jeden Monat zu (§45b SGB XI) — rund 60 % davon bleiben deutschlandweit ungenutzt.
            Berechnen Sie in 10 Sekunden Ihr Restbudget.
          </p>
        </div>

        <BudgetRechner />

        <section className="info-card" style={{ marginTop: 18 }}>
          <h3>So nutzen Sie Ihr Budget — ohne Papierkram</h3>
          <div className="info-steps">
            <div className="info-step">
              <div className="info-step-num">1</div>
              <div className="info-step-text">Restbudget oben berechnen und kostenlose Beratung anfragen</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">2</div>
              <div className="info-step-text">Wir klären alles mit Ihrer Pflegekasse — inkl. Abtretungserklärung</div>
            </div>
            <div className="info-step">
              <div className="info-step-num">3</div>
              <div className="info-step-text">Ihr Engel kommt: Einkauf, Haushalt, Arztbegleitung, Gesellschaft — 0 € Eigenanteil</div>
            </div>
          </div>
        </section>

        <section className="info-card">
          <h3>Jetzt Restbudget sichern</h3>
          <p style={{ marginBottom: 16 }}>
            Wir prüfen kostenlos, wie viel Budget Ihnen wirklich zusteht — inklusive Übertrag und
            Umwandlungsanspruch — und übernehmen die komplette Abrechnung mit der Pflegekasse.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="budgetrechner" />
        </section>

        <section className="info-card">
          <h3>Mehr zum Thema</h3>
          <ul className="info-list">
            <li><Link href="/blog/entlastungsbetrag-45b">Entlastungsbetrag §45b richtig nutzen</Link></li>
            <li><Link href="/blog/entlastungsbetrag-rueckwirkend">Entlastungsbetrag rückwirkend erhalten</Link></li>
            <li><Link href="/pflegegrad-check">Noch kein Pflegegrad? Jetzt kostenlos einschätzen</Link></li>
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
