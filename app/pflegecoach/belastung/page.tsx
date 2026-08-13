'use client'

// PflegeCoach — Belastungs-Selbsteinschätzung für pflegende Angehörige.
// Eigenes, nicht validiertes Kurzinstrument (Lizenzklärung BSFC-s/Zarit offen,
// siehe lib/coach/belastung.ts). Keine klinische Bewertung.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachMeasurement } from '@/lib/coach/types'
import { BELASTUNG_ITEMS, BELASTUNG_MAX, BELASTUNG_STUFEN } from '@/lib/coach/belastung'
import { coachApi, useCoachProfil } from '../_lib/client'

export default function BelastungSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [messungen, setMessungen] = useState<CoachMeasurement[]>([])
  const [antworten, setAntworten] = useState<Record<string, number>>({})
  const [sende, setSende] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const lade = () =>
    coachApi<{ messungen: CoachMeasurement[] }>('/api/coach/messungen?instrument=belastung_kurz')
      .then(r => setMessungen(r.messungen))
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setMeldung(null)
    if (BELASTUNG_ITEMS.some(i => antworten[i.id] === undefined)) {
      setMeldung({ art: 'error', text: 'Bitte beantworten Sie alle Fragen.' })
      return
    }
    setSende(true)
    try {
      await coachApi('/api/coach/messungen', {
        method: 'POST',
        body: JSON.stringify({ instrument: 'belastung_kurz', antworten }),
      })
      setAntworten({})
      setMeldung({ art: 'ok', text: 'Vielen Dank! Ihre Selbsteinschätzung wurde gespeichert.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Belastungs-Check</h1>
      <p className="pc-lead">
        7 Fragen zu den letzten zwei Wochen. Die Selbsteinschätzung hilft Ihnen, Veränderungen
        früh zu bemerken — sie ist keine medizinische Bewertung und kein Test mit „Diagnose“.
      </p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <form onSubmit={absenden}>
        {BELASTUNG_ITEMS.map(item => (
          <fieldset key={item.id} className="pc-fieldset">
            <legend>{item.frage}</legend>
            <div className="pc-scale">
              {BELASTUNG_STUFEN.map((stufe, wert) => (
                <label key={wert} className="pc-scale-option">
                  <input
                    type="radio"
                    name={item.id}
                    value={wert}
                    checked={antworten[item.id] === wert}
                    onChange={() => setAntworten(a => ({ ...a, [item.id]: wert }))}
                  />
                  <span>{stufe}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird gespeichert …' : 'Selbsteinschätzung speichern'}
        </button>
      </form>

      {messungen.length > 0 && (
        <section className="pc-card" aria-labelledby="belastung-verlauf-titel">
          <h2 id="belastung-verlauf-titel">Ihr Verlauf</h2>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr><th scope="col">Datum</th><th scope="col">Wert (0–{BELASTUNG_MAX})</th></tr>
              </thead>
              <tbody>
                {[...messungen].reverse().map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.erhoben_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                    <td>{m.summenwert ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Höhere Werte bedeuten eine höhere selbst wahrgenommene Belastung. Wenn Ihre Belastung
            dauerhaft hoch ist: Entlastungsangebote finden Sie unter{' '}
            <Link href="/pflegecoach/angehoerige">Für Angehörige</Link>.
          </p>
        </section>
      )}
    </>
  )
}
