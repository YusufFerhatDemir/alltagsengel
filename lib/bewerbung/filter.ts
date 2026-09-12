/**
 * Bewerberfilter — deklarativ, damit Seite und Prüfung dasselbe meinen.
 *
 * WARUM NICHT DIREKT IN DER SEITE
 * Bis 12.09.2026 hingen drei Filter als je eigener `useState` in
 * `app/admin/applications/page.tsx`, die Auswahl-Logik stand ausgeschrieben
 * in einem `useMemo`. Jeder weitere Filter hätte einen weiteren Hook und eine
 * weitere Zeile in derselben Bedingung gebraucht — und keiner davon wäre
 * prüfbar gewesen, ohne die Seite zu rendern.
 *
 * Hier steht stattdessen, WAS es zu filtern gibt und WIE der Wert aus einer
 * Zeile zu lesen ist. Die Seite baut daraus ihre Auswahlfelder und ruft
 * `passtZuFiltern`. Ein neuer Filter ist ein Eintrag in dieser Liste.
 *
 * ── EINE EHRLICHE EINSCHRÄNKUNG ───────────────────────────────────────
 * Von 36 Bewerbungen trugen am 12.09.2026 genau **zwei** strukturierte
 * Angaben in `bewerbung_daten`; die übrigen 34 sind Altbestand aus der Zeit
 * vor dem Formular. Ein Filter auf „Führerschein" findet deshalb heute fast
 * nichts — nicht weil er falsch wäre, sondern weil die Daten fehlen.
 * `ohneAngabe` macht genau das sichtbar, statt die Zeilen stumm
 * wegzufiltern: wer „ohne Angabe" wählt, sieht die Lücke.
 */

import {
  QUALIFIKATIONEN, FUEHRERSCHEIN, SPRACHEN, VERFUEGBARKEIT, STUNDEN, BESCHAEFTIGUNGSART,
} from '@/lib/bewerbung/katalog'
import { BEWERBER_PRIO, BEWERBER_BLOCKER, prioUndBlocker } from '@/lib/bewerbung/pipeline'
import { WARTELISTE_REGIONEN } from '@/lib/warteliste/katalog'

/** Was eine Zeile der Bewerberliste mindestens hergeben muss. */
export interface FilterZeile {
  plz?: string | null
  utm_source?: string | null
  daten?: Record<string, unknown> | null
  /** Rohes `bewerbung_daten` — trägt auch den Pipeline-Stand (Prio, Blocker). */
  roh?: unknown
}

export const ALLE = 'alle'
/** Eigener Wert: „Feld ist leer" ist eine Antwort, kein fehlender Filter. */
export const OHNE_ANGABE = '__ohne__'

export interface FilterDimension {
  key: string
  label: string
  /** Auswahlwerte ohne „alle" und „ohne Angabe" — die kommen automatisch dazu. */
  werte: readonly { key: string; label: string }[]
  /** Liest den Wert (oder die Werte) aus einer Zeile. Leer = keine Angabe. */
  lies: (z: FilterZeile) => string[]
}

/** Katalogfeld aus `bewerbung_daten` — Einzelwert. */
function ausDaten(feld: string) {
  return (z: FilterZeile): string[] => {
    const w = z.daten?.[feld]
    return typeof w === 'string' && w ? [w] : []
  }
}

/** Katalogfeld aus `bewerbung_daten` — Mehrfachauswahl (z. B. Sprachen). */
function ausDatenListe(feld: string) {
  return (z: FilterZeile): string[] => {
    const w = z.daten?.[feld]
    if (Array.isArray(w)) return w.filter((x): x is string => typeof x === 'string' && !!x)
    return typeof w === 'string' && w ? [w] : []
  }
}

/** PLZ-Bereich — nach erster Ziffer, das ist die Grobregion. */
export const PLZ_BEREICHE = [
  { key: '6', label: '6xxxx — Rhein-Main, Südhessen' },
  { key: '5', label: '5xxxx — Köln, Bonn' },
  { key: '4', label: '4xxxx — Ruhrgebiet, Düsseldorf' },
  { key: '3', label: '3xxxx — Nord- und Mittelhessen' },
] as const

