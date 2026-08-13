'use client'

// PflegeCoach — Einstieg: Zweckbestimmung, Rolle, Einwilligungen (Art. 9).
//
// Diese Seite ist der einzige Einstiegspunkt des Produkts und muss deshalb
// auch OHNE Anmeldung etwas Sinnvolles zeigen: die Zweckbestimmung und die
// Produktgrenze. Erst danach kommt der Anmeldeweg. Ohne das wäre der
// PflegeCoach von außen eine reine Login-Sackgasse.
//
// ABBRUCHFEST: Das Onboarding schreibt in mehreren Schritten (Profil,
// Pflicht-Einwilligung, optionale Einwilligung, Abschluss-Vermerk). Bricht
// es dazwischen ab — Netz weg, Tab geschlossen —, darf der Nutzer nicht in
// einem halben Zustand landen. Die Seite erkennt deshalb beim Aufruf, was
// schon existiert, und setzt genau dort fort.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CoachRolle, CoachUser } from '@/lib/coach/types'
import { ROLLE_LABELS } from '@/lib/coach/types'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'
import { coachApi, CoachApiError } from '../_lib/client'
import { useDipaModus } from '../_lib/Modus'
import { CoachLaden, CoachLadefehler } from '../_lib/Zustand'

const ZURUECK = encodeURIComponent('/pflegecoach/start')

/**
 * Leistungsumfang — die acht Bereiche, die das Produkt heute wirklich
 * enthält. Jeder Punkt entspricht einem gebauten Bereich in der
 * Navigation; hier darf nichts stehen, das es nicht gibt.
 */
const LEISTUNGSUMFANG: Array<{ titel: string; text: string }> = [
  {
    titel: 'Pflegeassessment',
    text: 'Strukturierte Selbsteinschätzung der Lebensbereiche — der Ausgangspunkt für alles Weitere.',
  },
  {
    titel: 'Ziele',
    text: 'Eigene, konkrete Ziele festhalten und ihren Stand über die Zeit nachhalten.',
  },
  {
    titel: 'Aktivitäten',
    text: 'Wiederkehrende Aufgaben und Übungen anlegen, abhaken und nachvollziehen.',
  },
  {
    titel: 'Wochenplan',
    text: 'Aktivitäten auf Wochentage und Uhrzeiten verteilen — Struktur für den Alltag.',
  },
  {
    titel: 'Mobilität',
    text: 'Anleitungen zu Bewegung, Sturzvermeidung und sicherem Bewegen in der Wohnung.',
  },
  {
    titel: 'Angehörigen-Entlastung',
    text: 'Wissensmodule für pflegende Angehörige und ein Belastungs-Check mit eigenem Verlauf.',
  },
  {
    titel: 'Verlauf',
    text: 'Entwicklung der Selbsteinschätzungen, Ziele und Erledigungen über Wochen und Monate.',
  },
  {
    titel: 'Bericht',
    text: 'Druckbarer Verlaufsbericht — etwa für das Gespräch mit Ärztin, Arzt oder Pflegedienst.',
  },
]

/**
 * Zweckbestimmung + Produktgrenze — identisch für an- und abgemeldete Sicht.
 *
 * Die Negativabgrenzung steht bewusst hier und nicht nur im Marketing:
 * Sie ist Teil der Zweckbestimmung und muss jeder sehen, der das Produkt
 * einrichtet — nicht nur der, der die Verkaufsseite gelesen hat.
 */
function Zweckbestimmung() {
  // Der Selbstzahler-Hinweis ist an COACH_DIPA_MODUS gebunden: Er ist
  // heute richtig und wäre in einem tatsächlichen DiPA-Verfahren falsch.
  const dipaAktiv = useDipaModus()

  return (
    <>
      <section className="pc-card" aria-labelledby="zweck-titel">
        <h2 id="zweck-titel">Was dieser PflegeCoach ist</h2>
        <p>
          Der Digitale PflegeCoach unterstützt Pflegebedürftige in häuslicher Versorgung sowie
          ihre pflegenden Angehörigen mit strukturierten Anleitungs-, Erinnerungs- und
          Dokumentationsfunktionen: Selbständigkeit im Alltag erhalten, die häusliche Versorgung
          stabilisieren und Angehörige entlasten.
        </p>
        <p>
          <strong>Was er nicht ist:</strong> Der PflegeCoach dient nicht der Erkennung, Behandlung
          oder Überwachung von Krankheiten und trifft keine diagnostischen oder therapeutischen
          Entscheidungen. Er ersetzt keine ärztliche oder pflegefachliche Beratung.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="abgrenzung-titel">
        <h2 id="abgrenzung-titel">Wichtig zu wissen</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>
            <strong>Dies ist kein medizinisches Produkt.</strong> Der PflegeCoach ist kein
            Medizinprodukt im Sinne der Medizinprodukte-Verordnung und stellt keine Diagnosen,
            spricht keine Therapieempfehlungen aus und überwacht keine Krankheitsverläufe.
          </li>
          {!dipaAktiv && (
            <li>
              <strong>Dies ist keine Kassenleistung.</strong> Der PflegeCoach ist keine Leistung
              der gesetzlichen Pflege- oder Krankenversicherung. Es findet keine Abrechnung mit
              Pflege- oder Krankenkassen statt; einen Anspruch gegenüber Ihrer Kasse gibt es
              nicht. Die Nutzung erfolgt als privat zu zahlendes Angebot.
            </li>
          )}
          <li>
            <strong>Kein Ersatz für Versorgung.</strong> Der PflegeCoach ersetzt weder ärztliche
            oder pflegefachliche Beratung noch einen Pflegedienst. In Notfällen wählen Sie
            bitte die 112.
          </li>
        </ul>
      </section>
    </>
  )
}

