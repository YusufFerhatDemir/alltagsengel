import { datumBerlin } from '@/lib/utils/timezone';
// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Nutzungsnachweise (Schritt 5 des DiPA-Nutzerflows)
//
// ZWECK: Kennzahlen für die Evaluation (Nutzennachweis) — OHNE eine
// zweite Kopie der Gesundheitsdaten anzulegen.
//
// DATENMINIMIERUNG (im Datenmodell verankert, coach_nutzungsereignisse):
//  * kein Personenbezug — nur ein HMAC-Pseudonym, das niemand auflösen
//    kann, der den Schlüssel nicht besitzt (coach_pseudonym_key)
//  * kein exakter Zeitstempel — nur die Auswertungswoche
//  * keine Inhalte — nur Ereignisart und Modul-Schlüssel
//
// KLEINE-FALLZAHLEN-SCHUTZ: Aggregate unterhalb von MIN_GRUPPENGROESSE
// werden unterdrückt. Bei wenigen Teilnehmenden wäre eine Kennzahl sonst
// faktisch ein Einzeldatensatz.
//
// KEINE WIRKSAMKEITSAUSSAGE: Diese Kennzahlen beschreiben Nutzung, nicht
// Wirkung. Die Bewertung erfolgt im Evaluationskonzept
// (audit/dipa/evaluationskonzept.md), nicht im Code.
// ═══════════════════════════════════════════════════════════════

export type NutzungsEreignis =
  | 'sitzung_gestartet' | 'modul_geoeffnet' | 'modul_abgeschlossen'
  | 'aktivitaet_erledigt' | 'assessment_erfasst' | 'ziel_angelegt'
  | 'ziel_erreicht' | 'messung_erfasst' | 'bericht_erstellt' | 'export_erstellt'

export const NUTZUNGS_EREIGNISSE: NutzungsEreignis[] = [
  'sitzung_gestartet', 'modul_geoeffnet', 'modul_abgeschlossen',
  'aktivitaet_erledigt', 'assessment_erfasst', 'ziel_angelegt',
  'ziel_erreicht', 'messung_erfasst', 'bericht_erstellt', 'export_erstellt',
]

export const EREIGNIS_LABELS: Record<NutzungsEreignis, string> = {
  sitzung_gestartet: 'Sitzung gestartet',
  modul_geoeffnet: 'Modul geöffnet',
  modul_abgeschlossen: 'Modul abgeschlossen',
  aktivitaet_erledigt: 'Aktivität erledigt',
  assessment_erfasst: 'Assessment erfasst',
  ziel_angelegt: 'Ziel angelegt',
  ziel_erreicht: 'Ziel erreicht',
  messung_erfasst: 'Messung erfasst',
  bericht_erstellt: 'Bericht erstellt',
  export_erstellt: 'Export erstellt',
}

/** Unterhalb dieser Gruppengröße wird nicht ausgewiesen. */
export const MIN_GRUPPENGROESSE = 5

export interface NutzungsZeile {
  pseudonym: string
  ereignis: NutzungsEreignis
  modul_key: string | null
  rolle: string | null
  auswertungswoche: string
  anzahl: number
}

export interface WochenKennzahl {
  woche: string
  aktiveNutzer: number
  ereignisse: number
}

export interface NutzungsAuswertung {
  /** Anzahl unterschiedlicher Pseudonyme im Zeitraum. */
  teilnehmende: number
  /** true, wenn wegen zu kleiner Gruppe keine Details ausgewiesen werden. */
  unterdrueckt: boolean
  gesamtEreignisse: number
  jeEreignis: Array<{ ereignis: NutzungsEreignis; anzahl: number }>
  jeModul: Array<{ modul: string; anzahl: number }>
  jeWoche: WochenKennzahl[]
  /** Anteil der Teilnehmenden mit Aktivität in mindestens 4 Wochen. */
  anteilRegelmaessig: number | null
}

const LEER: NutzungsAuswertung = {
  teilnehmende: 0,
  unterdrueckt: true,
  gesamtEreignisse: 0,
  jeEreignis: [],
  jeModul: [],
  jeWoche: [],
  anteilRegelmaessig: null,
}

/**
 * Aggregiert pseudonymisierte Ereignisse zu Kennzahlen.
 * Reine Funktion — keine IO, deterministisch testbar.
 */
export function werteNutzungAus(zeilen: NutzungsZeile[]): NutzungsAuswertung {
  const pseudonyme = new Set(zeilen.map(z => z.pseudonym))
  const teilnehmende = pseudonyme.size

  if (teilnehmende < MIN_GRUPPENGROESSE) {
    return { ...LEER, teilnehmende, unterdrueckt: true }
  }

  const summe = (map: Map<string, number>, key: string, n: number) =>
    map.set(key, (map.get(key) ?? 0) + n)

  const jeEreignisMap = new Map<string, number>()
  const jeModulMap = new Map<string, number>()
  const jeWocheEreignisse = new Map<string, number>()
  const jeWochePseudonyme = new Map<string, Set<string>>()
  const wochenJePseudonym = new Map<string, Set<string>>()
  let gesamt = 0

  for (const z of zeilen) {
    gesamt += z.anzahl
    summe(jeEreignisMap, z.ereignis, z.anzahl)
    if (z.modul_key) summe(jeModulMap, z.modul_key, z.anzahl)
    summe(jeWocheEreignisse, z.auswertungswoche, z.anzahl)

    const wochePseudo = jeWochePseudonyme.get(z.auswertungswoche) ?? new Set<string>()
    wochePseudo.add(z.pseudonym)
    jeWochePseudonyme.set(z.auswertungswoche, wochePseudo)

    const wochen = wochenJePseudonym.get(z.pseudonym) ?? new Set<string>()
    wochen.add(z.auswertungswoche)
    wochenJePseudonym.set(z.pseudonym, wochen)
  }

  const regelmaessig = [...wochenJePseudonym.values()].filter(w => w.size >= 4).length

  return {
    teilnehmende,
    unterdrueckt: false,
    gesamtEreignisse: gesamt,
    jeEreignis: [...jeEreignisMap.entries()]
      .map(([ereignis, anzahl]) => ({ ereignis: ereignis as NutzungsEreignis, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    jeModul: [...jeModulMap.entries()]
      .map(([modul, anzahl]) => ({ modul, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    jeWoche: [...jeWocheEreignisse.entries()]
      .map(([woche, ereignisse]) => ({
        woche,
        ereignisse,
        aktiveNutzer: jeWochePseudonyme.get(woche)?.size ?? 0,
      }))
      .sort((a, b) => a.woche.localeCompare(b.woche)),
    anteilRegelmaessig: Math.round((regelmaessig / teilnehmende) * 100) / 100,
  }
}

/** Montag der Woche zu einem ISO-Datum — spiegelt date_trunc('week') in SQL. */
export function auswertungswoche(isoDatum: string): string {
  const d = new Date(`${isoDatum.slice(0, 10)}T00:00:00Z`)
  const wochentag = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (wochentag - 1))
  return datumBerlin(d)
}

export function istNutzungsEreignis(wert: unknown): wert is NutzungsEreignis {
  return typeof wert === 'string' && (NUTZUNGS_EREIGNISSE as string[]).includes(wert)
}
