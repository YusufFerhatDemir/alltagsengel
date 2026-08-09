// ═══════════════════════════════════════════════════════════
// TOURENPLANUNG — Fahrtzeit-Schätzung zwischen Einsatzorten
// ═══════════════════════════════════════════════════════════
// PLZ-basiert und offline: Koordinaten aus lib/plz-coords.ts
// (amtlicher Bestand, ~8.300 PLZ), Luftlinie via Haversine aus
// lib/geo.ts, dann Umwegfaktor + Geschwindigkeitsmodell.
//
// Bewusst KEINE externe Routing-API: für die Tourenplanung
// reicht eine stabile, deterministische Schätzung — sie muss
// serverseitig ohne Netzabhängigkeit funktionieren.
//
// Wie plz-coords: NICHT in Client-Komponenten importieren
// (Datensatz ~180 KB). Nur Route Handler / Server Components.
// ═══════════════════════════════════════════════════════════

import { plzCoords } from '@/lib/plz-coords'
import { haversineDistanceMeters } from '@/lib/geo'

/** Straßen-Umweg gegenüber der Luftlinie (empirischer Mittelwert). */
export const UMWEGFAKTOR = 1.3

/** Fahrt innerhalb derselben PLZ: pauschale Annahme. */
export const FAHRZEIT_GLEICHE_PLZ_MINUTEN = 7
export const DISTANZ_GLEICHE_PLZ_KM = 2

/** Puffer pro Halt (Parken, Weg zur Wohnung). */
export const PUFFER_PRO_STOP_MINUTEN = 3

export interface FahrtSchaetzung {
  /** geschätzte Straßen-Distanz in km (1 Nachkommastelle) */
  distanzKm: number
  /** geschätzte Fahrzeit in Minuten inkl. Puffer, aufgerundet */
  fahrzeitMinuten: number
}

/**
 * Durchschnittsgeschwindigkeit nach Streckenlänge:
 * kurze Wege sind fast vollständig innerorts, lange Wege
 * enthalten Landstraßen-/Autobahnanteile.
 */
export function durchschnittsgeschwindigkeitKmh(strassenKm: number): number {
  if (strassenKm <= 3) return 22
  if (strassenKm <= 15) return 35
  return 55
}

/**
 * Fahrtzeit-Schätzung zwischen zwei PLZ.
 * null, wenn eine der PLZ nicht im amtlichen Bestand ist.
 */
export function fahrtZwischenPlz(
  plzVon: string | null | undefined,
  plzNach: string | null | undefined
): FahrtSchaetzung | null {
  if (!plzVon || !plzNach) return null

  if (plzVon === plzNach) {
    return {
      distanzKm: DISTANZ_GLEICHE_PLZ_KM,
      fahrzeitMinuten: FAHRZEIT_GLEICHE_PLZ_MINUTEN,
    }
  }

  const von = plzCoords(plzVon)
  const nach = plzCoords(plzNach)
  if (!von || !nach) return null

  const luftlinieKm = haversineDistanceMeters(von[0], von[1], nach[0], nach[1]) / 1000
  const strassenKm = luftlinieKm * UMWEGFAKTOR
  const kmh = durchschnittsgeschwindigkeitKmh(strassenKm)
  const fahrzeit = (strassenKm / kmh) * 60 + PUFFER_PRO_STOP_MINUTEN

  return {
    distanzKm: Math.round(strassenKm * 10) / 10,
    fahrzeitMinuten: Math.max(FAHRZEIT_GLEICHE_PLZ_MINUTEN, Math.ceil(fahrzeit)),
  }
}

export interface StopMitPlz {
  plz: string | null
}

export interface StopFahrt {
  /** Fahrt vom vorherigen Stop; null beim ersten Stop oder ohne PLZ. */
  fahrzeitMinuten: number | null
  distanzKm: number | null
}

/**
 * Fahrtzeiten entlang einer geordneten Stop-Liste.
 * Ergebnis[i] beschreibt die Anfahrt ZU Stop i (Index 0 = Tourstart,
 * dort keine Anfahrt berechnet — optional über startPlz).
 */
export function fahrtzeitenEntlangRoute(
  stops: StopMitPlz[],
  startPlz?: string | null
): StopFahrt[] {
  return stops.map((stop, i) => {
    const vorherPlz = i === 0 ? startPlz ?? null : stops[i - 1].plz
    const fahrt = fahrtZwischenPlz(vorherPlz, stop.plz)
    return fahrt
      ? { fahrzeitMinuten: fahrt.fahrzeitMinuten, distanzKm: fahrt.distanzKm }
      : { fahrzeitMinuten: null, distanzKm: null }
  })
}
