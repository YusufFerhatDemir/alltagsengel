'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  '/kunde/pflegebox': 'Pflegebox',
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
  '/admin/pflegebox': 'Admin Pflegebox',
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

// IP adresini al — /api/client-ip üzerinden
async function getClientIP(): Promise<string | null> {
  try {
    const res = await fetch('/api/client-ip', { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json()
      return data.ip || null
    }
  } catch {}
  return null
}

export default function PageTracker() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (pathname === lastPath.current) return
    lastPath.current = pathname

    async function track() {
      try {
        const supabase = createClient()

        // IP + user bilgisi paralel al
        const [ipResult, authResult] = await Promise.all([
          getClientIP(),
          supabase.auth.getUser()
        ])

        await supabase.from('page_views').insert({
          user_id: authResult.data?.user?.id || null,
          path: pathname,
          page_label: getPageLabel(pathname),
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
          screen_width: window.innerWidth,
          ip_address: ipResult,
          viewed_at: new Date().toISOString(),
        })
      } catch {
        // Tracking should never break the app
      }
    }

    track()
  }, [pathname])

  return null
}
