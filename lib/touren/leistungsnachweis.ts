// ═══════════════════════════════════════════════════════════════════
// TOURENPLANUNG — Leistungsnachweis-Werte aus dem Einsatz ableiten
// ═══════════════════════════════════════════════════════════════════
//
// BEFUND (Einsatzplanungs-Track): Schliesst ein Stop mit
// `leistungsnachweis_anlegen: true` ab, legte PATCH /api/tours/[id]/stops
// den Nachweis mit zwei FESTEN Werten an:
//
//     service_type: 'Alltagsbegleitung'
//     budget_type:  'entlastung'
//
// Beides ist geraten, nicht uebernommen. Der Stop haengt an einem Einsatz
// (`assignments`), und DER traegt die Leistungsart, die die Disposition
// gepflegt hat — 'Haushaltshilfe', 'Arztbegleitung', 'verhinderungspflege'
// und so weiter (`lib/touren/server.ts::aufloeseStops` schreibt sie beim
// Anlegen des Einsatzes).
//
// Die Folgen der festen Werte:
//
//   * service_type: der Rechnungslauf loest den Tarif ueber
//     `LOWER(billing_tariffs.leistungsart) = LOWER(service_records.service_type)`
//     auf (siehe lib/billing/leistungsarten.ts). Eine Haushaltshilfe, die als
//     'Alltagsbegleitung' im Nachweis steht, wird also zum FALSCHEN Satz
//     abgerechnet — und faellt nicht auf, weil ein Tarif existiert.
//
//   * budget_type: 'entlastung' ist der § 45b-Topf (131 EUR/Monat). Ein
//     Verhinderungspflege-Einsatz (§ 42a, eigener Topf, eigenes Kontingent)
//     verbrauchte damit still den Entlastungsbetrag des Kunden. Genau die
//     Umbuchung, die `lib/admin/service-records.ts` an anderer Stelle
//     ausdruecklich verweigert ("stille Umbuchung fremden Geldes").
//
// Diese Datei haelt die Ableitung an EINER Stelle, damit sie testbar ist und
// nicht in einer Route-Datei versteckt liegt.

import { normalisiereLeistungsart } from '@/lib/billing/leistungsarten'

/**
 * Einsatz-Leistungsarten, die auf den § 42a-Topf (Verhinderungs-/Kurzzeit-
 * pflege) zeigen. Gleiche Wortliste wie `VERHINDERUNG_BUDGET_TYPEN` in
 * lib/billing/core/budget-cap.ts — dort als budget_type, hier als die
 * Schreibweise, die in `assignments.service_type` landet (POST
 * /api/einsatzplanung prueft `service_type === 'verhinderungspflege' |
 * 'verhinderung'`).
 */
export const VP_LEISTUNGSARTEN = ['verhinderungspflege', 'verhinderung', 'kurzzeitpflege'] as const

/** Einsatz-Leistungsarten ohne Kassenbezug. */
export const PRIVAT_LEISTUNGSARTEN = ['privat', 'private', 'selbstzahler'] as const

/**
 * `service_records.budget_type` — live erlaubt sind ausschliesslich
 * 'entlastung', 'verhinderungspflege', 'carryover', 'private'
 * (CHECK service_records_budget_type_check, am 27.08.2026 gegen Produktion
 * gelesen). Ein anderer Wert laesst den INSERT mit 23514 scheitern; ersetzt
 * wird er dann NICHT (siehe lib/admin/service-records.ts).
 */
export type NachweisBudgetTyp = 'entlastung' | 'verhinderungspflege' | 'private'

export interface NachweisWerte {
  service_type: string
  budget_type: NachweisBudgetTyp
}

/**
 * Der Budget-Topf zu einer Einsatz-Leistungsart.
 *
 * Bewusst KEIN Raten in Richtung Kasse: alles, was nicht ausdruecklich als
 * Verhinderungspflege oder als Privatleistung gekennzeichnet ist, bleibt beim
 * Entlastungsbetrag — dem Topf, den die Tourenplanung schon immer gebucht hat
 * und der zu den Leistungen der Tourenmasken (Alltagsbegleitung,
 * Haushaltshilfe, Einkaufshilfe …) fachlich gehoert.
 */
export function budgetTypFuerLeistungsart(serviceType: string): NachweisBudgetTyp {
  const n = normalisiereLeistungsart(serviceType)
  if ((VP_LEISTUNGSARTEN as readonly string[]).includes(n)) return 'verhinderungspflege'
  if ((PRIVAT_LEISTUNGSARTEN as readonly string[]).includes(n)) return 'private'
  return 'entlastung'
}

/**
 * Die Nachweis-Werte zu einem Einsatz — oder `null`, wenn der Einsatz keine
 * Leistungsart traegt.
 *
 * `null` heisst fail-closed: der Aufrufer legt dann KEINEN Nachweis an und
 * meldet das. Ein Ersatzwert waere genau der Fehler, den diese Datei behebt.
 * (`assignments.service_type` ist NOT NULL — `null` kommt hier also nur an,
 * wenn der Einsatz gar nicht gelesen werden konnte oder der Stop keinen hat.)
 */
export function nachweisWerteAusEinsatz(
  einsatzServiceType: string | null | undefined,
): NachweisWerte | null {
  const service = (einsatzServiceType ?? '').trim()
  if (!service) return null
  return { service_type: service, budget_type: budgetTypFuerLeistungsart(service) }
}
