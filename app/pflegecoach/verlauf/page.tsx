'use client'

// PflegeCoach — Verlaufsmessung: Assessments + Messungen über die Zeit.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachAssessment, CoachMeasurement } from '@/lib/coach/types'
import { ASSESSMENT_BEREICHE, ASSESSMENT_BEREICH_LABELS } from '@/lib/coach/assessment'
import { coachApi, useCoachProfil } from '../_lib/client'

const INSTRUMENT_LABELS: Record<string, string> = {
  belastung_kurz: 'Belastungs-Check',
  sturzereignis: 'Sturz (Selbstbericht)',
  fes_i_k: 'Sturzangst (FES-I Kurzform)',
  bsfc_s: 'Belastung (BSFC-s)',
  sus: 'Usability (SUS)',
  selbsteinschaetzung_selbststaendigkeit: 'Selbständigkeit (Selbsteinschätzung)',
  befinden: 'Befinden',
}

export default function VerlaufSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [assessments, setAssessments] = useState<CoachAssessment[]>([])
  const [messungen, setMessungen] = useState<CoachMeasurement[]>([])
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!profil) return
    Promise.all([
      coachApi<{ assessments: CoachAssessment[] }>('/api/coach/assessments'),
      coachApi<{ messungen: CoachMeasurement[] }>('/api/coach/messungen'),
    ])
      .then(([a, m]) => { setAssessments(a.assessments); setMessungen(m.messungen) })
      .catch(e => setLadeFehler(e.message))
  }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  return (
    <>
      <h1 className="pc-h1">Mein Verlauf</h1>
      <p className="pc-lead">
        Alle Selbsteinschätzungen im Zeitverlauf. Für einen zusammenfassenden, druckbaren
        Bericht: <Link href="/pflegecoach/bericht">Bericht erstellen</Link>.
      </p>

      {ladeFehler && <p className="pc-feedback pc-feedback--error" role="alert">{ladeFehler}</p>}

      <section className="pc-card" aria-labelledby="verlauf-assessments-titel">
        <h2 id="verlauf-assessments-titel">Assessments</h2>
        {assessments.length === 0 && (
          <p>Noch keine Erhebung. <Link href="/pflegecoach/assessment">Jetzt starten</Link></p>
        )}
        {assessments.length > 0 && (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <caption className="sr-only">Assessment-Werte je Erhebung (0 = selbständig, 4 = umfassende Unterstützung)</caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  {ASSESSMENT_BEREICHE.map(b => <th key={b} scope="col">{ASSESSMENT_BEREICH_LABELS[b]}</th>)}
                </tr>
              </thead>
              <tbody>
                {assessments.map(a => (
                  <tr key={a.id}>
                    <td>{new Date(a.erhoben_am + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                    {ASSESSMENT_BEREICHE.map(b => <td key={b}>{a[b] ?? '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="pc-lead" style={{ fontSize: '0.9em' }}>
          Skala: 0 = selbständig … 4 = umfassende Unterstützung nötig.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="verlauf-messungen-titel">
        <h2 id="verlauf-messungen-titel">Weitere Messungen</h2>
        {messungen.length === 0 && <p>Noch keine Messungen vorhanden.</p>}
        {messungen.length > 0 && (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr><th scope="col">Datum</th><th scope="col">Art</th><th scope="col">Wert</th></tr>
              </thead>
              <tbody>
                {[...messungen].reverse().map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.erhoben_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</td>
                    <td>{INSTRUMENT_LABELS[m.instrument] ?? m.instrument}</td>
                    <td>{m.summenwert ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
