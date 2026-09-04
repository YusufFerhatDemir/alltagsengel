'use client'
/**
 * Cookie-Einwilligung — Banner und Einstellungen
 *
 * ── WAS SICH GEGENÜBER DEM VORHERIGEN STAND GEÄNDERT HAT ───────────────
 * 1. DREI KATEGORIEN, EINZELN WÄHLBAR. Vorher kannte der Banner nur
 *    „alles" oder „nichts"; der Aufklapptext beschrieb bereits drei
 *    Kategorien, wählbar waren sie nicht. Wer der Reichweitenmessung
 *    zustimmen wollte, aber nicht dem Retargeting, musste alles ablehnen.
 * 2. GLEICHE PROMINENZ. „Alle akzeptieren" trug einen Goldverlauf mit
 *    Schatten, fetterer Schrift und mehr Innenabstand, „Nur Notwendige"
 *    war ein blasser Umriss mit 70 % Deckkraft. Eine Einwilligung, die
 *    über eine gestalterische Schieflage zustande kommt, ist keine
 *    freiwillige (Art. 4 Nr. 11 DSGVO). Beide Knöpfe sind jetzt
 *    baugleich — gleiche Größe, gleiches Gewicht, gleicher Kontrast.
 * 3. DER BANNER VERDECKT NICHTS MEHR DAUERHAFT. Er lag als
 *    `position: fixed` über jeder Seite und hat auf schmalen Geräten die
 *    Absende-Knöpfe darunter verdeckt. Jetzt schiebt er den Seiteninhalt
 *    über eine CSS-Variable nach oben, statt ihn zu überdecken.
 *
 * Die Entscheidungslogik selbst steht in lib/consent/kategorien.ts und
 * ist dort geprüft — diese Datei zeigt an und speichert.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CONSENT_SCHLUESSEL, KATEGORIE_TEXT, alleAkzeptiert, auswahl, lies, nurNotwendig,
  schreibe, gtagEinwilligung, type ConsentZustand,
} from '@/lib/consent/kategorien'

// Die globale gtag-Deklaration steht bereits in lib/tracking.ts. Sie hier
// mit abweichender Signatur zu wiederholen, waere ein TS2717 — deshalb
// wird sie importiert statt neu erklaert.
/** Der gespeicherte Zustand. `null` = noch nicht entschieden. */
export function getConsentZustand(): ConsentZustand | null {
  if (typeof window === 'undefined') return null
  try {
    return lies(localStorage.getItem(CONSENT_SCHLUESSEL))
  } catch {
    // Privater Modus oder blockierter Speicher: gilt als „nicht entschieden".
    return null
  }
}

/**
 * Alte Schnittstelle, damit bestehende Aufrufer nicht brechen.
 * Neuer Code fragt `darf(getConsentZustand(), 'marketing')` — die Frage
 * „alles oder nichts?" gibt es nicht mehr.
 *
 * @deprecated Kategorie prüfen statt Gesamtzustand.
 */
export function getCookieConsent(): 'accepted' | 'rejected' | null {
  const zustand = getConsentZustand()
  if (!zustand) return null
  return zustand.statistik && zustand.marketing ? 'accepted' : 'rejected'
}

/** Öffnet die Einstellungen erneut — „Cookie-Einstellungen" im Footer. */
export function openCookieSettings() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('ae_open_cookie_settings'))
}

/** Speichert und meldet die Änderung an alle Tracking-Komponenten. */
function uebernehmen(zustand: ConsentZustand) {
  try {
    localStorage.setItem(CONSENT_SCHLUESSEL, schreibe(zustand))
  } catch {
    // Kein Speicher: die Entscheidung gilt für diese Sitzung, der Banner
    // kommt beim nächsten Besuch wieder. Besser als ein harter Fehler.
  }
  window.dispatchEvent(new CustomEvent('ae_consent_change', { detail: zustand }))
  const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
  if (typeof gtag === 'function') {
    gtag('consent', 'update', gtagEinwilligung(zustand))
  }
}

const GOLD = '#C9963C'
const HELL = '#F7F2EA'

