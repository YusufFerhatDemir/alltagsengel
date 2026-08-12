'use client'

// PflegeCoach — Pflegeassessment: Selbsteinschätzung je Lebensbereich (0–4).

import { useEffect, useState } from 'react'
import type { CoachAssessment } from '@/lib/coach/types'
import {
  ASSESSMENT_BEREICHE, ASSESSMENT_BEREICH_LABELS, ASSESSMENT_STUFEN,
  vergleicheAssessments, type AssessmentBereich,
} from '@/lib/coach/assessment'
import { coachApi, useCoachProfil } from '../_lib/client'

export default function AssessmentSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [bisherige, setBisherige] = useState<CoachAssessment[]>([])
  const [werte, setWerte] = useState<Partial<Record<AssessmentBereich, number>>>({})
  const [notizen, setNotizen] = useState('')
  const [sende, setSende] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const lade = () =>
    coachApi<{ assessments: CoachAssessment[] }>('/api/coach/assessments')
      .then(r => setBisherige(r.assessments))
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setMeldung(null)
    if (ASSESSMENT_BEREICHE.some(b => werte[b] === undefined)) {
      setMeldung({ art: 'error', text: 'Bitte beantworten Sie alle Bereiche.' })
      return
    }
    setSende(true)
    try {
      await coachApi('/api/coach/assessments', {
        method: 'POST',
        body: JSON.stringify({
          assessment_typ: bisherige.length ? 'verlaufsassessment' : 'erstassessment',
          ...werte,
          notizen: notizen || null,
        }),
      })
      setWerte({})
      setNotizen('')
      setMeldung({ art: 'ok', text: 'Assessment gespeichert. Vielen Dank!' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  const letztes = bisherige[bisherige.length - 1]
  const vorletztes = bisherige[bisherige.length - 2]
  const deltas = letztes && vorletztes ? vergleicheAssessments(vorletztes, letztes) : null

  return (
    <>
      <h1 className="pc-h1">Pflegeassessment</h1>
      <p className="pc-lead">
        Ihre Selbsteinschätzung: Wie gut gelingen Ihnen diese Lebensbereiche im Alltag?
        Es gibt kein richtig oder falsch — die Angaben helfen, passende Ziele zu finden
        und Ihren Verlauf sichtbar zu machen.
      </p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <form onSubmit={absenden}>
        {ASSESSMENT_BEREICHE.map(bereich => (
          <fieldset key={bereich} className="pc-fieldset">
            <legend>{ASSESSMENT_BEREICH_LABELS[bereich]}</legend>
            <div className="pc-scale">
              {ASSESSMENT_STUFEN.map((stufe, wert) => (
                <label key={wert} className="pc-scale-option">
                  <input
                    type="radio"
                    name={bereich}
                    value={wert}
                    checked={werte[bereich] === wert}
                    onChange={() => setWerte(w => ({ ...w, [bereich]: wert }))}
                  />
                  <span>{stufe}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="pc-card">
          <label htmlFor="notizen">Anmerkungen (optional)</label>
          <textarea id="notizen" value={notizen} onChange={e => setNotizen(e.target.value)} maxLength={4000} />
        </div>

        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird gespeichert …' : 'Assessment speichern'}
        </button>
      </form>

      {deltas && (
        <section className="pc-card" aria-labelledby="vergleich-titel">
          <h2 id="vergleich-titel">Vergleich zur vorherigen Erhebung</h2>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr><th scope="col">Bereich</th><th scope="col">Vorher</th><th scope="col">Aktuell</th><th scope="col">Veränderung</th></tr>
              </thead>
              <tbody>
                {deltas.map(d => (
                  <tr key={d.bereich}>
                    <th scope="row">{d.label}</th>
                    <td>{d.vorher ?? '—'}</td>
                    <td>{d.nachher ?? '—'}</td>
                    <td>
                      {d.delta === null ? '—' :
                        d.delta === 0 ? 'unverändert' :
                        d.delta > 0 ? `mehr Unterstützungsbedarf (+${d.delta})` :
                        `selbständiger (${d.delta})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bisherige.length > 0 && (
        <section className="pc-card" aria-labelledby="historie-titel">
          <h2 id="historie-titel">Bisherige Erhebungen</h2>
          <ul style={{ paddingLeft: 20 }}>
            {[...bisherige].reverse().map(a => (
              <li key={a.id}>
                {new Date(a.erhoben_am + 'T00:00:00').toLocaleDateString('de-DE')} — {a.assessment_typ === 'erstassessment' ? 'Erstassessment' : 'Verlaufsassessment'}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
