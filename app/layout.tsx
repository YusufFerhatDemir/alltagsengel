import type { Metadata, Viewport } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'
import VisitorTracker from '@/components/VisitorTracker'
import CookieConsent from '@/components/CookieConsent'

const jost = Jost({ subsets: ['latin'], variable: '--font-jost', weight: ['300','400','500','600','700'] })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400','500','600','700'], style: ['normal','italic'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1612',
  colorScheme: 'dark only' as any,
}

export const metadata: Metadata = {
  title: {
    default: 'Alltagsengel.care — Premium Alltagsbegleitung',
    template: '%s | Alltagsengel.care',
  },
  description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. Abrechnung über §45b SGB XI — 131€/Monat. Jetzt Engel finden.',
  keywords: ['Alltagsbegleitung', 'Seniorenbetreuung', 'Pflegehilfe', '§45b SGB XI', 'Entlastungsbetrag', 'Alltagsbegleiter', 'Frankfurt', 'Pflege'],
  metadataBase: new URL('https://alltagsengel.care'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Alltagsengel.care — Premium Alltagsbegleitung',
    description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. 131€/Monat über die Pflegekasse. Jetzt kostenlos registrieren.',
    url: 'https://alltagsengel.care',
    siteName: 'Alltagsengel.care',
    locale: 'de_DE',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Alltagsengel.care — Premium Alltagsbegleitung für Senioren',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alltagsengel.care — Premium Alltagsbegleitung',
    description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. 131€/Monat über die Pflegekasse.',
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
    <html lang="de" style={{ colorScheme: 'dark only' } as any}>
      <head>
        {/* Android Chrome Auto-Dark / Akku-Sparmodus Schutz */}
        <meta name="color-scheme" content="dark only" />
        <meta name="supported-color-schemes" content="dark only" />
        {/* DarkReader Browser-Extension blockieren */}
        <meta name="darkreader-lock" />
        {/* Samsung Internet Dark Mode blockieren */}
        <meta name="nightmode" content="disable" />
        {/* Android Chrome Theme */}
        <meta name="theme-color" content="#1A1612" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#1A1612" media="(prefers-color-scheme: light)" />
        <meta name="msapplication-navbutton-color" content="#1A1612" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`${jost.variable} ${cormorant.variable}`} style={{ fontFamily: "'Jost', sans-serif", backgroundColor: '#1A1612', color: '#F5F0E8' }}>
        <VisitorTracker />
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
        <CookieConsent />
      </body>
    </html>
  )
}
