import type { Metadata } from 'next'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'

export const metadata: Metadata = {
  title: 'Krankenfahrten Frankfurt & Rhein-Main | Mit Verordnung oder Selbstzahler — Alltagsengel',
  description:
    'Krankenfahrten in Frankfurt & Rhein-Main buchen. Mit ärztlicher Verordnung über die Krankenkasse (§60 SGB V) oder als Selbstzahler. Arztfahrten, Dialysefahrten, Klinikfahrten — sicher und pünktlich über die App.',
  keywords: [
    'Krankenfahrt Frankfurt',
    'Krankenfahrt buchen',
    'Patientenfahrdienst Frankfurt',
    'Krankenfahrt Rhein-Main',
    '§60 SGB V',
    'Krankenfahrt Verordnung',
    'Krankenfahrt Krankenkasse',
    'Krankentransport Frankfurt',
    'Dialysefahrt Frankfurt',
    'Arztfahrt buchen',
    'Krankenfahrt Selbstzahler',
  ],
  openGraph: {
    title: 'Krankenfahrten Frankfurt & Rhein-Main — Alltagsengel',
    description:
      'Krankenfahrten sicher buchen. Mit Verordnung zahlt die Krankenkasse (§60 SGB V). Auch als Selbstzahler — alles in der App.',
    url: 'https://alltagsengel.care/krankenfahrten',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/krankenfahrten' },
}

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': 'https://alltagsengel.care/#service-krankenfahrt',
  name: 'Krankenfahrt-Vermittlung (Frankfurt & Rhein-Main)',
  description:
    'Sichere Krankenfahrten zu Arzt, Klinik, Dialyse und Therapie in Frankfurt am Main und dem Rhein-Main-Gebiet. Mit ärztlicher Verordnung über die Krankenkasse abrechenbar (§60 SGB V) oder als Selbstzahler buchbar.',
  provider: {
    '@type': 'Organization',
    '@id': 'https://alltagsengel.care/#organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Neue Mainzer Straße 66-68',
      postalCode: '60311',
      addressLocality: 'Frankfurt am Main',
      addressRegion: 'Hessen',
      addressCountry: 'DE',
    },
  },
  serviceType: 'Krankenfahrt / Patientenfahrdienst',
  areaServed: [
    { '@type': 'City', name: 'Frankfurt am Main' },
    { '@type': 'City', name: 'Offenbach am Main' },
    { '@type': 'City', name: 'Darmstadt' },
    { '@type': 'City', name: 'Wiesbaden' },
    { '@type': 'City', name: 'Mainz' },
    { '@type': 'City', name: 'Hanau' },
    { '@type': 'City', name: 'Bad Homburg' },
    { '@type': 'City', name: 'Oberursel' },
    { '@type': 'City', name: 'Aschaffenburg' },
    { '@type': 'AdministrativeArea', name: 'Rhein-Main-Gebiet' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Krankenfahrt-Optionen',
    itemListElement: [
      {
        '@type': 'Offer',
        name: 'Krankenfahrt mit Verordnung',
        description:
          'Abrechnung über die Krankenkasse nach §60 SGB V. Gesetzliche Zuzahlung 5–10 € pro Fahrt.',
      },
      {
        '@type': 'Offer',
        name: 'Krankenfahrt als Selbstzahler',
        description: 'Ohne Verordnung als Selbstzahler buchbar. Preise nach Region und Fahrtart.',
      },
    ],
  },
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Was kostet eine Krankenfahrt?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Mit ärztlicher Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V. Es fällt eine gesetzliche Zuzahlung von 10 % an (mindestens 5 €, höchstens 10 € pro Fahrt). Ohne Verordnung fahren Sie als Selbstzahler — die Preise richten sich nach Region, Fahrtart und Hilfebedarf.',
      },
    },
    {
      '@type': 'Question',
      name: 'Brauche ich eine Verordnung für die Krankenfahrt?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Nein, eine Verordnung ist nur nötig, damit die Krankenkasse zahlt. Ohne Verordnung buchen Sie als Selbstzahler. Haben Sie eine Verordnung? Einfach als Foto oder PDF in der App hochladen.',
      },
    },
    {
      '@type': 'Question',
      name: 'In welchem Gebiet sind Krankenfahrten verfügbar?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Alltagsengel vermittelt Krankenfahrten in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet über ein Netz qualifizierter Partnerfahrer.',
      },
    },
    {
      '@type': 'Question',
      name: 'Wie buche ich eine Krankenfahrt bei Alltagsengel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie Datum und Zielort, und ein qualifizierter Fahrer wird Ihnen zugeteilt. Die Buchung dauert nur 2 Minuten — direkt in der App.',
      },
    },
  ],
}

export default function KrankenfahrtenLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <BreadcrumbSchema items={[{ name: 'Krankenfahrten' }]} />
      <HowToSchema
        name="Krankenfahrt bei Alltagsengel buchen"
        description="So buchen Sie eine Krankenfahrt in Frankfurt & Rhein-Main über die Alltagsengel-App — mit Verordnung (Krankenkasse zahlt) oder als Selbstzahler."
        totalTime="PT2M"
        steps={[
          { name: 'Kostenlos registrieren', text: 'Erstellen Sie ein kostenloses Konto bei Alltagsengel in der App oder auf alltagsengel.care.', url: '/auth/register' },
          { name: 'Fahrt buchen', text: 'Wählen Sie Datum, Uhrzeit und Zielort (Arzt, Klinik, Dialyse, Therapie). Geben Sie Ihren Hilfebedarf an.' },
          { name: 'Verordnung hochladen (optional)', text: 'Haben Sie eine ärztliche Verordnung? Laden Sie diese als Foto oder PDF hoch — die Krankenkasse übernimmt die Kosten nach §60 SGB V.' },
          { name: 'Fahrer wird zugeteilt', text: 'Ein qualifizierter Fahrer aus unserem Partnernetz wird Ihnen zugeteilt. Pünktliche Abholung garantiert.' },
        ]}
      />
      {children}
    </>
  )
}
