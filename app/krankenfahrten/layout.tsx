import type { Metadata } from 'next'

// Hinweis: JSON-LD (Service, FAQPage, HowTo, BreadcrumbList) lebt ausschließlich in page.tsx
// bzw. [stadt]/page.tsx — das Layout darf KEINE Schemas emittieren, sonst entstehen
// Duplikate auf jeder Kind-Route.

export const metadata: Metadata = {
  title: 'Krankenfahrten Frankfurt & Rhein-Main',
  description:
    'Krankenfahrten in Frankfurt & Rhein-Main buchen: Arzt, Dialyse, Klinik. Mit Verordnung zahlt die Krankenkasse (§60 SGB V) — oder als Selbstzahler.',
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

export default function KrankenfahrtenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
