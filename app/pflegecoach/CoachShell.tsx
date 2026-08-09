'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Produkt-Shell: Kopfzeile, Navigation, Barrierefreiheit
// (Schriftgröße, Kontrast), Fußzeile. Werbefrei, ohne Tracker.
// Schrift/Kontrast wirken sofort (localStorage) und werden — sofern ein
// Profil existiert — serverseitig gespeichert (geräteübergreifend).
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CoachSchriftgrad } from '@/lib/coach/types'

const SCALE: Record<CoachSchriftgrad, number> = { normal: 1, gross: 1.2, sehr_gross: 1.45 }

const NAV = [
  { href: '/pflegecoach', label: 'Übersicht' },
  { href: '/pflegecoach/wochenplan', label: 'Wochenplan' },
  { href: '/pflegecoach/ziele', label: 'Ziele' },
  { href: '/pflegecoach/assessment', label: 'Assessment' },
  { href: '/pflegecoach/mobilitaet', label: 'Mobilität' },
  { href: '/pflegecoach/alltag', label: 'Alltag' },
  { href: '/pflegecoach/angehoerige', label: 'Für Angehörige' },
  { href: '/pflegecoach/verlauf', label: 'Verlauf' },
  { href: '/pflegecoach/bericht', label: 'Bericht' },
  { href: '/pflegecoach/einstellungen', label: 'Einstellungen' },
]

export default function CoachShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [schriftgrad, setSchriftgrad] = useState<CoachSchriftgrad>('normal')
  const [kontrast, setKontrast] = useState(false)

  useEffect(() => {
    try {
      const g = localStorage.getItem('pc_schriftgrad') as CoachSchriftgrad | null
      if (g && SCALE[g]) setSchriftgrad(g)
      setKontrast(localStorage.getItem('pc_kontrast') === 'true')
    } catch { /* localStorage nicht verfügbar */ }
  }, [])

  const speichere = useCallback((grad: CoachSchriftgrad, kontrastAn: boolean) => {
    try {
      localStorage.setItem('pc_schriftgrad', grad)
      localStorage.setItem('pc_kontrast', String(kontrastAn))
    } catch { /* ignorieren */ }
    // Serverseitig mitschreiben, wenn ein Profil existiert (Fehler still:
    // die Einstellung wirkt lokal auch ohne Profil/Anmeldung).
    fetch('/api/coach/profil', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a11y_schriftgrad: grad, a11y_kontrast: kontrastAn }),
    }).catch(() => {})
  }, [])

  const setzeGrad = (grad: CoachSchriftgrad) => {
    setSchriftgrad(grad)
    speichere(grad, kontrast)
  }
  const toggleKontrast = () => {
    const neu = !kontrast
    setKontrast(neu)
    speichere(schriftgrad, neu)
  }

  return (
    <div
      className="pc-root"
      data-pc-kontrast={kontrast ? 'true' : 'false'}
      style={{ ['--pc-scale' as string]: SCALE[schriftgrad] }}
    >
      <a href="#pc-main" className="pc-skiplink">Zum Inhalt springen</a>

      <header className="pc-header">
        <div className="pc-header-inner">
          <Link href="/pflegecoach" className="pc-brand">Digitaler PflegeCoach</Link>
          <div className="pc-a11y-controls" role="group" aria-label="Darstellung anpassen">
            <button
              type="button" className="pc-btn pc-btn--secondary pc-btn--small"
              aria-pressed={schriftgrad === 'normal'}
              onClick={() => setzeGrad('normal')}
            >
              A<span className="sr-only"> Normale Schrift</span>
            </button>
            <button
              type="button" className="pc-btn pc-btn--secondary pc-btn--small"
              aria-pressed={schriftgrad === 'gross'}
              onClick={() => setzeGrad('gross')}
              style={{ fontSize: '1.15em' }}
            >
              A<span className="sr-only"> Große Schrift</span>
            </button>
            <button
              type="button" className="pc-btn pc-btn--secondary pc-btn--small"
              aria-pressed={schriftgrad === 'sehr_gross'}
              onClick={() => setzeGrad('sehr_gross')}
              style={{ fontSize: '1.3em' }}
            >
              A<span className="sr-only"> Sehr große Schrift</span>
            </button>
            <button
              type="button" className="pc-btn pc-btn--secondary pc-btn--small"
              aria-pressed={kontrast}
              onClick={toggleKontrast}
            >
              Kontrast
            </button>
          </div>
        </div>
      </header>

      <nav className="pc-nav" aria-label="PflegeCoach-Bereiche">
        <ul>
          {NAV.map(item => {
            const aktiv = item.href === '/pflegecoach' ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={aktiv ? 'page' : undefined}>{item.label}</Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <main id="pc-main" className="pc-container">
        {children}
      </main>

      <footer className="pc-footer">
        <div className="pc-footer-inner">
          <p>
            Der Digitale PflegeCoach unterstützt bei der Organisation der häuslichen Pflege.
            Er ersetzt keine ärztliche oder pflegefachliche Beratung. Bei Notfällen: 112.
          </p>
          <p>
            <Link href="/pflegecoach/datenschutz">Datenschutz</Link>{' · '}
            <Link href="/impressum">Impressum</Link>{' · '}
            <Link href="/pflegecoach/einstellungen">Datenexport &amp; Einwilligungen</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
