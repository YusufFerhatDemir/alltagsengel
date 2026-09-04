'use client'
/**
 * Bewerbung als Alltagsbegleiterin oder Alltagsbegleiter — 12 Schritte.
 *
 * ── WARUM HIER EINE ANMELDUNG NÖTIG IST ────────────────────────────────
 * onboarding_progress.user_id zeigt auf profiles — ein Fortschritt ohne
 * Konto lässt sich also gar nicht speichern. Genau das ist aber der Kern
 * dieses Ablaufs: „später fortsetzen" braucht jemanden, dem der Stand
 * gehört. Wer noch kein Konto hat, wird deshalb zur Registrierung
 * geschickt und kommt danach hierher zurück.
 *
 * ── DIE SEITE ENTSCHEIDET NICHTS ───────────────────────────────────────
 * Prüfen, Weiterschalten und Fehlerbehandlung stecken in
 * lib/onboarding/wizard-logik.ts und sind dort getestet. Hier wird nur
 * geladen, gerendert und weitergereicht.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Wizard, { type WizardMaskeProps } from '@/components/onboarding/Wizard'
import {
  Schritt01Willkommen, Schritt02Person, Schritt03Einsatzgebiet,
  Schritt04Qualifikation, Schritt05Fuehrerschein, Schritt06Sprachen,
  Schritt07Verfuegbarkeit, Schritt08Stundenumfang, Schritt09Fuehrungszeugnis,
  Schritt10Unterlagen, Schritt11Zusammenfassung, Schritt12Absenden,
} from '@/components/onboarding/bewerber'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'
import type { SpeicherAuftrag } from '@/lib/onboarding/wizard-logik'
import { logger } from '@/lib/logger'

const log = logger.child('onboarding:bewerber')

interface GeladenerStand {
  aktuellerSchritt: number
  schritteDaten: Record<string, { daten?: Record<string, unknown> }>
}

export default function BewerberOnboardingSeite() {
  const router = useRouter()
  const [stand, setStand] = useState<GeladenerStand | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const antwort = await fetch('/api/onboarding/fortschritt?typ=bewerber')
        if (antwort.status === 401) {
          // Ohne Konto gibt es keinen Stand zum Fortsetzen — siehe Kopf.
          router.replace('/engel/register?weiter=/onboarding/bewerber')
          return
        }
        const daten = await antwort.json()
        if (abgebrochen) return
        if (!antwort.ok) {
          setLadefehler(daten?.error ?? 'Ihr Stand konnte nicht geladen werden.')
          return
        }
        setStand({
          aktuellerSchritt: Number(daten.fortschritt?.aktuellerSchritt ?? 1),
          schritteDaten: daten.fortschritt?.schritteDaten ?? {},
        })
      } catch (err) {
        log.errorWithException('Fortschritt laden', err)
        if (!abgebrochen) setLadefehler('Ihr Stand konnte nicht geladen werden.')
      }
    }
    void laden()
    return () => { abgebrochen = true }
  }, [router])

  const speichern = useCallback(async (auftrag: SpeicherAuftrag) => {
    const antwort = await fetch('/api/onboarding/fortschritt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typ: 'bewerber', ...auftrag }),
    })
    if (!antwort.ok) {
      const fehler = await antwort.json().catch(() => null)
      // Wirft bewusst: der Wizard bleibt dann auf dem Schritt stehen und
      // behält die Eingaben.
      throw new Error(fehler?.error ?? 'Das Speichern hat nicht geklappt.')
    }
  }, [])

  const hochladen = useCallback(async (art: string, datei: File): Promise<string> => {
    const formular = new FormData()
    formular.append('typ', 'bewerber')
    formular.append('art', art)
    formular.append('datei', datei)
    const antwort = await fetch('/api/onboarding/dokumente', { method: 'POST', body: formular })
    const daten = await antwort.json().catch(() => null)
    if (!antwort.ok) throw new Error(daten?.error ?? 'Das Hochladen hat nicht geklappt.')
    return String(daten?.dateiname ?? datei.name)
  }, [])

  const abschluss = useCallback(async () => {
    const antwort = await fetch('/api/onboarding/absenden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typ: 'bewerber' }),
    })
    if (!antwort.ok) {
      const fehler = await antwort.json().catch(() => null)
      throw new Error(fehler?.error ?? 'Das Absenden hat nicht geklappt.')
    }
  }, [])

  const spaeter = useCallback(async (stelle: string) => {
    try {
      await fetch('/api/onboarding/fortschritt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ: 'bewerber', abbruchstelle: stelle }),
      })
    } catch (err) {
      // Der Stand ist bereits gespeichert; die Abbruchmarke ist nur für
      // die Auswertung. Ihr Fehlen darf niemanden aufhalten.
      log.errorWithException('Abbruchstelle merken', err)
    }
    router.push('/engel/home')
  }, [router])

  if (ladefehler) {
    return (
      <main style={huelle}>
        <p role="alert" style={fehlerStil}>{ladefehler}</p>
      </main>
    )
  }

  if (!stand) {
    return (
      <main style={huelle}>
        <p style={{ color: 'var(--ink4)' }}>Ihr Stand wird geladen …</p>
      </main>
    )
  }

  // Bereits gegebene Antworten in die Form bringen, die der Wizard hält.
  const anfangsDaten: Record<string, Record<string, unknown>> = {}
  for (const [schluessel, eintrag] of Object.entries(stand.schritteDaten)) {
    anfangsDaten[schluessel] = eintrag?.daten ?? {}
  }

  const masken: Record<string, (p: WizardMaskeProps) => React.ReactNode> = {
    willkommen: () => <Schritt01Willkommen />,
    kontakt: p => <Schritt02Person {...p} />,
    einsatzgebiet: p => <Schritt03Einsatzgebiet {...p} />,
    erfahrung: p => <Schritt04Qualifikation {...p} />,
    fuehrerschein: p => <Schritt05Fuehrerschein {...p} />,
    sprachen: p => <Schritt06Sprachen {...p} />,
    verfuegbarkeit: p => <Schritt07Verfuegbarkeit {...p} />,
    stundenumfang: p => <Schritt08Stundenumfang {...p} />,
    fuehrungszeugnis: p => <Schritt09Fuehrungszeugnis {...p} />,
    unterlagen: p => <Schritt10Unterlagen {...p} onUpload={hochladen} />,
    zusammenfassung: p => <Schritt11Zusammenfassung {...p} />,
    absenden: p => <Schritt12Absenden {...p} />,
  }

  return (
    <main style={huelle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '8px 0 0' }}>
        Ihre Bewerbung bei Alltagsengel
      </h1>
      <Wizard
        schritte={SCHRITTFOLGEN.bewerber}
        masken={masken}
        startSchritt={stand.aktuellerSchritt}
        anfangsDaten={anfangsDaten}
        onSpeichern={speichern}
        onAbschluss={abschluss}
        onSpaeter={spaeter}
        onHilfe={() => router.push('/kontakt?anliegen=bewerbung')}
        abschlussInhalt={
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              Vielen Dank — Ihre Bewerbung ist bei uns eingegangen.
            </p>
            <p style={{ marginBottom: 0, color: 'var(--ink4)' }}>
              Wir sehen sie uns an und melden uns innerhalb weniger Tage bei Ihnen.
              Sie müssen dafür nichts weiter tun.
            </p>
          </div>
        }
      />
    </main>
  )
}

const huelle = { maxWidth: 640, margin: '0 auto', padding: '16px 8px 48px' } as const
const fehlerStil = {
  margin: 16, padding: '12px 14px', borderRadius: 10,
  background: 'rgba(180,40,40,.10)', color: '#B42828', fontSize: 14,
} as const
