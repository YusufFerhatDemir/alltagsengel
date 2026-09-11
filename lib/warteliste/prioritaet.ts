/**
 * Priorisierung der Kunden-Warteliste im Admin-Posteingang.
 *
 * Kriterien (Auftrag 11.09.2026): Pflegegrad, Region, Leistungswunsch,
 * Dringlichkeit, Quelle, Datum, letzter Kontakt.
 *
 * ── WARUM EINE PUNKTZAHL UND KEINE REINE SORTIERUNG ───────────────────
 * Sieben Kriterien lassen sich nicht hintereinander sortieren, ohne dass
 * das erste die übrigen sechs erschlägt. Eine Punktzahl mit sichtbarer
 * Aufschlüsselung („warum steht der oben?") lässt jedes Kriterium
 * mitsprechen. Einzelsortierungen je Kriterium bleiben daneben wählbar.
 *
 * ── DIE GEWICHTE ──────────────────────────────────────────────────────
 * Dringlichkeit schlägt alles andere: ein Lead, der seit 72 h unberührt
 * liegt, ist ein Versäumnis — egal wie gut er sonst passt. Danach kommen
 * die Merkmale, die über Umsetzbarkeit entscheiden (Region im Einsatz-
 * gebiet, Pflegegrad = Anspruch auf den Entlastungsbetrag von 131 €/Monat),
 * zuletzt die weichen (Quelle, Umfang des Leistungswunschs).
 *
 * Die Leistung darf in Hessen erst nach dem §45a-Bescheid über die Kasse
 * laufen („im Anerkennungsverfahren"); der Pflegegrad sagt deshalb hier
 * etwas über den künftigen Anspruch, nicht über eine heutige Abrechnung.
 *
 * Rein rechnend — aus Seite und Tests importierbar.
 */

import {
  followUpSeitEingang, followUpSeitWiedervorlage, plusTage, stundenSeit,
  FOLLOW_UP_META, type FollowUpStufe,
} from '@/lib/leads/follow-up'
import { WARTELISTE_OFFEN, WARTELISTE_STUFEN_FLOW, wartelisteStufe } from './katalog'

export interface WartelisteLead {
  id: string
  stufe: string
  pflegegrad: string | null
  /** Regionsschlüssel ODER Label aus `ort` — beides wird erkannt. */
  region: string | null
  bundesland: string | null
  gewuenschte_leistungen: string[]
  nachricht: string | null
  quelle: string | null
  created_at: string | null
  /** Letzte Bearbeitung (Trigger `trg_state_waitlist_updated_at`). */
  updated_at: string | null
}

export interface PrioritaetsTeil {
  kriterium: string
  punkte: number
  grund: string
}

export interface Prioritaet {
  punkte: number
  followUp: FollowUpStufe
  /** Wann die Stufe wieder vorgelegt wird (nur offene Stufen außer NEU). */
  wiedervorlageAm: string | null
  teile: PrioritaetsTeil[]
}

// ── Region ───────────────────────────────────────────────────────────
// Kerngebiet: Hessen und in der Regionsliste namentlich geführt. „Umland"
// ist Hessen, aber außerhalb der bekannten Orte; Mainz liegt in
// Rheinland-Pfalz — dort gibt es heute keine Kassenabrechnung.
const REGION_PUNKTE: Record<string, number> = { kern: 12, umland: 5, ausserhalb: 1 }

const UMLAND_LABEL = 'Anderer Ort im Rhein-Main-Gebiet'

function regionsKlasse(lead: WartelisteLead): 'kern' | 'umland' | 'ausserhalb' | null {
  if (!lead.region && !lead.bundesland) return null
  if (lead.bundesland && lead.bundesland !== 'hessen') return 'ausserhalb'
  if (lead.region === 'umland' || lead.region === UMLAND_LABEL) return 'umland'
  return 'kern'
}

// ── Pflegegrad ───────────────────────────────────────────────────────
// PG 1–5 haben Anspruch auf den Entlastungsbetrag (131 €/Monat); höherer
// Grad = höherer Betreuungsbedarf. „unbekannt" ist oft ein PG, den jemand
// nicht nachgeschlagen hat — mehr als „keiner", weniger als PG 1.
const PFLEGEGRAD_PUNKTE: Record<string, number> = {
  '5': 20, '4': 17, '3': 14, '2': 11, '1': 8, unbekannt: 5, '0': 0,
}

// ── Leistungswunsch ──────────────────────────────────────────────────
// Demenzbetreuung und Entlastung pflegender Angehöriger sind die Fälle, in
// denen eine Familie am dringendsten auf Hilfe wartet.
const LEISTUNG_SCHWER = new Set(['demenzbetreuung', 'entlastung_angehoerige'])

