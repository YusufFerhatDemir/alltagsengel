'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAdminGuard } from '@/lib/useAdminGuard'
import { IconChart, IconUsers, IconClipboard, IconWings, IconLogout, IconBox } from '@/components/Icons'
import { ReactNode } from 'react'

const navItems = [
  { href: '/admin/home', label: 'Dashboard', icon: <IconChart size={18} /> },
  { href: '/admin/users', label: 'Benutzer', icon: <IconUsers size={18} /> },
  { href: '/admin/bookings', label: 'Buchungen', icon: <IconClipboard size={18} /> },
  { href: '/admin/pflegebox', label: 'Pflegebox', icon: <IconBox size={18} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isAdmin, loading: adminLoading } = useAdminGuard()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  if (adminLoading || !isAdmin) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--ink3)' }}>Laden...</div>
  }

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <div className="admin-logo">
          <span style={{ display: 'flex', alignItems: 'center' }}><IconWings size={20} /></span>
          <span>Admin Panel</span>
        </div>
        <nav className="admin-nav">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <button onClick={handleLogout} className="admin-nav-item admin-logout">
          <span><IconLogout size={18} /></span>
          <span>Abmelden</span>
        </button>
      </div>
      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}
