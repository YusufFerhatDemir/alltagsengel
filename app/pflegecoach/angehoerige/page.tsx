'use client'

// PflegeCoach — Unterstützung pflegender Angehöriger:
// Wissensmodule (Entlastung, Selbstsorge, Pflegetechniken) + Belastungs-Check.

import Link from 'next/link'
import { INHALT_ENTWURF_HINWEIS, WISSEN_MODULE } from '@/lib/coach/inhalte'
import { useCoachProfil } from '../_lib/client'

export default function AngehoerigeSeite() {
  const { profil, laden, fehler } = useCoachProfil()

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const module = WISSEN_MODULE.filter(m => m.zielgruppe === 'angehoerig' || m.zielgruppe === 'alle')

  return (
    <>
      <h1 className="pc-h1">Für pflegende Angehörige</h1>
      <p className="pc-lead">
        Wer pflegt, braucht selbst Unterstützung. Hier finden Sie Wissen zu Entlastungsangeboten,
        Selbstsorge und praktischen Techniken — und den regelmäßigen{' '}
        <Link href="/pflegecoach/belastung">Belastungs-Check</Link>.
      </p>

      <section className="pc-card">
        <h2>Belastungs-Check</h2>
        <p>
          Eine kurze Selbsteinschätzung (7 Fragen, ca. 2 Minuten) macht sichtbar, wie sich Ihre
          Belastung über die Zeit entwickelt.
        </p>
        <Link className="pc-btn" href="/pflegecoach/belastung">Zum Belastungs-Check</Link>
      </section>

      {module.map(m => (
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
