'use client'
// ═══════════════════════════════════════════════════════════════
// EXPANSION DEUTSCHLAND — Client-Seite
// ═══════════════════════════════════════════════════════════════
// Für 'use client'-Komponenten (Buchungsstrecke, Registrierung).
// Die Entscheidung fällt weiterhin serverseitig — hier wird nur
// das Ergebnis von /api/expansion/status geholt und gecacht.
//
// Bis die Antwort da ist, gilt der Fail-safe-Zustand:
// Kasse aus, Privat aus, Warteliste an. Dadurch kann in keiner
// Millisekunde ein Kassen-Button sichtbar sein, der es nicht sein darf.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import {
  TEXT_KASSE_IM_VERFAHREN,
  type BundeslandCode,
  type ExpansionStatus,
} from './types'

export interface BundeslandLageClient {
  bundesland: BundeslandCode | null
  bundeslandName: string | null
  eindeutig: boolean
  plz: string | null
  status: ExpansionStatus
  werbung: boolean
  registrierung: boolean
  warteliste: boolean
  privatleistungen: boolean
  kassenabrechnung: boolean
  hinweis: string
  goLive: string | null
  ansprechpartner: { name: string | null; email: string | null; telefon: string | null }
}

/** Zustand vor der ersten Antwort bzw. bei Netzwerkfehler. */
export const LADE_LAGE: BundeslandLageClient = {
  bundesland: null,
  bundeslandName: null,
  eindeutig: false,
  plz: null,
  status: 'VORBEREITUNG',
  werbung: true,
  registrierung: true,
  warteliste: true,
  privatleistungen: false,
  kassenabrechnung: false,
  hinweis: TEXT_KASSE_IM_VERFAHREN,
  goLive: null,
  ansprechpartner: { name: null, email: null, telefon: null },
}

// Ein Cache pro Browser-Session — dieselbe PLZ wird in der Buchungsstrecke
// mehrfach abgefragt (Schritt 1, Schritt 4, Zusammenfassung).
const lageCache = new Map<string, BundeslandLageClient>()

export async function ladeBundeslandLage(
  plz: string | null | undefined
): Promise<BundeslandLageClient> {
  const key = String(plz ?? '').match(/\d{5}/)?.[0] ?? ''
  if (!key) return LADE_LAGE

  const gecacht = lageCache.get(key)
  if (gecacht) return gecacht

  try {
    const res = await fetch(`/api/expansion/status?plz=${encodeURIComponent(key)}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return LADE_LAGE
    const lage = (await res.json()) as BundeslandLageClient
    lageCache.set(key, lage)
    return lage
  } catch {
    // Netzwerkfehler → fail-safe, KEINE Kassenleistung anbieten
    return LADE_LAGE
  }
}

/** Cache verwerfen (z. B. nachdem der Admin ein Bundesland freigeschaltet hat). */
export function invalidateLageCache(): void {
  lageCache.clear()
}

/**
 * React-Hook für die Buchungs- und Registrierungsstrecken.
 *
 *   const { lage, laedt } = useBundeslandLage(profil?.postal_code)
 *   if (!lage.kassenabrechnung) { … Button ausgrauen … }
 */
export function useBundeslandLage(plz: string | null | undefined): {
  lage: BundeslandLageClient
  laedt: boolean
} {
  const [lage, setLage] = useState<BundeslandLageClient>(LADE_LAGE)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    let abgebrochen = false
    const key = String(plz ?? '').match(/\d{5}/)?.[0] ?? ''

    if (!key) {
      setLage(LADE_LAGE)
      setLaedt(false)
      return
    }

    setLaedt(true)
    ladeBundeslandLage(key).then(ergebnis => {
      if (abgebrochen) return
      setLage(ergebnis)
      setLaedt(false)
    })

    return () => { abgebrochen = true }
  }, [plz])

  return { lage, laedt }
}

/** Trägt eine Interessentin in die Warteliste eines Bundeslands ein. */
export async function wartelisteEintragen(payload: {
  bundesland?: BundeslandCode | null
  plz?: string | null
  ort?: string | null
  name?: string | null
  email: string
  telefon?: string | null
  interesse?: 'kasse' | 'privat' | 'beides' | 'mitarbeit'
  quelle?: string
}): Promise<{ ok: true } | { ok: false; fehler: string }> {
  try {
    const res = await fetch('/api/expansion/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quelle: 'web', ...payload }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, fehler: json?.error || 'Eintragung fehlgeschlagen.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, fehler: 'Netzwerkfehler. Bitte später erneut versuchen.' }
  }
}
