'use client'
// ═══════════════════════════════════════════════════════════════
// BUNDESLAND-FILTER — Client-Kontext für die Admin-Oberfläche
// ═══════════════════════════════════════════════════════════════
// Der Umschalter in der Seitenleiste setzt hier den Wert; alle
// Admin-Seiten lesen ihn über useBundeslandFilter() und filtern
// ihre Listen, ohne die Seite neu zu laden.
//
// Für Listen mit Postleitzahl gibt es `passtZuFilter(plz)` — damit
// muss keine Seite die PLZ-Auflösung selbst kennen.
// ═══════════════════════════════════════════════════════════════

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { bundeslandFuerPlz, normalizeBundesland } from '@/lib/expansion/plz-bundesland'
import {
  ACTIVE_BUNDESLAND_COOKIE,
  ALLE_BUNDESLAENDER,
  BUNDESLAND_NAMEN,
} from '@/lib/expansion/types'

interface BundeslandFilterKontext {
  /** Gewählter Bundesland-Code oder 'alle'. */
  aktiv: string
  /** Klartextname, oder 'Alle Bundesländer'. */
  label: string
  /** true, wenn kein Filter aktiv ist. */
  alle: boolean
  setAktiv: (wert: string) => void
  /** Passt ein Datensatz mit dieser PLZ zum Filter? */
  passtZuFilter: (plz: string | null | undefined) => boolean
  /** Passt ein Datensatz mit diesem Bundesland-Feld zum Filter? */
  passtZuLand: (bundesland: string | null | undefined) => boolean
}

const Kontext = createContext<BundeslandFilterKontext | null>(null)

/** Liest den zuletzt gewählten Wert aus dem Cookie (kein Flackern beim Laden). */
function ausCookie(): string {
  if (typeof document === 'undefined') return ALLE_BUNDESLAENDER
  const treffer = document.cookie
    .split('; ')
    .find(c => c.startsWith(`${ACTIVE_BUNDESLAND_COOKIE}=`))
  if (!treffer) return ALLE_BUNDESLAENDER
  const wert = decodeURIComponent(treffer.split('=')[1] ?? '')
  if (wert === ALLE_BUNDESLAENDER) return ALLE_BUNDESLAENDER
  return normalizeBundesland(wert) ?? ALLE_BUNDESLAENDER
}

export function BundeslandProvider({ children }: { children: ReactNode }) {
  const [aktiv, setAktivState] = useState<string>(ALLE_BUNDESLAENDER)

  // Cookie erst nach dem Mount lesen — sonst weicht der Server-HTML-Baum ab.
  useEffect(() => { setAktivState(ausCookie()) }, [])

  const setAktiv = useCallback((wert: string) => {
    setAktivState(wert === ALLE_BUNDESLAENDER ? ALLE_BUNDESLAENDER
      : (normalizeBundesland(wert) ?? ALLE_BUNDESLAENDER))
  }, [])

  const wert = useMemo<BundeslandFilterKontext>(() => {
    const alle = aktiv === ALLE_BUNDESLAENDER
    return {
      aktiv,
      alle,
      label: alle
        ? 'Alle Bundesländer'
        : (BUNDESLAND_NAMEN[aktiv as keyof typeof BUNDESLAND_NAMEN] ?? aktiv),
      setAktiv,
      passtZuFilter: (plz) => {
        if (alle) return true
        // Ohne zuordenbare PLZ bleibt der Datensatz sichtbar — sonst
        // verschwinden Klienten mit Datenlücke lautlos aus jeder Liste.
        const treffer = bundeslandFuerPlz(plz)
        if (!treffer.code) return true
        return treffer.code === aktiv
      },
      passtZuLand: (bundesland) => {
        if (alle) return true
        const code = normalizeBundesland(bundesland)
        if (!code) return true
        return code === aktiv
      },
    }
  }, [aktiv, setAktiv])

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>
}

/**
 * Zugriff auf den Bundesland-Filter.
 * Außerhalb des Providers (z. B. in einer isoliert gerenderten Komponente)
 * liefert der Hook den neutralen Zustand „alle" statt zu werfen.
 */
export function useBundeslandFilter(): BundeslandFilterKontext {
  const kontext = useContext(Kontext)
  if (kontext) return kontext
  return {
    aktiv: ALLE_BUNDESLAENDER,
    label: 'Alle Bundesländer',
    alle: true,
    setAktiv: () => {},
    passtZuFilter: () => true,
    passtZuLand: () => true,
  }
}
