'use client'

// PflegeCoach — Onboarding: Zweckbestimmung, Rolle, Einwilligungen (Art. 9).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CoachRolle, CoachUser } from '@/lib/coach/types'
import { ROLLE_LABELS } from '@/lib/coach/types'
import { coachApi, CoachApiError } from '../_lib/client'

export default function CoachStart() {
  const router = useRouter()
  const [pruefe, setPruefe] = useState(true)
  const [rolle, setRolle] = useState<CoachRolle | ''>('')
  const [anzeigename, setAnzeigename] = useState('')
  const [pflegegrad, setPflegegrad] = useState('')
  const [einwilligungArt9, setEinwilligungArt9] = useState(false)
  const [einwilligungWissenschaft, setEinwilligungWissenschaft] = useState(false)
  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    coachApi<{ profil: CoachUser | null }>('/api/coach/profil')
      .then(({ profil }) => {
        if (profil) router.push('/pflegecoach')
        else setPruefe(false)
      })
      .catch((e: CoachApiError) => {
        if (e.status === 401) router.push('/auth/login?redirectTo=' + encodeURIComponent('/pflegecoach/start'))
        else { setFehler(e.message); setPruefe(false) }
      })
  }, [router])

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    if (!rolle) { setFehler('Bitte wählen Sie Ihre Rolle.'); return }
    if (!einwilligungArt9) { setFehler('Ohne Einwilligung in die Datenverarbeitung kann der PflegeCoach nicht genutzt werden.'); return }
    setSende(true)
    try {
      await coachApi('/api/coach/profil', {
        method: 'POST',
        body: JSON.stringify({
          rolle,
          anzeigename: anzeigename || null,
          pflegegrad: rolle === 'pflegebeduerftig' && pflegegrad ? Number(pflegegrad) : null,
        }),
      })
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: 'gesundheitsdaten_art9', erteilt: true }),
      })
      if (einwilligungWissenschaft) {
        await coachApi('/api/coach/consents', {
          method: 'POST',
          body: JSON.stringify({ consent_typ: 'wissenschaftliche_auswertung', erteilt: true }),
        })
      }
      await coachApi('/api/coach/profil', {
        method: 'PATCH',
        body: JSON.stringify({ onboarding_abgeschlossen: true }),
      })
      router.push('/pflegecoach')
    } catch (e) {
      setFehler((e as Error).message)
      setSende(false)
    }
  }

  if (pruefe) return <p role="status">Wird geladen …</p>

  return (
    <>
      <h1 className="pc-h1">Willkommen beim Digitalen PflegeCoach</h1>

      <section className="pc-card" aria-labelledby="zweck-titel">
        <h2 id="zweck-titel">Was dieser PflegeCoach ist</h2>
        <p>
          Der Digitale PflegeCoach unterstützt Pflegebedürftige in häuslicher Versorgung sowie
          ihre pflegenden Angehörigen mit strukturierten Anleitungs-, Erinnerungs- und
          Dokumentationsfunktionen: Selbständigkeit im Alltag erhalten, die häusliche Versorgung
          stabilisieren und Angehörige entlasten.
        </p>
        <p>
          <strong>Was er nicht ist:</strong> Der PflegeCoach dient nicht der Erkennung, Behandlung
          oder Überwachung von Krankheiten und trifft keine diagnostischen oder therapeutischen
          Entscheidungen. Er ersetzt keine ärztliche oder pflegefachliche Beratung.
        </p>
      </section>

      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={absenden}>
        <fieldset className="pc-fieldset">
          <legend>Ihre Rolle</legend>
          <div className="pc-scale">
            {(Object.keys(ROLLE_LABELS) as CoachRolle[]).map(r => (
              <label key={r} className="pc-scale-option">
                <input
                  type="radio" name="rolle" value={r}
                  checked={rolle === r}
                  onChange={() => setRolle(r)}
                />
                <span>{ROLLE_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pc-card">
          <label htmlFor="anzeigename">Wie dürfen wir Sie ansprechen? (optional)</label>
          <input id="anzeigename" type="text" value={anzeigename} onChange={e => setAnzeigename(e.target.value)} maxLength={120} />

          {rolle === 'pflegebeduerftig' && (
            <>
              <label htmlFor="pflegegrad">Pflegegrad (optional)</label>
              <select id="pflegegrad" value={pflegegrad} onChange={e => setPflegegrad(e.target.value)}>
                <option value="">Keine Angabe</option>
                {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>Pflegegrad {g}</option>)}
              </select>
            </>
          )}
        </div>

        <fieldset className="pc-fieldset">
          <legend>Einwilligungen</legend>
          <label className="pc-check-row">
            <input type="checkbox" checked={einwilligungArt9} onChange={e => setEinwilligungArt9(e.target.checked)} />
            <span>
              Ich willige ein, dass meine im PflegeCoach eingegebenen Pflege- und Gesundheitsdaten
              (Art. 9 DSGVO) zur Bereitstellung der PflegeCoach-Funktionen verarbeitet werden.
              Diese Einwilligung kann ich jederzeit in den Einstellungen widerrufen.
              Details: <a href="/pflegecoach/datenschutz">Datenschutzhinweise</a>. <strong>(erforderlich)</strong>
            </span>
          </label>
          <label className="pc-check-row">
            <input type="checkbox" checked={einwilligungWissenschaft} onChange={e => setEinwilligungWissenschaft(e.target.checked)} />
            <span>
              Ich willige ein, dass meine Nutzungs- und Fragebogendaten pseudonymisiert für die
              wissenschaftliche Evaluation des PflegeCoach ausgewertet werden dürfen.
              Getrennt widerruflich. <strong>(freiwillig)</strong>
            </span>
          </label>
        </fieldset>

        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird eingerichtet …' : 'PflegeCoach starten'}
        </button>
      </form>
    </>
  )
}
