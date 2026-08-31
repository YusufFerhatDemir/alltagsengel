'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { IconHome, IconClipboard, IconCalendar, IconChat, IconDocument } from '@/components/Icons'

const navItems = [
  { href: '/angehoerige', icon: <IconHome size={20} />, label: 'Start' },
  { href: '/angehoerige/pflegebericht', icon: <IconClipboard size={20} />, label: 'Berichte' },
  { href: '/angehoerige/termine', icon: <IconCalendar size={20} />, label: 'Termine' },
  { href: '/angehoerige/kommunikation', icon: <IconChat size={20} />, label: 'Nachrichten' },
  { href: '/angehoerige/dokumente', icon: <IconDocument size={20} />, label: 'Dokumente' },
]

// ═══════════════════════════════════════════════════════════════
// AngehAuth — Auth-Guard fuer das Angehoerigenportal
// Prueft: 1) eingeloggt  2) Rolle = angehoerige (oder admin/superadmin)
// ═══════════════════════════════════════════════════════════════
function useAngehAuth() {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'ladefehler'>('loading')

  const checkAuth = useCallback(async () => {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      // Retry nach kurzem Delay (iOS-WebView, Cookie-Propagierung)
      let found = false
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 400))
        const { data: { session: retry } } = await supabase.auth.getSession()
        if (retry) { found = true; break }
      }
      if (!found) {
        const redirectTo = typeof window !== 'undefined' ? window.location.pathname : '/angehoerige'
        router.replace(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`)
        return
      }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    // Rolle pruefen: angehoerige, admin oder superadmin
    const { data: profile, error: rollenFehler } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    // Eine gestoerte Rollenabfrage ist keine falsche Rolle. Bis 31.08.2026
    // wurde der Fehler verworfen: `profile` war null, der Zweig unten griff,
    // und ein Angehoeriger wurde nach /admin geschickt — in einen Bereich,
    // den er nicht betreten darf und aus dem ihn der Proxy sofort wieder
    // herauswarf. Zwei Weiterleitungen als Antwort auf eine Netzstoerung.
    if (rollenFehler) {
      setAuthState('ladefehler')
      return
    }

    const erlaubteRollen = ['angehoerige', 'admin', 'superadmin']
    if (!profile || !erlaubteRollen.includes(profile.role)) {
      // Falsche Rolle — zur Admin-Seite oder Login umleiten
      if (profile?.role === 'engel') {
        router.replace('/engel')
      } else {
        router.replace('/admin')
      }
      return
    }

    setAuthState('authenticated')
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return authState
}

export default function AngehoerigenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const authState = useAngehAuth()

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
    return null
  }

  if (authState === 'ladefehler') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg, #F7F2EA)',
        flexDirection: 'column', gap: 12, padding: 32, textAlign: 'center',
      }} role="alert">
        <div style={{ fontSize: 16, fontWeight: 600 }}>Zugang konnte nicht geprüft werden</div>
        <div style={{ fontSize: 14, opacity: 0.7, maxWidth: 320 }}>
          Das ist kein Zugriffsproblem — die Prüfung selbst ist fehlgeschlagen.
          Bitte versuchen Sie es erneut.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 4, padding: '12px 24px', minHeight: 44, borderRadius: 10,
            border: 'none', background: 'var(--gold2, #C9963C)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Erneut versuchen
        </button>
      </div>
    )
  }

  return (
    <>
      {children}
      <nav className="bottom-nav" role="navigation" aria-label="Angehoerigenportal Navigation">
        {navItems.map(item => {
          const isActive = item.href === '/angehoerige'
            ? pathname === '/angehoerige'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bnav-item${isActive ? ' on' : ''}`}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="bnav-ic">{item.icon}</div>
              <div className="bnav-lbl">{item.label}</div>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
