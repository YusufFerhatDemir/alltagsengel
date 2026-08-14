'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Datenfreigaben an Angehörige/Pflegedienst
//
// Datenmodell existiert bereits (coach_shares, Migration 20260819010000):
// Eigentümer verwaltet, Empfänger sieht nur die eigene Freigabe, jede
// Freigabe jederzeit widerruflich, Schreibzugriff auf die freigegebenen
// Datentabellen ist der Empfängerseite ohnehin verwehrt (nur SELECT).
// Diese Seite ist die bisher fehlende Oberfläche dafür.
//
// Voraussetzung für eine NEUE Freigabe ist die allgemeine Einwilligung
// „Datenfreigabe an Angehörige/Pflegedienst" (coach_consents, Typ
// 'datenfreigabe') — dieselbe, die bisher nur als Schalter in
// /pflegecoach/einstellungen stand, ohne dass sie etwas Konkretes bewirkt
// hätte. Diese Seite ist die Wirkung: erst die grundsätzliche Einwilligung,
// dann die einzelne, namentliche Freigabe.
//
// BESTÄTIGUNG VOR SENSIBLER FREIGABE: Ein `window.confirm()` mit einer
// mehrzeiligen Aufzählung Ihrer Gesundheitsdaten ist auf vielen Systemen
// kaum lesbar. Statt eines Browser-Dialogs gibt es deshalb einen echten
// zweiten Schritt auf der Seite selbst: erst Eingabe, dann eine Karte mit
// allem, was konkret freigegeben würde, und einer eigenen Bestätigung.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachConsent } from '@/lib/coach/types'
import { hatAktiveEinwilligung } from '@/lib/coach/consent'
import {
  EMPFAENGER_ROLLEN, EMPFAENGER_ROLLE_LABELS,
  istAktiveFreigabe,
  type CoachFreigabeZeile, type EmpfaengerRolle,
} from '@/lib/coach/freigabe'
import { coachApi, useCoachProfil } from '../../_lib/client'
import { CoachLaden, CoachLadefehler } from '../../_lib/Zustand'

const FREIGEGEBENE_BEREICHE = [
  'Ihr Assessment (Selbsteinschätzung je Lebensbereich)',
  'Ihre Ziele und deren Fortschritt',
  'Ihr Wochenplan und die Erledigungen darin',
  'Ihre Verlaufsmessungen (z. B. Belastung, Sturzangst)',
  'Ihre erstellten Berichte und Datenexporte',
]

function datum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