export default function CookieConsent() {
  const [sichtbar, setSichtbar] = useState(false)
  const [detailsOffen, setDetailsOffen] = useState(false)
  const [statistik, setStatistik] = useState(false)
  const [marketing, setMarketing] = useState(false)

  useEffect(() => {
    const vorhanden = getConsentZustand()
    let uhr: ReturnType<typeof setTimeout> | undefined
    if (!vorhanden) {
      // Kurze Verzögerung, damit der Banner beim Laden nicht aufblitzt.
      uhr = setTimeout(() => setSichtbar(true), 800)
    }

    const oeffnen = () => {
      // Beim erneuten Öffnen die bisherige Wahl vorbelegen — sonst sieht
      // es aus, als sei nie etwas eingestellt worden.
      const stand = getConsentZustand()
      setStatistik(stand?.statistik === true)
      setMarketing(stand?.marketing === true)
      setDetailsOffen(true)
      setSichtbar(true)
    }
    window.addEventListener('ae_open_cookie_settings', oeffnen)
    return () => {
      if (uhr) clearTimeout(uhr)
      window.removeEventListener('ae_open_cookie_settings', oeffnen)
    }
  }, [])

  // Der Banner schiebt den Seiteninhalt hoch, statt ihn zu überdecken.
  // Ohne das lagen auf schmalen Geräten Absende-Knöpfe darunter.
  useEffect(() => {
    const wurzel = document.documentElement
    if (sichtbar) wurzel.style.setProperty('--ae-consent-hoehe', detailsOffen ? '420px' : '190px')
    else wurzel.style.removeProperty('--ae-consent-hoehe')
    return () => { wurzel.style.removeProperty('--ae-consent-hoehe') }
  }, [sichtbar, detailsOffen])

  const schliessen = useCallback((zustand: ConsentZustand) => {
    uebernehmen(zustand)
    setSichtbar(false)
    setDetailsOffen(false)
  }, [])

  if (!sichtbar) return null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie-Einstellungen"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99999,
        background: 'linear-gradient(135deg, #1E1B17 0%, #252119 100%)',
        borderTop: `1px solid ${GOLD}4D`,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        maxHeight: '85vh', overflowY: 'auto',
        fontFamily: "'Jost', sans-serif",
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1, marginTop: 2 }}>🍪</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 600, color: HELL }}>
              Ihre Cookie-Einstellungen
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: HELL }}>
              Wir verwenden notwendige Cookies für den Betrieb der Website. Für
              Statistik und Marketing fragen wir Sie vorher — Sie entscheiden,
              was Sie erlauben, und können das jederzeit ändern.
            </p>
          </div>
        </div>

        {detailsOffen && (
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <Zeile art="notwendig" an disabled />
            <Zeile art="statistik" an={statistik} onChange={setStatistik} />
            <Zeile art="marketing" an={marketing} onChange={setMarketing} />
            <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.6, color: `${HELL}B3` }}>
              Sie können Ihre Auswahl jederzeit über „Cookie-Einstellungen" im
              Fußbereich ändern. Einzelheiten stehen in unserer{' '}
              <a href="/datenschutz" style={{ color: GOLD, textDecoration: 'underline' }}>
                Datenschutzerklärung
              </a>.
            </p>
          </div>
        )}

        {/* Beide Hauptknöpfe sind BAUGLEICH — siehe Kopf. Die Reihenfolge
            stellt das Ablehnen sogar zuerst; keiner der beiden ist
            hervorgehoben, keiner vorausgewählt. */}
        <div style={{
          marginTop: 16,
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}>
          <button type="button" style={hauptKnopf} onClick={() => schliessen(nurNotwendig())}>
            Nur notwendige
          </button>
          <button type="button" style={hauptKnopf} onClick={() => schliessen(alleAkzeptiert())}>
            Alle akzeptieren
          </button>
        </div>

        <div style={{
          marginTop: 8,
          display: 'grid',
          gap: 8,
          gridTemplateColumns: detailsOffen ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
        }}>
          <button
            type="button"
            style={nebenKnopf}
            onClick={() => setDetailsOffen(o => !o)}
            aria-expanded={detailsOffen}
          >
            {detailsOffen ? 'Einstellungen ausblenden' : 'Einstellungen anpassen'}
          </button>
          {detailsOffen && (
            <button
              type="button"
              style={nebenKnopf}
              onClick={() => schliessen(auswahl({ statistik, marketing }))}
            >
              Auswahl speichern
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Eine Kategorie mit Schalter.
 *
 * Der Titel steht als DIREKTES Kind des <label>. Vorher lag er zwei
 * Ebenen tief in verschachtelten <span>, und dann findet weder die
 * eslint-Regel label-has-associated-control noch — was mehr zählt —
 * Vorlesesoftware verlässlich den Beschriftungstext.
 */
function Zeile({ art, an, onChange, disabled }: {
  art: keyof typeof KATEGORIE_TEXT
  an: boolean
  onChange?: (an: boolean) => void
  disabled?: boolean
}) {
  const text = KATEGORIE_TEXT[art]
  const id = `ae-consent-${art}`
  const beschreibungId = `${id}-beschreibung`

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      border: `1px solid ${GOLD}${an ? '4D' : '1F'}`,
      background: an ? `${GOLD}14` : 'transparent',
    }}>
      <label
        htmlFor={id}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          minHeight: 24, fontSize: 14, fontWeight: 600, color: HELL,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <input
          id={id}
          type="checkbox"
          checked={an}
          disabled={disabled}
          aria-describedby={beschreibungId}
          onChange={e => onChange?.(e.target.checked)}
          style={{ width: 20, height: 20, flexShrink: 0, accentColor: GOLD }}
        />
        {text.titel}
        {disabled && <span style={{ fontWeight: 400, color: `${HELL}99` }}>· immer aktiv</span>}
      </label>

      <div id={beschreibungId} style={{ marginLeft: 32, marginTop: 4 }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: `${HELL}B3` }}>
          {text.kurz}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: `${HELL}80` }}>
          Dienste: {text.dienste}
        </p>
      </div>
    </div>
  )
}

/**
 * Ein Stil für BEIDE Hauptknöpfe. Bewusst eine einzige Konstante: zwei
 * getrennte Stile driften auseinander, und genau daraus entsteht die
 * Schieflage, die diese Änderung beseitigt hat.
 */
const hauptKnopf = {
  minHeight: 48,
  padding: '12px 20px',
  borderRadius: 10,
  border: `1px solid ${GOLD}`,
  background: 'transparent',
  color: HELL,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Jost', sans-serif",
  width: '100%',
} as const

const nebenKnopf = {
  ...hauptKnopf,
  fontSize: 14,
  fontWeight: 500,
  border: `1px solid ${GOLD}40`,
  color: `${HELL}CC`,
} as const
