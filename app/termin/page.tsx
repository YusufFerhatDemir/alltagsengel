import Link from 'next/link'
import type { Metadata } from 'next'
import TerminBuchung from '@/components/TerminBuchung'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Termin online buchen | Kostenlose Pflege-Beratung — Alltagsengel',
  description: 'Beratungstermin in 1 Minute online buchen: Alltagsbegleitung, Pflege-Box oder Krankenfahrt in Frankfurt & Rhein-Main. Wunschtag wählen, wir rufen zurück — kostenlos.',
  keywords: ['Termin buchen Pflege', 'Pflegeberatung Termin', 'Alltagsbegleitung Termin', 'Beratungstermin Pflegekasse', 'Online Terminbuchung Pflege Frankfurt'],
  openGraph: {
    title: 'Termin online buchen — kostenlose Pflege-Beratung',
    description: 'Wunschtag und Zeitfenster wählen, wir rufen zurück. Alltagsbegleitung, Pflege-Box, Krankenfahrten — Frankfurt & Rhein-Main.',
    url: 'https://alltagsengel.care/termin',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/termin' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Kostenlose Pflege-Beratung — Online-Terminbuchung',
  url: 'https://alltagsengel.care/termin',
  description: 'Online-Terminbuchung für kostenlose Beratung zu Alltagsbegleitung (§45b SGB XI), Pflege-Box (§40) und Krankenfahrten in Frankfurt und Rhein-Main.',
  provider: { '@type': 'Organization', name: 'Alltagsengel', url: 'https://alltagsengel.care' },
  areaServed: { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR', description: 'Beratung kostenlos und unverbindlich' },
  potentialAction: {
    '@type': 'ScheduleAction',
    target: { '@type': 'EntryPoint', urlTemplate: 'https://alltagsengel.care/termin', actionPlatform: 'https://schema.org/DesktopWebPlatform' },
    name: 'Beratungstermin buchen',
  },
}

export default function TerminPage() {
  return (
    <div className="screen info-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BreadcrumbSchema items={[{ name: 'Termin buchen' }]} />

      <div className="legal-header">
        <Link href="/" className="legal-back">‹</Link>
        <h1 className="legal-title">Termin buchen</h1>
      </div>

      <div className="info-body">
        <div className="info-hero">
          <div className="info-hero-icon">📅</div>
          <h2 className="info-hero-title">Ihr Termin in 1 Minute</h2>
          <p className="info-hero-sub">
            Leistung wählen, Wunschtag aussuchen, fertig — wir rufen Sie zur Bestätigung an.
            Kostenlos, unverbindlich, ohne Registrierung.
          </p>
        </div>

        <TerminBuchung />

        <section className="info-card" style={{ marginTop: 18 }}>
          <h3>Lieber sofort sprechen?</h3>
          <ul className="info-list">
            <li>WhatsApp: <a href="https://wa.me/491783382825" target="_blank" rel="noopener noreferrer">+49 178 3382825</a></li>
            <li><Link href="/kontakt">Kontaktformular</Link> — wir antworten innerhalb von 24 Stunden</li>
            <li>Erst informieren? <Link href="/budgetrechner">Budgetrechner</Link> und <Link href="/pflegegrad-check">Pflegegrad-Check</Link></li>
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
