'use client'
/**
 * Onboarding-Wizard — der eine mehrstufige Ablauf
 *
 * Ersetzt das Muster, das im Bestand fuenfmal kopiert liegt (jeweils ein
 * eigenes `useState(step)` samt `{step === n && …}`): OnboardingFlow,
 * app/onboarding, TerminBuchung, PflegegradCheck, PflegeboxKonfigurator.
 * Neue Abläufe bekommen hier Fortschritt, Speichern, Abbruch und
 * Barrierefreiheit fertig mit, statt sie erneut zu erfinden.
 *
 * ── DIESE DATEI ENTSCHEIDET NICHTS ─────────────────────────────────────
 * Alles, was falsch sein kann — prüfen, weiterschalten, Fehler behandeln —
 * steht in lib/onboarding/wizard-logik.ts und ist dort getestet. Hier wird
 * nur gerendert und weitergereicht. Der Grund: dieses Repo hat keine
 * DOM-Testumgebung, eine Entscheidung in dieser Datei wäre ungetestet.
 *
 * ── ERST SPEICHERN, DANN WEITER ────────────────────────────────────────
 * Schlägt das Speichern fehl, bleibt der Schritt stehen und die Eingaben
 * bleiben im Zustand. Niemand verliert Angaben an einen Netzfehler.
 *
 * ── MOBIL ZUERST ───────────────────────────────────────────────────────
 * Ein Schritt je Bildschirm, ein Satz Hinweis, Knöpfe mit mindestens
 * 52 px Höhe. Die Empfänger sind oft ältere Menschen auf dem Telefon —
 * kleine Ziele und lange Texte sind hier kein Schönheitsfehler, sondern
 * der Grund für einen Abbruch.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Karte, pflegePrimaryBtn, pflegeSecondaryBtn } from '@/components/admin/PflegeUI'
import {
  abbruchstelle as baueAbbruchstelle,
  auftragFuerSpaeter,
  beginneWeiter,
  ersterZustand,
  fortschrittProzent,
  schrittBeschriftung,
  setzeSchrittDaten,
  weiterBeschriftung,
  springeZu,
  zurueck as zurueckLogik,
  zustandNachSpeichern,
  type SpeicherAuftrag,
  type WizardSchritt,
} from '@/lib/onboarding/wizard-logik'

export interface WizardMaskeProps {
  daten: Record<string, unknown>
  setzeDaten: (teil: Record<string, unknown>) => void
  /** Angaben, die beim letzten „Weiter" gefehlt haben. */
  fehlendePflicht: string[]
  disabled: boolean
  /** Alle bisherigen Eingaben — die Zusammenfassung braucht sie. */
  alleDaten: Record<string, Record<string, unknown>>
  /** Zu einem bereits erreichten Schritt zurückspringen (Korrektur). */
  geheZuSchritt: (nummer: number) => void
}

export interface WizardProps {
  schritte: readonly WizardSchritt[]
  /** Maske je Schrittschlüssel. Fehlt eine, bleibt der Bereich leer. */
  masken: Record<string, (props: WizardMaskeProps) => ReactNode>
  startSchritt?: number
  anfangsDaten?: Record<string, Record<string, unknown>>
  /** Automatisches Speichern. Wirft oder liefert false ⇒ Schritt bleibt stehen. */
  onSpeichern: (auftrag: SpeicherAuftrag) => Promise<void>
  onAbschluss: () => Promise<void>
  /** „Später fortsetzen" — nach dem Speichern aufgerufen. */
  onSpaeter?: (stelle: string) => void | Promise<void>
  /** „Ich brauche Hilfe" — öffnet Beratung/Rückruf. Fehlt sie, entfällt der Knopf. */
  onHilfe?: () => void
  /** Was nach dem letzten Schritt steht. */
  abschlussInhalt?: ReactNode
}

