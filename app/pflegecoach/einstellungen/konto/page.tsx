'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Konto und Nutzung beenden
//
// Warum diese Seite eigenständig ist: In den Einstellungen stehen die
// laufenden Stellschrauben (Profil, einzelne Einwilligungen, Export).
// Das Beenden der Nutzung ist etwas anderes — es ist ein Ausstieg, und
// wer aussteigen will, soll den Weg an EINER Stelle vollständig
// vorfinden: aufhören, mitnehmen, löschen, kündigen, nachfragen.
//
// DREI GETRENNTE DINGE, die hier bewusst auseinandergehalten werden:
//  1. Nutzung beenden  → Pflicht-Einwilligung widerrufen. Danach nimmt
//     der PflegeCoach nichts Neues mehr entgegen, die bisherigen Daten
//     bleiben lesbar und exportierbar (Art. 7 Abs. 3 DSGVO).
//  2. PflegeCoach-Daten löschen → /pflegecoach/loeschung. Löscht nur das
//     Produkt, das Alltagsengel-Konto bleibt.
//  3. Alltagsengel-Konto löschen → allgemeiner Kontoweg der Plattform.
//     Nimmt die PflegeCoach-Daten mit.
// Die Löschlogik liegt weiterhin nur an ihrer jeweiligen Stelle; hier
// stehen die Wege dorthin, nicht eine zweite Umsetzung davon.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { CoachConsent } from '@/lib/coach/types'
import { hatAktiveEinwilligung, PFLICHT_CONSENT } from '@/lib/coach/consent'
import { COACH_PRODUKT_NAME, COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { coachApi, useCoachProfil } from '../../_lib/client'
import { CoachLaden, CoachLadefehler } from '../../_lib/Zustand'

export default function KontoSeite() {
  const { profil, laden, fehler, neuLaden } = useCoachProfil()
  const [consents, setConsents] = useState<CoachConsent[]>([])
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

  const nutzungAktiv = hatAktiveEinwilligung(consents, PFLICHT_CONSENT)

  const beenden = async () => {
    const ok = window.confirm(
      'Nach dem Beenden nimmt der PflegeCoach keine neuen Einträge mehr entgegen — weder ' +
      'Assessments noch Ziele, Aktivitäten oder Messungen. Ihre bisherigen Daten bleiben ' +
      'lesbar und exportierbar, bis Sie die Löschung veranlassen. Sie können jederzeit wieder ' +
      'einsteigen. Nutzung jetzt beenden?'
    )
    if (!ok) return
    setMeldung(null)
    try {
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: PFLICHT_CONSENT, erteilt: false }),
      })
      setMeldung({ art: 'ok', text: 'Die Nutzung ist beendet. Ihre Daten bleiben vorerst erhalten.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  const wiederAufnehmen = async () => {
    setMeldung(null)
    try {
      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: PFLICHT_CONSENT, erteilt: true }),
      })
      setMeldung({ art: 'ok', text: 'Die Nutzung ist wieder freigeschaltet.' })
      await lade()
    } catch (e) {
      setMeldung({ art: 'error', text: (e as Error).message })
    }
  }

  return (
    <>
      <h1 className="pc-h1">Konto und Nutzung beenden</h1>
      <p className="pc-lead">
        Hier beenden Sie die Nutzung des {COACH_PRODUKT_NAME}s, nehmen Ihre Daten mit oder
        löschen sie. Sie entscheiden bei jedem Schritt einzeln.
      </p>

      {meldung && (
        <p
          className={`pc-feedback pc-feedback--${meldung.art}`}
          role={meldung.art === 'error' ? 'alert' : 'status'}
        >
          {meldung.text}
        </p>
      )}

      <section className="pc-card" aria-labelledby="beenden-titel">
        <h2 id="beenden-titel">1. Nutzung beenden</h2>
        <p>
          Sie beenden die Nutzung, indem Sie Ihre Einwilligung in die Verarbeitung Ihrer Pflege-
          und Gesundheitsdaten widerrufen. Danach nimmt der PflegeCoach keine neuen Einträge mehr
          entgegen. Ihre bisherigen Daten bleiben für Sie lesbar und exportierbar — gelöscht wird
          erst, wenn Sie es ausdrücklich veranlassen (Schritt 3).
        </p>
        <p>
          Es gibt keine Mindestlaufzeit und keine Kündigungsfrist im Produkt: Der Widerruf wirkt
          sofort und Sie können jederzeit wieder einsteigen.
        </p>
        {consentsGeladen && (
          nutzungAktiv ? (
            <button type="button" className="pc-btn pc-btn--secondary" onClick={beenden}>
              Nutzung jetzt beenden
            </button>
          ) : (
            <>
              <p className="pc-feedback pc-feedback--info">
                Die Nutzung ist derzeit beendet. Es werden keine neuen Einträge gespeichert.
              </p>
              <button type="button" className="pc-btn" onClick={wiederAufnehmen}>
                Nutzung wieder aufnehmen
              </button>
            </>
          )
        )}
      </section>

      <section className="pc-card" aria-labelledby="mitnehmen-titel">
        <h2 id="mitnehmen-titel">2. Daten mitnehmen</h2>
        <p>
          Laden Sie Ihre Daten herunter, bevor Sie löschen — als maschinenlesbare Datei (JSON)
          oder als druckbaren Bericht. Nach der Löschung ist das nicht mehr möglich.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <a className="pc-btn pc-btn--secondary" href="/api/coach/export">
            Daten herunterladen (JSON)
          </a>
          <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/bericht">
            Bericht erstellen
          </Link>
        </div>
      </section>

      <section className="pc-card" aria-labelledby="loeschen-titel">
        <h2 id="loeschen-titel">3. PflegeCoach-Daten löschen</h2>
        <p>
          Sie können alle Ihre PflegeCoach-Daten selbst und vollständig löschen (Art. 17 DSGVO).
          Ihr Alltagsengel-Konto bleibt dabei bestehen. Die Löschseite zeigt Ihnen vorher genau
          an, was gelöscht wird, und verlangt eine ausdrückliche Bestätigung.
        </p>
        <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/loeschung">
          PflegeCoach-Daten löschen
        </Link>
      </section>

      <section className="pc-card" aria-labelledby="konto-titel">
        <h2 id="konto-titel">4. Alltagsengel-Konto löschen</h2>
        <p>
          Möchten Sie nicht nur den PflegeCoach, sondern Ihr gesamtes Alltagsengel-Konto löschen,
          gehen Sie über Ihr <Link href="/kunde/profil">Profil</Link>. Mit dem Konto werden auch
          Ihre PflegeCoach-Daten gelöscht.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="hilfe-titel">
        <h2 id="hilfe-titel">Fragen zum Beenden?</h2>
        <p>
          Wenn etwas unklar ist oder ein Schritt nicht funktioniert, schreiben Sie uns an{' '}
          <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>. Bitte senden Sie
          uns dabei keine Gesundheitsdaten.
        </p>
        <p>
          Wie wir Ihre Daten verarbeiten, steht in den{' '}
          <Link href="/pflegecoach/datenschutz">Datenschutzhinweisen zum PflegeCoach</Link>.
        </p>
      </section>
    </>
  )
}
