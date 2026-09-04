'use client'
/**
 * „Dein Start bei Alltagsengel" — Karte fürs Dashboard.
 *
 * Kurzform der Anleitung: Balken, Zahl, die nächsten offenen Punkte, ein
 * Knopf. Wer weitermachen will, soll dafür nicht erst eine Liste lesen
 * müssen.
 *
 * Ist der Ablauf abgeschlossen, verschwindet die Karte nicht, sondern
 * sagt es — sonst wirkt es, als sei etwas verlorengegangen.
 */

import { erforderlichePunkte, type Anleitung } from '@/lib/onboarding/anleitung'

export interface FortschrittsKarteProps {
  anleitung: Anleitung
  /** Führt in den Ablauf. Fehlt sie, wird kein Knopf gezeigt. */
  onWeitermachen?: () => void
  /** Höchstzahl der aufgelisteten offenen Punkte. */
  maxPunkte?: number
}

export default function FortschrittsKarte({
  anleitung, onWeitermachen, maxPunkte = 3,
}: FortschrittsKarteProps) {
  const offen = erforderlichePunkte(anleitung)
  const gezeigt = offen.slice(0, maxPunkte)
  const weitere = offen.length - gezeigt.length

  return (
    <section style={{
      background: 'var(--coal2, #1b1b1b)', border: '1px solid var(--border, #333)',
      borderRadius: 12, padding: 16, display: 'grid', gap: 12,
    }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink, #eee)' }}>
          Dein Start bei Alltagsengel
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--ink4, #aaa)' }}>
          {anleitung.erledigt} von {anleitung.gesamt} Schritten · {anleitung.prozent}&nbsp;%
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={anleitung.prozent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${anleitung.erledigt} von ${anleitung.gesamt} Schritten erledigt`}
        style={{ height: 8, borderRadius: 999, background: 'var(--border, #333)', overflow: 'hidden' }}
      >
        <div style={{
          height: '100%', width: `${anleitung.prozent}%`,
          background: 'var(--gold, #C9963C)', transition: 'width .3s ease',
        }} />
      </div>

      {anleitung.abgeschlossen ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink4, #aaa)' }}>
          {anleitung.lage}
        </p>
      ) : (
        <>
          {gezeigt.length > 0 && (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--ink5, #888)' }}>
                Das wird noch gebraucht:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                {gezeigt.map(p => (
                  <li key={p.schluessel} style={{ fontSize: 14, color: 'var(--ink, #eee)' }}>
                    {p.titel}
                  </li>
                ))}
                {weitere > 0 && (
                  <li style={{ fontSize: 13, color: 'var(--ink5, #888)' }}>
                    und {weitere} weitere
                  </li>
                )}
              </ul>
            </div>
          )}

          {gezeigt.length === 0 && (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink4, #aaa)' }}>
              {anleitung.lage}
            </p>
          )}

          {onWeitermachen && (
            <button
              type="button"
              onClick={onWeitermachen}
              style={{
                minHeight: 52, borderRadius: 12, border: 'none', width: '100%',
                background: 'var(--gold, #C9963C)', color: '#1b1b1b',
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Jetzt weitermachen
            </button>
          )}
        </>
      )}
    </section>
  )
}
