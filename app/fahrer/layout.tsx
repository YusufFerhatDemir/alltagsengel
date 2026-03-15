import BottomNav from '@/components/BottomNav'

export default function FahrerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav role="fahrer" />
    </>
  )
}
