'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — gemeinsame Zustandsdarstellungen (Laden, Fehler, Sperre)
//
// Grund: Bisher rendete jede Seite ihren Fehler als nackten Absatz. Ein
// Netzwerkabbruch endete damit in einer Sackgasse — Text ohne Ausweg, kein
// zweiter Versuch, kein Weg zurück. Diese Bausteine geben jedem
// Fehlerzustand mindestens eine Handlung.
// ═══════════════════════════════════════════════════════════════

import Link from 'next/link'

export function CoachLaden({ text = 'Wird geladen …' }: { text?: string }) {
  return <p role="status">{text}</p>
}

/**
 * Ladefehler mit Ausweg: erneut versuchen und/oder zurück zur Übersicht.
 * `neuLaden` ist optional — bei Fehlern, die ein zweiter Versuch nicht
 * behebt, bleibt der Weg zurück.
 */
export function CoachLadefehler({ fehler, neuLaden }: { fehler: string; neuLaden?: () => void }) {
  return (
    <section className="pc-card" aria-labelledby="pc-fehler-titel">
      <h2 id="pc-fehler-titel">Das hat gerade nicht geklappt</h2>
      <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {neuLaden && (
          <button type="button" className="pc-btn" onClick={neuLaden}>Erneut versuchen</button>
        )}
        <Link className="pc-btn pc-btn--secondary" href="/pflegecoach">Zur Übersicht</Link>
      </div>
    </section>
  )
}

/**
 * Hinweis bei widerrufener Pflicht-Einwilligung.
 *
 * Bewusst kein Sperrbildschirm: Lesen, Export und Löschung müssen offen
 * bleiben (Art. 15/17/20 DSGVO). Gesperrt ist nur das Anlegen neuer
 * Einträge — und das erzwingt der Server, nicht diese Anzeige.
 */
export function EinwilligungWiderrufen() {
  return (
    <section className="pc-card" aria-labelledby="pc-einwilligung-titel">
      <h2 id="pc-einwilligung-titel">Einwilligung widerrufen</h2>
      <p>
        Sie haben Ihre Einwilligung in die Verarbeitung Ihrer Pflege- und Gesundheitsdaten
        widerrufen. <strong>Neue Einträge sind deshalb nicht möglich.</strong> Ihre bisherigen
        Daten bleiben gespeichert und für Sie einsehbar, bis Sie die Löschung veranlassen.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Link className="pc-btn" href="/pflegecoach/einstellungen">Einwilligung erneut erteilen</Link>
        <a className="pc-btn pc-btn--secondary" href="/api/coach/export">Daten herunterladen</a>
        <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/loeschung">Daten löschen</Link>
      </div>
    </section>
  )
}
