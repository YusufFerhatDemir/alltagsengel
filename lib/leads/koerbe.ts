/**
 * Arbeitskörbe des Posteingangs — die Sicht „was mache ich als Nächstes".
 *
 * ── WARUM NEBEN DER AMPEL NOCH KÖRBE ─────────────────────────────────
 * Die Ampel (`lib/leads/posteingang.ts`) sagt, wie schlimm es ist. Sie sagt
 * nicht, wer gerade dran ist. Wer morgens die Liste öffnet, will nicht
 * „orange", sondern „heute fällig", „Rückrufe", „Bewerber".
 *
 * ── DIE KÖRBE ÜBERLAPPEN — UND DAS IST ABSICHT ───────────────────────
 * Ein Bewerber kann gleichzeitig überfällig sein, ein Terminwunsch
 * gleichzeitig dringend. Die Körbe sind deshalb **keine Aufteilung**,
 * sondern Filter: jeder Lead erscheint in jedem Korb, in den er gehört.
 *
 * Wären sie gegenseitig ausschließend, müsste eine Reihenfolge entscheiden,
 * und dann verschwindet genau der Lead, der in zwei Körben liegt, aus
 * einem von beiden — die Art von stiller Lücke, aus der die 58 Tage
 * Rückstand vom 12.09.2026 entstanden sind.
 *
 * `korbGesamt()` zählt deshalb einmal die Vereinigungsmenge: die Summe der
 * Korbgrößen ist größer als die Zahl der Leads, und das ist kein Fehler.
 */

import { berlinerTagPlus } from '@/lib/leads/follow-up'
import type { PosteingangEintrag } from '@/lib/leads/posteingang'

export type KorbKey =
  | 'heute' | 'ueberfaellig' | 'dringend' | 'neu'
  | 'terminwuensche' | 'rueckrufe' | 'bewerber'

export interface Korb {
  key: KorbKey
  label: string
  /** Was der Korb bedeutet — steht in der Oberfläche, nicht in einem Handbuch. */
  bedeutung: string
  /** Anzeigefarbe, angelehnt an die Ampel. */
  color: string
  passt: (e: PosteingangEintrag, jetzt: Date) => boolean
}

/** Kalendertag in Berlin — dieselbe Rechnung wie die Follow-up-Leiter. */
function heutigerTag(jetzt: Date): string {
  return berlinerTagPlus(jetzt, 0)
}

/** Wiedervorlage-Tag eines Eintrags (YYYY-MM-DD) oder `null`. */
function faelligAmTag(e: PosteingangEintrag): string | null {
  return e.wiedervorlage ? e.wiedervorlage.slice(0, 10) : null
}

export const KOERBE: readonly Korb[] = [
  {
    key: 'heute', label: 'Heute fällig', color: '#E8A000',
    bedeutung: 'Wiedervorlage ist auf heute gesetzt',
    passt: (e, jetzt) => faelligAmTag(e) === heutigerTag(jetzt),
  },
  {
    key: 'ueberfaellig', label: 'Überfällig', color: '#D04B3B',
    bedeutung: 'Wiedervorlage lag vor heute und ist nicht erledigt',
    passt: (e, jetzt) => {
      const tag = faelligAmTag(e)
      return tag !== null && tag < heutigerTag(jetzt)
    },
  },
  {
    key: 'dringend', label: 'Dringend', color: '#7B1E14',
    // Ab 72 h. „verschleppt" (>7 Tage) zählt mit — es ist die schärfere
    // Stufe derselben Leiter, nicht eine andere Sache.
    bedeutung: 'Seit über 72 Stunden ohne Bearbeitung',
    passt: e => e.followUp === 'dringend' || e.followUp === 'verschleppt',
  },
  {
    key: 'neu', label: 'Neu', color: '#2196F3',
    // Unter 24 h UND noch keine Stufe erreicht: echter Neuzugang, bei dem
    // die Leiter noch nicht angeschlagen hat.
    bedeutung: 'Eingang vor weniger als 24 Stunden, noch unbearbeitet',
    passt: e => e.followUp === 'keine' && e.stundenOffen < 24,
  },
  {
    key: 'terminwuensche', label: 'Terminwünsche', color: '#9C27B0',
    bedeutung: 'Über die Online-Terminbuchung eingegangen',
    passt: e => e.quelle === 'terminbuchung',
  },
  {
    key: 'rueckrufe', label: 'Rückrufe', color: '#03A9F4',
    bedeutung: 'Rückruf angefordert — Anliegen oft unbekannt',
    passt: e => e.quelle === 'rueckruf',
  },
  {
    key: 'bewerber', label: 'Bewerber', color: '#26A69A',
    bedeutung: 'Bewerbung als Alltagsbegleiter/in',
    passt: e => e.art === 'bewerbung',
  },
] as const

export function korb(key: KorbKey): Korb {
  const k = KOERBE.find(x => x.key === key)
  if (!k) throw new Error(`Unbekannter Korb: ${key}`)
  return k
}

/** Einträge eines Korbs, in der übergebenen Reihenfolge. */
export function inKorb(
  eintraege: readonly PosteingangEintrag[],
  key: KorbKey,
  jetzt: Date,
): PosteingangEintrag[] {
  const k = korb(key)
  return eintraege.filter(e => k.passt(e, jetzt))
}

export type KorbZaehlung = Record<KorbKey, number>

export function zaehleKoerbe(
  eintraege: readonly PosteingangEintrag[],
  jetzt: Date,
): KorbZaehlung {
  const z = {} as KorbZaehlung
  for (const k of KOERBE) z[k.key] = 0
  for (const e of eintraege) {
    for (const k of KOERBE) if (k.passt(e, jetzt)) z[k.key]++
  }
  return z
}

/**
 * Wie viele Leads liegen in **mindestens einem** Korb?
 *
 * Nicht die Summe der Korbgrößen — die zählt Mehrfachzugehörigkeit mehrfach.
 * Diese Zahl ist die, die man einer Person sagt: „so viele Vorgänge warten".
 */
export function korbGesamt(
  eintraege: readonly PosteingangEintrag[],
  jetzt: Date,
): number {
  let n = 0
  for (const e of eintraege) {
    if (KOERBE.some(k => k.passt(e, jetzt))) n++
  }
  return n
}

/**
 * Leads, die in **keinem** Korb liegen.
 *
 * Der wichtigste Rückgabewert dieser Datei. Ein offener Lead, den kein Korb
 * zeigt, ist genau der Lead, der wieder 58 Tage liegen bleibt — er taucht in
 * keiner Arbeitsliste auf. Die Oberfläche muss diese Zahl zeigen, und wenn
 * sie über null steht, ist das eine Lücke im Modell, kein Randfall.
 */
export function ohneKorb(
  eintraege: readonly PosteingangEintrag[],
  jetzt: Date,
): PosteingangEintrag[] {
  return eintraege.filter(e => !KOERBE.some(k => k.passt(e, jetzt)))
}