export default function Wizard({
  schritte, masken, startSchritt = 1, anfangsDaten = {},
  onSpeichern, onAbschluss, onSpaeter, onHilfe, abschlussInhalt,
}: WizardProps) {
  const [zustand, setZustand] = useState(() =>
    ersterZustand(schritte.length, startSchritt, anfangsDaten))

  const schritt = schritte[zustand.aktuellerSchritt - 1]
  const prozent = fortschrittProzent(zustand.aktuellerSchritt, zustand.gesamtSchritte)

  const setzeDaten = useCallback((teil: Record<string, unknown>) => {
    if (!schritt) return
    setZustand(z => setzeSchrittDaten(z, schritt.schluessel, teil))
  }, [schritt])

  async function fuehreAus(auftrag: SpeicherAuftrag): Promise<boolean> {
    try {
      await onSpeichern(auftrag)
      return true
    } catch (err) {
      setZustand(z => zustandNachSpeichern(z, {
        ok: false,
        fehler: err instanceof Error
          ? err.message
          : 'Das Speichern hat nicht geklappt. Ihre Eingaben sind noch da.',
      }))
      return false
    }
  }

  async function weiter() {
    if (!schritt || zustand.speichert) return

    const vorbereitet = beginneWeiter(zustand, schritt)
    if (vorbereitet.art === 'unvollstaendig') {
      setZustand(vorbereitet.zustand)
      return
    }

    setZustand(vorbereitet.zustand)
    if (!await fuehreAus(vorbereitet.auftrag)) return

    const nachher = zustandNachSpeichern(vorbereitet.zustand, { ok: true })
    setZustand(nachher)

    if (nachher.fertig) {
      try {
        await onAbschluss()
      } catch (err) {
        setZustand(z => ({
          ...z,
          fertig: false,
          fehler: err instanceof Error ? err.message : 'Der Abschluss hat nicht geklappt.',
        }))
      }
    }
  }

  async function spaeter() {
    if (!schritt || zustand.speichert) return
    setZustand(z => ({ ...z, speichert: true, fehler: null }))
    // Ohne Prüfung: wer aussteigen will, soll nicht erst ein Formular
    // vervollständigen müssen — sonst steigt er ungespeichert aus.
    const ok = await fuehreAus(auftragFuerSpaeter(zustand, schritt))
    setZustand(z => ({ ...z, speichert: false }))
    if (ok) await onSpaeter?.(baueAbbruchstelle(zustand, schritt))
  }

  const maske = useMemo(
    () => (schritt ? masken[schritt.schluessel] : undefined),
    [schritt, masken],
  )

  if (zustand.fertig) {
    return (
      <div style={huelle}>
        <Karte titel="Geschafft">
          {abschlussInhalt ?? (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
              Vielen Dank — Ihre Angaben sind bei uns eingegangen. Wir melden uns bei Ihnen.
            </p>
          )}
        </Karte>
      </div>
    )
  }

  if (!schritt) return null

  return (
    <div style={huelle}>
      {/* Fortschritt zuerst: „wie viel noch?" ist die erste Frage. */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 13, marginBottom: 6, color: 'var(--ink4)',
        }}>
          <span>{schrittBeschriftung(zustand.aktuellerSchritt, zustand.gesamtSchritte)}</span>
          <span>{prozent}&nbsp;%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={prozent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={schrittBeschriftung(zustand.aktuellerSchritt, zustand.gesamtSchritte)}
          style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}
        >
          <div style={{
            height: '100%', width: `${prozent}%`, background: 'var(--gold, #C9963C)',
            transition: 'width .3s ease',
          }} />
        </div>
      </div>

      <Karte titel={schritt.titel}>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5, color: 'var(--ink4)' }}>
          {schritt.hinweis}
        </p>

        {maske?.({
          daten: zustand.daten[schritt.schluessel] ?? {},
          setzeDaten,
          fehlendePflicht: zustand.fehlendePflicht,
          disabled: zustand.speichert,
          alleDaten: zustand.daten,
          geheZuSchritt: n => setZustand(z => springeZu(z, n)),
        })}

        {zustand.fehler && (
          // aria-live: Vorlesesoftware meldet den Fehler, ohne dass der
          // Fokus springt.
          <p role="alert" aria-live="polite" style={{
            margin: '16px 0 0', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(180,40,40,.12)', color: '#B42828', fontSize: 14,
          }}>
            {zustand.fehler}
          </p>
        )}
      </Karte>

      {/* Knöpfe: der Hauptweg zuerst und über die volle Breite — auf dem
          Telefon ist er damit unter dem Daumen. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={weiter}
          disabled={zustand.speichert}
          style={{ ...pflegePrimaryBtn, ...grosserKnopf, opacity: zustand.speichert ? 0.6 : 1 }}
        >
          {zustand.speichert
            ? 'Wird gespeichert …'
            : weiterBeschriftung(zustand.aktuellerSchritt, zustand.gesamtSchritte)}
        </button>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {zustand.aktuellerSchritt > 1 && (
            <button
              type="button"
              onClick={() => setZustand(zurueckLogik)}
              disabled={zustand.speichert}
              style={{ ...pflegeSecondaryBtn, ...grosserKnopf, flex: '1 1 120px' }}
            >
              Zurück
            </button>
          )}
          <button
            type="button"
            onClick={spaeter}
            disabled={zustand.speichert}
            style={{ ...pflegeSecondaryBtn, ...grosserKnopf, flex: '1 1 160px' }}
          >
            Später fortsetzen
          </button>
        </div>

        {onHilfe && (
          <button
            type="button"
            onClick={onHilfe}
            style={{
              ...pflegeSecondaryBtn, ...grosserKnopf,
              background: 'transparent', textDecoration: 'underline',
            }}
          >
            Ich brauche Hilfe
          </button>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 13, lineHeight: 1.5, color: 'var(--ink5)' }}>
        Ihre Angaben werden bei jedem Schritt gespeichert. Sie können jederzeit
        pausieren und später weitermachen.
      </p>
    </div>
  )
}

const huelle = {
  maxWidth: 560,
  margin: '0 auto',
  padding: 16,
} as const

/** Mindestens 52 px hoch — sichere Tippfläche auch für unruhige Hände. */
const grosserKnopf = {
  minHeight: 52,
  fontSize: 16,
  borderRadius: 12,
  width: '100%',
} as const
