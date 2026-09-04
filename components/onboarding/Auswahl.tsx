'use client'
/**
 * Auswahl-Bausteine für das Onboarding
 *
 * PflegeUI bringt Textfelder, Auswahllisten und Schalter mit, aber keine
 * Gruppen aus Ankreuzfeldern. Genau die braucht der Bewerberablauf
 * mehrfach (Wochentage, Zeitfenster, Sprachen, Stundenumfang).
 *
 * ── WARUM FIELDSET UND NICHT LABEL ─────────────────────────────────────
 * PflegeUI.Feld umschließt seinen Inhalt mit einem <label>. Für EIN
 * Eingabefeld ist das richtig; für eine Gruppe aus sieben Ankreuzfeldern
 * wäre es falsch — ein <label> darf genau ein Bedienelement beschriften,
 * sonst liest Vorlesesoftware die Gruppenüberschrift bei jedem einzelnen
 * Kästchen erneut vor. Gruppen brauchen <fieldset> mit <legend>.
 *
 * ── GROSSE ZIELE ───────────────────────────────────────────────────────
 * Mindestens 52 px hohe Flächen, und die ganze Fläche ist klickbar, nicht
 * nur das Kästchen. Die Empfänger sind oft ältere Menschen auf dem
 * Telefon; ein 16-px-Kästchen ist dort keine Bedienung, sondern ein
 * Geschicklichkeitsspiel.
 */

import type { ReactNode } from 'react'

export interface Option {
  wert: string
  label: string
  /** Eine Zeile Erläuterung unter dem Label. */
  hinweis?: string
}

const gruppeStil = {
  border: 'none',
  padding: 0,
  margin: '0 0 4px',
  minInlineSize: 0,
} as const

const legendeStil = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink4)',
  padding: 0,
  marginBottom: 8,
} as const

function kachelStil(gewaehlt: boolean, disabled: boolean) {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 52,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${gewaehlt ? 'var(--gold, #C9963C)' : 'var(--border)'}`,
    background: gewaehlt ? 'rgba(201,150,60,.10)' : 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  } as const
}

function Gruppe({ legende, hinweis, kinder }: {
  legende: string; hinweis?: string; kinder: ReactNode
}) {
  return (
    <fieldset style={gruppeStil}>
      <legend style={legendeStil}>{legende}</legend>
      {hinweis && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink5)' }}>{hinweis}</p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>{kinder}</div>
    </fieldset>
  )
}

/** Genau eine Auswahl (Radio) — als große Kacheln. */
export function EinfachAuswahl({ legende, hinweis, optionen, wert, onChange, disabled, name }: {
  legende: string
  hinweis?: string
  optionen: readonly Option[]
  wert: string
  onChange: (wert: string) => void
  disabled?: boolean
  /** Muss je Gruppe eindeutig sein, sonst greifen zwei Gruppen ineinander. */
  name: string
}) {
  return (
    <Gruppe legende={legende} hinweis={hinweis} kinder={optionen.map(o => {
      const gewaehlt = wert === o.wert
      return (
        <label key={o.wert} style={kachelStil(gewaehlt, !!disabled)}>
          <input
            type="radio"
            name={name}
            value={o.wert}
            checked={gewaehlt}
            disabled={disabled}
            onChange={() => onChange(o.wert)}
            style={{ marginTop: 3, width: 20, height: 20, flexShrink: 0 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{o.label}</span>
            {o.hinweis && (
              <span style={{ display: 'block', fontSize: 12, color: 'var(--ink5)', marginTop: 2 }}>
                {o.hinweis}
              </span>
            )}
          </span>
        </label>
      )
    })} />
  )
}

/** Mehrere Auswahlen (Checkbox) — als große Kacheln. */
export function MehrfachAuswahl({ legende, hinweis, optionen, werte, onChange, disabled }: {
  legende: string
  hinweis?: string
  optionen: readonly Option[]
  werte: string[]
  onChange: (werte: string[]) => void
  disabled?: boolean
}) {
  function schalte(wert: string) {
    onChange(werte.includes(wert) ? werte.filter(w => w !== wert) : [...werte, wert])
  }

  return (
    <Gruppe legende={legende} hinweis={hinweis} kinder={optionen.map(o => {
      const gewaehlt = werte.includes(o.wert)
      return (
        <label key={o.wert} style={kachelStil(gewaehlt, !!disabled)}>
          <input
            type="checkbox"
            checked={gewaehlt}
            disabled={disabled}
            onChange={() => schalte(o.wert)}
            style={{ marginTop: 3, width: 20, height: 20, flexShrink: 0 }}
          />
          <span>
            <span style={{ display: 'block', fontSize: 15, color: 'var(--ink)' }}>{o.label}</span>
            {o.hinweis && (
              <span style={{ display: 'block', fontSize: 12, color: 'var(--ink5)', marginTop: 2 }}>
                {o.hinweis}
              </span>
            )}
          </span>
        </label>
      )
    })} />
  )
}

/**
 * Hinweis, dass eine Angabe beim letzten „Weiter" gefehlt hat.
 * Bewusst kein rotes Feld am Eingabefeld selbst: die Person hat nichts
 * falsch gemacht, sie ist nur noch nicht fertig.
 */
export function FehltHinweis({ sichtbar, text = 'Bitte noch ausfüllen.' }: {
  sichtbar: boolean; text?: string
}) {
  if (!sichtbar) return null
  return (
    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#B42828' }}>{text}</p>
  )
}
