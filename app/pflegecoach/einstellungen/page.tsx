'use client'

// PflegeCoach — Einstellungen: Profil, Einwilligungen, Datenexport.

import { useEffect, useState } from 'react'
import type { CoachConsent, ConsentTyp } from '@/lib/coach/types'
import { ROLLE_LABELS } from '@/lib/coach/types'
import Link from 'next/link'
import { hatAktiveEinwilligung, PFLICHT_CONSENT } from '@/lib/coach/consent'
import { coachApi, useCoachProfil } from '../_lib/client'
import { CoachLaden, CoachLadefehler, EinwilligungWiderrufen } from '../_lib/Zustand'

const CONSENT_LABELS: Record<ConsentTyp, string> = {
  gesundheitsdaten_art9: 'Verarbeitung meiner Pflege- und Gesundheitsdaten (erforderlich für die Nutzung)',
  wissenschaftliche_auswertung: 'Pseudonymisierte wissenschaftliche Auswertung (freiwillig)',
  datenfreigabe: 'Datenfreigabe an Angehörige/Pflegedienst (freiwillig)',
}

export default function EinstellungenSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()
  const [consents, setConsents] = useState<CoachConsent[]>([])
  // Ohne dieses Flag zeigte die Seite zwischen Render und Antwort kurz den
  // Sperrhinweis an — die noch leere Liste sieht wie „nichts erteilt" aus.
  const [consentsGeladen, setConsentsGeladen] = useState(false)
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const lade = () =>
    coachApi<{ consents: CoachConsent[] }>('/api/coach/consents')
      .then(r => { setConsents(r.consents); setConsentsGeladen(true) })
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <CoachLaden />
  if (fehler) return <CoachLadefehler fehler={fehler} neuLaden={neuLaden} />
  if (!profil) return null

  /** Aktueller Stand je Typ — dieselbe Auswertung wie serverseitig. */
  const aktiv = (typ: ConsentTyp) => hatAktiveEinwilligung(consents, typ)

  const setzeConsent = async (typ: ConsentTyp, erteilt: boolean) => {
    setMeldung(null)
    if (typ === PFLICHT_CONSENT && !erteilt) {
      const ok = window.confirm(
        'Nach dem Widerruf können Sie keine neuen Einträge mehr anlegen — weder Assessments ' +
        'noch Ziele, Aktivitäten oder Messungen. Ihre bisherigen Daten bleiben lesbar und ' +
        'exportierbar, bis Sie die Löschung veranlassen. Sie können die Einwilligung jederzeit ' +
        'wieder erteilen. Wirklich widerrufen?'
      )
      if (!ok) return
    }
    try {
      await coachApi('/api/coach/consents', { method: 'POST', body: JSON.stringify({ consent_typ: typ, erteilt }) })
      setMeldung({ art: 'ok', text: erteilt ? 'Einwilligung erteilt.' : 'Einwilligung widerrufen.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <h1 className="pc-h1">Einstellungen</h1>

      {meldung && (
        <p className={`pc-feedback pc-feedback--${meldung.art}`} role={meldung.art === 'error' ? 'alert' : 'status'}>
          {meldung.text}
        </p>
      )}

      {consentsGeladen && !aktiv(PFLICHT_CONSENT) && <EinwilligungWiderrufen />}

      <section className="pc-card" aria-labelledby="profil-titel">
        <h2 id="profil-titel">Ihr Profil</h2>
        <p>
          Rolle: <strong>{ROLLE_LABELS[profil.rolle]}</strong>
          {profil.pflegegrad ? <> · Pflegegrad {profil.pflegegrad}</> : null}
        </p>
        <p className="pc-lead">
          Schriftgröße und Kontrast stellen Sie oben in der Kopfzeile ein — die Einstellung
          wird für alle Ihre Geräte gespeichert.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="consents-titel">
        <h2 id="consents-titel">Einwilligungen</h2>
        <p className="pc-lead">
          Jede Einwilligung ist einzeln und jederzeit widerruflich. Alle Erteilungen und
          Widerrufe werden mit Datum und Textversion protokolliert.
        </p>
        {(Object.keys(CONSENT_LABELS) as ConsentTyp[]).map(typ => (
          <div key={typ} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--pc-border)' }}>
            <div style={{ flex: 1 }}>
              <strong>{CONSENT_LABELS[typ]}</strong>
              <br />
              <span className="pc-lead">{aktiv(typ) ? 'Erteilt' : 'Nicht erteilt'}</span>
            </div>
            <button
              type="button"
              className="pc-btn pc-btn--secondary pc-btn--small"
              onClick={() => setzeConsent(typ, !aktiv(typ))}
            >
              {aktiv(typ) ? 'Widerrufen' : 'Erteilen'}
            </button>
          </div>
        ))}
      </section>

      <section className="pc-card" aria-labelledby="export-titel">
        <h2 id="export-titel">Meine Daten exportieren</h2>
        <p>
          Sie können jederzeit alle Ihre PflegeCoach-Daten herunterladen — als maschinenlesbare
          Datei (JSON). Einen menschenlesbaren, druckbaren Bericht erstellen Sie unter{' '}
          <a href="/pflegecoach/bericht">Bericht</a>.
        </p>
        <a className="pc-btn" href="/api/coach/export">Daten herunterladen (JSON)</a>
      </section>

      <section className="pc-card" aria-labelledby="loeschung-titel">
        <h2 id="loeschung-titel">Daten löschen</h2>
        <p>
          Sie können Ihre PflegeCoach-Daten selbst und vollständig löschen (Art. 17 DSGVO) —
          Ihr Alltagsengel-Konto bleibt dabei bestehen. Die Seite zeigt Ihnen vorher genau an,
          was gelöscht wird, und verlangt eine ausdrückliche Bestätigung.
        </p>
        <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/loeschung">
          PflegeCoach-Daten löschen
        </Link>
      </section>
    </>
  )
}
