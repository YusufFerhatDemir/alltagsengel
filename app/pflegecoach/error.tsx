'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Fehlergrenze des Produktbereichs
//
// Ohne diese Datei landet ein unerwarteter Fehler in der globalen
// Fehlerseite der Plattform: außerhalb der Produkt-Shell, mit
// Marketing-Rahmen und ohne Weg zurück in den PflegeCoach. Für ein
// Produkt mit eigener Produktgrenze ist das falsch — und für die
// Zielgruppe ist eine englische oder technische Fehlerseite unbrauchbar.
//
// Bewusst OHNE technische Details: Fehlermeldungen können Datenbank- oder
// Pfadangaben enthalten. Der Nutzer bekommt Handlungsoptionen, nicht den
// Stacktrace. Die Kennung (digest) wird angezeigt, damit der Support einen
// Vorfall zuordnen kann.
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@/lib/logger'
const log = logger.child('pflegecoach')

export default function CoachFehlerseite({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    log.errorWithException('Unerwarteter Fehler', error)
  }, [error])

  return (
    <>
      <h1 className="pc-h1">Da ist etwas schiefgegangen</h1>
      <p className="pc-lead">
        Dieser Bereich konnte nicht geladen werden. Ihre gespeicherten Daten sind davon
        nicht betroffen.
      </p>

      <section className="pc-card" aria-labelledby="fehler-optionen-titel">
        <h2 id="fehler-optionen-titel">Was Sie jetzt tun können</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="button" className="pc-btn" onClick={reset}>Erneut versuchen</button>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach">Zur Übersicht</Link>
        </div>
        <p style={{ marginTop: 16 }}>
          Bleibt der Fehler bestehen, laden Sie die Seite neu. Hilft auch das nicht, wenden Sie
          sich an Alltagsengel — die Kontaktdaten stehen im <Link href="/impressum">Impressum</Link>.
        </p>
        {error.digest && (
          <p className="pc-lead" style={{ fontSize: '0.9em' }}>
            Kennung für den Support: {error.digest}
          </p>
        )}
      </section>

      <p className="pc-feedback pc-feedback--info">
        Bei einem gesundheitlichen Notfall wählen Sie den Notruf 112 — nicht auf diese Seite warten.
      </p>
    </>
  )
}
