'use client'

// PflegeCoach — Zugang freischalten (Schritt 3 des Nutzerflows).
// Der Code kommt von der Pflegekasse (oder aus einem Pilotzugang) und
// wird hier eingelöst. Ob ein Code-Verfahren verbindlich vorgeschrieben
// ist, ist noch offen — deshalb ist die Freischaltung standardmäßig
// KEINE Zugangsvoraussetzung (COACH_FREISCHALTUNG_PFLICHT, Default aus).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachFreischaltung } from '@/lib/coach/types'
import { FREISCHALT_QUELLE_LABELS } from '@/lib/coach/freischaltung'
import { coachApi, CoachApiError, useCoachProfil } from '../_lib/client'

interface StatusAntwort {
  freischaltungen: CoachFreischaltung[]
  freigeschaltet: boolean
  pflicht: boolean
}

export default function FreischaltungSeite() {
  const { profil, laden } = useCoachProfil()
  const [status, setStatus] = useState<StatusAntwort | null>(null)
  const [code, setCode] = useState('')
  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)

  const ladeStatus = useCallback(() => {
    coachApi<StatusAntwort>('/api/coach/freischaltung')
      .then(setStatus)
      .catch(() => setFehler('Der Freischaltstatus konnte nicht geladen werden.'))
  }, [])

  useEffect(() => { if (profil) ladeStatus() }, [profil, ladeStatus])

  const einloesen = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    setErfolg(null)
    setSende(true)
    try {
      await coachApi('/api/coach/freischaltung', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setErfolg('Ihr Zugang ist freigeschaltet.')
      setCode('')
      ladeStatus()
    } catch (e) {
      setFehler(e instanceof CoachApiError ? e.message : 'Der Code konnte nicht eingelöst werden.')
    } finally {
      setSende(false)
    }
  }

  if (laden || !profil) return <p role="status">Wird geladen …</p>

  return (
    <>
      <h1 className="pc-h1">Zugang freischalten</h1>
      <p className="pc-lead">
        Wenn Sie einen Freischaltcode erhalten haben, können Sie ihn hier eingeben.
      </p>

      {status?.freigeschaltet && (
        <p className="pc-feedback pc-feedback--ok" role="status">
          Ihr Zugang ist freigeschaltet.
        </p>
      )}
      {status && !status.freigeschaltet && !status.pflicht && (
        <p className="pc-feedback pc-feedback--info">
          Sie können den PflegeCoach vollständig nutzen. Ein Freischaltcode ist
          derzeit nicht erforderlich.
        </p>
      )}

      {erfolg && <p className="pc-feedback pc-feedback--ok" role="status">{erfolg}</p>}
      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={einloesen} className="pc-card">
        <label htmlFor="code">Freischaltcode</label>
        <input
          id="code"
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="ABCD-EFGH-JKLM"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          aria-describedby="code-hilfe"
        />
        <p id="code-hilfe" className="pc-lead">
          Groß- und Kleinschreibung sowie Bindestriche spielen keine Rolle.
        </p>
        <button type="submit" className="pc-btn" disabled={sende || !code.trim()}>
          {sende ? 'Wird geprüft …' : 'Code einlösen'}
        </button>
      </form>

      {status && status.freischaltungen.length > 0 && (
        <section className="pc-card" aria-labelledby="verlauf-titel">
          <h2 id="verlauf-titel">Ihre Freischaltungen</h2>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th scope="col">Freigeschaltet am</th>
                  <th scope="col">Herkunft</th>
                  <th scope="col">Gültig bis</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {status.freischaltungen.map(f => (
                  <tr key={f.id}>
                    <td>{formatDatum(f.freigeschaltet_am)}</td>
                    <td>{FREISCHALT_QUELLE_LABELS[f.quelle]}</td>
                    <td>{f.gueltig_bis ? formatDatum(f.gueltig_bis) : 'unbefristet'}</td>
                    <td>{f.status === 'aktiv' ? 'Aktiv' : f.status === 'abgelaufen' ? 'Abgelaufen' : 'Widerrufen'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pc-card" aria-labelledby="hilfe-titel">
        <h2 id="hilfe-titel">Sie haben noch keinen Code?</h2>
        <p>
          Ein Freischaltcode kann im Rahmen eines Pilotzugangs oder einer Kooperation
          bereitgestellt werden. Bei Fragen wenden Sie sich an Alltagsengel.
        </p>
      </section>
    </>
  )
}

function formatDatum(wert: string): string {
  const iso = wert.slice(0, 10)
  const [j, m, t] = iso.split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}