// ── Quelle ───────────────────────────────────────────────────────────
// Eine Empfehlung oder ein Partner (Pflegestützpunkt, Sozialdienst) kommt
// mit Vorvertrauen und schließt häufiger ab als ein Anzeigenklick.
const QUELLE_PUNKTE: Array<[RegExp, number, string]> = [
  [/empfehl|referral|weiterempf/i, 8, 'Empfehlung'],
  [/partner|sozialdienst|pflegestuetzpunkt|pflegestützpunkt|krankenhaus|klinik/i, 8, 'Partner/Zuweiser'],
  [/google|organic|seo|website|warteliste/i, 3, 'Website/Suche'],
]

// ── Dringlichkeit im Text ────────────────────────────────────────────
// Heuristik, als solche gekennzeichnet: wer „Entlassung" oder „sofort"
// schreibt, wartet nicht auf die Wiedervorlage.
const DRINGLICH_IM_TEXT = /dringend|sofort|schnellstm|asap|entlass|krankenhaus|notfall|akut|ab morgen|diese woche/i

const FOLLOW_UP_PUNKTE: Record<FollowUpStufe, number> = {
  keine: 0, erinnerung: 25, eskalation: 40, dringend: 60,
}

/** Wiedervorlage einer offenen Stufe aus letzter Bearbeitung + Stufenfrist. */
export function wiedervorlageFuer(lead: Pick<WartelisteLead, 'stufe' | 'updated_at' | 'created_at'>): string | null {
  const tage = wartelisteStufe(lead.stufe).wiedervorlageTage
  if (tage === null || !WARTELISTE_OFFEN.includes(lead.stufe)) return null
  const basis = lead.updated_at || lead.created_at
  return basis ? plusTage(basis, tage) : null
}

/** Follow-up-Stufe eines Wartelisteneintrags. */
export function followUpFuer(lead: Pick<WartelisteLead, 'stufe' | 'updated_at' | 'created_at'>, jetzt: Date = new Date()): FollowUpStufe {
  // Unbekannter DB-Wert: wie NEU behandeln — die Uhr läuft ab Eingang.
  if (lead.stufe === 'neu' || !WARTELISTE_STUFEN_FLOW.includes(lead.stufe)) {
    return followUpSeitEingang(lead.created_at, jetzt)
  }
  return followUpSeitWiedervorlage(wiedervorlageFuer(lead), jetzt)
}

export function berechnePrioritaet(lead: WartelisteLead, jetzt: Date = new Date()): Prioritaet {
  const teile: PrioritaetsTeil[] = []
  // Unbekannte Stufen gelten als offen: eine Zeile, die niemand einordnen
  // kann, gehört nach oben, nicht ans Ende.
  const offen = !['kunde', 'abgelehnt'].includes(lead.stufe)

  // 1. Dringlichkeit (Bearbeitungsdruck + Hinweis im Text)
  const followUp = offen ? followUpFuer(lead, jetzt) : 'keine'
  if (followUp !== 'keine') {
    teile.push({
      kriterium: 'Dringlichkeit',
      punkte: FOLLOW_UP_PUNKTE[followUp],
      grund: lead.stufe === 'neu'
        ? `${FOLLOW_UP_META[followUp].label}: seit ${Math.floor(stundenSeit(lead.created_at, jetzt) ?? 0)} h unbearbeitet`
        : `${FOLLOW_UP_META[followUp].label}: Wiedervorlage überfällig`,
    })
  }
  if (lead.nachricht && DRINGLICH_IM_TEXT.test(lead.nachricht)) {
    teile.push({ kriterium: 'Dringlichkeit', punkte: 10, grund: 'Dringlichkeit in der Nachricht genannt' })
  }

  // 2. Pflegegrad
  if (lead.pflegegrad && PFLEGEGRAD_PUNKTE[lead.pflegegrad] !== undefined) {
    const p = PFLEGEGRAD_PUNKTE[lead.pflegegrad]
    if (p > 0) {
      teile.push({
        kriterium: 'Pflegegrad',
        punkte: p,
        grund: lead.pflegegrad === 'unbekannt' ? 'Pflegegrad unbekannt' : `Pflegegrad ${lead.pflegegrad}`,
      })
    }
  }

  // 3. Region
  const rk = regionsKlasse(lead)
  if (rk) {
    teile.push({
      kriterium: 'Region',
      punkte: REGION_PUNKTE[rk],
      grund: rk === 'kern' ? 'Im Einsatzgebiet' : rk === 'umland' ? 'Rhein-Main-Umland' : 'Außerhalb Hessens',
    })
  }

  // 4. Leistungswunsch
  const leistungen = lead.gewuenschte_leistungen ?? []
  if (leistungen.length > 0) {
    const schwer = leistungen.filter(l => LEISTUNG_SCHWER.has(l)).length
    const p = Math.min(leistungen.length, 3) * 2 + (schwer > 0 ? 4 : 0)
    teile.push({
      kriterium: 'Leistungswunsch',
      punkte: p,
      grund: `${leistungen.length} Leistung(en)${schwer > 0 ? ', davon Demenz/Angehörigen-Entlastung' : ''}`,
    })
  }

  // 5. Quelle
  if (lead.quelle) {
    const treffer = QUELLE_PUNKTE.find(([re]) => re.test(lead.quelle as string))
    if (treffer) teile.push({ kriterium: 'Quelle', punkte: treffer[1], grund: treffer[2] })
  }

  // 6. Datum — Wartezeit zählt, gedeckelt: nach zwei Wochen ist das
  // Versäumnis schon über die Dringlichkeit abgebildet.
  const tageAlt = Math.floor((stundenSeit(lead.created_at, jetzt) ?? 0) / 24)
  if (offen && tageAlt > 0) {
    teile.push({ kriterium: 'Datum', punkte: Math.min(tageAlt, 14) * 0.5, grund: `Seit ${tageAlt} Tag(en) auf der Liste` })
  }

  // 7. Letzter Kontakt — lange ohne Bearbeitung in einer offenen Stufe
  // nach NEU. Für NEU zählt schon die Dringlichkeit.
  if (offen && lead.stufe !== 'neu') {
    const tageStill = Math.floor((stundenSeit(lead.updated_at || lead.created_at, jetzt) ?? 0) / 24)
    if (tageStill > 0) {
      teile.push({ kriterium: 'Letzter Kontakt', punkte: Math.min(tageStill, 10) * 0.5, grund: `Letzte Bearbeitung vor ${tageStill} Tag(en)` })
    }
  }

  // Abgeschlossene Einträge (Kunde/Abgelehnt) rutschen ans Ende, egal wie
  // gut sie passen — sie brauchen keine Arbeit mehr.
  const summe = teile.reduce((s, t) => s + t.punkte, 0)
  return {
    punkte: offen ? Math.round(summe * 10) / 10 : 0,
    followUp,
    wiedervorlageAm: offen && lead.stufe !== 'neu' ? wiedervorlageFuer(lead) : null,
    teile,
  }
}