export default function FreigabenSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()
  const [consents, setConsents] = useState<CoachConsent[]>([])
  const [consentsGeladen, setConsentsGeladen] = useState(false)
  const [freigaben, setFreigaben] = useState<CoachFreigabeZeile[]>([])
  const [freigabenGeladen, setFreigabenGeladen] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)
  const [arbeitet, setArbeitet] = useState(false)

  const [email, setEmail] = useState('')
  const [rolle, setRolle] = useState<EmpfaengerRolle>('angehoerig')
  const [schrittBestaetigen, setSchrittBestaetigen] = useState(false)

  const ladeConsents = useCallback(
    () =>
      coachApi<{ consents: CoachConsent[] }>('/api/coach/consents')
        .then(r => { setConsents(r.consents); setConsentsGeladen(true) })
        .catch(e => setMeldung({ art: 'error', text: (e as Error).message })),
    []
  )

  const ladeFreigaben = useCallback(
    () =>
      coachApi<{ freigaben: CoachFreigabeZeile[] }>('/api/coach/freigaben')
        .then(r => { setFreigaben(r.freigaben); setFreigabenGeladen(true) })
        .catch(e => setMeldung({ art: 'error', text: (e as Error).message })),
    []
  )

  useEffect(() => {
    if (!profil) return
    ladeConsents()
    ladeFreigaben()
  }, [profil, ladeConsents, ladeFreigaben])

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  const einwilligungAktiv = hatAktiveEinwilligung(consents, 'datenfreigabe')
  const aktive = freigaben.filter(istAktiveFreigabe)
  const historie = freigaben.filter(f => !istAktiveFreigabe(f))

  const einwilligungErteilen = async () => {
    setMeldung(null)
    setArbeitet(true)
    try {
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: 'datenfreigabe', erteilt: true }),
      })
      await ladeConsents()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setArbeitet(false)
    }
  }

  const zurBestaetigung = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setMeldung(null)
    setSchrittBestaetigen(true)
  }

  const jetztFreigeben = async () => {
    setMeldung(null)
    setArbeitet(true)
    try {
      await coachApi('/api/coach/freigaben', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), empfaenger_rolle: rolle }),
      })
      setMeldung({ art: 'ok', text: `Die Freigabe für ${email.trim()} wurde erteilt.` })
      setEmail('')
      setRolle('angehoerig')
      setSchrittBestaetigen(false)
      await ladeFreigaben()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setArbeitet(false)
    }
  }

  const widerrufen = async (zeile: CoachFreigabeZeile) => {
    const ok = window.confirm(
      `Die Freigabe für ${zeile.empfaenger_email} wird sofort beendet. Diese Person kann Ihre ` +
      'PflegeCoach-Daten danach nicht mehr einsehen. Sie können ihr später erneut freigeben. ' +
      'Jetzt widerrufen?'
    )
    if (!ok) return
    setMeldung(null)
    setArbeitet(true)
    try {
      await coachApi(`/api/coach/freigaben/${zeile.id}`, { method: 'PATCH' })
      setMeldung({ art: 'ok', text: `Die Freigabe für ${zeile.empfaenger_email} wurde widerrufen.` })
      await ladeFreigaben()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    } finally {
      setArbeitet(false)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Datenfreigaben</h1>
      <p className="pc-lead">
        Hier geben Sie Angehörigen oder einem Pflegedienst Einblick in Ihre PflegeCoach-Daten —
        und widerrufen es genauso einfach wieder. Die eingeladene Person kann Ihre Daten nur
        lesen, nie verändern oder löschen.
      </p>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      <section className="pc-card" aria-labelledby="umfang-titel">
        <h2 id="umfang-titel">Was wird bei einer Freigabe sichtbar?</h2>
        <p>
          Jede Freigabe gilt für <strong>alle</strong> Ihre PflegeCoach-Daten — eine Auswahl
          einzelner Bereiche ist nicht möglich:
        </p>
        <ul style={{ paddingLeft: '1.4em', lineHeight: 1.7 }}>
          {FREIGEGEBENE_BEREICHE.map(b => <li key={b}>{b}</li>)}
        </ul>
        <p className="pc-lead">
          Nicht enthalten: Ihre Einwilligungen, Ihre Vertrags- und Zahlungsdaten und Ihre
          Anmeldedaten. Diese sieht ausschließlich Sie selbst.
        </p>
      </section>

      {consentsGeladen && !einwilligungAktiv && (
        <section className="pc-card" aria-labelledby="einwilligung-titel">
          <h2 id="einwilligung-titel">Grundsätzliche Einwilligung erforderlich</h2>
          <p>
            Bevor Sie einer bestimmten Person freigeben können, benötigen wir Ihre grundsätzliche
            Einwilligung in die <strong>Datenfreigabe an Angehörige/Pflegedienst</strong>. Sie
            bleibt jederzeit widerruflich.
          </p>
          <button type="button" className="pc-btn" onClick={einwilligungErteilen} disabled={arbeitet}>
            Einwilligung jetzt erteilen
          </button>
        </section>
      )}

      {consentsGeladen && einwilligungAktiv && !schrittBestaetigen && (
        <section className="pc-card" aria-labelledby="einladen-titel">
          <h2 id="einladen-titel">Person einladen</h2>
          <p className="pc-lead">
            Die Person braucht bereits ein eigenes PflegeCoach-Konto mit genau dieser
            E-Mail-Adresse. Hat sie noch keines, bitten Sie sie, sich zuerst unter{' '}
            <Link href="/pflegecoach/start">pflegecoach</Link> zu registrieren.
          </p>
          <form onSubmit={zurBestaetigung}>
            <label htmlFor="freigabe-email">E-Mail-Adresse der Person</label>
            <input
              id="freigabe-email"
              name="email"
              type="email"
              autoComplete="off"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="person@beispiel.de"
            />
            <fieldset className="pc-fieldset">
              <legend>Rolle dieser Person</legend>
              {EMPFAENGER_ROLLEN.map(r => (
                <label key={r} className="pc-scale-option">
                  <input
                    type="radio"
                    name="rolle"
                    value={r}
                    checked={rolle === r}
                    onChange={() => setRolle(r)}
                  />
                  {EMPFAENGER_ROLLE_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <button type="submit" className="pc-btn">Weiter zur Bestätigung</button>
          </form>
        </section>
      )}

      {schrittBestaetigen && (
        <section className="pc-card" aria-labelledby="bestaetigen-titel">
          <h2 id="bestaetigen-titel">Freigabe bestätigen</h2>
          <p>
            Sie geben <strong>{email.trim()}</strong> ({EMPFAENGER_ROLLE_LABELS[rolle]}) Einblick
            in Ihre Gesundheits- und Pflegedaten:
          </p>
          <ul style={{ paddingLeft: '1.4em', lineHeight: 1.7 }}>
            {FREIGEGEBENE_BEREICHE.map(b => <li key={b}>{b}</li>)}
          </ul>
          <p className="pc-lead">
            Die Freigabe gilt ab sofort und bis Sie sie widerrufen. Die Person wird nicht
            automatisch benachrichtigt — teilen Sie ihr die Freigabe selbst mit.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button type="button" className="pc-btn" onClick={jetztFreigeben} disabled={arbeitet}>
              {arbeitet ? 'Wird erteilt …' : 'Jetzt freigeben'}
            </button>
            <button
              type="button"
              className="pc-btn pc-btn--secondary"
              onClick={() => setSchrittBestaetigen(false)}
              disabled={arbeitet}
            >
              Abbrechen
            </button>
          </div>
        </section>
      )}

      <section className="pc-card" aria-labelledby="aktive-titel">
        <h2 id="aktive-titel">Aktive Freigaben</h2>
        {!freigabenGeladen && <p className="pc-lead">Wird geladen …</p>}
        {freigabenGeladen && aktive.length === 0 && (
          <p className="pc-lead">Sie haben derzeit niemandem Ihre Daten freigegeben.</p>
        )}
        {aktive.length > 0 && (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <caption className="sr-only">Personen mit aktivem Zugriff auf Ihre PflegeCoach-Daten</caption>
              <thead>
                <tr>
                  <th scope="col">E-Mail</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">Freigegeben am</th>
                  <th scope="col"><span className="sr-only">Aktion</span></th>
                </tr>
              </thead>
              <tbody>
                {aktive.map(f => (
                  <tr key={f.id}>
                    <td>{f.empfaenger_email}</td>
                    <td>{EMPFAENGER_ROLLE_LABELS[f.empfaenger_rolle]}</td>
                    <td>{datum(f.erstellt_am)}</td>
                    <td>
                      <button
                        type="button"
                        className="pc-btn pc-btn--secondary pc-btn--small"
                        onClick={() => widerrufen(f)}
                        disabled={arbeitet}
                      >
                        Widerrufen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="pc-card" aria-labelledby="historie-titel">
        <h2 id="historie-titel">Abgelaufene und widerrufene Freigaben</h2>
        {freigabenGeladen && historie.length === 0 && (
          <p className="pc-lead">Es liegen keine widerrufenen Freigaben vor.</p>
        )}
        {historie.length > 0 && (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <caption className="sr-only">Frühere Freigaben, die inzwischen widerrufen sind</caption>
              <thead>
                <tr>
                  <th scope="col">E-Mail</th>
                  <th scope="col">Rolle</th>
                  <th scope="col">Freigegeben am</th>
                  <th scope="col">Widerrufen am</th>
                </tr>
              </thead>
              <tbody>
                {historie.map(f => (
                  <tr key={f.id}>
                    <td>{f.empfaenger_email}</td>
                    <td>{EMPFAENGER_ROLLE_LABELS[f.empfaenger_rolle]}</td>
                    <td>{datum(f.erstellt_am)}</td>
                    <td>{f.widerrufen_am ? datum(f.widerrufen_am) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="pc-lead">
          Nach dem Widerruf hat die betroffene Person sofort keinen Zugriff mehr — das setzen wir
          serverseitig durch, unabhängig von dieser Ansicht.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="zurueck-titel">
        <h2 id="zurueck-titel">Weitere Einstellungen</h2>
        <p>
          <Link href="/pflegecoach/einstellungen">Zurück zu den Einstellungen</Link>
        </p>
      </section>
    </>
  )
}
