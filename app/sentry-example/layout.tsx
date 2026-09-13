import type { Metadata } from 'next'

/**
 * `/sentry-example` ist eine Smoke-Test-Seite: man oeffnet sie einmal nach
 * dem Einrichten der DSN und loest absichtlich einen Fehler aus.
 *
 * Sie war bis zum 13.09.2026 `index, follow` und damit fuer Suchmaschinen
 * offen — eine Debug-Seite mit einem Knopf „Fehler ausloesen" im Index
 * unter dem eigenen Markennamen. `robots.txt` sperrt sie nicht, weil sie
 * unter keinem der gesperrten Praefixe liegt.
 *
 * Das Layout traegt die Anweisung, nicht die Seite selbst: die Seite ist
 * eine Client-Komponente und kann kein `metadata` exportieren.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function SentryExampleLayout({ children }: { children: React.ReactNode }) {
  return children
}
