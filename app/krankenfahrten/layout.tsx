import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Krankenfahrten Frankfurt | Krankentransport & Patientenfahrten — Alltagsengel',
  description: 'Zuverlässige Krankenfahrten in Frankfurt am Main und Umgebung. Arztfahrten, Dialysefahrten, Krankenhausfahrten — mit Rezept kostenfrei. Jetzt online buchen.',
  keywords: ['Krankenfahrten Frankfurt', 'Krankentransport Frankfurt', 'Patientenfahrten', 'Dialysefahrten Frankfurt', 'Arztfahrten', 'Krankenfahrten buchen', 'Krankenfahrten Rezept'],
  openGraph: {
    title: 'Krankenfahrten Frankfurt — Zuverlässiger Krankentransport',
    description: 'Krankenfahrten in Frankfurt und Umgebung. Arzt-, Dialyse- und Krankenhausfahrten. Mit ärztlicher Verordnung kostenfrei.',
    url: 'https://alltagsengel.care/krankenfahrten',
    siteName: 'Alltagsengel',
    locale: 'de_DE',
    type: 'website',
  },
  alternates: { canonical: 'https://alltagsengel.care/krankenfahrten' },
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Krankenfahrten Frankfurt',
  description: 'Professionelle Krankenfahrten und Patientenfahrten in Frankfurt am Main. Arztfahrten, Dialysefahrten, Krankenhausfahrten.',
  provider: {
    '@type': 'Organization',
    name: 'Alltagsengel',
    url: 'https://alltagsengel.care',
    address: { '@type': 'PostalAddress', addressLocality: 'Frankfurt am Main', addressRegion: 'Hessen', addressCountry: 'DE' },
  },
  areaServed: [
    { '@type': 'City', name: 'Frankfurt am Main' },
    { '@type': 'State', name: 'Hessen' },
  ],
  serviceType: 'Krankenfahrten',
}

export default function KrankenfahrtenLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {children}
    </>
  )
}
