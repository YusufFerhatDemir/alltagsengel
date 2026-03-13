'use client'
import { usePathname } from 'next/navigation'
import StatusBar from '@/components/StatusBar'
import PageTracker from '@/components/PageTracker'

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMIS = pathname.startsWith('/mis')
  const isLP = pathname.startsWith('/lp')

  if (isMIS || isLP) {
    return <>{children}</>
  }

  return (
    <div className="phone">
      <StatusBar />
      <PageTracker />
      {children}
    </div>
  )
}
