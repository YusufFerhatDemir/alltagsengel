import BottomNav from '@/components/BottomNav'

export default function KundeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav role="kunde" />
    </>
  )
}
