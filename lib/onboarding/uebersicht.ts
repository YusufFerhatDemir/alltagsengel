/**
 * Onboarding — Betriebssicht für die Verwaltung
 *
 * Rein rechnend: macht aus Fortschrittszeilen die Zahlen und Merkmale,
 * nach denen in der Verwaltung gesucht wird. Ohne Datenbank, damit die
 * Filterregeln prüfbar sind — „seit X Tagen inaktiv" ist genau die Art
 * Regel, die man sonst nie testet und die dann still das Falsche zählt.
 *
 * ── WAS DIESE SICHT NICHT IST ──────────────────────────────────────────
 * Sie sagt, was im Ablauf steht — nicht, was im Haus angekommen ist.
 * „Dokument fehlt" heißt hier immer: in diesem Ablauf ist keines
 * vermerkt. Per Post oder E-Mail Zugesandtes taucht nicht auf. Dieselbe
 * Regel wie beim Assistenten; sie steht auch in der Oberfläche, damit
 * niemand jemanden anruft und etwas anmahnt, das längst auf dem
 * Schreibtisch liegt.
 */

import { schrittfolge, type OnboardingTyp } from './schritte'
// tageSeit wird NICHT noch einmal geschrieben: zwei Implementierungen
// derselben Frist laufen irgendwann auseinander, und dann zaehlt die
// Erinnerung anders als die Betriebssicht.
import { tageSeit } from './triggers'
import type { SchrittEintrag } from './service'

export { tageSeit }

/** Eine Fortschrittszeile, so weit die Betriebssicht sie braucht. */
export interface UebersichtsZeile {
  id: string
  userId: string
  typ: OnboardingTyp
  name: string
  aktuellerSchritt: number
  gesamtSchritte: number
  schritteDaten: Record<string, SchrittEintrag>
  fehlendeAngaben: string[]
  dokumentStatus: Record<string, unknown>
  letzteAutoNachricht: string | null
  abbruchstelle: string | null
  abgeschlossenAm: string | null
  createdAt: string
  updatedAt: string
}

export interface AusgewerteteZeile extends UebersichtsZeile {
  erledigteSchritte: number
  prozent: number
  /** Titel des Schritts, auf dem die Person steht. */
  letzterSchrittTitel: string
  /** Volle Tage seit der letzten eigenen Änderung. */
  tageInaktiv: number
  /** Anzahl vermerkter Unterlagen. */
  dokumenteVermerkt: number
  /** Alle Pflichtschritte erledigt, aber noch nicht abgeschickt. */
  bereitZurPruefung: boolean
}

/**
 * Rechnet die abgeleiteten Werte einer Zeile aus.
 *
 * Fail-soft bei unbekannter Ablaufart: die Zeile bleibt sichtbar, nur
 * ohne Schritt-Titel. Eine Zeile, die wegen eines unbekannten Typs aus
 * der Betriebssicht verschwindet, ist der schlechteste Ausgang — dann
 * wartet jemand, den niemand mehr sieht.
 */
export function werteAus(zeile: UebersichtsZeile, jetzt: Date = new Date()): AusgewerteteZeile {
  let folge: ReturnType<typeof schrittfolge> = []
  try {
    folge = schrittfolge(zeile.typ)
  } catch {
    folge = []
  }

  const erledigt = folge.filter(
    s => zeile.schritteDaten[s.schluessel]?.status === 'fertig'
      || zeile.schritteDaten[s.schluessel]?.status === 'uebersprungen',
  ).length

  const offenePflicht = folge.filter(
    s => !s.ueberspringbar && zeile.schritteDaten[s.schluessel]?.status !== 'fertig',
  )

  const gesamt = folge.length || zeile.gesamtSchritte || 1

  return {
    ...zeile,
    erledigteSchritte: erledigt,
    prozent: Math.round((erledigt / gesamt) * 100),
    letzterSchrittTitel: folge[zeile.aktuellerSchritt - 1]?.titel ?? `Schritt ${zeile.aktuellerSchritt}`,
    tageInaktiv: tageSeit(zeile.updatedAt, jetzt),
    dokumenteVermerkt: Object.keys(zeile.dokumentStatus ?? {}).length,
    bereitZurPruefung: !zeile.abgeschlossenAm && offenePflicht.length === 0,
  }
}

export const FILTER = [
  'alle',
  'unvollstaendig',
  'vollstaendig',
  'inaktiv',
  'dokument_fehlt',
  'bereit',
] as const
export type Filter = (typeof FILTER)[number]

export function istFilter(wert: unknown): wert is Filter {
  return typeof wert === 'string' && (FILTER as readonly string[]).includes(wert)
}

export const FILTER_LABEL: Record<Filter, string> = {
  alle: 'Alle',
  unvollstaendig: 'Unvollständig',
  vollstaendig: 'Abgeschlossen',
  inaktiv: 'Seit Tagen inaktiv',
  dokument_fehlt: 'Keine Unterlage vermerkt',
  bereit: 'Bereit zur Prüfung',
}

/**
 * Wendet einen Filter an.
 *
 * `inaktivAbTagen` gilt nur für den Filter 'inaktiv'. Der Vergleich ist
 * `>=`: „seit 7 Tagen inaktiv" schließt den siebten Tag ein — sonst
 * fiele genau die Menge heraus, nach der jemand gerade sucht.
 */
export function wendeFilterAn(
  zeilen: readonly AusgewerteteZeile[],
  filter: Filter,
  inaktivAbTagen = 7,
): AusgewerteteZeile[] {
  switch (filter) {
    case 'alle':
      return [...zeilen]
    case 'unvollstaendig':
      return zeilen.filter(z => !z.abgeschlossenAm)
    case 'vollstaendig':
      return zeilen.filter(z => Boolean(z.abgeschlossenAm))
    case 'inaktiv':
      // Abgeschlossene sind nicht „inaktiv" — sie sind fertig.
      return zeilen.filter(z => !z.abgeschlossenAm && z.tageInaktiv >= inaktivAbTagen)
    case 'dokument_fehlt':
      return zeilen.filter(z => !z.abgeschlossenAm && z.dokumenteVermerkt === 0)
    case 'bereit':
      return zeilen.filter(z => z.bereitZurPruefung)
  }
}

/** Namenssuche, klein geschrieben und ohne Rücksicht auf Leerzeichen. */
export function sucheNachName(
  zeilen: readonly AusgewerteteZeile[],
  begriff: string,
): AusgewerteteZeile[] {
  const gesucht = String(begriff ?? '').trim().toLowerCase()
  if (!gesucht) return [...zeilen]
  return zeilen.filter(z => z.name.toLowerCase().includes(gesucht))
}

export interface Kennzahlen {
  gesamt: number
  offen: number
  abgeschlossen: number
  bereit: number
  inaktiv: number
}

export function kennzahlen(
  zeilen: readonly AusgewerteteZeile[],
  inaktivAbTagen = 7,
): Kennzahlen {
  return {
    gesamt: zeilen.length,
    offen: zeilen.filter(z => !z.abgeschlossenAm).length,
    abgeschlossen: zeilen.filter(z => Boolean(z.abgeschlossenAm)).length,
    bereit: zeilen.filter(z => z.bereitZurPruefung).length,
    inaktiv: wendeFilterAn(zeilen, 'inaktiv', inaktivAbTagen).length,
  }
}
