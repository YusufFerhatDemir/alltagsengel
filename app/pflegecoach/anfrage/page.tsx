'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Anfrage (Selbstzahler-Weg)
//
// Bewusst OHNE Anmeldung erreichbar und bewusst ohne Checkout: Wer
// überlegt, den PflegeCoach zu nutzen, soll fragen können, ohne vorher
// ein Konto anzulegen oder etwas zu bezahlen. Die Anfrage geht als
// E-Mail an das Team (app/api/coach/anfrage/route.ts) und legt nichts
// im Produktdatenbestand an.
//
// KEINE GESUNDHEITSDATEN: Das Formular fragt nichts Gesundheitsbezogenes
// ab und weist ausdrücklich darauf hin, hier keine Diagnosen oder
// Befunde einzutragen. Der Grund steht im Datenflussdokument: Alles,
// was vor der Art.-9-Einwilligung eingeht, wäre ohne Rechtsgrundlage
// verarbeitet.
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react'
import Link from 'next/link'
// Nur die Support-Adresse als Konstante: COACH_PRODUKT_NAME steht im
// Nominativ („Digitaler PflegeCoach") und ergäbe in gebeugten Sätzen
// („zum …", „des …s") falsches Deutsch. In solchen Sätzen steht deshalb
// die Kurzform „PflegeCoach"; der vollständige Produktname erscheint in
// Titel, Fußzeile, Export und Bericht.
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'

const ROLLEN = [
  { wert: 'fuer_mich', label: 'Für mich selbst' },
  { wert: 'fuer_angehoerige', label: 'Für eine angehörige Person' },
  { wert: 'beruflich', label: 'Beruflich / für eine Einrichtung' },
] as const

export default function AnfrageSeite() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [rolle, setRolle] = useState<string>('fuer_mich')
  const [nachricht, setNachricht] = useState('')
  const [einwilligung, setEinwilligung] = useState(false)
  const [sende, setSende] = useState(false)
  const [gesendet, setGesendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setFehler(null)
    if (!name.trim() || !email.trim()) {
      setFehler('Bitte geben Sie Ihren Namen und Ihre E-Mail-Adresse an.')
      return
    }
    if (!einwilligung) {
      setFehler('Bitte bestätigen Sie den Datenschutzhinweis.')
      return
    }
    setSende(true)
    try {
      const antwort = await fetch('/api/coach/anfrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          telefon: telefon.trim() || null,
          rolle,
          nachricht: nachricht.trim() || null,
          einwilligung: true,
        }),
      })
      const daten = await antwort.json().catch(() => ({}))
      if (!antwort.ok) throw new Error(daten.error || 'Die Anfrage konnte nicht gesendet werden.')
      setGesendet(true)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setSende(false)
    }
  }

  if (gesendet) {
    return (
      <>
        <h1 className="pc-h1">Vielen Dank für Ihre Anfrage</h1>
        <section className="pc-card">
          <p>
            Ihre Anfrage ist bei uns eingegangen. Wir melden uns in der Regel innerhalb von zwei
            Werktagen bei Ihnen. Eine Bestätigung haben wir an Ihre E-Mail-Adresse geschickt.
          </p>
          <p>
            <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/start">
              Zurück zur Produktübersicht
            </Link>
          </p>
        </section>
      </>
    )
  }

  return (
    <>
      <h1 className="pc-h1">Anfrage zum PflegeCoach</h1>
      <p className="pc-lead">
        Sie möchten den PflegeCoach nutzen oder haben Fragen dazu, ob er zu Ihrer Situation passt?
        Schreiben Sie uns — Sie brauchen dafür kein Konto.
      </p>

      <section className="pc-card" aria-labelledby="einordnung-titel">
        <h2 id="einordnung-titel">Kurz vorab</h2>
        <ul style={{ paddingLeft: 20 }}>
          <li>
            Der PflegeCoach ist ein digitales Unterstützungsangebot für die häusliche Pflege —
            kein medizinisches Produkt und keine Kassenleistung.
          </li>
          <li>Er ersetzt keine ärztliche oder pflegefachliche Beratung. In Notfällen: 112.</li>
          <li>
            Der PflegeCoach ist kostenlos. Mit dieser Anfrage entstehen für Sie keinerlei Kosten.
          </li>
        </ul>
      </section>

      {fehler && <p className="pc-feedback pc-feedback--error" role="alert">{fehler}</p>}

      <form onSubmit={absenden}>
        <div className="pc-card">
          <label htmlFor="name">Ihr Name</label>
          <input
            id="name" type="text" value={name} onChange={e => setName(e.target.value)}
            maxLength={120} autoComplete="name" required
          />

          <label htmlFor="email">Ihre E-Mail-Adresse</label>
          <input
            id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            maxLength={200} autoComplete="email" required
          />

          <label htmlFor="telefon">Telefon (optional)</label>
          <input
            id="telefon" type="tel" value={telefon} onChange={e => setTelefon(e.target.value)}
            maxLength={40} autoComplete="tel"
          />
        </div>

        <fieldset className="pc-fieldset">
          <legend>Für wen ist die Anfrage?</legend>
          <div className="pc-scale">
            {ROLLEN.map(r => (
              <label key={r.wert} className="pc-scale-option">
                <input
                  type="radio" name="rolle" value={r.wert}
                  checked={rolle === r.wert}
                  onChange={() => setRolle(r.wert)}
                />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pc-card">
          <label htmlFor="nachricht">Ihre Nachricht (optional)</label>
          <textarea
            id="nachricht" rows={5} value={nachricht} maxLength={2000}
            onChange={e => setNachricht(e.target.value)}
            aria-describedby="nachricht-hinweis"
          />
          <p id="nachricht-hinweis" className="pc-lead">
            Bitte geben Sie hier <strong>keine Gesundheitsdaten</strong> an — keine Diagnosen,
            Befunde oder Medikamente. Für die Anfrage brauchen wir das nicht.
          </p>
        </div>

        <fieldset className="pc-fieldset">
          <legend>Datenschutz</legend>
          <label className="pc-check-row">
            <input
              type="checkbox" checked={einwilligung}
              onChange={e => setEinwilligung(e.target.checked)}
            />
            <span>
              Ich bin damit einverstanden, dass Alltagsengel meine hier angegebenen Kontaktdaten
              verarbeitet, um meine Anfrage zu beantworten. Die Daten werden zu diesem Zweck per
              E-Mail an das Team übermittelt und nicht für Werbung genutzt. Details:{' '}
              <Link href="/pflegecoach/datenschutz">Datenschutzhinweise zum PflegeCoach</Link>
              {' '}und <Link href="/datenschutz">allgemeine Datenschutzerklärung</Link>.
            </span>
          </label>
        </fieldset>

        <button type="submit" className="pc-btn" disabled={sende}>
          {sende ? 'Wird gesendet …' : 'Anfrage senden'}
        </button>
      </form>

      <section className="pc-card" aria-labelledby="direkt-titel">
        <h2 id="direkt-titel">Lieber direkt schreiben?</h2>
        <p>
          Sie erreichen uns auch unter{' '}
          <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </>
  )
}
