'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconChart, IconUsers, IconClipboard, IconWings, IconLogout, IconBox, IconTarget } from '@/components/Icons'
import { ReactNode } from 'react'

const navItems = [
  { href: '/admin/home', label: 'Dashboard', icon: <IconChart size={18} /> },
  { href: '/admin/users', label: 'Benutzer', icon: <IconUsers size={18} /> },
  { href: '/admin/bookings', label: 'Buchungen', icon: <IconClipboard size={18} /> },
  { href: '/admin/pflegebox', label: 'Pflegebox', icon: <IconBox size={18} /> },
  { href: '/admin/analytics', label: 'Analytik', icon: <IconTarget size={18} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="admin-layout">
      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9,
        }} />
      )}

      <div className={`admin-sidebar${mobileOpen ? ' admin-sidebar-open' : ''}`}>
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
              onClick={() => setMobileOpen(false)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          {/* MIS Portal Link */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: 8 }}>
            <button
              className="admin-nav-item"
              onClick={() => { setMobileOpen(false); window.location.href = '/mis' }}
              style={{ background: 'rgba(201,150,60,0.08)', color: 'var(--gold2)', fontWeight: 600 }}
            >
              <span><IconChart size={18} /></span>
              <span>MIS Portal</span>
            </button>
          </div>
        </nav>
        <button onClick={() => { handleLogout(); setMobileOpen(false) }} className="admin-nav-item admin-logout">
          <span><IconLogout size={18} /></span>
          <span>Abmelden</span>
        </button>
      </div>

      {/* Mobile header with hamburger */}
      <div className="admin-mobile-header">
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{
          background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer',
          padding: 4, display: 'flex', alignItems: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
          Admin Panel
        </span>
        <button onClick={() => { window.location.href = '/mis' }} style={{ color: 'var(--gold2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'rgba(201,150,60,0.1)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          MIS
        </button>
      </div>

      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}
