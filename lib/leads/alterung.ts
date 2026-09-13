/**
 * Alterung von Leads und Kunden — „wie lange hat niemand mehr mit dieser
 * Person gesprochen".
 *
 * ── ABGRENZUNG ZU `lib/leads/follow-up.ts` ────────────────────────────
 * Die Follow-up-Leiter misst **Reaktionsrückstand in Stunden**: eine Anfrage
 * kam herein, oder eine Wiedervorlage wurde fällig, und niemand hat
 * reagiert. Sie beantwortet „was ist gerade zu spät".
 *
 * Diese Datei misst **Kontaktalter in Tagen**. Das ist eine andere Frage.
 * Eine Kundin, bei der alles läuft, hat keinen Rückstand — aber wenn seit
 * 40 Tagen niemand mit ihr gesprochen hat, ist das ein eigener Befund. Die
 * Follow-up-Leiter sieht ihn nicht, weil nichts überfällig ist: es steht ja
 * gar keine Wiedervorlage.
 *
 * Beide Leitern laufen nebeneinander. Die eine abzuschaffen, weil die
 * andere „auch Zeit misst", würde genau eine der beiden Lücken wieder
 * öffnen — die stille (kein Rückstand, trotzdem vergessen) oder die laute
 * (Termin verpasst).
 *
 * ── DIE SCHWELLEN (Auftrag 13.09.2026) ────────────────────────────────
 *   über  7 Tage → erhöht
 *   über 14 Tage → hoch
 *   über 30 Tage → kritisch
 * „Über" heißt echt größer: am siebten Tag ist die Stufe noch `normal`,
 * ab dem achten `erhoeht`.
 *
 * Rein rechnend — kein Datenbank- und kein Browserzugriff.
 */

import { berlinerTagPlus, stundenSeit, tagAlsZeitpunkt } from '@/lib/leads/follow-up'

const TAG_STUNDEN = 24

/** Tagesgrenzen der Alterung. Echt größer, nicht „ab". */
export const ALTERUNG_SCHWELLEN_TAGE = {
  erhoeht: 7,
  hoch: 14,
  kritisch: 30,
} as const

export type Prioritaet = 'normal' | 'erhoeht' | 'hoch' | 'kritisch'

export const PRIORITAET_META: Record<Prioritaet, { label: string; color: string; rang: number }> = {
  normal: { label: 'Normal', color: '#8A8A8A', rang: 0 },
  erhoeht: { label: 'Erhöht', color: '#E8A000', rang: 1 },
  hoch: { label: 'Hoch', color: '#FF7043', rang: 2 },
  kritisch: { label: 'Kritisch', color: '#D04B3B', rang: 3 },
}

export const PRIORITAETEN: readonly Prioritaet[] = ['normal', 'erhoeht', 'hoch', 'kritisch']

/** Ist der Wert eine bekannte Prioritätsstufe? */
export function istPrioritaet(wert: unknown): wert is Prioritaet {
  return typeof wert === 'string' && (PRIORITAETEN as readonly string[]).includes(wert)
}

/**
 * Eskalationsstufe bei überfälliger Wiedervorlage.
 *
 * Getrennt von der Priorität, weil es eine andere Aussage ist: Priorität
 * sagt „lange nichts gehört", Eskalation sagt „ein zugesagter Termin ist
 * verstrichen". Das Zweite ist ein gebrochenes Versprechen und wiegt
 * schwerer als das Erste.
 */
export const ESKALATION_SCHWELLEN_TAGE = { stufe1: 1, stufe2: 3, stufe3: 7 } as const
export type Eskalation = 0 | 1 | 2 | 3

export const ESKALATION_META: Record<Eskalation, { label: string; bedeutung: string }> = {
  0: { label: '—', bedeutung: 'Keine überfällige Wiedervorlage' },
  1: { label: 'Stufe 1', bedeutung: 'Wiedervorlage seit mindestens einem Tag überfällig' },
  2: { label: 'Stufe 2', bedeutung: 'Seit drei Tagen überfällig — Verwaltung informieren' },
  3: { label: 'Stufe 3', bedeutung: 'Seit einer Woche überfällig — Vorgang gilt als liegen geblieben' },
}

