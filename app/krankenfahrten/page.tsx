import type { Metadata } from 'next'
import KrankenfahrtenContent from './KrankenfahrtenContent'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import HowToSchema from '@/components/HowToSchema'

export const metadata: Metadata = {
  title: 'Krankenfahrten Frankfurt & Rhein-Main buchen',
  description:
    'Krankenfahrten in Frankfurt & Rhein-Main: zu Arzt, Dialyse, Klinik und Therapie. Mit Verordnung zahlt die Krankenkasse (§60 SGB V). Jetzt Fahrt buchen!',
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

// EIN Array für sichtbare FAQ-Sektion UND FAQPage-Schema — beides muss aus derselben
// Quelle kommen (Google-Richtlinie: nur sichtbar gerenderte FAQs auszeichnen).
const faqItems = [
  {
    q: 'Was kostet eine Krankenfahrt?',
    a: 'Mit ärztlicher Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V. Es fällt eine gesetzliche Zuzahlung von 10 % an (mindestens 5 €, höchstens 10 € pro Fahrt). Ohne Verordnung fahren Sie als Selbstzahler — die Preise richten sich nach Region, Fahrtart und Hilfebedarf.',
  },
  {
    q: 'Brauche ich eine Verordnung für die Krankenfahrt?',
    a: 'Nein, eine Verordnung ist nur nötig, damit die Krankenkasse zahlt. Ohne Verordnung buchen Sie als Selbstzahler. Haben Sie eine Verordnung? Einfach als Foto oder PDF in der App hochladen.',
  },
  {
    q: 'In welchem Gebiet sind Krankenfahrten verfügbar?',
    a: 'Alltagsengel vermittelt Krankenfahrten in Frankfurt am Main und dem gesamten Rhein-Main-Gebiet über ein Netz qualifizierter Partnerfahrer.',
  },
  {
    q: 'Wie buche ich eine Krankenfahrt bei Alltagsengel?',
    a: 'Registrieren Sie sich kostenlos bei Alltagsengel, wählen Sie Datum und Zielort, und ein qualifizierter Fahrer wird Ihnen zugeteilt. Die Buchung dauert nur 2 Minuten — direkt in der App.',
  },
]

const serviceJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': 'https://alltagsengel.care/krankenfahrten#service',
  name: 'Krankenfahrt-Vermittlung (Frankfurt & Rhein-Main)',
  serviceType: 'Krankenfahrt / Patientenfahrdienst',
  description:
    'Vermittlung von Krankenfahrten zu Arzt-, Dialyse-, Klinik- und Therapieterminen in Frankfurt am Main und dem Rhein-Main-Gebiet. Mit ärztlicher Verordnung übernimmt die Krankenkasse die Kosten nach §60 SGB V ganz oder teilweise; alternativ als Selbstzahler buchbar.',
  image: 'https://alltagsengel.care/og-image.png',
  provider: { '@id': 'https://alltagsengel.care/#organization' },
  areaServed: [
    ...[
      'Frankfurt am Main',
      'Offenbach am Main',
      'Wiesbaden',
      'Darmstadt',
      'Hanau',
      'Bad Homburg',
      'Oberursel',
      'Mainz',
      'Aschaffenburg',
      'Neu-Isenburg',
      'Friedberg (Wetterau)',
    ].map((name) => ({ '@type': 'City', name })),
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
  availableChannel: {
    '@type': 'ServiceChannel',
    serviceUrl: 'https://alltagsengel.care/choose',
    servicePhone: '+491783382825',
    availableLanguage: 'de',
  },
  termsOfService: 'https://alltagsengel.care/agb',
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function KrankenfahrtenPage() {
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
      <KrankenfahrtenContent faqs={faqItems} />
    </>
  )
}
