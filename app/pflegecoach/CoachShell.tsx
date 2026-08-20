'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Produkt-Shell: Kopfzeile, Navigation, Barrierefreiheit
// (Schriftgröße, Kontrast), Fußzeile. Werbefrei, ohne Tracker.
// Schrift/Kontrast wirken sofort (localStorage) und werden — sofern ein
// Profil existiert — serverseitig gespeichert (geräteübergreifend).
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { CoachSchriftgrad } from '@/lib/coach/types'
import { COACH_PRODUKT_NAME, COACH_PRODUKT_VERSION, COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { DipaModusProvider } from './_lib/Modus'

const SCALE: Record<CoachSchriftgrad, number> = { normal: 1, gross: 1.2, sehr_gross: 1.45 }

const NAV = [
  { href: '/pflegecoach', label: 'Übersicht' },
  { href: '/pflegecoach/wochenplan', label: 'Wochenplan' },
  { href: '/pflegecoach/ziele', label: 'Ziele' },
  { href: '/pflegecoach/assessment', label: 'Assessment' },
  { href: '/pflegecoach/mobilitaet', label: 'Mobilität' },
  { href: '/pflegecoach/alltag', label: 'Alltag' },
  { href: '/pflegecoach/angehoerige', label: 'Für Angehörige' },
  // Der Belastungs-Check war bisher nur über Querverweise erreichbar,
  // obwohl er ein eigener Inhaltsbereich mit eigenem Verlauf ist.
  { href: '/pflegecoach/belastung', label: 'Belastungs-Check' },
  { href: '/pflegecoach/verlauf', label: 'Verlauf' },
  { href: '/pflegecoach/bericht', label: 'Bericht' },
  { href: '/pflegecoach/einstellungen', label: 'Einstellungen' },
]

/**
 * Bereichsnamen für die Wechsel-Ansage (WCAG 4.1.3). Deckt auch die Seiten
 * ab, die nicht in der Hauptnavigation stehen — sonst bliebe die Ansage
 * beim Wechsel dorthin stumm.
 */
const BEREICH_NAMEN: Record<string, string> = {
  ...Object.fromEntries(NAV.map(n => [n.href, n.label])),
  '/pflegecoach/start': 'Willkommen und Zweckbestimmung',
  '/pflegecoach/anfrage': 'Anfrage stellen',
  '/pflegecoach/datenschutz': 'Datenschutzhinweise',
  '/pflegecoach/einstellungen/konto': 'Konto und Nutzung beenden',
  '/pflegecoach/einstellungen/sicherheit': 'Anmeldesicherheit',
  '/pflegecoach/einstellungen/freigaben': 'Datenfreigaben',
  '/pflegecoach/loeschung': 'Daten löschen',
  '/pflegecoach/anspruch': 'Anspruch prüfen',
  '/pflegecoach/freischaltung': 'Zugang freischalten',
}

/**
 * Zusatzpunkt, der NUR erscheint, wenn ein Freischaltverfahren tatsächlich
 * aktiv ist (COACH_DIPA_MODUS oder COACH_FREISCHALTUNG_PFLICHT). Im
 * Normalbetrieb ist der Punkt nicht bloß gesperrt, sondern gar nicht
 * vorhanden — sonst stünde im Produkt eine Zugangshürde, die es nicht gibt.
 * Der Wert kommt aus dem Server-Layout: Client-Komponenten können
 * process.env nicht lesen.
 */
const NAV_FREISCHALTUNG = { href: '/pflegecoach/freischaltung', label: 'Zugang freischalten' }

export default function CoachShell({
  children,
  zeigeFreischaltung = false,
  dipaAktiv = false,
}: {
  children: React.ReactNode
  zeigeFreischaltung?: boolean
  /** COACH_DIPA_MODUS — steuert produktrechtliche Aussagen auf den Seiten. */
  dipaAktiv?: boolean
}) {
  const pathname = usePathname()
  const navPunkte = zeigeFreischaltung ? [...NAV, NAV_FREISCHALTUNG] : NAV
  const [schriftgrad, setSchriftgrad] = useState<CoachSchriftgrad>('normal')
  const [kontrast, setKontrast] = useState(false)
  const [ansage, setAnsage] = useState('')
  const ersterPfad = useRef(pathname)

  // Seitenwechsel hörbar machen: Bei einer Navigation innerhalb der App wird
  // das Dokument nicht neu geladen — Screenreader lesen den neuen Titel
  // deshalb nicht vor, und der Fokus bleibt auf dem angeklickten Link.
  // Die Ansage schließt diese Lücke. Beim ersten Aufruf bleibt sie leer,
  // weil der Seitentitel dort bereits vorgelesen wird.
  useEffect(() => {
    if (pathname === ersterPfad.current) return
    setAnsage(`${BEREICH_NAMEN[pathname] ?? 'PflegeCoach'} — Seite geladen`)
  }, [pathname])

  useEffect(() => {
    // Bewusst setState im Effect: die Darstellungseinstellungen liegen in
    // localStorage und dürfen im SSR-Render nicht gelesen werden, sonst
    // weicht der Server-HTML vom Client ab (Hydration-Mismatch). Der Effect
    // läuft genau einmal und übernimmt den gespeicherten Stand.
     
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
    }).catch((err) => console.warn('[PflegeCoach] Profil-Sync fehlgeschlagen (non-blocking):', err))
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
          {navPunkte.map(item => {
            const aktiv = item.href === '/pflegecoach' ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={aktiv ? 'page' : undefined}>{item.label}</Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <p className="sr-only" role="status" aria-live="polite">{ansage}</p>

      <main id="pc-main" className="pc-container">
        <DipaModusProvider aktiv={dipaAktiv}>{children}</DipaModusProvider>
      </main>

      <footer className="pc-footer">
        <div className="pc-footer-inner">
          <p>
            Der Digitale PflegeCoach unterstützt bei der Organisation der häuslichen Pflege.
            Er ersetzt keine ärztliche oder pflegefachliche Beratung. Bei Notfällen: 112.
          </p>
          {/* Support gehört sichtbar in jede Ansicht: Wer im Produkt nicht
              weiterkommt, darf nicht erst über das Marketing-Impressum
              suchen müssen. */}
          <p>
            Fragen zum Produkt?{' '}
            <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>
            {' · '}
            <Link href="/pflegecoach/anfrage">Anfrage stellen</Link>
          </p>
          {/* Rechtliche Pflichtverweise auf JEDER Produktseite: Datenschutz,
              Impressum, AGB und Widerrufsbelehrung. Sie stehen im Layout und
              nicht auf den einzelnen Seiten, damit keine Seite sie vergessen
              kann — auch keine, die später dazukommt. */}
          <p>
            <Link href="/pflegecoach/datenschutz">Datenschutz</Link>{' · '}
            <Link href="/impressum">Impressum</Link>{' · '}
            <Link href="/pflegecoach/agb">AGB</Link>{' · '}
            <Link href="/pflegecoach/widerruf">Widerrufsbelehrung</Link>
          </p>
          <p>
            <Link href="/pflegecoach/einstellungen">Datenexport &amp; Einwilligungen</Link>{' · '}
            <Link href="/pflegecoach/einstellungen/konto">Vertrag &amp; Nutzung beenden</Link>{' · '}
            <Link href="/pflegecoach/loeschung">Daten löschen</Link>
          </p>
          {/* Anlage 2 DiPAV, Themenfeld I Nr. 4 verlangt, dass die genutzten
              Interoperabilitäts-Standards „auf der Anwendungswebseite verlinkt"
              sind. Der Verweis gehört deshalb ins Layout, nicht auf eine
              einzelne Seite — sonst hinge die Erfüllung an einer Seite, die
              jemand später umbaut. */}
          <p>
            <Link href="/pflegecoach/interoperabilitaet">Interoperabilität &amp; Datenexport-Standards</Link>
          </p>
          {/* Kein aria-label auf dem Absatz: Die Rolle „paragraph" erlaubt keinen
              zugänglichen Namen, das Attribut würde ignoriert. Der Hinweis steht
              deshalb als echter, nur für Screenreader sichtbarer Text davor. */}
          <p>
            <span className="sr-only">Produktversion: </span>
            {COACH_PRODUKT_NAME} — Version {COACH_PRODUKT_VERSION} · Hersteller: Alltagsengel UG (haftungsbeschränkt)
          </p>
        </div>
      </footer>
    </div>
  )
}
