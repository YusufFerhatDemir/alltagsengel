'use client'

// PflegeCoach — Unterstützung pflegender Angehöriger:
// Wissensmodule (Entlastung, Selbstsorge, Pflegetechniken) + Belastungs-Check.

import Link from 'next/link'
import { INHALT_ENTWURF_HINWEIS, WISSEN_MODULE } from '@/lib/coach/inhalte'
// Der Prüfstatus kommt aus dem Freigaberegister, nicht aus dem Literal in
// inhalte.ts: freigegeben ist ein Inhalt nur mit vollständigem Vermerk, der
// zur aktuellen Textfassung passt (AK-QI-01).
import { pruefstatusWissen } from '@/lib/coach/inhalte-freigabe'
import { useCoachProfil } from '../_lib/client'
import { CoachLaden, CoachLadefehler } from '../_lib/Zustand'

export default function AngehoerigeSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  const wissensmodule = WISSEN_MODULE.filter(m => m.zielgruppe === 'angehoerig' || m.zielgruppe === 'alle')

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

      {wissensmodule.map(m => (
        <article key={m.id} className="pc-card" aria-label={m.titel}>
          <h2>
            {m.titel}{' '}
            {pruefstatusWissen(m) === 'entwurf' && <span className="pc-badge pc-badge--entwurf">In fachlicher Prüfung</span>}
          </h2>
          {m.abschnitte.map((a, i) => (
            <div key={i}>
              <h3>{a.ueberschrift}</h3>
              <p>{a.text}</p>
            </div>
          ))}
          {pruefstatusWissen(m) === 'entwurf' && <p className="pc-lead" style={{ fontSize: '0.9em' }}>{INHALT_ENTWURF_HINWEIS}</p>}
        </article>
      ))}
    </>
  )
}
