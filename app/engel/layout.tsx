import BottomNav from '@/components/BottomNav'

export default function EngelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav role="engel" />
    </>
  )
}
