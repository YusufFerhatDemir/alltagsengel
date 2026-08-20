'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Bestellseite
//
// AUFBAU IN DER REIHENFOLGE, IN DER MAN KAUFT: was man bekommt →
// welcher Tarif → an wen die Rechnung geht → was rechtlich gilt →
// Bestellknopf. Nichts davon ist ausklappbar oder wegklickbar; die
// Zielgruppe soll nicht suchen müssen, was sie gerade zusagt.
//
// ═══ § 312j ABS. 3 BGB — BUTTON-LÖSUNG ═════════════════════════
// Der Bestellknopf trägt die Beschriftung „Zahlungspflichtig
// bestellen". Das ist keine Formulierungsfrage: Ohne eindeutige
// Beschriftung kommt kein Vertrag zustande. Direkt darüber stehen
// nach § 312j Abs. 2 BGB die wesentlichen Merkmale, der Gesamtpreis
// und die Laufzeit — deshalb steht die Zusammenfassung unmittelbar
// über dem Knopf und nicht weiter oben.
//
// ═══ WAS HIER BEWUSST FEHLT ════════════════════════════════════
//  * Keine Checkbox „Ich verzichte auf mein Widerrufsrecht". Die wäre
//    zulässig und wird trotzdem nicht angeboten (lib/coach/bestellung.ts).
//  * Kein Countdown, kein „nur noch heute", kein durchgestrichener
//    Vergleichspreis. Das Produkt richtet sich an Menschen in einer
//    Belastungssituation; Verkaufsdruck ist hier fehl am Platz.
//  * Keine Zahlungsdaten in diesem Formular — Karte und Bankverbindung
//    erhebt ausschließlich Stripe auf seiner eigenen Seite.
// ═══════════════════════════════════════════════════════════════

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { coachApi, useCoachProfil } from '../_lib/client'
import { CoachLaden, CoachLadefehler } from '../_lib/Zustand'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'

interface TarifAnzeige {
  key: 'monatlich' | 'jaehrlich'
  bezeichnung: string
  beschreibung: string
  betrag_cent: number
  intervall_monate: number
  testphase_tage: number
  bestellbar: boolean
}

interface AboStand {
  bestellung: { status: string } | null
  zugang: boolean
  verkauf_moeglich: boolean
  tarife: TarifAnzeige[]
}

/** Cent → „19,00 €". Spiegelt formatiereCent() aus lib/coach/pricing.ts. */
function geld(cent: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cent / 100)
}

function proMonat(t: TarifAnzeige): string {
  return geld(Math.round(t.betrag_cent / t.intervall_monate))
}

/**
 * Suspense-Grenze um den Bestellinhalt.
 *
 * `useSearchParams()` zwingt Next beim Prerendern zum Abbruch, wenn es
 * nicht in einer Suspense-Grenze steht — der Produktions-Build bricht
 * dann mit „missing-suspense-with-csr-bailout" ab (im Entwicklungsmodus
 * fällt das nicht auf). Gebraucht wird der Parameter nur für den
 * Hinweis nach einem abgebrochenen Stripe-Vorgang; die Grenze kostet
 * also nichts und hält den Build grün.
 */
export default function CheckoutSeite() {
  return (
    <Suspense fallback={<CoachLaden />}>
      <CheckoutInhalt />
    </Suspense>
  )
}

