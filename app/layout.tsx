import type { Metadata, Viewport } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'

const jost = Jost({ subsets: ['latin'], variable: '--font-jost', weight: ['300','400','500','600','700'] })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400','500','600','700'], style: ['normal','italic'] })

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1612',
  colorScheme: 'dark',
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
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alltagsengel.care — Premium Alltagsbegleitung',
    description: 'Zertifizierte Alltagsbegleiter für Senioren & Pflegebedürftige. 131€/Monat über die Pflegekasse.',
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html lang="de">
      <body className={`${jost.variable} ${cormorant.variable}`} style={{ fontFamily: "'Jost', sans-serif" }}>
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
