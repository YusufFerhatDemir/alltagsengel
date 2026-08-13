'use client'

import { heuteBerlin } from '@/lib/utils/timezone';
// Client-Helfer für alle PflegeCoach-Seiten: API-Aufrufe + Profil-Guard.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CoachUser } from '@/lib/coach/types'

export class CoachApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Verbindungsabbruch: `fetch` wirft, es gibt keinen HTTP-Status. */
export const OFFLINE_CODE = 'OFFLINE'

export const OFFLINE_TEXT =
  'Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut. ' +
  'Ihre bereits gespeicherten Daten bleiben erhalten.'

/**
 * JSON-Fetch mit einheitlicher Fehlerbehandlung.
 *
 * Drei Fehlerarten, alle als CoachApiError mit deutschem Text:
 *  * Verbindungsabbruch (`fetch` wirft) → status 0, code OFFLINE. Ohne diese
 *    Übersetzung landete die Browser-Meldung „Failed to fetch" ungefiltert
 *    in der Oberfläche — englisch und für die Zielgruppe wertlos.
 *  * HTTP-Fehler mit JSON-Körper → Text und Code der API.
 *  * HTTP-Fehler ohne verwertbaren Körper (Proxy-/Gateway-Seiten) → generischer
 *    deutscher Text statt einer leeren Meldung.
 */
export async function coachApi<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new CoachApiError(OFFLINE_TEXT, 0, OFFLINE_CODE)
  }

  const daten = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok) {
    const text = typeof (daten as { error?: unknown }).error === 'string'
      ? (daten as { error: string }).error
      : `Der Server hat mit einem Fehler geantwortet (${res.status}). Bitte später erneut versuchen.`
    throw new CoachApiError(text, res.status, (daten as { code?: string }).code)
  }
  return daten as T
}

export interface CoachProfilStand {
  profil: CoachUser | null
  /** Gilt die Pflicht-Einwilligung (Art. 9) noch? Bei `false` sind neue
   *  Einträge serverseitig gesperrt (lib/coach/consent.ts). */
  einwilligungAktiv: boolean
  laden: boolean
  fehler: string | null
  /** Erneuter Ladeversuch — für die Wiederholen-Schaltfläche bei Netzfehlern. */
  neuLaden: () => void
}

/**
 * Lädt das PflegeCoach-Profil.
 * Ohne Anmeldung UND ohne Profil → /pflegecoach/start. Diese Seite ist der
 * einzige Einstieg: sie zeigt Nicht-Angemeldeten die Zweckbestimmung und
 * den Anmeldeweg, statt sie ohne Erklärung auf das Login zu werfen.
 */
export function useCoachProfil(): CoachProfilStand {
  const router = useRouter()
  const [profil, setProfil] = useState<CoachUser | null>(null)
  const [einwilligungAktiv, setEinwilligungAktiv] = useState(true)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [versuch, setVersuch] = useState(0)

  const neuLaden = useCallback(() => {
    setFehler(null)
    setLaden(true)
    setVersuch(v => v + 1)
  }, [])

  useEffect(() => {
    let aktiv = true
    coachApi<{ profil: CoachUser | null; einwilligung_aktiv?: boolean }>('/api/coach/profil')
      .then(({ profil, einwilligung_aktiv }) => {
        if (!aktiv) return
        if (!profil) {
          router.push('/pflegecoach/start')
          return
        }
        setProfil(profil)
        // Fehlt das Feld (ältere Antwort im Cache), nicht sperren — die
        // verbindliche Prüfung passiert ohnehin serverseitig beim Schreiben.
        setEinwilligungAktiv(einwilligung_aktiv !== false)
        setLaden(false)
      })
      .catch((e: CoachApiError) => {
        if (!aktiv) return
        if (e.status === 401) {
          router.push('/pflegecoach/start')
          return
        }
        setFehler(e.message)
        setLaden(false)
      })
    return () => { aktiv = false }
  }, [router, versuch])

  return { profil, einwilligungAktiv, laden, fehler, neuLaden }
}

export function heuteIso(): string {
  return heuteBerlin()
}

/** JS-Wochentag → ISO (1=Mo…7=So) */
export function isoWochentag(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}

export const WOCHENTAG_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
