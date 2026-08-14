'use client'

// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Rückkehr von Stripe nach erfolgreicher Zahlung
//
// ═══ DAS ZEITFENSTER, DAS DIESE SEITE LÖST ═════════════════════
// Stripe leitet sofort nach der Zahlung hierher zurück. Freigeschaltet
// wird der Zugang aber erst, wenn der Webhook eintrifft — das dauert in
// der Regel ein bis drei Sekunden, gelegentlich länger. Ohne diese
// Seite landete die Kundin unmittelbar nach dem Bezahlen auf einem
// PflegeCoach, der ihr sagt, sie habe keinen Zugang. Das ist der
// klassische Auslöser für eine Rückbuchung.
//
// Deshalb wird hier gewartet und nachgefragt, bis der Zugang steht —
// mit klarer Ansage, was gerade passiert.
//
// ═══ DIE SEITE BESTÄTIGT NICHTS SELBST ═════════════════════════
// Sie liest ausschließlich den Serverstand. Eine Bestätigung allein
// aufgrund der Rückkehr von Stripe wäre fälschbar: Die URL lässt sich
// aufrufen, ohne je bezahlt zu haben. Maßgeblich ist der Webhook, nie
// dieser Seitenaufruf.
// ═══════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { coachApi } from '../../_lib/client'
import { COACH_SUPPORT_EMAIL } from '@/lib/coach/version'

interface AboStand {
  zugang: boolean
  bestellung: { status: string; laufzeit_bis: string | null } | null
}

/** Abstand zwischen zwei Nachfragen. */
const ABSTAND_MS = 2000
/** Nach ~30 Sekunden aufhören und den Hinweis-Text zeigen. */
const MAX_VERSUCHE = 15

function formatDatum(iso: string | null): string {
  if (!iso) return '–'
  const [j, m, t] = iso.slice(0, 10).split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

export default function DankeSeite() {
  const [zugang, setZugang] = useState(false)
  const [laufzeitBis, setLaufzeitBis] = useState<string | null>(null)
  const [versuche, setVersuche] = useState(0)
  const [aufgegeben, setAufgegeben] = useState(false)
  const gestoppt = useRef(false)

  const pruefe = useCallback(async (): Promise<boolean> => {
    try {
      const stand = await coachApi<AboStand>('/api/coach/abo')
      if (stand.zugang) {
        setZugang(true)
        setLaufzeitBis(stand.bestellung?.laufzeit_bis ?? null)
        return true
      }
    } catch {
      // Ein einzelner Fehlschlag beendet das Warten nicht: Der Zugang
      // hängt am Webhook, nicht an dieser Abfrage. Nach MAX_VERSUCHE
      // greift ohnehin der Hinweis-Text.
    }
    return false
  }, [])

  useEffect(() => {
    if (gestoppt.current) return
    let timer: ReturnType<typeof setTimeout>

    pruefe().then(fertig => {
      if (fertig) { gestoppt.current = true; return }
      if (versuche >= MAX_VERSUCHE) { setAufgegeben(true); return }
      timer = setTimeout(() => setVersuche(v => v + 1), ABSTAND_MS)
    })

    return () => clearTimeout(timer)
  }, [versuche, pruefe])

  // ─── Zugang steht ────────────────────────────────────────────

  if (zugang) {
    return (
      <>
        <h1 className="pc-h1">Vielen Dank — Ihr Zugang ist freigeschaltet</h1>

        <section className="pc-card" aria-labelledby="fertig-titel">
          <h2 id="fertig-titel">Alles bereit</h2>
          <p>
            Ihre Zahlung ist eingegangen und der PflegeCoach steht Ihnen ab sofort in vollem
            Umfang zur Verfügung.
            {laufzeitBis && <> Ihr Zugang ist bezahlt bis zum <strong>{formatDatum(laufzeitBis)}</strong>.</>}
          </p>
          <p>
            Eine Bestätigung mit allen Angaben zu Ihrer Bestellung und Ihrem Widerrufsrecht ist
            per E-Mail an Sie unterwegs.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link className="pc-btn" href="/pflegecoach/assessment">
              Mit dem Assessment beginnen
            </Link>
            <Link className="pc-btn pc-btn--secondary" href="/pflegecoach">Zur Übersicht</Link>
          </div>
        </section>

        <section className="pc-card" aria-labelledby="naechste-titel">
          <h2 id="naechste-titel">Was als Nächstes sinnvoll ist</h2>
          <ol style={{ paddingLeft: 20 }}>
            <li>
              <strong>Assessment ausfüllen</strong> — die Selbsteinschätzung ist der Ausgangspunkt
              für Ziele, Wochenplan und Verlauf. Sie dauert etwa zehn Minuten.
            </li>
            <li>
              <strong>Ein erstes Ziel festlegen</strong> — klein und konkret ist besser als groß
              und vage.
            </li>
            <li>
              <strong>Wochenplan füllen</strong> — nur mit dem, was ohnehin ansteht. Der Plan
              soll entlasten, nicht zusätzlich fordern.
            </li>
          </ol>
        </section>

        <section className="pc-card" aria-labelledby="vertrag-titel">
          <h2 id="vertrag-titel">Ihr Vertrag</h2>
          <p>
            Rechnung, Zahlungsverlauf, nächste Abbuchung, Kündigung und Widerruf finden Sie
            jederzeit unter <Link href="/pflegecoach/einstellungen/konto">Konto und Nutzung
            beenden</Link>.
          </p>
        </section>
      </>
    )
  }

  // ─── Webhook blieb aus ───────────────────────────────────────

  if (aufgegeben) {
    return (
      <>
        <h1 className="pc-h1">Ihre Zahlung wird noch verarbeitet</h1>
        <section className="pc-card">
          <p className="pc-feedback pc-feedback--info">
            Ihre Zahlung ist bei unserem Zahlungsdienstleister eingegangen. Die Freischaltung
            dauert in seltenen Fällen etwas länger als gewöhnlich.
          </p>
          <p>
            <strong>Es ist nichts verloren gegangen und Sie müssen nichts erneut bestellen.</strong>{' '}
            Bitte laden Sie diese Seite in einigen Minuten neu — oder schauen Sie später in Ihrem
            Konto nach.
          </p>
          <p>
            Sollte der Zugang bis morgen nicht bereitstehen, schreiben Sie uns bitte an{' '}
            <a href={`mailto:${COACH_SUPPORT_EMAIL}`}>{COACH_SUPPORT_EMAIL}</a> — wir klären das
            und schalten von Hand frei. Bitte senden Sie uns keine Gesundheitsdaten per E-Mail.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <button
              type="button"
              className="pc-btn"
              onClick={() => { setAufgegeben(false); setVersuche(0) }}
            >
              Erneut prüfen
            </button>
            <Link className="pc-btn pc-btn--secondary" href="/pflegecoach/einstellungen/konto">
              Zum Konto
            </Link>
          </div>
        </section>
      </>
    )
  }

  // ─── Warten ──────────────────────────────────────────────────

  return (
    <>
      <h1 className="pc-h1">Vielen Dank für Ihre Bestellung</h1>
      <section className="pc-card">
        {/* role="status" + aria-live: Screenreader sollen den Wechsel von
            „wird freigeschaltet" zu „bereit" mitbekommen, ohne dass der
            Fokus springt. */}
        <p className="pc-feedback pc-feedback--info" role="status" aria-live="polite">
          Ihre Zahlung ist eingegangen. Wir schalten Ihren Zugang gerade frei — das dauert nur
          einen Moment.
        </p>
        <p>Bitte schließen Sie dieses Fenster noch nicht.</p>
      </section>
    </>
  )
}
