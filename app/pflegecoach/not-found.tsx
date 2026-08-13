// ═══════════════════════════════════════════════════════════════
// PflegeCoach — 404 innerhalb des Produktbereichs
//
// Ohne diese Datei greift die 404-Seite der Plattform: der Nutzer verlässt
// die Produkt-Shell und findet keinen Weg zurück in den PflegeCoach.
// Hier bleibt er im Produkt und bekommt die vorhandenen Bereiche angeboten.
// ═══════════════════════════════════════════════════════════════

import Link from 'next/link'
import { coachSeitenMetadata } from './_lib/seitentitel'

export const metadata = coachSeitenMetadata('Seite nicht gefunden')

const BEREICHE = [
  { href: '/pflegecoach', label: 'Übersicht' },
  { href: '/pflegecoach/wochenplan', label: 'Wochenplan' },
  { href: '/pflegecoach/ziele', label: 'Ziele' },
  { href: '/pflegecoach/assessment', label: 'Assessment' },
  { href: '/pflegecoach/belastung', label: 'Belastungs-Check' },
  { href: '/pflegecoach/verlauf', label: 'Verlauf' },
  { href: '/pflegecoach/einstellungen', label: 'Einstellungen' },
]

export default function CoachNichtGefunden() {
  return (
    <>
      <h1 className="pc-h1">Diese Seite gibt es nicht</h1>
      <p className="pc-lead">
        Die aufgerufene Adresse gehört zu keinem Bereich des Digitalen PflegeCoach.
        Möglicherweise ist ein Lesezeichen veraltet.
      </p>

      <section className="pc-card" aria-labelledby="bereiche-404-titel">
        <h2 id="bereiche-404-titel">Hier geht es weiter</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {BEREICHE.map(b => (
            <Link key={b.href} className="pc-btn pc-btn--secondary" href={b.href}>{b.label}</Link>
          ))}
        </div>
      </section>
    </>
  )
}
