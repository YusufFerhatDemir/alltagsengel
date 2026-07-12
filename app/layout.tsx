import type { Metadata, Viewport } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'
import GoogleTagManager from '@/components/GoogleTagManager'
import ClientSideProviders from '@/components/ClientSideProviders'

// Fonts: Nur tatsächlich genutzte Gewichte laden (vorher: 5+8 = 13 Font-Dateien)
const jost = Jost({ subsets: ['latin'], variable: '--font-jost', weight: ['300','400','600','700'] })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400','600','700'], style: ['normal','italic'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom erlaubt (WCAG 1.4.4): Zielgruppe Senioren — Pinch-Zoom muss möglich sein.
  maximumScale: 5,
  userScalable: true,
  themeColor: '#1A1612',
  colorScheme: 'only dark' as any,
}

export const metadata: Metadata = {
  title: {
    default: 'Alltagsengel Frankfurt — Begleitung, Pflegebox, Krankenfahrt',
    template: '%s | Alltagsengel',
  },
  description: 'Alltagsbegleitung (§45b, 131 €/Monat), Pflegebox (0 € Eigenanteil) & Krankenfahrten in Frankfurt & Rhein-Main. Jetzt kostenlos in der App starten.',
  keywords: [
    'Alltagsbegleitung',
    'Alltagsbegleitung Frankfurt',
    'Alltagsbegleiter finden',
    'Alltagsbegleitung App',
    'Alltagsbegleitung Senioren',
    'Alltagsbegleitung buchen',
    'Pflegebox beantragen',
    'Pflegehilfsmittel Box kostenlos',
    'Pflegebox Frankfurt',
    'Pflege-Box §40 SGB XI',
    'Krankenfahrt buchen Frankfurt',
    'Krankenfahrt Rhein-Main',
    'Patientenfahrdienst Frankfurt',
    'Krankenfahrt Verordnung',
    'Krankenkasse §60 SGB V',
    '42 Euro Pflegekasse',
    'Pflegehilfsmittel kostenlos',
  ],
  metadataBase: new URL('https://alltagsengel.care'),
  // canonical bewusst NICHT global setzen — Sub-Pages müssen eigenes
  // alternates.canonical liefern, sonst würde jede URL auf "/" zeigen.
  alternates: {
    types: {
      'application/rss+xml': [{ url: '/blog/feed.xml', title: 'Alltagsengel Ratgeber' }],
    },
  },
  openGraph: {
    title: 'Alltagsengel — Alltagsbegleitung, Pflegebox & Krankenfahrt',
    description: 'Alltagsbegleitung über den Entlastungsbetrag (131 €/Monat) · Pflegebox 0 € Eigenanteil · Krankenfahrten — alles in der App.',
    url: 'https://alltagsengel.care',
    siteName: 'Alltagsengel.care',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Alltagsengel — Pflegebox & Krankenfahrt für Frankfurt und das Rhein-Main-Gebiet',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alltagsengel — Alltagsbegleitung, Pflegebox & Krankenfahrt',
    description: 'Alltagsbegleitung über den Entlastungsbetrag (131 €/Monat) · Pflegebox 0 € Eigenanteil · Krankenfahrten — alles in der App.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/favicon.ico', sizes: '32x32' },
    { rel: 'icon', url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png', sizes: '180x180' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Alltagsengel',
  },
  formatDetection: {
    telephone: false,
  },
  // Lokale Geo-Signale (Bing/legacy Crawler; Google nutzt primär JSON-LD)
  other: {
    'geo.region': 'DE-HE',
    'geo.placename': 'Frankfurt am Main',
    'geo.position': '50.1109;8.6821',
    ICBM: '50.1109, 8.6821',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" style={{ colorScheme: 'only dark' } as any}>
      <head>
        {/* ═══ RESOURCE HINTS (CWV) ═══ */}
        {/* GTM/gtag lädt auf jeder Seite afterInteractive → Preconnect spart
            DNS+TLS-Roundtrip auf dem kritischen Third-Party-Pfad. Für die
            übrigen Tracker reicht dns-prefetch (laden später/consent-abhängig,
            volle Sockets wären hier Verschwendung). */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://analytics.tiktok.com" />
        {/* ═══ ANDROID AUTO-DARK / AKKU-SPARMODUS SCHUTZ ═══ */}
        {/* Chrome Auto Dark Theme opt-out (offizielle Methode) */}
        <meta name="color-scheme" content="only dark" />
        <meta name="supported-color-schemes" content="dark" />
        {/* DarkReader Browser-Extension blockieren */}
        <meta name="darkreader-lock" />
        <meta name="darkreader" content="NO" />
        {/* Samsung Internet Dark Mode blockieren */}
        <meta name="nightmode" content="disable" />
        {/* Android Chrome Theme */}
        <meta name="theme-color" content="#1A1612" />
        <meta name="msapplication-navbutton-color" content="#1A1612" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Frühes Script: Auto-Dark Detection und Removal */}
        {/* ═══ JSON-LD STRUCTURED DATA ═══ */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': 'https://alltagsengel.care/#organization',
                name: 'Alltagsengel',
                legalName: 'Alltagsengel UG (haftungsbeschränkt)',
                url: 'https://alltagsengel.care',
                logo: {
                  '@type': 'ImageObject',
                  url: 'https://alltagsengel.care/icon-512x512.png',
                  width: 512,
                  height: 512,
                },
                image: 'https://alltagsengel.care/og-image.png',
                description: 'Pflege-Box (Pflegehilfsmittel nach §40 SGB XI, bis 42 €/Monat) und Krankenfahrten (mit Verordnung nach §60 SGB V oder als Selbstzahler) für Frankfurt und das Rhein-Main-Gebiet — bestellt und gebucht in der Alltagsengel-App.',
                telephone: '+491783382825',
                email: 'info@alltagsengel.care',
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: 'Neue Mainzer Straße 66-68',
                  postalCode: '60311',
                  addressLocality: 'Frankfurt am Main',
                  addressRegion: 'Hessen',
                  addressCountry: 'DE',
                },
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: 50.1109,
                  longitude: 8.6821,
                },
                contactPoint: [
                  {
                    '@type': 'ContactPoint',
                    telephone: '+491783382825',
                    contactType: 'customer service',
                    availableLanguage: ['German', 'Turkish', 'English'],
                    areaServed: 'DE',
                  },
                  {
                    '@type': 'ContactPoint',
                    telephone: '+491783382825',
                    contactType: 'customer service',
                    url: 'https://wa.me/491783382825',
                    description: 'WhatsApp',
                  },
                ],
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
                  { '@type': 'State', name: 'Hessen' },
                ],
                sameAs: [
                  'https://www.instagram.com/alltagsengel_ug',
                  'https://www.tiktok.com/@alltagsengel_ug',
                  'https://apps.apple.com/de/app/alltagsengel/id6761319222',
                ],
                foundingLocation: {
                  '@type': 'City',
                  name: 'Frankfurt am Main',
                },
                // Handelsregister als eindeutiger Identifier (Knowledge Graph / Wikidata)
                identifier: {
                  '@type': 'PropertyValue',
                  propertyID: 'Handelsregister',
                  value: 'Amtsgericht Frankfurt am Main, HRB 140351',
                },
                knowsAbout: [
                  'Entlastungsbetrag §45b SGB XI',
                  'Alltagsbegleitung nach §45a SGB XI',
                  'Pflegehilfsmittel zum Verbrauch §40 SGB XI',
                  'Krankenfahrten und Fahrkostenübernahme §60 SGB V',
                  'Pflegegrade und Begutachtung (NBA)',
                  'Verhinderungspflege',
                  'Seniorenbetreuung zu Hause',
                ],
                slogan: 'Alltagsbegleitung, Pflegebox und Krankenfahrten — über die Pflegekasse finanziert.',
              },
              {
                '@type': 'LocalBusiness',
                '@id': 'https://alltagsengel.care/#localbusiness',
                name: 'Alltagsengel',
                description: 'Alltagsbegleitung, Pflegebox und Krankenfahrten in Frankfurt und dem Rhein-Main-Gebiet. Pflegehilfsmittel nach §40 SGB XI (bis 42 €/Monat, 0 € Eigenanteil) und Krankenfahrten nach §60 SGB V.',
                url: 'https://alltagsengel.care',
                telephone: '+491783382825',
                email: 'info@alltagsengel.care',
                priceRange: '€',
                image: 'https://alltagsengel.care/og-image.png',
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: 'Neue Mainzer Straße 66-68',
                  postalCode: '60311',
                  addressLocality: 'Frankfurt am Main',
                  addressRegion: 'Hessen',
                  addressCountry: 'DE',
                },
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: 50.1109,
                  longitude: 8.6821,
                },
                openingHoursSpecification: [
                  {
                    '@type': 'OpeningHoursSpecification',
                    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    opens: '08:00',
                    closes: '18:00',
                  },
                ],
                currenciesAccepted: 'EUR',
                paymentAccepted: 'Rechnung, Überweisung, Abrechnung über die Pflegekasse',
                sameAs: [
                  'https://www.instagram.com/alltagsengel_ug',
                  'https://www.tiktok.com/@alltagsengel_ug',
                  'https://apps.apple.com/de/app/alltagsengel/id6761319222',
                ],
              },
              {
                // iOS-App im App Store (kein Play-Store-Eintrag — Android-App nicht live)
                '@type': 'MobileApplication',
                '@id': 'https://alltagsengel.care/#app',
                name: 'Alltagsengel',
                operatingSystem: 'iOS',
                applicationCategory: 'HealthApplication',
                installUrl: 'https://apps.apple.com/de/app/alltagsengel/id6761319222',
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'EUR',
                },
                publisher: { '@id': 'https://alltagsengel.care/#organization' },
              },
              {
                '@type': 'WebSite',
                '@id': 'https://alltagsengel.care/#website',
                url: 'https://alltagsengel.care',
                name: 'Alltagsengel',
                publisher: { '@id': 'https://alltagsengel.care/#organization' },
                inLanguage: 'de-DE',
                potentialAction: {
                  '@type': 'SearchAction',
                  target: 'https://alltagsengel.care/blog?q={search_term_string}',
                  'query-input': 'required name=search_term_string',
                },
              },
            ],
          }) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            // Ensure color-scheme is set before any rendering
            document.documentElement.style.colorScheme='dark';
            // Remove any filter/inversion applied by browser dark mode
            var s=document.documentElement.style;
            if(s.filter)s.filter='none';
            // Observer: watch for browser-injected style changes
            var obs=new MutationObserver(function(m){
              m.forEach(function(r){
                if(r.attributeName==='style'){
                  var el=r.target;
                  var cs=el.style;
                  if(cs.filter&&cs.filter!=='none'){cs.filter='none';}
                  if(cs.getPropertyValue&&cs.getPropertyValue('-webkit-filter')!=='none'){
                    cs.setProperty('-webkit-filter','none','important');
                  }
                }
              });
            });
            obs.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
            document.addEventListener('DOMContentLoaded',function(){
              obs.observe(document.body,{attributes:true,attributeFilter:['style']});
            });
          })();
        `}} />
        {/* Google Consent Mode v2: Default DENIED — muss VOR gtag.js stehen */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'wait_for_update': 500
          });
        `}} />
      </head>
      <body className={`${jost.variable} ${cormorant.variable}`} style={{ fontFamily: "'Jost', sans-serif", backgroundColor: '#1A1612', color: '#F5F0E8' }}>
        <GoogleTagManager />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
        <ClientSideProviders />
      </body>
    </html>
  )
}
