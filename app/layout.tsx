import type { Metadata } from 'next'
import { Jost, Cormorant_Garamond } from 'next/font/google'
import './globals.css'
import StatusBar from '@/components/StatusBar'

const jost = Jost({ subsets: ['latin'], variable: '--font-jost', weight: ['300','400','500','600','700'] })
const cormorant = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-cormorant', weight: ['400','500','600','700'], style: ['normal','italic'] })

export const metadata: Metadata = {
  title: 'ALLTAGSENGEL',
  description: 'Premium Alltagsbegleitung — Mit Herz für dich da',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={`${jost.variable} ${cormorant.variable}`} style={{ fontFamily: "'Jost', sans-serif" }}>
        <div className="phone">
          <StatusBar />
          {children}
        </div>
      </body>
    </html>
  )
}
