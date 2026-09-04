'use client'
/**
 * Zugang als angehörige Person — 6 Schritte.
 *
 * Gleiche Bauweise wie die beiden anderen Abläufe. Der Unterschied steht
 * im letzten Schritt: dieser Ablauf ERTEILT KEINEN ZUGANG. Er sammelt,
 * was für eine Freigabe gebraucht wird; freigegeben wird von der
 * betreuten Person oder der Verwaltung.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Wizard, { type WizardMaskeProps } from '@/components/onboarding/Wizard'
import OnboardingAssistent from '@/components/onboarding/OnboardingAssistent'
import {
  SchrittAbschluss, SchrittBezug, SchrittKontakt, SchrittUmfang,
  SchrittUnterlagen, SchrittZusammenfassung,
} from '@/components/onboarding/angehoerige'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'
import type { SpeicherAuftrag } from '@/lib/onboarding/wizard-logik'
import { logger } from '@/lib/logger'

const log = logger.child('onboarding:angehoerige')

interface Stand {
  aktuellerSchritt: number
  schritteDaten: Record<string, { daten?: Record<string, unknown>; status?: string }>
  fehlendeAngaben: string[]
  dokumentStatus: Record<string, unknown>
  abgeschlossenAm: string | null
}

export default function AngehoerigenOnboardingSeite() {
  const router = useRouter()
  const [stand, setStand] = useState<Stand | null>(null)
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [sprung, setSprung] = useState<number | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const antwort = await fetch('/api/onboarding/fortschritt?typ=angehoerige')
        if (antwort.status === 401) {
          router.replace('/auth/register?redirectTo=/onboarding/angehoerige')
          return
        }
        const daten = await antwort.json()
        if (abgebrochen) return
        if (!antwort.ok) {
          setLadefehler(daten?.error ?? 'Ihr Stand konnte nicht geladen werden.')
          return
        }
        const f = daten.fortschritt ?? {}
        setStand({
          aktuellerSchritt: Number(f.aktuellerSchritt ?? 1),
          schritteDaten: f.schritteDaten ?? {},
          fehlendeAngaben: f.fehlendeAngaben ?? [],
          dokumentStatus: f.dokumentStatus ?? {},
          abgeschlossenAm: f.abgeschlossenAm ?? null,
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
      body: JSON.stringify({ typ: 'angehoerige', ...auftrag }),
    })
    if (!antwort.ok) {
      const fehler = await antwort.json().catch(() => null)
      throw new Error(fehler?.error ?? 'Das Speichern hat nicht geklappt.')
    }
  }, [])

  const hochladen = useCallback(async (art: string, datei: File): Promise<string> => {
    const formular = new FormData()
    formular.append('typ', 'angehoerige')
    formular.append('art', art)
    formular.append('datei', datei)
    const antwort = await fetch('/api/onboarding/dokumente', { method: 'POST', body: formular })
    const daten = await antwort.json().catch(() => null)
    if (!antwort.ok) throw new Error(daten?.error ?? 'Das Hochladen hat nicht geklappt.')
    return String(daten?.dateiname ?? datei.name)
  }, [])

  // Dieser Ablauf reicht nichts ein — er endet mit dem Abschluss.
  // /api/onboarding/absenden weist 'angehoerige' bewusst ab.
  const abschluss = useCallback(async () => {
    await speichern({
      schritt: SCHRITTFOLGEN.angehoerige.length,
      schluessel: 'abschluss',
      daten: { abgesendet: true },
      status: 'fertig',
    })
  }, [speichern])

  const spaeter = useCallback(async (stelle: string) => {
    try {
      await fetch('/api/onboarding/fortschritt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ typ: 'angehoerige', abbruchstelle: stelle }),
      })
    } catch (err) {
      log.errorWithException('Abbruchstelle merken', err)
    }
    router.push('/angehoerige')
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
    kontakt: p => <SchrittKontakt {...p} />,
    bezug: p => <SchrittBezug {...p} />,
    umfang: p => <SchrittUmfang {...p} />,
    unterlagen: p => <SchrittUnterlagen {...p} onUpload={hochladen} />,
    zusammenfassung: p => <SchrittZusammenfassung {...p} />,
    abschluss: () => <SchrittAbschluss />,
  }

  return (
    <main style={huelle}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '8px 0 0' }}>
        Zugang als angehörige Person
      </h1>
      <Wizard
        key={sprung ?? 'start'}
        schritte={SCHRITTFOLGEN.angehoerige}
        masken={masken}
        startSchritt={sprung ?? stand.aktuellerSchritt}
        anfangsDaten={anfangsDaten}
        onSpeichern={speichern}
        onAbschluss={abschluss}
        onSpaeter={spaeter}
        onHilfe={() => router.push('/kontakt?anliegen=angehoerige')}
        abschlussInhalt={<SchrittAbschluss />}
      />

      <OnboardingAssistent
        lage={{
          typ: 'angehoerige',
          aktuellerSchritt: stand.aktuellerSchritt,
          gesamtSchritte: SCHRITTFOLGEN.angehoerige.length,
          schritteDaten: stand.schritteDaten as never,
          fehlendeAngaben: stand.fehlendeAngaben,
          dokumentStatus: stand.dokumentStatus,
          abgeschlossenAm: stand.abgeschlossenAm,
        }}
        onGeheZuSchritt={setSprung}
        onOeffneAblauf={typ => router.push(`/onboarding/${typ}`)}
        onMensch={() => router.push('/kontakt?anliegen=angehoerige')}
      />
    </main>
  )
}

const huelle = { maxWidth: 640, margin: '0 auto', padding: '16px 8px 96px' } as const
const fehlerStil = {
  margin: 16, padding: '12px 14px', borderRadius: 10,
  background: 'rgba(180,40,40,.10)', color: '#B42828', fontSize: 14,
} as const
