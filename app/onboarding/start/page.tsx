/**
 * Einstieg ins Onboarding — welcher Ablauf ist der richtige?
 *
 * BEWUSST EINE EIGENE ROUTE und nicht app/onboarding/page.tsx: dort liegt
 * die Mandanten-Einrichtung (Organisation, IK-Nummer, ITSG-Zertifikat) für
 * Pflegedienste, die diese Software als Mandant nutzen. Das ist ein ganz
 * anderer Vorgang für ganz andere Menschen. Sie zu überschreiben, hieße
 * einen laufenden B2B-Weg abzuräumen, um einen B2C-Weg zu eröffnen.
 *
 * Kein 'use client': die Seite ist statischer Text mit drei Links.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Loslegen bei Alltagsengel — Unterstützung anfragen oder Engel werden',
  description:
    'Wählen Sie Ihren Weg: Unterstützung im Alltag anfragen, als Alltagsbegleiterin '
    + 'oder Alltagsbegleiter bewerben, oder als angehörige Person Zugang erhalten.',
  alternates: { canonical: '/onboarding/start' },
}

const WEGE = [
  {
    href: '/onboarding/kunde',
    titel: 'Ich suche Unterstützung',
    text: 'Für mich selbst oder für eine angehörige Person. Unverbindlich und kostenfrei.',
    dauer: 'etwa 5 Minuten',
  },
  {
    href: '/onboarding/bewerber',
    titel: 'Ich möchte als Engel arbeiten',
    text: 'Alltagsbegleiterin oder Alltagsbegleiter werden. Eine Ausbildung ist nicht nötig.',
    dauer: 'etwa 5 Minuten',
  },
  {
    href: '/onboarding/angehoerige',
    titel: 'Ich bin angehörig und möchte Zugang',
    text: 'Für Menschen, deren Angehörige bereits von uns betreut werden.',
    dauer: 'etwa 3 Minuten',
  },
]

export default function OnboardingStartSeite() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
        Schön, dass Sie da sind
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 16, lineHeight: 1.6, color: 'var(--ink4)' }}>
        Wählen Sie, was auf Sie zutrifft. Sie können jederzeit pausieren —
        Ihre Angaben bleiben gespeichert.
      </p>

      <nav aria-label="Wege ins Onboarding">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {WEGE.map(weg => (
            <li key={weg.href}>
              <Link
                href={weg.href}
                style={{
                  // Mindestens 48 px hoch, ganze Fläche klickbar — auf dem
                  // Telefon ist ein kleines Ziel der häufigste Abbruchgrund.
                  display: 'block', minHeight: 72, padding: '16px 18px',
                  borderRadius: 14, border: '1px solid var(--border, #333)',
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <span style={{ display: 'block', fontSize: 17, fontWeight: 700, color: 'var(--ink, #eee)' }}>
                  {weg.titel}
                </span>
                <span style={{ display: 'block', fontSize: 14, lineHeight: 1.5, marginTop: 4, color: 'var(--ink4, #aaa)' }}>
                  {weg.text}
                </span>
                <span style={{ display: 'block', fontSize: 12, marginTop: 6, color: 'var(--ink5, #888)' }}>
                  {weg.dauer}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p style={{ margin: '24px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--ink5, #888)' }}>
        Sie sind sich nicht sicher? <Link href="/kontakt" style={{ color: 'var(--gold, #C9963C)' }}>
          Schreiben Sie uns
        </Link> — wir helfen Ihnen weiter.
      </p>
    </main>
  )
}