// ── Eingabe ──────────────────────────────────────────────────────────

export interface AlterungsZeile {
  /** Letzter echter Kontakt (ISO). Ein Trigger-Update zählt hier NICHT. */
  letzterKontakt?: string | Date | null
  /** Eingang des Vorgangs — Ersatzuhr, solange nie Kontakt bestand. */
  eingang?: string | Date | null
  /** Vereinbarte Wiedervorlage: ISO-Zeitpunkt oder Kalendertag (YYYY-MM-DD). */
  wiedervorlage?: string | Date | null
  /**
   * Läuft der Vorgang noch?
   *
   * Muss der Aufrufer mitgeben. Ein abgeschlossener Vorgang altert nicht —
   * sonst steht nach einem Jahr jeder erledigte Fall auf „kritisch" und die
   * Stufe sagt nichts mehr. Diese Datei kann `offen` nicht selbst
   * herleiten: die Stufennamen unterscheiden sich je Quelle (Warteliste,
   * Bewerbung, Anfrage), und geraten wäre hier schlimmer als gefragt.
   */
  offen: boolean
  /** Von Hand gesetzte Priorität, falls vorhanden. */
  prioritaetManuell?: Prioritaet | null
}

export interface Alterung {
  /** Volle Tage seit dem letzten Kontakt; `null` wenn keine Uhr läuft. */
  tageSeitKontakt: number | null
  /** Woran die Uhr hängt — damit die Oberfläche nicht „seit 12 Tagen kein Kontakt" behauptet, wo nie Kontakt war. */
  quelle: 'letzter_kontakt' | 'eingang' | 'keine'
  /** Was sich allein aus dem Alter ergibt. */
  automatisch: Prioritaet
  /** Was gilt: die dringendere von automatisch und manuell. */
  effektiv: Prioritaet
  /** Wurde eine manuelle Angabe von der Alterung überstimmt? */
  manuellUeberstimmt: boolean
  /** Volle Tage über der Wiedervorlage; `null` wenn keine gesetzt oder noch nicht fällig. */
  tageUeberfaellig: number | null
  eskalation: Eskalation
}

// ── Rechnung ─────────────────────────────────────────────────────────

/** Volle Tage seit einem Zeitpunkt; `null` bei fehlendem oder unlesbarem Wert. */
export function tageSeit(zeitpunkt: string | Date | null | undefined, jetzt: Date = new Date()): number | null {
  const std = stundenSeit(zeitpunkt, jetzt)
  if (std === null) return null
  return Math.floor(std / TAG_STUNDEN)
}

/** Schwellen auf eine Tageszahl anwenden. */
export function prioritaetFuerTage(tage: number | null): Prioritaet {
  if (tage === null) return 'normal'
  if (tage > ALTERUNG_SCHWELLEN_TAGE.kritisch) return 'kritisch'
  if (tage > ALTERUNG_SCHWELLEN_TAGE.hoch) return 'hoch'
  if (tage > ALTERUNG_SCHWELLEN_TAGE.erhoeht) return 'erhoeht'
  return 'normal'
}

/** Die dringendere zweier Stufen. */
export function hoeherePrioritaet(a: Prioritaet, b: Prioritaet): Prioritaet {
  return PRIORITAET_META[a].rang >= PRIORITAET_META[b].rang ? a : b
}

/** Tage über der Wiedervorlage; `null` wenn keine gesetzt oder noch nicht fällig. */
export function tageUeberfaellig(
  wiedervorlage: string | Date | null | undefined,
  jetzt: Date = new Date(),
): number | null {
  const roh = wiedervorlage instanceof Date ? wiedervorlage : wiedervorlage ?? null
  // Kalendertage (YYYY-MM-DD) gelten ab Tagesbeginn — dieselbe Rechnung
  // wie in der Follow-up-Leiter, damit beide denselben Tag als fällig sehen.
  const zeitpunkt = typeof roh === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(roh)
    ? tagAlsZeitpunkt(roh)
    : roh
  const std = stundenSeit(zeitpunkt, jetzt)
  if (std === null || std < 0) return null
  return Math.floor(std / TAG_STUNDEN)
}

