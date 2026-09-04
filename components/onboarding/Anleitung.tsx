'use client'
/**
 * Personalisierte Anleitung — was ist erledigt, was wird noch gebraucht.
 *
 * Anzeige zu lib/onboarding/anleitung.ts. Die Datei entscheidet nichts;
 * Zustände, Reihenfolge und Texte kommen aus der geprüften Logik.
 *
 * Das Zeichen (✅ ⚠️ ⏳) steht nie allein: daneben steht immer das Wort.
 * Ein Symbol allein ist für Vorlesesoftware nichts und für farbenblinde
 * oder sehschwache Menschen wenig.
 */

import { ZUSTAND_DARSTELLUNG, type Anleitung as AnleitungsDaten } from '@/lib/onboarding/anleitung'

export interface AnleitungProps {
  anleitung: AnleitungsDaten
  /** Sprung zu einem Schritt. Fehlt sie, sind die Punkte nicht klickbar. */
  onGeheZuSchritt?: (schritt: number) => void
}

export default function Anleitung({ anleitung, onGeheZuSchritt }: AnleitungProps) {
  return (
    <section style={{
      background: 'var(--coal2, #1b1b1b)', border: '1px solid var(--border, #333)',
      borderRadius: 12, padding: 16,
    }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink, #eee)' }}>
        {anleitung.ueberschrift}
      </h2>
      <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--ink4, #aaa)' }}>
        {anleitung.lage}
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {anleitung.punkte.map(punkt => {
          const darstellung = ZUSTAND_DARSTELLUNG[punkt.zustand]
          const klickbar = Boolean(onGeheZuSchritt) && !anleitung.abgeschlossen
          const Inhalt = (
            <>
              <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
                {darstellung.zeichen}
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, color: 'var(--ink, #eee)' }}>
                  {punkt.titel}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink5, #888)', marginTop: 2 }}>
                  {/* Der Klartext des Zustands — nie nur das Symbol. */}
                  {darstellung.text}
                  {punkt.uebersprungen && ' · übersprungen'}
                  {punkt.fehlendeAngaben.length > 0
                    && ` · es fehlt: ${punkt.fehlendeAngaben.join(', ')}`}
                </span>
              </span>
            </>
          )

          return (
            <li key={punkt.schluessel}>
              {klickbar ? (
                <button
                  type="button"
                  onClick={() => onGeheZuSchritt?.(punkt.nummer)}
                  style={{ ...zeileStil, width: '100%', cursor: 'pointer', textAlign: 'left' }}
                >
                  {Inhalt}
                </button>
              ) : (
                <div style={zeileStil}>{Inhalt}</div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const zeileStil = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  minHeight: 52,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #333)',
  background: 'transparent',
  color: 'var(--ink, #eee)',
} as const
