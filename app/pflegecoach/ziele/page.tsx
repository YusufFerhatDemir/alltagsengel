'use client'

// PflegeCoach — individuelle Pflegeziele (SMART: messbar + terminiert).

import { useEffect, useState } from 'react'
import type { CoachGoal, ZielBereich, ZielStatus } from '@/lib/coach/types'
import { BEREICH_LABELS } from '@/lib/coach/types'
import { coachApi, useCoachProfil } from '../_lib/client'

const STATUS_LABELS: Record<ZielStatus, string> = {
  aktiv: 'Aktiv', erreicht: 'Erreicht', angepasst: 'Angepasst', pausiert: 'Pausiert', beendet: 'Beendet',
}

export default function ZieleSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [ziele, setZiele] = useState<CoachGoal[]>([])
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  // Formular „Neues Ziel"
  const [titel, setTitel] = useState('')
  const [bereich, setBereich] = useState<ZielBereich>('mobilitaet')
  const [messgroesse, setMessgroesse] = useState('')
  const [startwert, setStartwert] = useState('')
  const [zielwert, setZielwert] = useState('')
  const [zielBis, setZielBis] = useState('')
  const [sende, setSende] = useState(false)

  const lade = () =>
    coachApi<{ ziele: CoachGoal[] }>('/api/coach/ziele')
      .then(r => setZiele(r.ziele))
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const anlegen = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setMeldung(null)
    setSende(true)
    try {
      await coachApi('/api/coach/ziele', {
        method: 'POST',
        body: JSON.stringify({
          titel,
          bereich,
          messgroesse: messgroesse || null,
          startwert: startwert === '' ? null : Number(startwert),
          zielwert: zielwert === '' ? null : Number(zielwert),
          ziel_bis: zielBis || null,
        }),
      })
      setTitel(''); setMessgroesse(''); setStartwert(''); setZielwert(''); setZielBis('')
      setMeldung({ art: 'ok', text: 'Ziel angelegt.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  const aktualisiere = async (id: string, update: Record<string, unknown>) => {
    setMeldung(null)
    try {
      await coachApi(`/api/coach/ziele/${id}`, { method: 'PATCH', body: JSON.stringify(update) })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <h1 className="pc-h1">Meine Pflegeziele</h1>
      <p className="pc-lead">
        Gute Ziele sind konkret, messbar und haben einen Termin — zum Beispiel:
        „Bis Ende nächsten Monats dreimal pro Woche 10 Minuten im Flur gehen."
      </p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <section className="pc-card" aria-labelledby="neues-ziel-titel">
        <h2 id="neues-ziel-titel">Neues Ziel</h2>
        <form onSubmit={anlegen}>
          <label htmlFor="ziel-titel">Was möchten Sie erreichen?</label>
          <input id="ziel-titel" type="text" required value={titel} onChange={e => setTitel(e.target.value)} maxLength={200} />

          <label htmlFor="ziel-bereich">Lebensbereich</label>
          <select id="ziel-bereich" value={bereich} onChange={e => setBereich(e.target.value as ZielBereich)}>
            {(Object.keys(BEREICH_LABELS) as ZielBereich[]).map(b => (
              <option key={b} value={b}>{BEREICH_LABELS[b]}</option>
            ))}
          </select>

          <label htmlFor="ziel-messgroesse">Woran messen Sie den Fortschritt? (optional)</label>
          <input id="ziel-messgroesse" type="text" value={messgroesse} onChange={e => setMessgroesse(e.target.value)} maxLength={200} placeholder="z. B. Spaziergänge pro Woche" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor="ziel-start">Startwert (optional)</label>
              <input id="ziel-start" type="number" value={startwert} onChange={e => setStartwert(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ziel-soll">Zielwert (optional)</label>
              <input id="ziel-soll" type="number" value={zielwert} onChange={e => setZielwert(e.target.value)} />
            </div>
          </div>

          <label htmlFor="ziel-bis">Bis wann? (optional)</label>
          <input id="ziel-bis" type="date" value={zielBis} onChange={e => setZielBis(e.target.value)} />

          <button type="submit" className="pc-btn" disabled={sende}>{sende ? 'Wird angelegt …' : 'Ziel anlegen'}</button>
        </form>
      </section>

      <section aria-labelledby="ziel-liste-titel">
        <h2 id="ziel-liste-titel" className="pc-h1" style={{ fontSize: '1.3em' }}>Ihre Ziele</h2>
        {ziele.length === 0 && <p>Noch keine Ziele angelegt.</p>}
        {ziele.map(z => (
          <article key={z.id} className="pc-card" aria-label={`Ziel: ${z.titel}`}>
            <h3>{z.titel} <span className="pc-badge">{STATUS_LABELS[z.status]}</span></h3>
            <p className="pc-lead">
              {BEREICH_LABELS[z.bereich]}
              {z.ziel_bis ? ` · bis ${new Date(z.ziel_bis + 'T00:00:00').toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : ''}
            </p>
            {z.messgroesse && (
              <p>
                {z.messgroesse}: {z.aktueller_wert ?? '—'}
                {z.zielwert != null ? ` von ${z.zielwert}` : ''}
                {z.startwert != null ? ` (Start: ${z.startwert})` : ''}
              </p>
            )}
            {z.anpassungs_notiz && <p><strong>Anpassung:</strong> {z.anpassungs_notiz}</p>}
            {z.status === 'aktiv' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} className="pc-no-print">
                {z.messgroesse && (
                  <button
                    type="button" className="pc-btn pc-btn--secondary pc-btn--small"
                    onClick={() => {
                      const wert = window.prompt(`Aktueller Wert für „${z.messgroesse}":`, String(z.aktueller_wert ?? ''))
                      if (wert !== null && wert !== '' && Number.isFinite(Number(wert))) {
                        aktualisiere(z.id, { aktueller_wert: Number(wert) })
                      }
                    }}
                  >
                    Fortschritt eintragen
                  </button>
                )}
                <button type="button" className="pc-btn pc-btn--secondary pc-btn--small" onClick={() => aktualisiere(z.id, { status: 'erreicht' })}>
                  Als erreicht markieren
                </button>
                <button
                  type="button" className="pc-btn pc-btn--secondary pc-btn--small"
                  onClick={() => {
                    const notiz = window.prompt('Was wird angepasst (kurze Notiz)?')
                    if (notiz) aktualisiere(z.id, { status: 'angepasst', anpassungs_notiz: notiz })
                  }}
                >
                  Anpassen
                </button>
                <button type="button" className="pc-btn pc-btn--secondary pc-btn--small" onClick={() => aktualisiere(z.id, { status: 'pausiert' })}>
                  Pausieren
                </button>
              </div>
            )}
            {z.status === 'pausiert' && (
              <button type="button" className="pc-btn pc-btn--secondary pc-btn--small" onClick={() => aktualisiere(z.id, { status: 'aktiv' })}>
                Wieder aufnehmen
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
