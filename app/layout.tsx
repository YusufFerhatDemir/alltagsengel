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
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1612',
  colorScheme: 'only dark' as any,
}

export const metadata: Metadata = {
  title: {
    default: 'Alltagsengel — Alltagsbegleitung · Pflegehilfsmittel · Krankenfahrten · Frankfurt / Rhein-Main',
    template: '%s | Alltagsengel.care',
  },
  description: 'Alltagsbegleitung nach §45a SGB XI (131 €/Monat Entlastungsbetrag), Pflegehilfsmittel kostenlos über die Pflegekasse (§40, bis 42 €/Monat) und Krankenfahrten (§60 SGB V) in Frankfurt & Rhein-Main. Alles in einer App.',
  keywords: [
    'Alltagsbegleitung Frankfurt',
    'Alltagsbegleitung §45a SGB XI',
    'Entlastungsbetrag 131 Euro',
    'Pflegehilfsmittel kostenlos',
    'Pflegebox beantragen',
    'Pflegebox Frankfurt',
    'Krankenfahrt buchen Frankfurt',
    'Krankenfahrt Rhein-Main',
    'Patientenfahrdienst Frankfurt',
    'Pflegehilfsmittel Box kostenlos',
    '42 Euro Pflegekasse',
  ],
  metadataBase: new URL('https://alltagsengel.care'),
  // canonical bewusst NICHT global setzen — Sub-Pages müssen eigenes
  // alternates.canonical liefern, sonst würde jede URL auf "/" zeigen.
  openGraph: {
    title: 'Alltagsengel — Alltagsbegleitung · Pflegehilfsmittel · Krankenfahrten · Frankfurt & Rhein-Main',
    description: 'Alltagsbegleitung (131 €/Monat Entlastungsbetrag) · Pflegehilfsmittel 0 € Eigenanteil · Krankenfahrten über die Krankenkasse — alles in einer App.',
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
    title: 'Alltagsengel — Pflegebox & Krankenfahrt für Frankfurt & Rhein-Main',
    description: 'Pflegebox 0 € Eigenanteil über die Pflegekasse · Krankenfahrt mit Verordnung oder als Selbstzahler.',
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
    title: 'AlltagsEngel',
  },
  formatDetection: {
    telephone: false,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" style={{ colorScheme: 'only dark' } as any}>
      <head>
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
                    telephone: '+4915510445517',
                    contactType: 'customer service',
                    contactOption: 'https://wa.me/4915510445517',
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
                ],
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
                    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                    opens: '00:00',
                    closes: '23:59',
                  },
                ],
                sameAs: [
                  'https://www.instagram.com/alltagsengel_ug',
                  'https://www.tiktok.com/@alltagsengel_ug',
                ],
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
