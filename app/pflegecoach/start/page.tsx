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

// ═══════════════════════════════════════════════════════════════
// PREISE
// ═══════════════════════════════════════════════════════════════

interface TarifAnzeige {
  key: string
  bezeichnung: string
  beschreibung: string
  betrag_cent: number
  pro_monat_cent: number
  intervall_monate: number
  testphase_tage: number
  bestellbar: boolean
}

interface TarifStand {
  verkauf_moeglich: boolean
  tarife: TarifAnzeige[]
  jahres_ersparnis: { betrag_cent: number; prozent: number } | null
}

function geld(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cent / 100)
}

/**
 * Preisabschnitt.
 *
 * Geschäftsmodell-Entscheidung vom 14.08.2026 (lib/coach/pricing.ts):
 * Der PflegeCoach ist dauerhaft kostenlos für Endnutzer. Der bezahlte
 * Bestellweg bleibt als fail-closed gesperrte Infrastruktur bestehen
 * (siehe pricing.ts) — solange COACH_PREISE_FREIGEGEBEN nicht auf
 * 'true' steht, gilt ausschließlich der kostenlose Zweig unten.
 *
 * Lädt über eine öffentliche Route, weil diese Seite auch ohne
 * Anmeldung etwas Sinnvolles zeigen muss. Rendert nichts, solange
 * nichts geladen ist.
 */
function Preise({ mitBestellknopf }: { mitBestellknopf: boolean }) {
  const [stand, setStand] = useState<TarifStand | null>(null)

  useEffect(() => {
    let aktiv = true
    fetch('/api/coach/tarife')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (aktiv && d) setStand(d as TarifStand) })
      .catch(() => { /* Preise sind Beiwerk — ein Fehler darf die Seite nicht stören. */ })
    return () => { aktiv = false }
  }, [])

  if (!stand) return null

  if (!stand.verkauf_moeglich) {
    return (
      <section className="pc-card" aria-labelledby="preise-titel">
        <h2 id="preise-titel">Was der PflegeCoach kostet</h2>
        <p>
          <strong>Der PflegeCoach ist für Sie kostenlos.</strong> Es entstehen keine Kosten,
          Sie benötigen keine Kreditkarte und schließen kein Abonnement ab. Es gibt keine
          Testphase, die abläuft — die Nutzung bleibt dauerhaft kostenfrei.
        </p>
      </section>
    )
  }

  return (
    <section className="pc-card" aria-labelledby="preise-titel">
      <h2 id="preise-titel">Was der PflegeCoach kostet</h2>
      <div className="pc-table-wrap">
        <table className="pc-table">
          <caption className="sr-only">Tarife des Digitalen PflegeCoach</caption>
          <thead>
            <tr>
              <th scope="col">Tarif</th>
              <th scope="col">Preis</th>
              <th scope="col">Das bedeutet</th>
            </tr>
          </thead>
          <tbody>
            {stand.tarife.filter(t => t.bestellbar).map(t => (
              <tr key={t.key}>
                <th scope="row">{t.bezeichnung}</th>
                <td>
                  <strong>{geld(t.betrag_cent)}</strong>
                  {t.intervall_monate === 1 ? ' / Monat' : ' / Jahr'}
                  {t.intervall_monate > 1 && (
                    <><br />entspricht {geld(t.pro_monat_cent)} pro Monat</>
                  )}
                </td>
                <td>
                  {t.beschreibung}
                  {t.testphase_tage > 0 && (
                    <><br />Die ersten {t.testphase_tage} Tage sind kostenlos.</>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {stand.jahres_ersparnis && (
        <p>
          Mit dem Jahrestarif sparen Sie {geld(stand.jahres_ersparnis.betrag_cent)} gegenüber
          zwölf Monatszahlungen ({stand.jahres_ersparnis.prozent} %).
        </p>
      )}

      <p>
        Alle Preise sind Endpreise. Es gibt keine Anschlussgebühr, keine Zusatzkosten und keine
        Mindestlaufzeit über den gewählten Zeitraum hinaus. Sie können jederzeit zum Ende des
        bezahlten Zeitraums kündigen — und innerhalb von 14 Tagen ohne Angabe von Gründen
        widerrufen, mit voller Erstattung.
      </p>

      {mitBestellknopf && (
        <Link className="pc-btn" href="/pflegecoach/checkout">Zugang bestellen</Link>
      )}

      <p className="pc-lead">
        <Link href="/pflegecoach/agb">AGB</Link>{' · '}
        <Link href="/pflegecoach/widerruf">Widerrufsbelehrung</Link>
      </p>
    </section>
  )
}

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
          stabilisieren und Angehörige entlasten. <strong>Die Nutzung ist für Sie kostenlos</strong> —
          keine Kosten, kein Abonnement, keine Kreditkarte.
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
              nicht. Für Sie als Nutzerin oder Nutzer ist der PflegeCoach dennoch kostenlos.
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

        {/* Preis vor dem Anmeldeweg: Wer erst ein Konto anlegen muss, um zu
            erfahren, was etwas kostet, springt zu Recht wieder ab. */}
        <Preise mitBestellknopf={false} />

        <section className="pc-card" aria-labelledby="zugang-titel">
          <h2 id="zugang-titel">So kommen Sie hinein</h2>
          <p>
            In drei Schritten: <strong>Konto anlegen</strong> — <strong>Einwilligung
            erteilen</strong> — <strong>Zugang bestellen</strong>. Das Konto ist nötig, damit Ihre
            Pflegedaten geschützt und nur für Sie sichtbar sind. Wie wir sie verarbeiten, steht
            in den <Link href="/pflegecoach/datenschutz">Datenschutzhinweisen</Link>.
          </p>
          <p>
            Sie sind unsicher, ob der PflegeCoach zu Ihrer Situation passt, oder haben Fragen?
            Schreiben Sie uns — wir melden uns bei Ihnen zurück.
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

      {/* Auch im Onboarding sichtbar: Wer gerade seine Einwilligung
          erteilt, soll wissen, was das Produkt kostet — nicht erst,
          wenn er es eingerichtet hat. Ohne Bestellknopf, weil erst das
          Profil fertig sein muss. */}
      <Preise mitBestellknopf={false} />

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
