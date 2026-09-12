'use client'
import { useEffect, useState } from 'react'
import { utmAusBrowser, UTM_LEER, type UtmWerte } from '@/lib/marketing/utm'

/**
 * Kampagnen-Herkunft für Formulare.
 *
 * Erst nach dem Mounten gelesen: `window` gibt es beim Server-Rendern nicht,
 * und ein Wert aus dem Speicher würde die Hydration auseinanderlaufen lassen.
 */
export function useUtm(): UtmWerte {
  const [werte, setWerte] = useState<UtmWerte>(UTM_LEER)
  useEffect(() => { setWerte(utmAusBrowser()) }, [])
  return werte
}
