'use client'

// Client-Helfer für alle PflegeCoach-Seiten: API-Aufrufe + Profil-Guard.

import { useEffect, useState } from 'react'
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

/** JSON-Fetch mit einheitlicher Fehlerbehandlung. */
export async function coachApi<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const daten = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new CoachApiError(daten.error || `Fehler (${res.status})`, res.status, daten.code)
  }
  return daten as T
}

/**
 * Lädt das PflegeCoach-Profil. Ohne Anmeldung → Login (mit Rücksprung),
 * ohne Profil → Onboarding (/pflegecoach/start).
 */
export function useCoachProfil() {
  const router = useRouter()
  const [profil, setProfil] = useState<CoachUser | null>(null)
  const [laden, setLaden] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    coachApi<{ profil: CoachUser | null }>('/api/coach/profil')
      .then(({ profil }) => {
        if (!aktiv) return
        if (!profil) {
          router.push('/pflegecoach/start')
          return
        }
        setProfil(profil)
        setLaden(false)
      })
      .catch((e: CoachApiError) => {
        if (!aktiv) return
        if (e.status === 401) {
          router.push('/auth/login?redirectTo=' + encodeURIComponent('/pflegecoach'))
          return
        }
        setFehler(e.message)
        setLaden(false)
      })
    return () => { aktiv = false }
  }, [router])

  return { profil, laden, fehler }
}

export function heuteIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** JS-Wochentag → ISO (1=Mo…7=So) */
export function isoWochentag(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay()
}

export const WOCHENTAG_LABELS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
