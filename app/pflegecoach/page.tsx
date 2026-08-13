'use client'

// PflegeCoach — Übersicht: heutige Aktivitäten, Hinweise, Schnellzugriff.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachActivity, CoachActivityLog, CoachAssessment, CoachGoal } from '@/lib/coach/types'
import type { Empfehlung } from '@/lib/coach/empfehlungen'
import { coachApi, heuteIso, isoWochentag, useCoachProfil } from './_lib/client'
import { CoachLaden, CoachLadefehler, EinwilligungWiderrufen } from './_lib/Zustand'

export default function CoachUebersicht() {
  const { profil, einwilligungAktiv, laden, fehler, neuLaden } = useCoachProfil()
  const [aktivitaeten, setAktivitaeten] = useState<CoachActivity[]>([])
  const [log, setLog] = useState<CoachActivityLog[]>([])
  const [ziele, setZiele] = useState<CoachGoal[]>([])
  const [assessments, setAssessments] = useState<CoachAssessment[]>([])
  const [empfehlungen, setEmpfehlungen] = useState<Empfehlung[]>([])
  const [hinweis, setHinweis] = useState('')
  const [datenGeladen, setDatenGeladen] = useState(false)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!profil) return
    Promise.all([
      coachApi<{ aktivitaeten: CoachActivity[] }>('/api/coach/aktivitaeten'),
      coachApi<{ log: CoachActivityLog[] }>('/api/coach/aktivitaeten/log?von=' + heuteIso()),
      coachApi<{ empfehlungen: Empfehlung[]; hinweis: string }>('/api/coach/empfehlungen'),
      coachApi<{ ziele: CoachGoal[] }>('/api/coach/ziele'),
      coachApi<{ assessments: CoachAssessment[] }>('/api/coach/assessments'),
    ])
      .then(([a, l, e, z, s]) => {
        setAktivitaeten(a.aktivitaeten)
        setLog(l.log)
        setEmpfehlungen(e.empfehlungen)
        setHinweis(e.hinweis)
        setZiele(z.ziele)
        setAssessments(s.assessments)
        setDatenGeladen(true)
      })
      .catch(e => setLadeFehler(e.message))
  }, [profil])

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  // Einstiegshilfe: Nach dem Onboarding ist alles leer — ohne Wegweiser
  // steht der Nutzer vor „Für heute ist nichts geplant" und weiß nicht,
  // womit er anfangen soll. Die Karte verschwindet, sobald alle drei
  // Schritte erledigt sind.
  const ersteSchritte = [
    {
      titel: 'Selbsteinschätzung ausfüllen',
      text: 'Einmal einschätzen, wie gut Ihnen die Lebensbereiche im Alltag gelingen — das ist der Ausgangspunkt für Ihren Verlauf.',
      href: '/pflegecoach/assessment',
      aktion: 'Zum Assessment',
      erledigt: assessments.length > 0,
    },
    {
      titel: 'Ein erstes Ziel setzen',
      text: 'Ein konkretes, kleines Ziel genügt für den Anfang.',
      href: '/pflegecoach/ziele',
      aktion: 'Ziel anlegen',
      erledigt: ziele.length > 0,
    },
    {
      titel: 'Eine Aktivität einplanen',
      text: 'Feste Routinen an bestimmten Wochentagen geben dem Tag Struktur.',
      href: '/pflegecoach/wochenplan',
      aktion: 'Aktivität einplanen',
      erledigt: aktivitaeten.length > 0,
    },
  ]
  const erledigteSchritte = ersteSchritte.filter(s => s.erledigt).length

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

      {!einwilligungAktiv && <EinwilligungWiderrufen />}

      {einwilligungAktiv && datenGeladen && ersteSchritte.some(s => !s.erledigt) && (
        <section className="pc-card" aria-labelledby="erste-schritte-titel">
          <h2 id="erste-schritte-titel">Ihre ersten Schritte</h2>
          <p>
            So richten Sie den PflegeCoach in wenigen Minuten ein — {erledigteSchritte} von{' '}
            {ersteSchritte.length} erledigt. Sie können jeden Schritt später ändern.
          </p>
          <ol style={{ paddingLeft: 22 }}>
            {ersteSchritte.map(s => (
              <li key={s.href} style={{ marginBottom: 12 }}>
                <strong>{s.erledigt ? '✓ ' : ''}{s.titel}</strong><br />
                {s.text}{' '}
                {!s.erledigt && <Link href={s.href}>{s.aktion}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

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