// ── Sortierungen ─────────────────────────────────────────────────────
export const WARTELISTE_SORTIERUNGEN = [
  { key: 'prioritaet', label: 'Priorität (empfohlen)' },
  { key: 'dringlichkeit', label: 'Dringlichkeit' },
  { key: 'pflegegrad', label: 'Pflegegrad' },
  { key: 'region', label: 'Region' },
  { key: 'leistung', label: 'Leistungswunsch' },
  { key: 'quelle', label: 'Quelle' },
  { key: 'datum_neu', label: 'Datum (neueste zuerst)' },
  { key: 'datum_alt', label: 'Datum (älteste zuerst)' },
  { key: 'letzter_kontakt', label: 'Letzter Kontakt (längste Stille zuerst)' },
] as const

export type WartelisteSortierung = (typeof WARTELISTE_SORTIERUNGEN)[number]['key']

const zeit = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0)
const pgRang = (pg: string | null) => (pg ? PFLEGEGRAD_PUNKTE[pg] ?? -1 : -1)

/**
 * Sortiert eine Kopie. Bei Gleichstand gilt immer: ältester Eingang zuerst
 * — wer länger wartet, kommt bei sonst gleicher Lage vorher dran.
 */
export function sortiereWarteliste<T extends WartelisteLead>(
  leads: readonly T[],
  sortierung: WartelisteSortierung,
  prio: (lead: T) => Prioritaet,
): T[] {
  const fifo = (a: T, b: T) => zeit(a.created_at) - zeit(b.created_at)
  const cmp: Record<WartelisteSortierung, (a: T, b: T) => number> = {
    prioritaet: (a, b) => prio(b).punkte - prio(a).punkte,
    dringlichkeit: (a, b) => FOLLOW_UP_META[prio(b).followUp].rang - FOLLOW_UP_META[prio(a).followUp].rang,
    pflegegrad: (a, b) => pgRang(b.pflegegrad) - pgRang(a.pflegegrad),
    region: (a, b) => (a.region || '~').localeCompare(b.region || '~', 'de'),
    leistung: (a, b) => (b.gewuenschte_leistungen?.length ?? 0) - (a.gewuenschte_leistungen?.length ?? 0),
    quelle: (a, b) => (a.quelle || '~').localeCompare(b.quelle || '~', 'de'),
    datum_neu: (a, b) => zeit(b.created_at) - zeit(a.created_at),
    datum_alt: () => 0,
    letzter_kontakt: (a, b) => zeit(a.updated_at || a.created_at) - zeit(b.updated_at || b.created_at),
  }
  return [...leads].sort((a, b) => cmp[sortierung](a, b) || fifo(a, b))
}
