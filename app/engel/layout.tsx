import BottomNav from '@/components/BottomNav'
import EngelInfoBanner from '@/components/EngelInfoBanner'
import OpsNotificationBell from '@/components/OpsNotificationBell'

export default function EngelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EngelInfoBanner />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 0' }}>
        <OpsNotificationBell />
      </div>
      {children}
      <BottomNav role="engel" />
    </>
  )
}
