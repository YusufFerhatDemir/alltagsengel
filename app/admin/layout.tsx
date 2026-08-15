'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IconChart, IconUsers, IconClipboard, IconWings, IconLogout, IconTarget, IconHeart, IconMoney, IconDocument, IconHandshake, IconHome, IconCalendar, IconClock, IconChat, IconBell, IconWorkflow } from '@/components/Icons'
import NotificationBell from '@/components/NotificationBell'
import OrgSwitcher from '@/components/OrgSwitcher'
import BundeslandSwitcher from '@/components/admin/BundeslandSwitcher'
import { BundeslandProvider } from '@/components/admin/BundeslandContext'
import { ReactNode } from 'react'

// ═══════════════════════════════════════════════════════════════
// AdminAuthGuard — WhatsApp-Level Persistenz für Admin
// ═══════════════════════════════════════════════════════════════
function extractRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null): string {
  const appRole = user?.app_metadata?.role
  if (typeof appRole === 'string' && appRole) return appRole
  const metaRole = user?.user_metadata?.role
  return typeof metaRole === 'string' ? metaRole : ''
}

function useAdminAuth() {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  const checkAuth = useCallback(async () => {
    const supabase = createClient()

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: { user } } = await supabase.auth.getUser()
      const role = extractRole(user)
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

    let attempts = 0
    const maxAttempts = 7
    const retryInterval = setInterval(async () => {
      attempts++
      const { data: { session: retrySession } } = await supabase.auth.getSession()
      if (retrySession) {
        clearInterval(retryInterval)
        const { data: { user } } = await supabase.auth.getUser()
        const role = extractRole(user)
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

// ═══════════════════════════════════════════════════════════════
// Gruppierte Navigation — 11 Fachbereiche + 7 bisher fehlende Seiten
// ═══════════════════════════════════════════════════════════════
const navGroups = [
  {
    key: 'uebersicht',
    title: 'Übersicht',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: <IconHome size={18} /> },
      { href: '/admin/pilot', label: 'Pilot / Echtbetrieb', icon: <IconTarget size={18} /> },
      { href: '/admin/go-live', label: 'Go-Live-Status', icon: <IconTarget size={18} /> },
    ],
  },
  {
    key: 'klienten',
    title: 'Klienten & Pflege',
    items: [
      { href: '/admin/clients', label: 'Klienten', icon: <IconHeart size={18} /> },
      { href: '/admin/budgets', label: 'Budgets', icon: <IconChart size={18} /> },
      { href: '/admin/verordnungen', label: 'Verordnungen', icon: <IconDocument size={18} /> },
      { href: '/admin/kostentraeger', label: 'Kostenträger', icon: <IconHandshake size={18} /> },
      { href: '/admin/aerzte', label: 'Ärzte & Praxen', icon: <IconUsers size={18} /> },
      { href: '/admin/pflegedoku', label: 'Pflegedokumentation', icon: <IconHeart size={18} /> },
      { href: '/admin/sturzprotokoll', label: 'Sturzprotokoll', icon: <IconClipboard size={18} /> },
      { href: '/admin/wunddokumentation', label: 'Wunddokumentation', icon: <IconHeart size={18} /> },
      { href: '/admin/vitalwerte', label: 'Vitalwerte', icon: <IconHeart size={18} /> },
      { href: '/admin/medikamente', label: 'Medikamente', icon: <IconHeart size={18} /> },
      { href: '/admin/sis', label: 'SIS', icon: <IconClipboard size={18} /> },
      { href: '/admin/vertraege', label: 'Verträge', icon: <IconDocument size={18} /> },
      { href: '/admin/dokumente', label: 'Dokumente', icon: <IconDocument size={18} /> },
    ],
  },
  {
    key: 'personal',
    title: 'Personal',
    items: [
      { href: '/admin/personal', label: 'Stammdaten', icon: <IconUsers size={18} /> },
      { href: '/admin/caregivers', label: 'Betreuungskräfte', icon: <IconUsers size={18} /> },
      { href: '/admin/nachweise', label: 'Qualifikationen', icon: <IconClipboard size={18} /> },
      { href: '/admin/einsatzfreigabe', label: 'Einsatzfreigabe', icon: <IconTarget size={18} /> },
      { href: '/admin/applications', label: 'Bewerbungen', icon: <IconClipboard size={18} /> },
    ],
  },
  {
    key: 'einsatz',
    title: 'Einsatzplanung',
    items: [
      { href: '/admin/schedule', label: 'Einsatzplanung', icon: <IconHome size={18} /> },
      { href: '/admin/tourenplanung', label: 'Tourenplanung', icon: <IconTarget size={18} /> },
      { href: '/admin/dienstplan', label: 'Dienstplan', icon: <IconCalendar size={18} /> },
      { href: '/admin/uebergaben', label: 'Dienstübergabe', icon: <IconClipboard size={18} /> },
      { href: '/admin/kalender', label: 'Kalender', icon: <IconClipboard size={18} /> },
      { href: '/admin/arbeitszeiten', label: 'Arbeitszeiten', icon: <IconClock size={18} /> },
      { href: '/admin/urlaub', label: 'Urlaub', icon: <IconCalendar size={18} /> },
      { href: '/admin/ausfallmanagement', label: 'Ausfallmanagement', icon: <IconTarget size={18} /> },
    ],
  },
  {
    key: 'leistung',
    title: 'Leistungsdoku',
    items: [
      { href: '/admin/records', label: 'Leistungsnachweise', icon: <IconClipboard size={18} /> },
      { href: '/admin/leistungsnachweis-digital', label: 'Digitale Nachweise', icon: <IconDocument size={18} /> },
      { href: '/admin/leistungsnachweis-upload', label: 'Prüfzentrale', icon: <IconClipboard size={18} /> },
      { href: '/admin/notizen', label: 'Notizen', icon: <IconDocument size={18} /> },
    ],
  },
  {
    key: 'abrechnung',
    title: 'Abrechnung',
    items: [
      { href: '/admin/rechnungserstellung', label: 'Rechnungserstellung', icon: <IconDocument size={18} /> },
      { href: '/admin/rechnungen', label: 'Rechnungsübersicht', icon: <IconDocument size={18} /> },
      { href: '/admin/gutschriften', label: 'Gutschriften', icon: <IconDocument size={18} /> },
      { href: '/admin/leistungspreise', label: 'Leistungspreise', icon: <IconMoney size={18} /> },
      { href: '/admin/monatsabschluss-vorbereitung', label: 'Monatsabschluss-Vorb.', icon: <IconChart size={18} /> },
      { href: '/admin/monatsabschluss', label: 'Monatsabschluss', icon: <IconChart size={18} /> },
      { href: '/admin/pruefprotokoll', label: 'Prüfprotokoll', icon: <IconTarget size={18} /> },
    ],
  },
  {
    key: 'kasse',
    title: 'Kassenabrechnung',
    items: [
      { href: '/admin/dta', label: 'DTA-Dashboard', icon: <IconMoney size={18} /> },
      { href: '/admin/kassenabrechnung', label: 'Kassenabrechnung', icon: <IconMoney size={18} /> },
      { href: '/admin/abrechnung', label: 'EDIFACT', icon: <IconMoney size={18} /> },
      { href: '/admin/abrechnung/einstellungen', label: 'SECON-Einstellungen', icon: <IconTarget size={18} /> },
      { href: '/admin/dakota', label: 'Dakota-Versand', icon: <IconTarget size={18} /> },
      { href: '/admin/annahmestellen', label: 'Annahmestellen', icon: <IconHandshake size={18} /> },
      { href: '/admin/ruecklaeufer', label: 'Rückläufer', icon: <IconClipboard size={18} /> },
      { href: '/admin/korrekturlaeufe', label: 'Korrekturläufe', icon: <IconClipboard size={18} /> },
      { href: '/admin/abrechnungsfehler', label: 'Fehlermanagement', icon: <IconTarget size={18} /> },
    ],
  },
  {
    key: 'zahlung',
    title: 'Zahlungsverkehr',
    items: [
      { href: '/admin/zahlungseingaenge', label: 'Zahlungseingänge', icon: <IconMoney size={18} /> },
      { href: '/admin/forderungen', label: 'Forderungen', icon: <IconMoney size={18} /> },
      { href: '/admin/sepa', label: 'SEPA-Lastschrift', icon: <IconMoney size={18} /> },
      { href: '/admin/mahnwesen', label: 'Mahnwesen', icon: <IconDocument size={18} /> },
      { href: '/admin/datev', label: 'DATEV-Export', icon: <IconMoney size={18} /> },
    ],
  },
  {
    key: 'aufgaben',
    title: 'Aufgaben & Kommunikation',
    items: [
      { href: '/admin/aufgaben', label: 'Aufgaben', icon: <IconClipboard size={18} /> },
      { href: '/admin/wiedervorlagen', label: 'Wiedervorlagen', icon: <IconCalendar size={18} /> },
      { href: '/admin/nachrichten', label: 'Nachrichten', icon: <IconChat size={18} /> },
      { href: '/admin/benachrichtigungen', label: 'Benachrichtigungen', icon: <IconBell size={18} /> },
    ],
  },
  {
    key: 'kim',
    title: 'KIM / TI',
    items: [
      { href: '/admin/kim', label: 'Posteingang', icon: <IconChat size={18} /> },
      { href: '/admin/kim/outbox', label: 'Postausgang', icon: <IconClipboard size={18} /> },
      { href: '/admin/kim/verfassen', label: 'Verfassen', icon: <IconDocument size={18} /> },
      { href: '/admin/kim/adressbuch', label: 'Adressbuch', icon: <IconUsers size={18} /> },
      { href: '/admin/kim/einstellungen', label: 'Provider-Einstellungen', icon: <IconSettings size={18} /> },
      { href: '/admin/kim/postfach', label: 'Postfach & Karten (Block 18)', icon: <IconClipboard size={18} /> },
    ],
  },
  {
    key: 'auto',
    title: 'Automatisierung',
    items: [
      { href: '/admin/workflow', label: 'Workflow-Engine', icon: <IconWorkflow size={18} /> },
      { href: '/admin/eskalationen', label: 'Eskalationsregeln', icon: <IconTarget size={18} /> },
    ],
  },
  {
    key: 'system',
    title: 'System',
    items: [
      { href: '/admin/users', label: 'Benutzer', icon: <IconUsers size={18} /> },
      { href: '/admin/bookings', label: 'Buchungen', icon: <IconClipboard size={18} /> },
      { href: '/admin/analytics', label: 'Analytik', icon: <IconTarget size={18} /> },
      { href: '/admin/analytics/kpi', label: 'KPI-Dashboard', icon: <IconChart size={18} /> },
      { href: '/admin/pdl-cockpit', label: 'PDL-Cockpit', icon: <IconChart size={18} /> },
      { href: '/admin/fristen', label: 'Fristen-Dashboard', icon: <IconCalendar size={18} /> },
      { href: '/admin/quality', label: 'Qualitätsmanagement', icon: <IconHeart size={18} /> },
      { href: '/admin/bonuses', label: 'Mitarbeiterbindung', icon: <IconTarget size={18} /> },
      { href: '/admin/partners', label: 'Kooperationspartner', icon: <IconHandshake size={18} /> },
      { href: '/admin/ops-audit', label: 'Aktivitätslog', icon: <IconDocument size={18} /> },
      { href: '/admin/sync-status', label: 'Sync-Status', icon: <IconWorkflow size={18} /> },
      { href: '/admin/sync-konflikte', label: 'Sync-Konflikte', icon: <IconClock size={18} /> },
      { href: '/admin/fhir', label: 'FHIR / Interoperabilität', icon: <IconDocument size={18} /> },
      { href: '/admin/expansion', label: 'Expansion', icon: <IconTarget size={18} /> },
      { href: '/admin/settings', label: 'Einstellungen', icon: <IconSettings size={18} /> },
    ],
  },
]

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
    >
      <polyline points="4,2 8,6 4,10" />
    </svg>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const authState = useAdminAuth()

  // ═══ Collapsible Navigation State ═══
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(navGroups.map(g => g.key))
  )
  const [navReady, setNavReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('admin-nav-open')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setOpenGroups(new Set(parsed))
      }
    } catch {}
    setNavReady(true)
  }, [])

  useEffect(() => {
    const active = navGroups.find(g =>
      g.items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
    )
    if (active) {
      setOpenGroups(prev => {
        if (prev.has(active.key)) return prev
        return new Set([...prev, active.key])
      })
    }
  }, [pathname])

  useEffect(() => {
    if (!navReady) return
    try { localStorage.setItem('admin-nav-open', JSON.stringify([...openGroups])) } catch {}
  }, [openGroups, navReady])

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <BundeslandProvider>
    <style>{`
      .admin-nav-group + .admin-nav-group { border-top: 1px solid var(--border, #e5e7eb); margin-top: 2px; padding-top: 2px; }
      .admin-nav-group-header { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 12px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink5, #888); background: none; border: none; cursor: pointer; font-family: inherit; transition: color 0.15s; }
      .admin-nav-group-header:hover { color: var(--ink, #333); }
      .admin-nav-group-header.has-active { color: var(--gold2, #C9963C); }
    `}</style>
    <div className="admin-layout">
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
        <OrgSwitcher />
        <BundeslandSwitcher />
        <nav className="admin-nav">
          {navGroups.map(group => {
            const isOpen = openGroups.has(group.key)
            const hasActive = group.items.some(i =>
              pathname === i.href || pathname.startsWith(i.href + '/')
            )
            return (
              <div key={group.key} className="admin-nav-group">
                <button
                  className={`admin-nav-group-header${hasActive ? ' has-active' : ''}`}
                  onClick={() => toggleGroup(group.key)}
                >
                  <span>{group.title}</span>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && group.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`admin-nav-item ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )
          })}

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
    </BundeslandProvider>
  )
}
