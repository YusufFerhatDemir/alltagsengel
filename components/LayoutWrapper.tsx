'use client'
import { usePathname } from 'next/navigation'
import StatusBar from '@/components/StatusBar'
import PageTracker from '@/components/PageTracker'

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

  return (
    <div className="phone" role="main" aria-label="Hauptinhaltsbereich">
      <StatusBar />
      <PageTracker />
      {children}
    </div>
  )
}
