'use client'

// PflegeCoach — Übersicht: heutige Aktivitäten, Hinweise, Schnellzugriff.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachActivity, CoachActivityLog } from '@/lib/coach/types'
import type { Empfehlung } from '@/lib/coach/empfehlungen'
import { coachApi, heuteIso, isoWochentag, useCoachProfil } from './_lib/client'

export default function CoachUebersicht() {
  const { profil, laden, fehler } = useCoachProfil()
  const [aktivitaeten, setAktivitaeten] = useState<CoachActivity[]>([])
  const [log, setLog] = useState<CoachActivityLog[]>([])
  const [empfehlungen, setEmpfehlungen] = useState<Empfehlung[]>([])
  const [hinweis, setHinweis] = useState('')
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!profil) return
    Promise.all([
      coachApi<{ aktivitaeten: CoachActivity[] }>('/api/coach/aktivitaeten'),
      coachApi<{ log: CoachActivityLog[] }>('/api/coach/aktivitaeten/log?von=' + heuteIso()),
      coachApi<{ empfehlungen: Empfehlung[]; hinweis: string }>('/api/coach/empfehlungen'),
    ])
      .then(([a, l, e]) => {
        setAktivitaeten(a.aktivitaeten)
        setLog(l.log)
        setEmpfehlungen(e.empfehlungen)
        setHinweis(e.hinweis)
      })
      .catch(e => setLadeFehler(e.message))
  }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const heuteTag = isoWochentag(new Date())
  const heutige = aktivitaeten.filter(a => a.aktiv && a.wochentage.includes(heuteTag))
  const erledigtIds = new Set(log.filter(l => l.datum === heuteIso() && l.status !== 'ausgelassen').map(l => l.activity_id))

  const abhaken = async (a: CoachActivity) => {
    try {
      await coachApi('/api/coach/aktivitaeten/log', {
        method: 'POST',
        body: JSON.stringify({ activity_id: a.id, status: 'erledigt' }),
      })
      const l = await coachApi<{ log: CoachActivityLog[] }>('/api/coach/aktivitaeten/log?von=' + heuteIso())
      setLog(l.log)
    } catch (e) {
      setLadeFehler((e as Error).message)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Guten Tag{profil.anzeigename ? `, ${profil.anzeigename}` : ''}!</h1>
      <p className="pc-lead">Ihr Überblick für heute.</p>

      {ladeFehler && <p className="pc-feedback pc-feedback--error" role="alert">{ladeFehler}</p>}

      <section className="pc-card" aria-labelledby="heute-titel">
        <h2 id="heute-titel">Heute geplant</h2>
        {heutige.length === 0 && (
          <p>Für heute ist nichts geplant. <Link href="/pflegecoach/wochenplan">Zum Wochenplan</Link></p>
        )}
        {heutige.map(a => (
          <label key={a.id} className="pc-check-row">
            <input
              type="checkbox"
              checked={erledigtIds.has(a.id)}
              onChange={() => abhaken(a)}
              disabled={erledigtIds.has(a.id)}
            />
            <span>
              {a.titel}
              {a.uhrzeit ? ` — ${a.uhrzeit.slice(0, 5)} Uhr` : ''}
              {a.dauer_minuten ? ` (${a.dauer_minuten} Min.)` : ''}
            </span>
          </label>
        ))}
      </section>

      {empfehlungen.length > 0 && (
        <section className="pc-card" aria-labelledby="hinweise-titel">
          <h2 id="hinweise-titel">Hinweise für Sie</h2>
          <ul style={{ paddingLeft: 20 }}>
            {empfehlungen.map((e, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <strong>{e.titel}</strong><br />
                {e.text} <Link href={e.link}>Ansehen</Link>
              </li>
            ))}
          </ul>
          {hinweis && <p className="pc-feedback pc-feedback--info">{hinweis}</p>}
        </section>
      )}

      <section className="pc-card" aria-labelledby="bereiche-titel">
        <h2 id="bereiche-titel">Ihre Bereiche</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/assessment">Pflegeassessment</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/ziele">Meine Ziele</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/wochenplan">Wochenplan</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/mobilitaet">Mobilität &amp; Übungen</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/alltag">Alltag &amp; Selbstversorgung</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/angehoerige">Für Angehörige</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/belastung">Belastungs-Check</Link>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/verlauf">Mein Verlauf</Link>
        </div>
      </section>
    </>
  )
}
