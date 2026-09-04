'use client'
/**
 * Alltagsengel Assistent — Begleitung während des Onboardings
 *
 * Bauweise wie components/BeratungsChat.tsx (fester Knopf unten, Panel
 * darüber), aber mit einem entscheidenden Unterschied: dieser Assistent
 * ruft KEIN Modell. Die Antworten kommen aus lib/onboarding/assistent.ts,
 * sind dort geprüft und stets dieselben.
 *
 * ── WAS ER NICHT TUT ───────────────────────────────────────────────────
 * Er behauptet nie, dass etwas vorliegt, angekommen oder genehmigt ist,
 * ohne dass es im Stand steht — und er sagt dazu, was er NICHT sehen
 * kann (Post, E-Mail). Fragen ohne Regel beantwortet er nicht, sondern
 * reicht sie an Menschen weiter. Die Begründung steht ausführlich im
 * Kopf von lib/onboarding/assistent.ts.
 *
 * Diese Datei entscheidet dementsprechend nichts: sie zeigt an, was die
 * Logik liefert, und führt die Aktionen aus, die sie anbietet.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  beantworte, vorschlaege,
  type Aktion, type AssistentLage,
} from '@/lib/onboarding/assistent'

interface Zeile {
  von: 'assistent' | 'person'
  text: string
  aktionen?: Aktion[]
}

export interface OnboardingAssistentProps {
  lage: AssistentLage
  /** Zu einem Schritt springen. */
  onGeheZuSchritt?: (schritt: number) => void
  /** Einen anderen Ablauf öffnen. */
  onOeffneAblauf?: (typ: AssistentLage['typ']) => void
  /** Eine Leistung vorbelegen (nur Kundenablauf). */
  onWaehleLeistung?: (wert: string) => void
  /** Zum Schritt „Unterlagen" bzw. zum Upload. */
  onHochladen?: (dokumentArt: string) => void
  /** Kontaktaufnahme mit Menschen. */
  onMensch?: () => void
}

const BEGRUESSUNG = 'Hallo! Ich bin der Alltagsengel Assistent. '
  + 'Ich sage Ihnen, was noch offen ist, und erkläre, was unklar ist. '
  + 'Was möchten Sie wissen?'

export default function OnboardingAssistent({
  lage, onGeheZuSchritt, onOeffneAblauf, onWaehleLeistung, onHochladen, onMensch,
}: OnboardingAssistentProps) {
  const [offen, setOffen] = useState(false)
  const [zeilen, setZeilen] = useState<Zeile[]>([{ von: 'assistent', text: BEGRUESSUNG }])
  const [eingabe, setEingabe] = useState('')
  const ende = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (offen) ende.current?.scrollIntoView({ behavior: 'smooth' })
  }, [zeilen, offen])

  const frage = useCallback((text: string) => {
    const sauber = text.trim()
    if (!sauber) return
    const antwort = beantworte(sauber, lage)
    setZeilen(z => [
      ...z,
      { von: 'person', text: sauber },
      { von: 'assistent', text: antwort.text, aktionen: antwort.aktionen },
    ])
    setEingabe('')
  }, [lage])

  function fuehreAus(aktion: Aktion) {
    switch (aktion.art) {
      case 'gehe_zu_schritt': onGeheZuSchritt?.(aktion.schritt); setOffen(false); break
      case 'oeffne_ablauf': onOeffneAblauf?.(aktion.typ); break
      case 'waehle_leistung': onWaehleLeistung?.(aktion.wert); setOffen(false); break
      case 'hochladen': onHochladen?.(aktion.dokumentArt); setOffen(false); break
      case 'mensch': onMensch?.(); break
    }
  }

  return (
    <>
      {offen && (
        <div
          role="dialog"
          aria-label="Alltagsengel Assistent"
          style={{
            position: 'fixed', right: 16, bottom: 84, zIndex: 1002,
            width: 'min(380px, calc(100vw - 32px))', maxHeight: 'min(560px, 70vh)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--coal2, #1b1b1b)', border: '1px solid var(--border, #333)',
            borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          }}
        >
          <header style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border, #333)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <strong style={{ fontSize: 14, color: 'var(--ink, #eee)' }}>
              Alltagsengel Assistent
            </strong>
            <button type="button" onClick={() => setOffen(false)} aria-label="Assistent schließen"
              style={{
                minWidth: 44, minHeight: 44, background: 'transparent', border: 'none',
                color: 'var(--ink4, #aaa)', fontSize: 20, cursor: 'pointer',
              }}>
              ×
            </button>
          </header>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 10 }}>
            {zeilen.map((z, i) => (
              <div key={i} style={{ display: 'grid', gap: 8, justifyItems: z.von === 'person' ? 'end' : 'start' }}>
                <p style={{
                  margin: 0, maxWidth: '90%', padding: '10px 12px', borderRadius: 14,
                  fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-line',
                  background: z.von === 'person' ? 'rgba(201,150,60,.22)' : 'rgba(255,255,255,.06)',
                  color: 'var(--ink, #eee)',
                }}>
                  {z.text}
                </p>
                {z.aktionen && z.aktionen.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {z.aktionen.map((a, j) => (
                      <button key={j} type="button" onClick={() => fuehreAus(a)}
                        style={knopfStil}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={ende} />
          </div>

          {/* Vorschläge: die häufigen Fragen als Knopf — Tippen auf dem
              Telefon ist die größte Hürde dieses Formats. */}
          <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vorschlaege(lage).map(v => (
              <button key={v} type="button" onClick={() => frage(v)} style={knopfStil}>
                {v}
              </button>
            ))}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); frage(eingabe) }}
            style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border, #333)' }}
          >
            <label htmlFor="assistent-eingabe" style={{
              position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)',
            }}>
              Ihre Frage
            </label>
            <input
              id="assistent-eingabe"
              value={eingabe}
              onChange={e => setEingabe(e.target.value)}
              placeholder="Ihre Frage …"
              style={{
                flex: 1, minHeight: 44, padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border, #333)', background: 'transparent',
                color: 'var(--ink, #eee)', fontSize: 15,
              }}
            />
            <button type="submit" style={{ ...knopfStil, minHeight: 44, paddingInline: 16 }}>
              Senden
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        aria-label="Alltagsengel Assistent öffnen"
        style={{
          position: 'fixed', right: 16, bottom: 16, zIndex: 1001,
          minHeight: 56, paddingInline: 20, borderRadius: 28,
          background: 'var(--gold, #C9963C)', color: '#1b1b1b',
          border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,.3)',
        }}
      >
        {offen ? 'Assistent schließen' : 'Fragen?'}
      </button>
    </>
  )
}

const knopfStil = {
  minHeight: 40,
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--border, #333)',
  background: 'rgba(255,255,255,.04)',
  color: 'var(--ink, #eee)',
  fontSize: 13,
  cursor: 'pointer',
  textAlign: 'left',
} as const
