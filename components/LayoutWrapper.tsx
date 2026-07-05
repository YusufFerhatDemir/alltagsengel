'use client'
import { usePathname } from 'next/navigation'
import StatusBar from '@/components/StatusBar'
import PageTracker from '@/components/PageTracker'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'

// Erste Pfad-Segmente, die zu eingeloggten Portal-/App-Bereichen gehören.
// Auf diesen Seiten wird KEIN Marketing-Header gezeigt.
// Exakter Segment-Vergleich, damit z.B. /engel-werden (öffentlich) NICHT
// mit /engel (Engel-Portal) verwechselt wird.
const PORTAL_ROOTS = new Set(['kunde', 'engel', 'fahrer', 'auth', 'choose', 'notfall'])

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMIS = pathname.startsWith('/mis')
  const isLP = pathname.startsWith('/lp')
  const isAdmin = pathname.startsWith('/admin')
  const isInvestor = pathname.startsWith('/investor')

  // Admin, MIS, LP, Investor — kein Phone-Frame
  if (isMIS || isLP || isAdmin || isInvestor) {
    return <>{children}</>
  }

  const firstSegment = pathname.split('/')[1] || ''
  const showHeader = !PORTAL_ROOTS.has(firstSegment)

  return (
    <div className="phone">
      <a href="#main-content" className="skip-link">Zum Hauptinhalt springen</a>
      <StatusBar />
      {showHeader && <SiteHeader />}
      <PageTracker />
      {/* role=main NUR um den eigentlichen Inhalt, nicht um Header/Footer —
          sonst zählt die Landmark Navigation und Footer mit zum "Hauptinhalt". */}
      <main id="main-content" aria-label="Hauptinhaltsbereich">
        {children}
      </main>
      {/* Globaler Footer auf allen Marketing-Seiten (gleiches Gate wie Header) */}
      {showHeader && <SiteFooter />}
    </div>
  )
}
