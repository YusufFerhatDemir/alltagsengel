'use client'
/**
 * Fortschrittskarte fürs Dashboard — lädt den Stand selbst.
 *
 * ── LEGT NICHTS AN ─────────────────────────────────────────────────────
 * Ruft die Route mit `anlegen=0`. Eine Karte auf dem Dashboard darf
 * keinen Ablauf erzeugen: sonst hätte jeder Besucher einen begonnenen
 * Ablauf, den er nie angefangen hat — der Erinnerungslauf schriebe ihn an
 * und die Betriebssicht zählte ihn als offen.
 *
 * ── VERSCHWINDET STILL ─────────────────────────────────────────────────
 * Gibt es keinen Ablauf, ist er abgeschlossen oder lässt er sich nicht
 * laden, rendert die Karte NICHTS. Eine Fehlermeldung auf dem Dashboard
 * über etwas, das die Person gar nicht angefangen hat, wäre nur
 * verwirrend — der Ablauf selbst zeigt Fehler dort, wo sie hingehören.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import FortschrittsKarte from './FortschrittsKarte'
import { baueAnleitung, type Anleitung } from '@/lib/onboarding/anleitung'
import type { OnboardingTyp } from '@/lib/onboarding/schritte'
import { logger } from '@/lib/logger'

const log = logger.child('onboarding:karte')

export default function FortschrittsKarteGeladen({ typ }: { typ: OnboardingTyp }) {
  const router = useRouter()
  const [anleitung, setAnleitung] = useState<Anleitung | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      try {
        const antwort = await fetch(`/api/onboarding/fortschritt?typ=${typ}&anlegen=0`)
        if (!antwort.ok) return
        const daten = await antwort.json()
        const fortschritt = daten?.fortschritt
        if (abgebrochen || !fortschritt || fortschritt.abgeschlossenAm) return
        setAnleitung(baueAnleitung({
          typ,
          schritteDaten: fortschritt.schritteDaten ?? {},
          abgeschlossenAm: fortschritt.abgeschlossenAm ?? null,
        }))
      } catch (err) {
        // Still: siehe Kopf.
        log.errorWithException('Fortschrittskarte laden', err)
      }
    }
    void laden()
    return () => { abgebrochen = true }
  }, [typ])

  if (!anleitung) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <FortschrittsKarte
        anleitung={anleitung}
        onWeitermachen={() => router.push(`/onboarding/${typ}`)}
      />
    </div>
  )
}
