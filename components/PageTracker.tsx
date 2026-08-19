'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
// Kein Supabase-Import: PageTracker hängt im Root-Layout und würde sonst
// ~46 KB gzip Supabase-JS ins First-Load-JS JEDER Seite ziehen (auch
// Marketing/SEO). Der Aufruf geht stattdessen an /api/track/page-view.

const PAGE_LABELS: Record<string, string> = {
  '/': 'Splash',
  '/choose': 'Rollenwahl',
  '/auth/login': 'Login',
  '/auth/register': 'Registrierung',
  '/auth/forgot-password': 'Passwort vergessen',
  '/auth/reset-password': 'Passwort zurücksetzen',
  '/kunde/home': 'Startseite',
  '/kunde/buchungen': 'Buchungen',
  '/kunde/profil': 'Profil',
  '/kunde/kalender': 'Kalender',
  '/kunde/dokumente': 'Dokumente',
  '/kunde/karte': 'Karte',
  '/engel/home': 'Engel Dashboard',
  '/engel/buchungen': 'Engel Buchungen',
  '/engel/profil': 'Engel Profil',
  '/engel/register': 'Engel Registrierung',
  '/engel/kalender': 'Engel Kalender',
  '/engel/dokumente': 'Engel Dokumente',
  '/admin/home': 'Admin Dashboard',
  '/admin/users': 'Admin Benutzer',
  '/admin/bookings': 'Admin Buchungen',
  '/admin/analytics': 'Admin Analytik',
}

function getPageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path]
  if (path.startsWith('/kunde/engel/')) return 'Engel-Profil'
  if (path.startsWith('/kunde/buchen/')) return 'Buchungsformular'
  if (path.startsWith('/kunde/warten/')) return 'Wartebildschirm'
  if (path.startsWith('/kunde/bestaetigt/')) return 'Buchung bestätigt'
  if (path.startsWith('/kunde/chat/')) return 'Chat (Kunde)'
  if (path.startsWith('/engel/bestaetigt/')) return 'Auftrag bestätigt'
  if (path.startsWith('/engel/chat/')) return 'Chat (Engel)'
  return path
}


export default function PageTracker() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (pathname === lastPath.current) return
    lastPath.current = pathname

    async function track() {
      try {
        // Security-Audit 2026-08-19 (NIEDRIG-3): kein Direktschreibpfad aus dem
        // Browser mehr. /api/track/page-view setzt IP, User und Organisation
        // serverseitig und ist ratenbegrenzt; die offene INSERT-Policy auf
        // page_views ist damit entfallen.
        await fetch('/api/track/page-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          signal: AbortSignal.timeout(3000),
          body: JSON.stringify({
            path: pathname,
            page_label: getPageLabel(pathname),
            referrer: document.referrer || null,
            screen_width: window.innerWidth,
          }),
        })
      } catch {
        // Tracking should never break the app
      }
    }

    track()
  }, [pathname])

  return null
}