export const FILTER_DIMENSIONEN: readonly FilterDimension[] = [
  // Region stand bis 12.09.2026 als einziger Filter handverdrahtet in
  // app/admin/applications/page.tsx — eigener useState, eigene Zählung, eigene
  // Zeile in der Auswahlbedingung. Ein Modell mit zehn deklarativen und einer
  // handgeschriebenen Dimension ist kein Modell, sondern eine Ausnahme mit
  // Anhang: die Abdeckungsanzeige („Ohne Angabe (34)") fehlte genau dort.
  {
    key: 'region', label: 'Region',
    werte: WARTELISTE_REGIONEN, lies: ausDaten('region'),
  },
  {
    key: 'qualifikation', label: 'Qualifikation',
    werte: QUALIFIKATIONEN, lies: ausDaten('qualifikation'),
  },
  {
    key: 'fuehrerschein', label: 'Führerschein & Auto',
    werte: FUEHRERSCHEIN, lies: ausDaten('fuehrerschein'),
  },
  {
    key: 'sprachen', label: 'Sprache',
    werte: SPRACHEN, lies: ausDatenListe('sprachen'),
  },
  {
    key: 'verfuegbarkeit', label: 'Verfügbarkeit',
    werte: VERFUEGBARKEIT, lies: ausDatenListe('verfuegbarkeit'),
  },
  {
    key: 'stunden', label: 'Stundenumfang',
    werte: STUNDEN, lies: ausDaten('stunden'),
  },
  {
    key: 'beschaeftigungsart', label: 'Arbeitsmodell',
    werte: BESCHAEFTIGUNGSART, lies: ausDaten('beschaeftigungsart'),
  },
  {
    key: 'plzBereich', label: 'PLZ-Bereich',
    werte: PLZ_BEREICHE,
    lies: z => (z.plz && /^[0-9]/.test(z.plz) ? [z.plz[0]] : []),
  },
  {
    key: 'prio', label: 'Priorität',
    werte: Object.entries(BEWERBER_PRIO).map(([key, v]) => ({ key, label: v.label })),
    lies: z => {
      const { prio } = prioUndBlocker(z.roh)
      return prio ? [prio] : []
    },
  },
  {
    key: 'blocker', label: 'Was fehlt',
    werte: Object.entries(BEWERBER_BLOCKER).map(([key, v]) => ({ key, label: v.label })),
    lies: z => prioUndBlocker(z.roh).blocker,
  },
  {
    key: 'quelle', label: 'Quelle',
    werte: [
      { key: 'google_jobs_apply', label: 'Google Jobs' },
      { key: 'chatgpt.com', label: 'ChatGPT' },
      { key: 'instagram', label: 'Instagram' },
      { key: 'facebook', label: 'Facebook' },
    ],
    lies: z => (z.utm_source ? [z.utm_source] : []),
  },
] as const

export type FilterAuswahl = Record<string, string>

/** Startzustand: überall „alle". */
export function leereAuswahl(): FilterAuswahl {
  return Object.fromEntries(FILTER_DIMENSIONEN.map(d => [d.key, ALLE]))
}

/**
 * Passt die Zeile zu ALLEN gesetzten Filtern? Unbekannte Schlüssel in der
 * Auswahl werden übergangen — ein alter Deep-Link soll die Liste nicht leeren.
 */
export function passtZuFiltern(zeile: FilterZeile, auswahl: FilterAuswahl): boolean {
  for (const dim of FILTER_DIMENSIONEN) {
    const gewaehlt = auswahl[dim.key]
    if (!gewaehlt || gewaehlt === ALLE) continue
    const vorhanden = dim.lies(zeile)
    if (gewaehlt === OHNE_ANGABE) {
      if (vorhanden.length > 0) return false
      continue
    }
    if (!vorhanden.includes(gewaehlt)) return false
  }
  return true
}

/** Wie viele Zeilen tragen zu dieser Dimension überhaupt eine Angabe? */
export function abdeckung(zeilen: readonly FilterZeile[], dimKey: string): { mit: number; ohne: number } {
  const dim = FILTER_DIMENSIONEN.find(d => d.key === dimKey)
  if (!dim) return { mit: 0, ohne: zeilen.length }
  let mit = 0
  for (const z of zeilen) if (dim.lies(z).length > 0) mit++
  return { mit, ohne: zeilen.length - mit }
}
