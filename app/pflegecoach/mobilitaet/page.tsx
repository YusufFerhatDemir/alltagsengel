'use client'

// PflegeCoach — Mobilität: Bewegungsübungen, Wohnraum-Check, Sturz notieren.
// Allgemeine Anleitungen, KEINE individualisierte Therapie (MDR-Abgrenzung).

import { useState } from 'react'
import Link from 'next/link'
import { INHALT_ENTWURF_HINWEIS, UEBUNGEN, WOHNRAUM_CHECK } from '@/lib/coach/inhalte'
import { coachApi, useCoachProfil } from '../_lib/client'

export default function MobilitaetSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [abgehakt, setAbgehakt] = useState<Set<string>>(new Set())
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)
  const [sende, setSende] = useState(false)

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const sturzNotieren = async () => {
    if (!window.confirm('Möchten Sie einen Sturz (oder Beinahe-Sturz) notieren?')) return
    setSende(true)
    setMeldung(null)
    try {
      await coachApi('/api/coach/messungen', {
        method: 'POST',
        body: JSON.stringify({ instrument: 'sturzereignis', antworten: { quelle: 'selbstbericht' } }),
      })
      setMeldung({
        art: 'ok',
        text: 'Sturz notiert. Bitte besprechen Sie das Ereignis mit Ihrer Hausarztpraxis oder der Pflegeberatung.',
      })
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Mobilität</h1>
      <p className="pc-lead">
        Regelmäßige, sichere Bewegung hilft, Kraft und Gleichgewicht im Alltag zu erhalten.
        Planen Sie Übungen als feste Aktivität im <Link href="/pflegecoach/wochenplan">Wochenplan</Link> ein.
      </p>

      <p className="pc-feedback pc-feedback--info">
        Diese Übungen sind allgemeine Anleitungen für den Hausgebrauch und ersetzen keine
        Physiotherapie und keine ärztliche Beratung. Brechen Sie eine Übung bei Schmerzen,
        Schwindel oder Unsicherheit sofort ab.
      </p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <section aria-labelledby="uebungen-titel">
        <h2 id="uebungen-titel" className="pc-h1" style={{ fontSize: '1.3em' }}>Übungen</h2>
        {UEBUNGEN.map(u => (
          <article key={u.id} className="pc-card" aria-label={`Übung: ${u.titel}`}>
            <h3>
              {u.titel}{' '}
              {u.pruefstatus === 'entwurf' && <span className="pc-badge pc-badge--entwurf">In fachlicher Prüfung</span>}
            </h3>
            <p className="pc-lead">{u.ziel} · ca. {u.dauer_minuten} Minuten</p>
            <ol style={{ paddingLeft: 22 }}>
              {u.schritte.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
            </ol>
            <p><strong>Sicherheit:</strong> {u.sicherheitshinweis}</p>
            {u.pruefstatus === 'entwurf' && <p className="pc-lead" style={{ fontSize: '0.9em' }}>{INHALT_ENTWURF_HINWEIS}</p>}
          </article>
        ))}
      </section>

      <section className="pc-card" aria-labelledby="wohnraum-titel">
        <h2 id="wohnraum-titel">Wohnraum-Sicherheits-Check</h2>
        <p>Gehen Sie die Punkte in Ruhe durch — jede beseitigte Stolperquelle zählt.</p>
        {WOHNRAUM_CHECK.map(item => (
          <label key={item.id} className="pc-check-row">
            <input
              type="checkbox"
              checked={abgehakt.has(item.id)}
              onChange={e => setAbgehakt(prev => {
                const neu = new Set(prev)
                if (e.target.checked) neu.add(item.id); else neu.delete(item.id)
                return neu
              })}
            />
            <span>{item.text}</span>
          </label>
        ))}
        <p role="status" style={{ marginTop: 12 }}>
          {abgehakt.size} von {WOHNRAUM_CHECK.length} Punkten erledigt.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="sturz-titel">
        <h2 id="sturz-titel">Sturz oder Beinahe-Sturz?</h2>
        <p>
          Notieren Sie Stürze — so behalten Sie den Überblick für Gespräche mit Hausarztpraxis
          oder Pflegeberatung. Der PflegeCoach bewertet Stürze nicht und ersetzt keine ärztliche Abklärung.
        </p>
        <button type="button" className="pc-btn" onClick={sturzNotieren} disabled={sende}>
          Sturz notieren
        </button>
      </section>
    </>
  )
}
