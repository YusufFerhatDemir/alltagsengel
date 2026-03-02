import type { Metadata, Viewport } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import StatusBar from '@/components/StatusBar'
import PageTracker from '@/components/PageTracker'

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
  title: 'ALLTAGSENGEL',
  description: 'Premium Alltagsbegleitung — Mit Herz für dich da',
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
        <div className="phone">
          <StatusBar />
          <PageTracker />
          {children}
        </div>
      </body>
    </html>
  )
}
