import BottomNav from '@/components/BottomNav'
import EngelInfoBanner from '@/components/EngelInfoBanner'

export default function EngelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EngelInfoBanner />
      {children}
      <BottomNav role="engel" />
    </>
  )
}
