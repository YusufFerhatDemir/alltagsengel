'use client'
/**
 * Unterstützung anfragen — 10 Schritte.
 *
 * Gleiche Bauweise wie der Bewerberablauf: die Seite lädt, rendert und
 * reicht weiter; jede Regel steckt in lib/onboarding/wizard-logik.ts und
 * ist dort getestet. Auch hier ist eine Anmeldung nötig, weil
 * onboarding_progress.user_id auf profiles zeigt — ohne Konto gibt es
 * keinen Stand, den man später fortsetzen könnte.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Wizard, { type WizardMaskeProps } from '@/components/onboarding/Wizard'
import {
  Schritt01FuerWen, Schritt02Adresse, Schritt03Bedarf, Schritt04Pflegegrad,
  Schritt05Finanzierung, Schritt06Zeiten, Schritt07Besonderheiten,
  Schritt08Unterlagen, Schritt09Zusammenfassung, Schritt10Abschluss,
} from '@/components/onboarding/kunde'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'
import type { SpeicherAuftrag } from '@/lib/onboarding/wizard-logik'
import { logger } from '@/lib/logger'

const log = logger.child('onboarding:kunde')

interface GeladenerStand {
  aktuellerSchritt: number
  schritteDaten: Record<string, { daten?: Record<string, unknown> }>
}

export default function KundenOnboardingSeite() {
  const router = useRouter()
  const [stand, setStand] = useState<GeladenerStand | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const antwort = await fetch('/api/onboarding/fortschritt?typ=kunde')
        if (antwort.status === 401) {
          router.replace('/auth/register?redirectTo=/onboarding/kunde')
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
      body: JSON.stringify({ typ: 'kunde', ...auftrag }),
    })
    if (!antwort.ok) {
      const fehler = await antwort.json().catch(() => null)
      throw new Error(fehler?.error ?? 'Das Speichern hat nicht geklappt.')
    }
  }, [])

  const hochladen = useCallback(async (art: string, datei: File): Promise<string> => {
    const formular = new FormData()
    formular.append('typ', 'kunde')
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
      body: JSON.stringify({ typ: 'kunde' }),
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
        body: JSON.stringify({ typ: 'kunde', abbruchstelle: stelle }),
      })
    } catch (err) {
      log.errorWithException('Abbruchstelle merken', err)
    }
    router.push('/kunde/home')
  }, [router])

  if (ladefehler) {
    return <main style={huelle}><p role="alert" style={fehlerStil}>{ladefehler}</p></main>
  }
  if (!stand) {
    return <main style={huelle}><p style={{ color: 'var(--ink4)' }}>Ihr Stand wird geladen …</p></main>
  }

  const anfangsDaten: Record<string, Record<string, unknown>> = {}
  for (const [schluessel, eintrag] of Object.entries(stand.schritteDaten)) {
    anfangsDaten[schluessel] = eintrag?.daten ?? {}
  }

  const masken: Record<string, (p: WizardMaskeProps) => React.ReactNode> = {
    fuer_wen: p => <Schritt01FuerWen {...p} />,
    adresse: p => <Schritt02Adresse {...p} />,
    bedarf: p => <Schritt03Bedarf {...p} />,
    pflegegrad: p => <Schritt04Pflegegrad {...p} />,
    finanzierung: p => <Schritt05Finanzierung {...p} />,
    zeiten: p => <Schritt06Zeiten {...p} />,
    besonderheiten: p => <Schritt07Besonderheiten {...p} />,
    unterlagen: p => <Schritt08Unterlagen {...p} onUpload={hochladen} />,
    zusammenfassung: p => <Schritt09Zusammenfassung {...p} />,
    abschluss: p => <Schritt10Abschluss {...p} />,
  }

  return (
    <main style={huelle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '8px 0 0' }}>
        Unterstützung im Alltag anfragen
      </h1>
      <Wizard
        schritte={SCHRITTFOLGEN.kunde}
        masken={masken}
        startSchritt={stand.aktuellerSchritt}
        anfangsDaten={anfangsDaten}
        onSpeichern={speichern}
        onAbschluss={abschluss}
        onSpaeter={spaeter}
        onHilfe={() => router.push('/kontakt?anliegen=unterstuetzung')}
        abschlussInhalt={
          <div style={{ fontSize: 15, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>Vielen Dank — Ihre Anfrage ist bei uns eingegangen.</p>
            <p style={{ marginBottom: 0, color: 'var(--ink4)' }}>
              Wir sehen sie uns an und melden uns innerhalb weniger Tage bei Ihnen.
              Die Anfrage ist unverbindlich und kostenfrei.
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
