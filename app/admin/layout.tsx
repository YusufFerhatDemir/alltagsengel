'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconChart, IconUsers, IconClipboard, IconWings, IconLogout, IconBox, IconTarget } from '@/components/Icons'
import NotificationBell from '@/components/NotificationBell'
import { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════
// AdminAuthGuard — WhatsApp-Level Persistenz für Admin
// ═══════════════════════════════════════════════════════════════
// Wartet bis SessionKeepAlive den Token refreshen konnte,
// bevor es den User zum Login schickt. Maximal 4 Sekunden
// Geduld, dann Redirect.
// ═══════════════════════════════════════════════════════════════
function useAdminAuth() {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  const checkAuth = useCallback(async () => {
    const supabase = createClient()

    // Versuch 1: Sofort prüfen
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      // Prüfe Admin-Rolle
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role || ''
      if (role === 'admin' || role === 'superadmin') {
        setAuthState('authenticated')
        return
      }
      // Fallback: profiles Tabelle
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile && ['admin', 'superadmin'].includes(profile.role)) {
          setAuthState('authenticated')
          return
        }
      }
      // User ist eingeloggt aber kein Admin
      router.replace('/auth/login?error=admin_required')
      return
    }

    // Versuch 2: Warte auf SessionKeepAlive Recovery (max 3.5s)
    // SessionKeepAlive versucht: Cookie → localStorage → IndexedDB → refreshSession
    let attempts = 0
    const maxAttempts = 7 // 7 × 500ms = 3.5 Sekunden
    const retryInterval = setInterval(async () => {
      attempts++
      const { data: { session: retrySession } } = await supabase.auth.getSession()
      if (retrySession) {
        clearInterval(retryInterval)
        const { data: { user } } = await supabase.auth.getUser()
        const role = user?.user_metadata?.role || ''
        if (role === 'admin' || role === 'superadmin') {
          setAuthState('authenticated')
          return
        }
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
          if (profile && ['admin', 'superadmin'].includes(profile.role)) {
            setAuthState('authenticated')
            return
          }
        }
        router.replace('/auth/login?error=admin_required')
        return
      }
      if (attempts >= maxAttempts) {
        clearInterval(retryInterval)
        // Alle Versuche gescheitert → Login
        const redirectTo = typeof window !== 'undefined' ? window.location.pathname : '/admin/home'
        router.replace(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`)
      }
    }, 500)

    return () => clearInterval(retryInterval)
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return authState
}

const IconSettings = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

const navItems = [
  { href: '/admin/home', label: 'Dashboard', icon: <IconChart size={18} /> },
  { href: '/admin/users', label: 'Benutzer', icon: <IconUsers size={18} /> },
  { href: '/admin/bookings', label: 'Buchungen', icon: <IconClipboard size={18} /> },
  { href: '/admin/pflegebox', label: 'Pflegebox', icon: <IconBox size={18} /> },
  { href: '/admin/analytics', label: 'Analytik', icon: <IconTarget size={18} /> },
  { href: '/admin/settings', label: 'Einstellungen', icon: <IconSettings size={18} /> },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const authState = useAdminAuth()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ═══ Loading Screen während Auth-Check ═══
  if (authState === 'loading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg, #F7F2EA)',
        flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid var(--gold2, #C9963C)',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return null // Router redirect is in progress
  }

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
          <div style={{ marginLeft: 'auto' }}><NotificationBell /></div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationBell />
          <button onClick={() => { window.location.href = '/mis' }} style={{ color: 'var(--gold2)', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'rgba(201,150,60,0.1)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            MIS
          </button>
        </div>
      </div>

      <div className="admin-main">
        {children}
      </div>
    </div>
  )
}
