'use client'

// PflegeCoach — Anspruchsprüfung (Schritt 1 des Nutzerflows).
// Orientierungshilfe, keine Anspruchsentscheidung: die Bewertung erfolgt
// serverseitig in lib/coach/anspruch.ts, damit Ergebnis und gespeicherte
// Kriterien-Version zusammenpassen.

import { useState } from 'react'
import Link from 'next/link'
import type { AnspruchErgebnisDetail, NutzungDurch } from '@/lib/coach/anspruch'
import { ANSPRUCH_ERGEBNIS_LABELS, ANSPRUCH_KRITERIEN } from '@/lib/coach/anspruch'
import { coachApi, CoachApiError, useCoachProfil } from '../_lib/client'

const NUTZUNG_LABELS: Record<NutzungDurch, string> = {
  pflegebeduerftig: 'Die pflegebedürftige Person selbst',
  angehoerig: 'Eine pflegende Angehörige oder ein pflegender Angehöriger',
  gemeinsam: 'Beide gemeinsam',
}

export default function AnspruchClient() {
  const { profil, laden } = useCoachProfil()
  const [pflegegrad, setPflegegrad] = useState<string>('')
  const [beantragt, setBeantragt] = useState(false)
  const [haeuslich, setHaeuslich] = useState<'' | 'ja' | 'nein'>('')
  const [nutzungDurch, setNutzungDurch] = useState<NutzungDurch | ''>('')
  const [ergebnis, setErgebnis] = useState<AnspruchErgebnisDetail | null>(null)
  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    if (pflegegrad === '') { setFehler('Bitte geben Sie an, ob ein Pflegegrad vorliegt.'); return }
    setSende(true)
    try {
      const antwort = await coachApi<{ ergebnis: AnspruchErgebnisDetail }>('/api/coach/anspruch', {
        method: 'POST',
        body: JSON.stringify({
          pflegegrad: Number(pflegegrad),
          pflegegrad_beantragt: beantragt,
          haeusliche_versorgung: haeuslich === '' ? null : haeuslich === 'ja',
          nutzung_durch: nutzungDurch || null,
        }),
      })
      setErgebnis(antwort.ergebnis)
    } catch (e) {
      setFehler(e instanceof CoachApiError ? e.message : 'Die Prüfung konnte nicht gespeichert werden.')
    } finally {
      setSende(false)
    }
  }

  if (laden || !profil) return <p role="status">Wird geladen …</p>

  return (
    <>
      <h1 className="pc-h1">Kann ich den PflegeCoach über die Pflegekasse beantragen?</h1>
      <p className="pc-lead">
        Diese kurze Selbstauskunft gibt Ihnen eine Orientierung. Sie ist unverbindlich —
        über den Leistungsanspruch entscheidet allein Ihre Pflegekasse.
      </p>

      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={absenden}>
        <fieldset className="pc-fieldset">
          <legend>Liegt ein Pflegegrad vor?</legend>
          <div className="pc-scale">
            <label className="pc-scale-option">
              <input type="radio" name="pg" value="0" checked={pflegegrad === '0'} onChange={() => setPflegegrad('0')} />
              <span>Nein, kein Pflegegrad</span>
            </label>
            {[1, 2, 3, 4, 5].map(g => (
              <label key={g} className="pc-scale-option">
                <input
                  type="radio" name="pg" value={String(g)}
                  checked={pflegegrad === String(g)}
                  onChange={() => setPflegegrad(String(g))}
                />
                <span>Pflegegrad {g}</span>
              </label>
            ))}
          </div>
          {pflegegrad === '0' && (
            <label className="pc-check-row">
              <input type="checkbox" checked={beantragt} onChange={e => setBeantragt(e.target.checked)} />
              <span>Ein Pflegegrad ist bereits beantragt, aber noch nicht festgestellt.</span>
            </label>
          )}
        </fieldset>

        <fieldset className="pc-fieldset">
          <legend>Findet die Versorgung zu Hause statt?</legend>
          <div className="pc-scale">
            <label className="pc-scale-option">
              <input type="radio" name="haeuslich" checked={haeuslich === 'ja'} onChange={() => setHaeuslich('ja')} />
              <span>Ja, zu Hause</span>
            </label>
            <label className="pc-scale-option">
              <input type="radio" name="haeuslich" checked={haeuslich === 'nein'} onChange={() => setHaeuslich('nein')} />
              <span>Nein, in einer stationären Einrichtung</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="pc-fieldset">
          <legend>Wer wird den PflegeCoach nutzen?</legend>
          <div className="pc-scale">
            {(Object.keys(NUTZUNG_LABELS) as NutzungDurch[]).map(n => (
              <label key={n} className="pc-scale-option">
                <input
                  type="radio" name="nutzung"
                  checked={nutzungDurch === n}
                  onChange={() => setNutzungDurch(n)}
                />
                <span>{NUTZUNG_LABELS[n]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird geprüft …' : 'Einschätzung anzeigen'}
        </button>
      </form>

      {ergebnis && (
        <section className="pc-card" aria-live="polite" aria-labelledby="ergebnis-titel">
          <h2 id="ergebnis-titel">{ANSPRUCH_ERGEBNIS_LABELS[ergebnis.ergebnis]}</h2>
          <ul>
            {ergebnis.hinweise.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
          <p><strong>Nächster Schritt:</strong> {ergebnis.naechsterSchritt}</p>
          {ergebnis.ergebnis === 'anspruch_moeglich' && (
            <p>
              Wenn Sie bereits einen Freischaltcode erhalten haben, können Sie ihn hier eingeben:{' '}
              <Link href="/pflegecoach/freischaltung">Zugang freischalten</Link>.
            </p>
          )}
        </section>
      )}

      <section className="pc-card" aria-labelledby="kriterien-titel">
        <h2 id="kriterien-titel">Worauf diese Einschätzung beruht</h2>
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th scope="col">Frage</th>
                <th scope="col">Erläuterung</th>
              </tr>
            </thead>
            <tbody>
              {ANSPRUCH_KRITERIEN.map(k => (
                <tr key={k.key}>
                  <th scope="row">
                    {k.frage}{' '}
                    {!k.verifiziert && <span className="pc-badge pc-badge--entwurf">noch zu klären</span>}
                  </th>
                  <td>{k.erlaeuterung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="pc-lead">
          Punkte mit dem Hinweis „noch zu klären" führen nie zu einer Ablehnung — sie bedeuten,
          dass Sie diesen Punkt mit Ihrer Pflegekasse besprechen sollten.
        </p>
      </section>
    </>
  )
}
