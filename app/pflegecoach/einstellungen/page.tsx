'use client'

// PflegeCoach — Einstellungen: Profil, Einwilligungen, Datenexport.

import { useEffect, useState } from 'react'
import type { CoachConsent, ConsentTyp } from '@/lib/coach/types'
import { ROLLE_LABELS } from '@/lib/coach/types'
import { coachApi, useCoachProfil } from '../_lib/client'

const CONSENT_LABELS: Record<ConsentTyp, string> = {
  gesundheitsdaten_art9: 'Verarbeitung meiner Pflege- und Gesundheitsdaten (erforderlich für die Nutzung)',
  wissenschaftliche_auswertung: 'Pseudonymisierte wissenschaftliche Auswertung (freiwillig)',
  datenfreigabe: 'Datenfreigabe an Angehörige/Pflegedienst (freiwillig)',
}

export default function EinstellungenSeite() {
  const { profil, laden, fehler } = useCoachProfil()
  const [consents, setConsents] = useState<CoachConsent[]>([])
  const [meldung, setMeldung] = useState<{ art: 'ok' | 'error'; text: string } | null>(null)

  const lade = () =>
    coachApi<{ consents: CoachConsent[] }>('/api/coach/consents')
      .then(r => setConsents(r.consents))
      .catch(e => setMeldung({ art: 'error', text: e.message }))

  useEffect(() => { if (profil) lade() }, [profil])

  if (laden) return <p role="status">Wird geladen …</p>
  if (fehler) return <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>
  if (!profil) return null

  /** Aktueller Stand je Typ: jüngster nicht widerrufener, erteilter Eintrag. */
  const aktiv = (typ: ConsentTyp) =>
    consents.some(c => c.consent_typ === typ && c.erteilt && !c.widerrufen_am)

  const setzeConsent = async (typ: ConsentTyp, erteilt: boolean) => {
    setMeldung(null)
    if (typ === 'gesundheitsdaten_art9' && !erteilt) {
      const ok = window.confirm(
        'Ohne diese Einwilligung kann der PflegeCoach nicht weiter genutzt werden. ' +
        'Ihre bisherigen Daten bleiben gespeichert, bis Sie die Löschung veranlassen. Wirklich widerrufen?'
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
          Wenn Sie Ihr Nutzerkonto löschen, werden auch alle Ihre PflegeCoach-Daten gelöscht
          (Art. 17 DSGVO). Die Konto-Löschung finden Sie in den allgemeinen Konto-Einstellungen;
          bei Fragen hilft Ihnen der Support (Kontakt in den <a href="/pflegecoach/datenschutz">Datenschutzhinweisen</a>).
        </p>
      </section>
    </>
  )
}
