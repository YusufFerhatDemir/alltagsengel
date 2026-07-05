import Link from 'next/link'
import type { Metadata } from 'next'
import EinzugsgebietLeaflet from '@/components/EinzugsgebietLeaflet'
import LeadForm from '@/components/LeadForm'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Einzugsgebiet & PLZ-Check — Frankfurt + 30 km Umkreis',
  description: 'Sind wir bei Ihnen verfügbar? PLZ eingeben und sofort prüfen: Alltagsengel bietet Alltagsbegleitung (§45a SGB XI, Abrechnung über §45b) in Frankfurt am Main und 30 km Umkreis — Offenbach, Hanau, Bad Homburg, Darmstadt u. v. m.',
  keywords: ['Alltagsbegleitung Frankfurt Einzugsgebiet', 'Alltagsbegleitung PLZ prüfen', 'Betreuungsdienst Rhein-Main', 'Alltagshilfe Frankfurt Umkreis', '§45b SGB XI Frankfurt'],
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Einzugsgebiet-Check: Ist Alltagsengel bei Ihnen verfügbar?',
    description: 'PLZ eingeben und sofort sehen, ob wir zu Ihnen kommen — Frankfurt am Main + 30 km Umkreis.',
    url: 'https://alltagsengel.care/einzugsgebiet',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/einzugsgebiet' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Alltagsbegleitung nach §45a SGB XI (Abrechnung über §45b)',
  serviceType: 'Alltagsbegleitung / häusliche Betreuung',
  provider: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
  },
  areaServed: {
    '@type': 'GeoCircle',
    geoMidpoint: {
      '@type': 'GeoCoordinates',
      latitude: 50.1155,
      longitude: 8.6842,
      postalCode: '60313',
      addressCountry: 'DE',
    },
    geoRadius: '30000',
    description: 'Frankfurt am Main und 30 km Umkreis (Rhein-Main-Gebiet)',
  },
  url: 'https://alltagsengel.care/einzugsgebiet',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'In welchen Städten ist Alltagsengel verfügbar?',
      acceptedAnswer: { '@type': 'Answer', text: 'Alltagsengel ist in Frankfurt am Main und im Umkreis von 30 Kilometern verfügbar — u. a. Offenbach, Hanau, Bad Homburg, Oberursel, Neu-Isenburg, Dreieich, Langen, Rodgau, Eschborn, Hofheim, Rüsselsheim und Darmstadt.' },
    },
    {
      '@type': 'Question',
      name: 'Was passiert, wenn meine PLZ außerhalb des Einzugsgebiets liegt?',
      acceptedAnswer: { '@type': 'Answer', text: 'Im Randgebiet (z. B. Wiesbaden, Mainz, Aschaffenburg) helfen wir oft trotzdem — fragen Sie einfach unverbindlich an. Außerhalb davon nehmen wir Ihre Kontaktdaten auf und melden uns, sobald wir Ihre Region erreichen.' },
    },
    {
      '@type': 'Question',
      name: 'Kostet die Anfahrt extra?',
      acceptedAnswer: { '@type': 'Answer', text: 'Nein. Innerhalb unseres Einzugsgebiets (Frankfurt + 30 km) fallen keine zusätzlichen Anfahrtskosten an. Die Alltagsbegleitung rechnen wir direkt über den Entlastungsbetrag (131 €/Monat, §45b SGB XI) mit Ihrer Pflegekasse ab.' },
    },
  ],
}

export default function EinzugsgebietPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Einzugsgebiet' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Einzugsgebiet</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📍</div>
          <h2 className="info-hero-title">Sind wir bei Ihnen verfügbar?</h2>
          <p className="info-hero-sub">
            Frankfurt am Main und 30 km Umkreis — geben Sie Ihre Postleitzahl ein
            und sehen Sie sofort, ob wir zu Ihnen kommen.
          </p>
        </div>

        <section className="info-card">
          <EinzugsgebietLeaflet />
        </section>

        <section className="info-card" style={{ marginTop: 18 }}>
          <h3>Unser Kerngebiet im Überblick</h3>
          <p style={{ marginBottom: 12 }}>
            Von unserem Standort in der Frankfurter Innenstadt (Neue Mainzer Straße 66-68, 60311)
            erreichen wir das gesamte Rhein-Main-Gebiet:
          </p>
          <ul className="info-list">
            <li><Link href="/alltagsbegleitung/frankfurt">Frankfurt am Main</Link> — alle Stadtteile inkl. Höchst</li>
            <li><Link href="/alltagsbegleitung/offenbach">Offenbach</Link> und Kreis Offenbach (Neu-Isenburg, Dreieich, Langen, Dietzenbach, Rodgau)</li>
            <li><Link href="/alltagsbegleitung/hanau">Hanau</Link>, Maintal und Bruchköbel</li>
            <li><Link href="/alltagsbegleitung/bad-homburg">Bad Homburg</Link>, Oberursel und der Hochtaunuskreis</li>
            <li>Main-Taunus-Kreis: Eschborn, Hofheim, Kelkheim, Bad Soden</li>
            <li>Rüsselsheim, Kelsterbach, Mörfelden-Walldorf und Groß-Gerau</li>
            <li><Link href="/alltagsbegleitung/darmstadt">Darmstadt</Link> und Bad Vilbel / Wetterau (Süd)</li>
          </ul>
        </section>

        <section className="info-card">
          <h3>Ihre Region war nicht dabei?</h3>
          <p style={{ marginBottom: 16 }}>
            Wir wachsen schnell. Hinterlassen Sie Ihre Nummer — wir prüfen kostenlos,
            ob wir Sie schon versorgen können, und melden uns umgehend zurück.
          </p>
          <LeadForm defaultService="Alltagsbegleitung" source="einzugsgebiet" />
        </section>

        <section className="info-card">
          <h3>Mehr zum Thema</h3>
          <ul className="info-list">
            <li><Link href="/budgetrechner">Budgetrechner: Ihr Entlastungsbetrag (131 €/Monat)</Link></li>
            <li><Link href="/pflegegrad-check">Pflegegrad-Check: Kostenlos einschätzen</Link></li>
            <li><Link href="/alltagsbegleitung">Alltagsbegleitung im Detail</Link></li>
            <li><Link href="/termin">Online-Termin buchen</Link></li>
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
