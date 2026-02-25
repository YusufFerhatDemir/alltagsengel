'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/admin/home', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Benutzer', icon: '👥' },
  { href: '/admin/bookings', label: 'Buchungen', icon: '📋' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="admin-layout">
      <div className="admin-sidebar">
        <div className="admin-logo">
          <span style={{ fontSize: 20 }}>👼</span>
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
          <span>🚪</span>
          <span>Abmelden</span>
        </button>
      </div>
      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}
