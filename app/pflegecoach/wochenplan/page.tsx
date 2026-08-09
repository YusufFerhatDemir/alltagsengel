'use client'

// PflegeCoach — Tages-/Wochenstruktur: wiederkehrende Aktivitäten planen.

import { useEffect, useState } from 'react'
import type { AktivitaetKategorie, CoachActivity, CoachActivityLog } from '@/lib/coach/types'
import { coachApi, heuteIso, isoWochentag, useCoachProfil, WOCHENTAG_LABELS } from '../_lib/client'

const KATEGORIE_LABELS: Record<AktivitaetKategorie, string> = {
  mobilitaet: 'Bewegung & Mobilität',
  selbstversorgung: 'Selbstversorgung',
  alltagsgestaltung: 'Alltagsgestaltung',
  soziale_teilhabe: 'Soziale Teilhabe',
  entlastung: 'Entlastung / Selbstsorge',
  erinnerung: 'Erinnerung (z. B. Trinken)',
}

export default function WochenplanSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [aktivitaeten, setAktivitaeten] = useState<CoachActivity[]>([])
  const [log, setLog] = useState<CoachActivityLog[]>([])
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const [titel, setTitel] = useState('')
  const [kategorie, setKategorie] = useState<AktivitaetKategorie>('mobilitaet')
  const [tage, setTage] = useState<number[]>([])
  const [uhrzeit, setUhrzeit] = useState('')
  const [dauer, setDauer] = useState('')
  const [sende, setSende] = useState(false)

  const lade = () =>
    Promise.all([
      coachApi<{ aktivitaeten: CoachActivity[] }>('/api/coach/aktivitaeten'),
      coachApi<{ log: CoachActivityLog[] }>('/api/coach/aktivitaeten/log?von=' + heuteIso()),
    ])
      .then(([a, l]) => { setAktivitaeten(a.aktivitaeten); setLog(l.log) })
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  const anlegen = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setMeldung(null)
    if (!tage.length) { setMeldung({ art: 'error', text: 'Bitte mindestens einen Wochentag wählen.' }); return }
    setSende(true)
    try {
      await coachApi('/api/coach/aktivitaeten', {
        method: 'POST',
        body: JSON.stringify({
          titel, kategorie, wochentage: tage,
          uhrzeit: uhrzeit || null,
          dauer_minuten: dauer === '' ? null : Number(dauer),
        }),
      })
      setTitel(''); setTage([]); setUhrzeit(''); setDauer('')
      setMeldung({ art: 'ok', text: 'Aktivität eingeplant.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setSende(false)
    }
  }

  const toggleAktiv = async (a: CoachActivity) => {
    try {
      await coachApi(`/api/coach/aktivitaeten/${a.id}`, { method: 'PATCH', body: JSON.stringify({ aktiv: !a.aktiv }) })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  const abhaken = async (a: CoachActivity) => {
    try {
      await coachApi('/api/coach/aktivitaeten/log', { method: 'POST', body: JSON.stringify({ activity_id: a.id, status: 'erledigt' }) })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  const heuteTag = isoWochentag(new Date())
  const erledigtHeute = new Set(log.filter(l => l.datum === heuteIso() && l.status !== 'ausgelassen').map(l => l.activity_id))

  return (
    <>
      <h1 className="pc-h1">Wochenplan</h1>
      <p className="pc-lead">Feste, kleine Routinen geben dem Tag Struktur — planen Sie Aktivitäten für feste Wochentage ein.</p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <section className="pc-card" aria-labelledby="neue-aktivitaet-titel">
        <h2 id="neue-aktivitaet-titel">Neue Aktivität einplanen</h2>
        <form onSubmit={anlegen}>
          <label htmlFor="akt-titel">Aktivität</label>
          <input id="akt-titel" type="text" required value={titel} onChange={e => setTitel(e.target.value)} maxLength={200} placeholder="z. B. 10 Minuten Gehen im Flur" />

          <label htmlFor="akt-kategorie">Kategorie</label>
          <select id="akt-kategorie" value={kategorie} onChange={e => setKategorie(e.target.value as AktivitaetKategorie)}>
            {(Object.keys(KATEGORIE_LABELS) as AktivitaetKategorie[]).map(k => (
              <option key={k} value={k}>{KATEGORIE_LABELS[k]}</option>
            ))}
          </select>

          <fieldset className="pc-fieldset">
            <legend>An welchen Tagen?</legend>
            {WOCHENTAG_LABELS.map((label, i) => {
              const tag = i + 1
              return (
                <label key={tag} className="pc-check-row">
                  <input
                    type="checkbox"
                    checked={tage.includes(tag)}
                    onChange={e => setTage(t => e.target.checked ? [...t, tag].sort() : t.filter(x => x !== tag))}
                  />
                  <span>{label}</span>
                </label>
              )
            })}
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor="akt-uhrzeit">Uhrzeit (optional)</label>
              <input id="akt-uhrzeit" type="time" value={uhrzeit} onChange={e => setUhrzeit(e.target.value)} />
            </div>
            <div>
              <label htmlFor="akt-dauer">Dauer in Minuten (optional)</label>
              <input id="akt-dauer" type="number" min={1} max={480} value={dauer} onChange={e => setDauer(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="pc-btn" disabled={sende}>{sende ? 'Wird eingeplant …' : 'Einplanen'}</button>
        </form>
      </section>

      <section className="pc-card" aria-labelledby="heute-plan-titel">
        <h2 id="heute-plan-titel">Heute ({WOCHENTAG_LABELS[heuteTag - 1]})</h2>
        {aktivitaeten.filter(a => a.aktiv && a.wochentage.includes(heuteTag)).length === 0 && <p>Heute ist nichts geplant.</p>}
        {aktivitaeten.filter(a => a.aktiv && a.wochentage.includes(heuteTag)).map(a => (
          <label key={a.id} className="pc-check-row">
            <input type="checkbox" checked={erledigtHeute.has(a.id)} disabled={erledigtHeute.has(a.id)} onChange={() => abhaken(a)} />
            <span>{a.titel}{a.uhrzeit ? ` — ${a.uhrzeit.slice(0, 5)} Uhr` : ''}</span>
          </label>
        ))}
      </section>

      <section aria-labelledby="wochenuebersicht-titel">
        <h2 id="wochenuebersicht-titel" className="pc-h1" style={{ fontSize: '1.3em' }}>Alle Aktivitäten</h2>
        {aktivitaeten.length === 0 && <p>Noch keine Aktivitäten eingeplant.</p>}
        {aktivitaeten.map(a => (
          <article key={a.id} className="pc-card" aria-label={`Aktivität: ${a.titel}`}>
            <h3>
              {a.titel}{' '}
              {!a.aktiv && <span className="pc-badge">Pausiert</span>}
            </h3>
            <p className="pc-lead">
              {KATEGORIE_LABELS[a.kategorie]} · {a.wochentage.map(t => WOCHENTAG_LABELS[t - 1].slice(0, 2)).join(', ') || 'keine Tage'}
              {a.uhrzeit ? ` · ${a.uhrzeit.slice(0, 5)} Uhr` : ''}
              {a.dauer_minuten ? ` · ${a.dauer_minuten} Min.` : ''}
            </p>
            <button type="button" className="pc-btn pc-btn--secondary pc-btn--small" onClick={() => toggleAktiv(a)}>
              {a.aktiv ? 'Pausieren' : 'Wieder aktivieren'}
            </button>
          </article>
        ))}
      </section>
    </>
  )
}
