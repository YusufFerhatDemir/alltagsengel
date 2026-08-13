'use client'

// PflegeCoach — Selbstversorgung & Gestaltung des Alltags (Wissensmodule).

import Link from 'next/link'
import { INHALT_ENTWURF_HINWEIS, WISSEN_MODULE } from '@/lib/coach/inhalte'
import { useCoachProfil } from '../_lib/client'
import { CoachLaden, CoachLadefehler } from '../_lib/Zustand'

export default function AlltagSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  const wissensmodule = WISSEN_MODULE.filter(m => m.zielgruppe === 'pflegebeduerftig' || m.zielgruppe === 'alle')

  return (
    <>
      <h1 className="pc-h1">Alltag &amp; Selbstversorgung</h1>
      <p className="pc-lead">
        Kleine Anpassungen erhalten Selbständigkeit: Energie gut einteilen, Hilfen nutzen,
        Kontakte pflegen. Verankern Sie das, was Ihnen guttut, als feste Aktivität im{' '}
        <Link href="/pflegecoach/wochenplan">Wochenplan</Link>.
      </p>

      {wissensmodule.map(m => (
        <article key={m.id} className="pc-card" aria-label={m.titel}>
          <h2>
            {m.titel}{' '}
            {m.pruefstatus === 'entwurf' && <span className="pc-badge pc-badge--entwurf">In fachlicher Prüfung</span>}
          </h2>
          {m.abschnitte.map((a, i) => (
            <div key={i}>
              <h3>{a.ueberschrift}</h3>
              <p>{a.text}</p>
            </div>
          ))}
          {m.pruefstatus === 'entwurf' && <p className="pc-lead" style={{ fontSize: '0.9em' }}>{INHALT_ENTWURF_HINWEIS}</p>}
        </article>
      ))}
    </>
  )
}
