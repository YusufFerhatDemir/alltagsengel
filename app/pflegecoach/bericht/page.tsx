'use client'

// PflegeCoach — Verlaufsberichte: erstellen, ansehen, drucken (PDF via Druck).

import { useEffect, useState } from 'react'
import type { CoachReport } from '@/lib/coach/types'
import { ASSESSMENT_BEREICH_LABELS, type AssessmentBereich } from '@/lib/coach/assessment'
import { coachApi, useCoachProfil } from '../_lib/client'

interface BerichtInhalt {
  zeitraum?: { von: string; bis: string }
  assessments?: Array<Record<string, unknown>>
  ziele?: Array<{ titel: string; bereich: string; status: string; startwert: number | null; zielwert: number | null; aktueller_wert: number | null }>
  erledigungen?: { gesamt: number; erledigt: number; teilweise: number; ausgelassen: number }
  messungen?: Array<{ instrument: string; summenwert: number | null; erhoben_am: string }>
}

export default function BerichtSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [berichte, setBerichte] = useState<CoachReport[]>([])
  const [offen, setOffen] = useState<CoachReport | null>(null)
  const [sende, setSende] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const lade = () =>
    coachApi<{ berichte: CoachReport[] }>('/api/coach/berichte')
      .then(r => setBerichte(r.berichte))
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const erstellen = async () => {
    setSende(true)
    setMeldung(null)
    try {
      const { bericht } = await coachApi<{ bericht: CoachReport }>('/api/coach/berichte', { method: 'POST', body: JSON.stringify({}) })
      setMeldung({ art: 'ok', text: 'Bericht erstellt.' })
      setOffen(bericht)
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  const inhalt = (offen?.inhalt ?? null) as BerichtInhalt | null

  return (
    <>
      <div className="pc-no-print">
        <h1 className="pc-h1">Verlaufsbericht</h1>
        <p className="pc-lead">
          Der Bericht fasst Assessments, Ziele, Erledigungen und Messungen eines Zeitraums
          nachvollziehbar zusammen. Er wird unveränderlich gespeichert und lässt sich drucken
          oder als PDF sichern (über die Druckfunktion Ihres Geräts).
        </p>

        {meldung && (
          <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
            {meldung.text}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="pc-btn" onClick={erstellen} disabled={sende}>
            {sende ? 'Wird erstellt …' : 'Neuen Bericht erstellen (letzte 12 Wochen)'}
          </button>
          {offen && (
            <button type="button" className="pc-btn pc-btn--secondary" onClick={() => window.print()}>
              Bericht drucken / als PDF sichern
            </button>
          )}
        </div>

        <section className="pc-card" aria-labelledby="bericht-liste-titel">
          <h2 id="bericht-liste-titel">Ihre Berichte</h2>
          {berichte.length === 0 && <p>Noch keine Berichte erstellt.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {berichte.map(b => (
              <li key={b.id} style={{ marginBottom: 8 }}>
                <button
                  type="button" className="pc-btn pc-btn--secondary pc-btn--small"
                  onClick={() => setOffen(b)}
                  aria-pressed={offen?.id === b.id}
                >
                  Bericht vom {new Date(b.erstellt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                  {b.zeitraum_von && b.zeitraum_bis
                    ? ` (${new Date(b.zeitraum_von + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} – ${new Date(b.zeitraum_bis + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })})`
                    : ''}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {offen && inhalt && (
        <section className="pc-card" aria-labelledby="bericht-detail-titel">
          <h2 id="bericht-detail-titel">
            Verlaufsbericht — Digitaler PflegeCoach
          </h2>
          <p>
            Zeitraum: {inhalt.zeitraum ? `${new Date(inhalt.zeitraum.von + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} bis ${new Date(inhalt.zeitraum.bis + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : '—'}
            <br />
            Erstellt am: {new Date(offen.erstellt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
          </p>

          <h3>Selbsteinschätzungen (0 = selbständig … 4 = umfassende Unterstützung)</h3>
          {!inhalt.assessments?.length && <p>Keine Erhebungen im Zeitraum.</p>}
          {!!inhalt.assessments?.length && (
            <div className="pc-table-wrap">
              <table className="pc-table">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    {(Object.keys(ASSESSMENT_BEREICH_LABELS) as AssessmentBereich[]).map(b => (
                      <th key={b} scope="col">{ASSESSMENT_BEREICH_LABELS[b]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inhalt.assessments.map((a, i) => (
                    <tr key={i}>
                      <td>{String(a.erhoben_am ?? '—')}</td>
                      {(Object.keys(ASSESSMENT_BEREICH_LABELS) as AssessmentBereich[]).map(b => (
                        <td key={b}>{a[b] == null ? '—' : String(a[b])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Ziele</h3>
          {!inhalt.ziele?.length && <p>Keine Ziele vorhanden.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {inhalt.ziele?.map((z, i) => (
              <li key={i}>
                {z.titel} — Status: {z.status}
                {z.zielwert != null ? `, Stand: ${z.aktueller_wert ?? '—'} von ${z.zielwert}` : ''}
              </li>
            ))}
          </ul>

          <h3>Erledigte Aktivitäten</h3>
          {inhalt.erledigungen ? (
            <p>
              {inhalt.erledigungen.erledigt} erledigt, {inhalt.erledigungen.teilweise} teilweise,{' '}
              {inhalt.erledigungen.ausgelassen} ausgelassen (gesamt {inhalt.erledigungen.gesamt} Einträge).
            </p>
          ) : <p>Keine Einträge.</p>}

          <h3>Messungen</h3>
          {!inhalt.messungen?.length && <p>Keine Messungen im Zeitraum.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {inhalt.messungen?.map((m, i) => (
              <li key={i}>
                {new Date(m.erhoben_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} — {m.instrument}: {m.summenwert ?? '—'}
              </li>
            ))}
          </ul>

          <p style={{ marginTop: 16 }}>
            Dieser Bericht beruht auf Selbstauskünften und dient der eigenen Übersicht sowie
            der Vorbereitung von Gesprächen (z. B. mit Pflegeberatung). Er enthält keine
            medizinische Bewertung.
          </p>
        </section>
      )}
    </>
  )
}