function CheckoutInhalt() {
  const { profil, laden: profilLaedt, fehler: profilFehler, neuLaden } = useCoachProfil()
  const suchparameter = useSearchParams()
  const abgebrochen = suchparameter.get('abgebrochen') === '1'

  const [stand, setStand] = useState<AboStand | null>(null)
  const [standFehler, setStandFehler] = useState<string | null>(null)
  const [tarif, setTarif] = useState<'monatlich' | 'jaehrlich'>('jaehrlich')

  const [name, setName] = useState('')
  const [strasse, setStrasse] = useState('')
  const [plz, setPlz] = useState('')
  const [ort, setOrt] = useState('')
  const [email, setEmail] = useState('')
  const [agb, setAgb] = useState(false)
  const [datenschutz, setDatenschutz] = useState(false)

  const [sende, setSende] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!profil) return
    coachApi<AboStand>('/api/coach/abo')
      .then(s => {
        setStand(s)
        // Vorauswahl auf den ersten bestellbaren Tarif. Ohne das stünde
        // bei gesperrtem Jahrestarif eine nicht bestellbare Auswahl da.
        const ersterBestellbare = s.tarife.find(t => t.bestellbar)
        if (ersterBestellbare) setTarif(ersterBestellbare.key)
        if (profil.anzeigename && !name) setName(profil.anzeigename)
      })
      .catch(e => setStandFehler((e as Error).message))
    // Absichtlich nur von `profil` abhängig: Ein erneuter Lauf bei jeder
    // Namenseingabe würde die Vorbelegung wieder überschreiben.
     
  }, [profil])

  if (profilLaedt) return <CoachLaden />
  if (profilFehler) return <CoachLadefehler fehler={profilFehler} neuLaden={neuLaden} />
  if (!profil) return null
  if (standFehler) return <CoachLadefehler fehler={standFehler} neuLaden={() => location.reload()} />
  if (!stand) return <CoachLaden />

  const gewaehlt = stand.tarife.find(t => t.key === tarif) ?? stand.tarife[0]

  // ─── Sonderfälle vor dem Formular ────────────────────────────

  if (stand.zugang) {
    return (
      <>
        <h1 className="pc-h1">Sie haben bereits Zugang</h1>
        <section className="pc-card">
          <p>
            Für Ihr Konto besteht bereits ein freigeschalteter Zugang zum PflegeCoach. Eine
            zweite Bestellung ist nicht nötig — und würde doppelt abgebucht.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="pc-btn" href="/pflegecoach">Zum PflegeCoach</Link>
            <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/einstellungen/konto">
              Vertrag verwalten
            </Link>
          </div>
        </section>
      </>
    )
  }

  if (!stand.verkauf_moeglich) {
    return (
      <>
        <h1 className="pc-h1">Keine Bestellung nötig</h1>
        <section className="pc-card">
          <p>
            <strong>Der PflegeCoach ist für Sie kostenlos.</strong> Es gibt derzeit keinen
            kostenpflichtigen Zugang zu bestellen — Sie nutzen den PflegeCoach ohne Kosten,
            ohne Abonnement und ohne Kreditkarte.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="pc-btn" href="/pflegecoach">Zum PflegeCoach</Link>
            <a className="pc-btn pc-btn--secondary" href={`mailto:${COACH_SUPPORT_EMAIL}`}>
              Fragen? E-Mail schreiben
            </a>
          </div>
        </section>
      </>
    )
  }

  // ─── Bestellung absenden ─────────────────────────────────────

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    if (!agb) { setFehler('Bitte bestätigen Sie die Allgemeinen Geschäftsbedingungen.'); return }
    if (!datenschutz) { setFehler('Bitte bestätigen Sie die Datenschutzhinweise.'); return }

    setSende(true)
    try {
      const { url } = await coachApi<{ url: string }>('/api/coach/checkout', {
        method: 'POST',
        body: JSON.stringify({
          tarif,
          rechnung_name: name,
          rechnung_strasse: strasse,
          rechnung_plz: plz,
          rechnung_ort: ort,
          rechnung_email: email,
          agb_akzeptiert: true,
          datenschutz_akzeptiert: true,
        }),
      })
      // Weiter zu Stripe. Kein router.push: Das Ziel liegt auf einer
      // fremden Domain.
      window.location.href = url
    } catch (e) {
      setFehler((e as Error).message)
      setSende(false)
    }
  }

  return (
    <>
      <h1 className="pc-h1">Bestellung</h1>

      {abgebrochen && (
        <p className="pc-feedback pc-feedback--info" role="status">
          Sie haben die Zahlung abgebrochen. Es wurde nichts abgebucht und nichts bestellt.
          Sie können jederzeit von vorn beginnen.
        </p>
      )}

      <section className="pc-card" aria-labelledby="was-titel">
        <h2 id="was-titel">Das bestellen Sie</h2>
        <p>
          Zugang zum <strong>Digitalen PflegeCoach</strong> mit allen Bereichen: Pflegeassessment,
          Ziele, Aktivitäten, Wochenplan, Mobilitätsanleitungen, Wissensmodule und
          Belastungs-Check für Angehörige, Verlauf und druckbarer Bericht.
        </p>
        <p>
          Der PflegeCoach ist <strong>kein Medizinprodukt</strong> und <strong>keine Leistung der
          gesetzlichen Pflege- oder Krankenversicherung</strong>. Eine Abrechnung mit Kassen findet
          nicht statt, einen Erstattungsanspruch gibt es nicht. Er ersetzt keine ärztliche oder
          pflegefachliche Beratung. In Notfällen wählen Sie bitte die 112.
        </p>
      </section>

      <form onSubmit={absenden}>
        <fieldset className="pc-fieldset">
          <legend>Tarif wählen</legend>
          <div className="pc-scale">
            {stand.tarife.map(t => (
              <label
                key={t.key}
                className="pc-scale-option"
                style={t.bestellbar ? undefined : { opacity: 0.5 }}
              >
                <input
                  type="radio"
                  name="tarif"
                  value={t.key}
                  checked={tarif === t.key}
                  disabled={!t.bestellbar}
                  onChange={() => setTarif(t.key)}
                />
                <span>
                  <strong>{t.bezeichnung} — {geld(t.betrag_cent)}</strong>
                  <br />
                  {t.intervall_monate > 1 && (
                    <>entspricht {proMonat(t)} pro Monat<br /></>
                  )}
                  {t.beschreibung}
                  {t.testphase_tage > 0 && (
                    <><br />Die ersten {t.testphase_tage} Tage sind kostenlos.</>
                  )}
                  {!t.bestellbar && <><br />Zurzeit nicht bestellbar.</>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="pc-card" aria-labelledby="rechnung-titel">
          <h2 id="rechnung-titel">Rechnungsanschrift</h2>
          <p className="pc-lead">
            Diese Angaben stehen auf Ihrer Rechnung. Sie sind gesetzlich vorgeschrieben.
          </p>

          <label htmlFor="r-name">Name</label>
          <input
            id="r-name" type="text" value={name} required maxLength={120}
            autoComplete="name" onChange={e => setName(e.target.value)}
          />

          <label htmlFor="r-strasse">Straße und Hausnummer</label>
          <input
            id="r-strasse" type="text" value={strasse} required maxLength={160}
            autoComplete="street-address" onChange={e => setStrasse(e.target.value)}
          />

          <label htmlFor="r-plz">Postleitzahl</label>
          <input
            id="r-plz" type="text" value={plz} required maxLength={12}
            autoComplete="postal-code" inputMode="numeric" onChange={e => setPlz(e.target.value)}
          />

          <label htmlFor="r-ort">Ort</label>
          <input
            id="r-ort" type="text" value={ort} required maxLength={100}
            autoComplete="address-level2" onChange={e => setOrt(e.target.value)}
          />

          <label htmlFor="r-email">E-Mail für Bestätigung und Rechnung</label>
          <input
            id="r-email" type="email" value={email} required maxLength={200}
            autoComplete="email" onChange={e => setEmail(e.target.value)}
          />
        </section>

        <section className="pc-card" aria-labelledby="recht-titel">
          <h2 id="recht-titel">Ihr Widerrufsrecht</h2>
          <p>
            Sie können diese Bestellung <strong>binnen 14 Tagen ohne Angabe von Gründen
            widerrufen</strong> und erhalten den vollen Betrag zurück. Für die Nutzung bis zum
            Widerruf berechnen wir nichts.
          </p>
          <p>
            Wir lassen uns bewusst <strong>nicht</strong> bestätigen, dass Ihr Widerrufsrecht
            durch den sofortigen Beginn vorzeitig erlischt. Es bleibt Ihnen die vollen 14 Tage
            erhalten, auch wenn Sie den PflegeCoach in dieser Zeit schon nutzen.
          </p>
          <p>
            Den Widerruf erklären Sie mit einem Klick in Ihrem Konto oder formlos per E-Mail.
            Einzelheiten: <Link href="/pflegecoach/widerruf">Widerrufsbelehrung</Link>.
          </p>
        </section>

        <fieldset className="pc-fieldset">
          <legend>Bestätigungen</legend>
          <label className="pc-check-row">
            <input type="checkbox" checked={agb} onChange={e => setAgb(e.target.checked)} />
            <span>
              Ich habe die <Link href="/pflegecoach/agb" target="_blank">Allgemeinen
              Geschäftsbedingungen</Link> und die <Link href="/pflegecoach/widerruf" target="_blank">
              Widerrufsbelehrung</Link> gelesen und stimme ihnen zu. <strong>(erforderlich)</strong>
            </span>
          </label>
          <label className="pc-check-row">
            <input type="checkbox" checked={datenschutz} onChange={e => setDatenschutz(e.target.checked)} />
            <span>
              Ich habe die <Link href="/pflegecoach/datenschutz" target="_blank">
              Datenschutzhinweise</Link> zur Kenntnis genommen. <strong>(erforderlich)</strong>
            </span>
          </label>
        </fieldset>

        {/* § 312j Abs. 2 BGB: wesentliche Merkmale, Gesamtpreis und
            Laufzeit unmittelbar vor dem Bestellknopf — nicht weiter oben,
            nicht in einer Fußnote. */}
        <section className="pc-card" aria-labelledby="uebersicht-titel">
          <h2 id="uebersicht-titel">Ihre Bestellung im Überblick</h2>
          <div className="pc-table-wrap">
            <table className="pc-table">
              <tbody>
                <tr>
                  <th scope="row">Leistung</th>
                  <td>Digitaler PflegeCoach — Zugang zu allen Bereichen</td>
                </tr>
                <tr>
                  <th scope="row">Tarif</th>
                  <td>{gewaehlt?.bezeichnung}</td>
                </tr>
                <tr>
                  <th scope="row">Laufzeit</th>
                  <td>
                    {gewaehlt?.intervall_monate === 1 ? 'ein Monat' : 'zwölf Monate'}, verlängert
                    sich automatisch — jederzeit zum Laufzeitende kündbar
                  </td>
                </tr>
                <tr>
                  <th scope="row">Gesamtpreis</th>
                  <td>
                    <strong>{gewaehlt ? geld(gewaehlt.betrag_cent) : '–'}</strong>
                    {gewaehlt?.intervall_monate === 1 ? ' pro Monat' : ' pro Jahr'}
                    {' '}(Endpreis, keine weiteren Kosten)
                  </td>
                </tr>
                <tr>
                  <th scope="row">Zahlung</th>
                  <td>über Stripe — Karte oder Lastschrift, im nächsten Schritt</td>
                </tr>
              </tbody>
            </table>
          </div>

          {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

          <button type="submit" className="pc-btn" disabled={sende || !gewaehlt?.bestellbar}>
            {sende ? 'Weiterleitung zur Zahlung …' : 'Zahlungspflichtig bestellen'}
          </button>
          <p className="pc-lead">
            Im nächsten Schritt geben Sie bei Stripe Ihr Zahlungsmittel ein. Wir selbst
            speichern keine Karten- oder Kontodaten.
          </p>
        </section>
      </form>
    </>
  )
}