export default function CoachStart() {
  const router = useRouter()
  const [angemeldet, setAngemeldet] = useState(true)
  const [pruefe, setPruefe] = useState(true)
  /** Profil bereits vorhanden? Dann fehlt nur noch die Einwilligung. */
  const [bestehendesProfil, setBestehendesProfil] = useState<CoachUser | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [versuch, setVersuch] = useState(0)

  const [rolle, setRolle] = useState<CoachRolle | ''>('')
  const [anzeigename, setAnzeigename] = useState('')
  const [pflegegrad, setPflegegrad] = useState('')
  const [einwilligungArt9, setEinwilligungArt9] = useState(false)
  const [einwilligungWissenschaft, setEinwilligungWissenschaft] = useState(false)
  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const neuLaden = useCallback(() => {
    setLadeFehler(null)
    setPruefe(true)
    setVersuch(v => v + 1)
  }, [])

  useEffect(() => {
    let aktiv = true
    coachApi<{ profil: CoachUser | null; einwilligung_aktiv?: boolean }>('/api/coach/profil')
      .then(({ profil, einwilligung_aktiv }) => {
        if (!aktiv) return
        // Fertig eingerichtet ist nur, wer Profil UND gültige Einwilligung hat.
        // Sonst bliebe ein abgebrochenes Onboarding unsichtbar, und jeder
        // Speicherversuch liefe später in einen 403.
        if (profil && einwilligung_aktiv !== false) {
          router.push('/pflegecoach')
          return
        }
        setBestehendesProfil(profil)
        setPruefe(false)
      })
      .catch((e: CoachApiError) => {
        if (!aktiv) return
        if (e.status === 401) setAngemeldet(false)
        else setLadeFehler(e.message)
        setPruefe(false)
      })
    return () => { aktiv = false }
  }, [router, versuch])

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    if (!bestehendesProfil && !rolle) { setFehler('Bitte wählen Sie Ihre Rolle.'); return }
    if (!einwilligungArt9) { setFehler('Ohne Einwilligung in die Datenverarbeitung kann der PflegeCoach nicht genutzt werden.'); return }
    setSende(true)
    try {
      if (!bestehendesProfil) {
        try {
          await coachApi('/api/coach/profil', {
            method: 'POST',
            body: JSON.stringify({
              rolle,
              anzeigename: anzeigename || null,
              pflegegrad: rolle === 'pflegebeduerftig' && pflegegrad ? Number(pflegegrad) : null,
            }),
          })
        } catch (e) {
          // 409 = das Profil existiert bereits (z. B. zweiter Tab oder ein
          // früherer Anlauf, der nur beim Einwilligen abgebrochen ist).
          // Das ist kein Fehlerfall: die restlichen Schritte laufen weiter.
          if (!(e instanceof CoachApiError && e.status === 409)) throw e
        }
      }

      await coachApi('/api/coach/consents', {
        method: 'POST',
        body: JSON.stringify({ consent_typ: 'gesundheitsdaten_art9', erteilt: true }),
      })
      if (einwilligungWissenschaft) {
        await coachApi('/api/coach/consents', {
          method: 'POST',
          body: JSON.stringify({ consent_typ: 'wissenschaftliche_auswertung', erteilt: true }),
        })
      }
      await coachApi('/api/coach/profil', {
        method: 'PATCH',
        body: JSON.stringify({ onboarding_abgeschlossen: true }),
      })
      router.push('/pflegecoach')
    } catch (e) {
      setFehler((e as Error).message)
      setSende(false)
    }
  }

  if (pruefe) return <CoachLaden />
  if (ladeFehler) return <CoachLadefehler fehler={ladeFehler} neuLaden={neuLaden} />

  if (!angemeldet) {
    return (
      <>
        <h1 className="pc-h1">Digitaler PflegeCoach</h1>
        <Zweckbestimmung />

        <section className="pc-card" aria-labelledby="funktionen-titel">
          <h2 id="funktionen-titel">Das ist enthalten</h2>
          <dl className="pc-leistungen">
            {LEISTUNGSUMFANG.map(l => (
              <div key={l.titel}>
                <dt>{l.titel}</dt>
                <dd>{l.text}</dd>
              </div>
            ))}
          </dl>
          <p>
            Alle Ihre Eingaben können Sie jederzeit selbst herunterladen und selbst
            vollständig löschen.
          </p>
        </section>

        <section className="pc-card" aria-labelledby="zugang-titel">
          <h2 id="zugang-titel">So kommen Sie hinein</h2>
          <p>
            Für die Nutzung ist ein Alltagsengel-Konto nötig — Ihre Pflegedaten sind damit
            geschützt und nur für Sie sichtbar. Wie wir sie verarbeiten, steht in den{' '}
            <Link href="/pflegecoach/datenschutz">Datenschutzhinweisen</Link>.
          </p>
          <p>
            Sie sind unsicher, ob der PflegeCoach zu Ihrer Situation passt, oder möchten die
            Konditionen besprechen? Schreiben Sie uns — wir melden uns bei Ihnen zurück.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="pc-btn" href="/auth/register">Konto anlegen</Link>
            <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/anfrage">
              Anfrage stellen
            </Link>
            <Link className="pc-btn pc-btn--secondary" href={`/auth/login?redirectTo=${ZURUECK}`}>
              Ich habe schon ein Konto
            </Link>
          </div>
          {/* Hinweis statt Rücksprung-Versprechen: /auth/register wertet
              redirectTo nicht aus, deshalb steht der Weg zurück als Text da. */}
          <p className="pc-lead">
            Nach der Registrierung kommen Sie über diese Seite zurück in den PflegeCoach.
          </p>
        </section>

        <section className="pc-card" aria-labelledby="hilfe-titel">
          <h2 id="hilfe-titel">Hilfe und Kontakt</h2>
          <p>
            Bei Fragen zum Produkt erreichen Sie uns per E-Mail unter{' '}
            <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>.
            Bitte senden Sie uns keine Gesundheitsdaten per E-Mail.
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      <h1 className="pc-h1">
        {bestehendesProfil ? 'Nur noch ein Schritt' : 'Willkommen beim Digitalen PflegeCoach'}
      </h1>

      <Zweckbestimmung />

      {bestehendesProfil && (
        <p className="pc-feedback pc-feedback--info">
          Ihr Profil ist bereits angelegt. Es fehlt nur noch Ihre Einwilligung in die
          Verarbeitung Ihrer Pflege- und Gesundheitsdaten — ohne sie kann der PflegeCoach
          keine Einträge für Sie speichern.
        </p>
      )}

      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={absenden}>
        {!bestehendesProfil && (
          <>
            <fieldset className="pc-fieldset">
              <legend>Ihre Rolle</legend>
              <div className="pc-scale">
                {(Object.keys(ROLLE_LABELS) as CoachRolle[]).map(r => (
                  <label key={r} className="pc-scale-option">
                    <input
                      type="radio" name="rolle" value={r}
                      checked={rolle === r}
                      onChange={() => setRolle(r)}
                    />
                    <span>{ROLLE_LABELS[r]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="pc-card">
              <label htmlFor="anzeigename">Wie dürfen wir Sie ansprechen? (optional)</label>
              <input id="anzeigename" type="text" value={anzeigename} onChange={e => setAnzeigename(e.target.value)} maxLength={120} />

              {rolle === 'pflegebeduerftig' && (
                <>
                  <label htmlFor="pflegegrad">Pflegegrad (optional)</label>
                  <select id="pflegegrad" value={pflegegrad} onChange={e => setPflegegrad(e.target.value)}>
                    <option value="">Keine Angabe</option>
                    {[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>Pflegegrad {g}</option>)}
                  </select>
                </>
              )}
            </div>
          </>
        )}

        <fieldset className="pc-fieldset">
          <legend>Einwilligungen</legend>
          <label className="pc-check-row">
            <input type="checkbox" checked={einwilligungArt9} onChange={e => setEinwilligungArt9(e.target.checked)} />
            <span>
              Ich willige ein, dass meine im PflegeCoach eingegebenen Pflege- und Gesundheitsdaten
              (Art. 9 DSGVO) zur Bereitstellung der PflegeCoach-Funktionen verarbeitet werden.
              Diese Einwilligung kann ich jederzeit in den Einstellungen widerrufen.
              Details: <a href="/pflegecoach/datenschutz">Datenschutzhinweise</a>. <strong>(erforderlich)</strong>
            </span>
          </label>
          <label className="pc-check-row">
            <input type="checkbox" checked={einwilligungWissenschaft} onChange={e => setEinwilligungWissenschaft(e.target.checked)} />
            <span>
              Ich willige ein, dass meine Nutzungs- und Fragebogendaten pseudonymisiert für die
              wissenschaftliche Evaluation des PflegeCoach ausgewertet werden dürfen.
              Getrennt widerruflich. <strong>(freiwillig)</strong>
            </span>
          </label>
        </fieldset>

        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird eingerichtet …' : 'PflegeCoach starten'}
        </button>
      </form>
    </>
  )
}
