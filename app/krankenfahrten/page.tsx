import type { Metadata } from 'next'
import KrankenfahrtenContent from './KrankenfahrtenContent'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'

export const metadata: Metadata = {
  title: 'Krankenfahrten Frankfurt & Rhein-Main — mit Verordnung oder als Selbstzahler',
  description:
    'Krankenfahrt buchen in Frankfurt & Rhein-Main: Fahrten zu Arzt, Dialyse, Klinik und Therapie. Mit ärztlicher Verordnung zahlt die Krankenkasse (§60 SGB V) — oder einfach als Selbstzahler. Pünktliche Abholung, Begleitung bis zur Tür.',
  keywords: [
    'Krankenfahrt Frankfurt',
    'Krankenfahrt buchen',
    'Krankenfahrt Verordnung',
    'Krankentransport sitzend',
    'Fahrdienst Arzt Frankfurt',
    'Dialysefahrt Frankfurt',
    'Krankenfahrt Kostenübernahme §60 SGB V',
    'Patientenfahrdienst Rhein-Main',
  ],
  alternates: { canonical: 'https://alltagsengel.care/krankenfahrten' },
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    title: 'Krankenfahrten Frankfurt & Rhein-Main — Alltagsengel',
    description:
      'Fahrten zu Arzt, Dialyse und Klinik — mit Verordnung von der Krankenkasse gezahlt (§60 SGB V) oder als Selbstzahler. Pünktlich, versichert, mit Begleitung bis zur Tür.',
    url: 'https://alltagsengel.care/krankenfahrten',
    type: 'website',
  },
}

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': 'https://alltagsengel.care/krankenfahrten#service',
  name: 'Krankenfahrten (sitzender Krankentransport)',
  serviceType: 'Krankenfahrt / Patientenfahrdienst',
  description:
    'Vermittlung von Krankenfahrten zu Arzt-, Dialyse-, Klinik- und Therapieterminen in Frankfurt am Main und dem Rhein-Main-Gebiet. Mit ärztlicher Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V ganz oder teilweise; alternativ als Selbstzahler buchbar.',
  provider: { '@id': 'https://alltagsengel.care/#organization' },
  areaServed: [
    'Frankfurt am Main',
    'Offenbach am Main',
    'Wiesbaden',
    'Darmstadt',
    'Hanau',
    'Bad Homburg',
    'Mainz',
    'Aschaffenburg',
    'Neu-Isenburg',
    'Friedberg (Wetterau)',
    'Rhein-Main-Gebiet',
  ].map((name) => ({ '@type': 'City', name })),
  availableChannel: {
    '@type': 'ServiceChannel',
    serviceUrl: 'https://alltagsengel.care/choose',
    servicePhone: '+491783382825',
    availableLanguage: 'de',
  },
  termsOfService: 'https://alltagsengel.care/agb',
}

export default function KrankenfahrtenPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <BreadcrumbSchema items={[{ name: 'Krankenfahrten' }]} />
      <KrankenfahrtenContent />
    </>
  )
}