export function eskalationFuerTage(tage: number | null): Eskalation {
  if (tage === null) return 0
  if (tage >= ESKALATION_SCHWELLEN_TAGE.stufe3) return 3
  if (tage >= ESKALATION_SCHWELLEN_TAGE.stufe2) return 2
  if (tage >= ESKALATION_SCHWELLEN_TAGE.stufe1) return 1
  return 0
}

/**
 * Vollständige Bewertung einer Zeile.
 *
 * ── WARUM MANUELL NICHT GEWINNT ───────────────────────────────────────
 * `effektiv` ist die **dringendere** von Hand- und Alterungsstufe, nicht
 * die von Hand gesetzte. Wer einen 40 Tage alten Vorgang auf „normal"
 * stellt, macht ihn sonst unsichtbar — und genau so entstehen die Fälle,
 * die monatelang liegen bleiben. Hochstufen von Hand geht jederzeit;
 * herunterstufen unter das Alter geht nicht, es wird nur als
 * `manuellUeberstimmt` sichtbar gemacht.
 */
export function bewerteAlterung(z: AlterungsZeile, jetzt: Date = new Date()): Alterung {
  if (!z.offen) {
    return {
      tageSeitKontakt: null, quelle: 'keine', automatisch: 'normal',
      effektiv: z.prioritaetManuell ?? 'normal', manuellUeberstimmt: false,
      tageUeberfaellig: null, eskalation: 0,
    }
  }

  const ausKontakt = tageSeit(z.letzterKontakt, jetzt)
  const ausEingang = tageSeit(z.eingang, jetzt)
  const tage = ausKontakt ?? ausEingang
  const quelle: Alterung['quelle'] =
    ausKontakt !== null ? 'letzter_kontakt' : ausEingang !== null ? 'eingang' : 'keine'

  const automatisch = prioritaetFuerTage(tage)
  const manuell = z.prioritaetManuell ?? null
  const effektiv = manuell ? hoeherePrioritaet(manuell, automatisch) : automatisch

  const ueber = tageUeberfaellig(z.wiedervorlage, jetzt)

  return {
    tageSeitKontakt: tage,
    quelle,
    automatisch,
    effektiv,
    manuellUeberstimmt: manuell !== null && effektiv !== manuell,
    tageUeberfaellig: ueber,
    eskalation: eskalationFuerTage(ueber),
  }
}

// ── Zählung und Sortierung ───────────────────────────────────────────

export type PrioritaetZaehlung = Record<Prioritaet, number> & { gesamt: number }

export function zaehlePrioritaeten(bewertungen: readonly Alterung[]): PrioritaetZaehlung {
  const z = { normal: 0, erhoeht: 0, hoch: 0, kritisch: 0, gesamt: 0 } as PrioritaetZaehlung
  for (const b of bewertungen) {
    z[b.effektiv]++
    if (b.effektiv !== 'normal') z.gesamt++
  }
  return z
}

/**
 * Sortierschlüssel: erst Eskalation, dann Priorität, dann Alter.
 * Größer = dringender, damit `sort((a, b) => rang(b) - rang(a))` reicht.
 */
export function dringlichkeitsRang(a: Alterung): number {
  return a.eskalation * 1_000_000
    + PRIORITAET_META[a.effektiv].rang * 100_000
    + Math.min(a.tageSeitKontakt ?? 0, 99_999)
}

/**
 * Nächste Wiedervorlage als Kalendertag (Berlin) — der Tag, den die
 * Oberfläche in ein `date`-Feld schreibt.
 */
export function wiedervorlageIn(tage: number, jetzt: Date = new Date()): string {
  return berlinerTagPlus(jetzt, tage)
}
