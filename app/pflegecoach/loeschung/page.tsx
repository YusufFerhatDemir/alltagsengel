'use client'

// PflegeCoach — Daten löschen (Löschkonzept, Art. 17 DSGVO).
// Löscht ausschließlich die PflegeCoach-Daten. Das Alltagsengel-Konto
// bleibt bestehen — das ist die Konsequenz der Produkttrennung.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { coachApi, CoachApiError, useCoachProfil } from '../_lib/client'

interface UmfangAntwort {
  umfang: Record<string, number>
  bestaetigungswort: string
}

const UMFANG_LABELS: Record<string, string> = {
  einwilligungen: 'Einwilligungen',
  assessments: 'Assessments',
  ziele: 'Ziele',
  aktivitaeten: 'Geplante Aktivitäten',
  erledigungen: 'Erledigungs-Einträge',
  messungen: 'Fragebogen-Ergebnisse',
  berichte: 'Berichte und Exporte',
  freigaben: 'Datenfreigaben an andere Personen',
  nutzungsereignisse: 'Pseudonyme Nutzungsdaten',
}

export default function LoeschungSeite() {
  const router = useRouter()
  const { profil, laden } = useCoachProfil()
  const [daten, setDaten] = useState<UmfangAntwort | null>(null)
  const [bestaetigung, setBestaetigung] = useState('')
  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!profil) return
    coachApi<UmfangAntwort>('/api/coach/loeschung')
      .then(setDaten)
      .catch(() => setFehler('Der Löschumfang konnte nicht ermittelt werden.'))
  }, [profil])

  const loeschen = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    setSende(true)
    try {
      await coachApi('/api/coach/loeschung', {
        method: 'DELETE',
        body: JSON.stringify({ bestaetigung }),
      })
      router.push('/pflegecoach/start')
    } catch (e) {
      setFehler(e instanceof CoachApiError ? e.message : 'Die Löschung konnte nicht ausgeführt werden.')
      setSende(false)
    }
  }

  if (laden || !profil) return <p role="status">Wird geladen …</p>

  const wort = daten?.bestaetigungswort ?? 'LOESCHEN'

  return (
    <>
      <h1 className="pc-h1">PflegeCoach-Daten löschen</h1>
      <p className="pc-lead">
        Hier löschen Sie alle Daten, die Sie im Digitalen PflegeCoach erfasst haben.
        Ihr Alltagsengel-Konto bleibt davon unberührt.
      </p>

      <section className="pc-card" aria-labelledby="export-titel">
        <h2 id="export-titel">Vorher: Daten sichern</h2>
        <p>
          Die Löschung lässt sich nicht rückgängig machen. Laden Sie Ihre Daten vorher herunter,
          wenn Sie sie behalten möchten.
        </p>
        <a className="pc-btn pc-btn--secondary" href="/api/coach/export">Daten herunterladen</a>
      </section>

      {daten && (
        <section className="pc-card" aria-labelledby="umfang-titel">
          <h2 id="umfang-titel">Was gelöscht wird</h2>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th scope="col">Bereich</th>
                  <th scope="col">Einträge</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(daten.umfang).map(([key, anzahl]) => (
                  <tr key={key}>
                    <th scope="row">{UMFANG_LABELS[key] ?? key}</th>
                    <td>{anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="pc-card" aria-labelledby="rest-titel">
        <h2 id="rest-titel">Was bestehen bleibt</h2>
        <ul>
          <li>
            Ein Protokolleintrag über die Löschung selbst — ohne Ihre Inhalte, nur als Nachweis,
            dass gelöscht wurde.
          </li>
          <li>
            Falls Ihr Zugang über einen Freischaltcode lief: der Vermerk, dass dieser Code
            eingelöst wurde. Er enthält keinen Bezug zu Ihrer Person und lässt sich Ihnen nicht
            wieder zuordnen.
          </li>
        </ul>
      </section>

      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={loeschen} className="pc-card">
        <label htmlFor="bestaetigung">
          Zur Bestätigung tippen Sie bitte das Wort <strong>{wort}</strong> ein
        </label>
        <input
          id="bestaetigung"
          type="text"
          value={bestaetigung}
          onChange={e => setBestaetigung(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="pc-btn" disabled={sende || bestaetigung !== wort}>
          {sende ? 'Wird gelöscht …' : 'Daten endgültig löschen'}
        </button>
      </form>
    </>
  )
}
