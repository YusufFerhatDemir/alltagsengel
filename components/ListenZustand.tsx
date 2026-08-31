'use client'
/**
 * ListenZustand — rendert eine `Ladelage` als Skelett, Fehler, Leerzustand
 * oder Inhalt.
 *
 * Der Zweck ist nicht Kosmetik, sondern eine Aussage: der Leerzustand
 * („Keine Einsaetze") behauptet, dass es nichts gibt. Diese Behauptung darf
 * die App nur treffen, wenn die Abfrage tatsaechlich erfolgreich war. Deshalb
 * kommt der Leerzustand hier ausschliesslich aus `istLeer` — und `istLeer`
 * ist im Fehlerfall falsch.
 *
 * @see lib/ui/ladelage.ts
 */
import type { ReactNode } from 'react'
import type { Ladelage } from '@/lib/ui/ladelage'
import { istFehler, istLeer, laedt } from '@/lib/ui/ladelage'

/** Zeilen-Skelett — bildet die Form einer Liste ab, nicht einen Spinner. */
export function ListenSkelett({ zeilen = 3, hoehe = 64 }: { zeilen?: number; hoehe?: number }) {
  return (
    <div className="ui-skelett-liste" aria-hidden="true">
      {Array.from({ length: zeilen }).map((_, i) => (
        <div
          key={i}
          className="ui-skelett-zeile"
          style={{ height: hoehe, animationDelay: `${i * 0.08}s` }}
        />
      ))}
    </div>
  )
}

export default function ListenZustand<T>({
  lage,
  leerTitel = 'Noch keine Einträge',
  leerText,
  erneut,
  skelettZeilen = 3,
  skelettHoehe = 64,
  children,
}: {
  lage: Ladelage<T>
  leerTitel?: string
  leerText?: string
  /** Ohne Wiederholen bleibt der Nutzer im Fehlerfall handlungsunfähig. */
  erneut?: () => void
  skelettZeilen?: number
  skelettHoehe?: number
  children: ReactNode
}) {
  if (laedt(lage)) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Wird geladen …</span>
        <ListenSkelett zeilen={skelettZeilen} hoehe={skelettHoehe} />
      </div>
    )
  }

  if (istFehler(lage)) {
    return (
      <div className="ui-state-card" role="alert">
        <div className="ui-state-icon error">!</div>
        <div className="ui-state-title">Daten konnten nicht geladen werden</div>
        <div className="ui-state-sub">
          {lage.status === 'fehler' ? lage.meldung : ''}
        </div>
        {erneut && (
          <button type="button" className="ui-state-btn primary" onClick={erneut}>
            Erneut versuchen
          </button>
        )}
      </div>
    )
  }

  if (istLeer(lage)) {
    return (
      <div className="ui-state-card">
        <div className="ui-state-icon empty">·</div>
        <div className="ui-state-title">{leerTitel}</div>
        {leerText && <div className="ui-state-sub">{leerText}</div>}
      </div>
    )
  }

  return <>{children}</>
}

/**
 * Schmale Variante fuer Seiten, die ihre Liste selbst rendern und nur den
 * Fehlerfall sichtbar machen wollen — ohne ihren bestehenden Leerzustand
 * aufzugeben.
 */
export function Ladefehler({ lage, erneut }: { lage: Ladelage<unknown>; erneut?: () => void }) {
  if (!istFehler(lage)) return null
  return (
    <div className="ui-ladefehler" role="alert">
      <span>{lage.status === 'fehler' ? lage.meldung : ''}</span>
      {erneut && (
        <button type="button" className="ui-ladefehler-btn" onClick={erneut}>
          Erneut versuchen
        </button>
      )}
    </div>
  )
}
