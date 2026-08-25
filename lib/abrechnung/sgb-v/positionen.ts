/**
 * § 302 SGB V — Verordnungs-Integration (Block 17)
 *
 * Bildet häusliche Krankenpflege (§ 37 SGB V) auf abrechenbare Positionen ab:
 * genehmigte HKP-Verordnung + erbrachte Leistungsnachweise → Positionen.
 *
 * Anders als bei § 105 SGB XI ist § 37 SGB V der einzige Verordnungstyp mit
 * echter ärztlicher Verordnung (Muster 12) — alle anderen Typen sind
 * Bewilligungen (s. istVerordnungPflicht() in lib/admin/ops.ts). Für § 302
 * heisst das: OHNE gültige, genehmigte Verordnung ist eine Leistung nicht
 * abrechenbar. Das ist hier hart geprüft, nicht als Warnung.
 *
 * KEINE Preise und KEINE Leistungsschlüssel in diesem Modul: Beträge kommen
 * aus den erfassten Leistungsnachweisen, die Positionsschlüssel (Leistungs-
 * erbringergruppenschlüssel, Abrechnungspositionsnummern) stehen in der
 * Technischen Anlage und werden erst mit ihr hinterlegt.
 */

import { euroZuCent } from '@/lib/geld'

export type HkpPositionsProblem =
  | 'keine_verordnung'
  | 'verordnung_nicht_genehmigt'
  | 'verordnung_abgelaufen'
  | 'verordnung_vor_beginn'
  | 'kein_kostentraeger_ik'
  | 'keine_versichertennummer'
  | 'kein_betrag'

export const HKP_PROBLEM_TEXT: Record<HkpPositionsProblem, string> = {
  keine_verordnung: 'Leistung ist keiner HKP-Verordnung zugeordnet (§ 37 SGB V verlangt Muster 12).',
  verordnung_nicht_genehmigt: 'Verordnung ist nicht genehmigt.',
  verordnung_abgelaufen: 'Leistungsdatum liegt nach dem Ende der Verordnung.',
  verordnung_vor_beginn: 'Leistungsdatum liegt vor dem Beginn der Verordnung.',
  kein_kostentraeger_ik: 'Der Verordnung fehlt die Krankenkassen-IK.',
  keine_versichertennummer: 'Dem Klienten fehlt die Versichertennummer.',
  kein_betrag: 'Die Leistung hat keinen Betrag.',
}

export interface HkpVerordnung {
  id: string
  client_id: string
  verordnung_type: string
  genehmigung_status: string
  gueltig_von: string | null
  gueltig_bis: string | null
  genehmigung_bis: string | null
  verordnung_nummer: string | null
  genehmigung_aktenzeichen: string | null
  kostentraeger_ik_nummer: string | null
  kostentraeger_name: string | null
}

export interface HkpLeistung {
  id: string
  client_id: string
  verordnung_id: string | null
  date: string
  duration_minutes: number | null
  service_type: string | null
  amount: number | null
}

export interface HkpKlient {
  id: string
  first_name: string | null
  last_name: string | null
  versichertennummer: string | null
  geburtsdatum: string | null
  date_of_birth: string | null
}

export interface HkpPosition {
  leistung_id: string
  client_id: string
  klient_name: string
  versichertennummer: string
  verordnung_id: string
  verordnung_nummer: string | null
  aktenzeichen: string | null
  kostentraeger_ik: string
  kostentraeger_name: string | null
  datum: string
  dauer_minuten: number | null
  leistungsart: string | null
  betrag_cent: number
}

export interface HkpAbgelehntePosition {
  leistung_id: string
  client_id: string
  klient_name: string
  datum: string
  problem: HkpPositionsProblem
  hinweis: string
}

export interface HkpFall {
  kostentraeger_ik: string
  kostentraeger_name: string | null
  client_id: string
  klient_name: string
  versichertennummer: string
  positionen: HkpPosition[]
  betrag_cent: number
}

export interface HkpAufbereitung {
  faelle: HkpFall[]
  abgelehnt: HkpAbgelehntePosition[]
  summe_cent: number
  anzahl_positionen: number
}

/** § 37 SGB V — der einzige Typ, der über § 302 abgerechnet wird. */
export const HKP_VERORDNUNG_TYPE = 'behandlungspflege_37'

function name(k: HkpKlient | undefined): string {
  if (!k) return '—'
  return [k.first_name, k.last_name].filter(Boolean).join(' ') || '—'
}

/**
 * Ende der Verordnungsgültigkeit. `gueltig_bis` ist die fachliche Grenze,
 * `genehmigung_bis` die der Kasse — es gilt die FRÜHERE von beiden, sonst
 * würden Leistungen nach Ablauf der Kassengenehmigung als abrechenbar gelten.
 */
export function gueltigBis(v: HkpVerordnung): string | null {
  const grenzen = [v.gueltig_bis, v.genehmigung_bis].filter(Boolean) as string[]
  if (grenzen.length === 0) return null
  return grenzen.sort()[0]
}

/**
 * Prüft eine einzelne Leistung gegen ihre Verordnung und den Klienten.
 * Gibt `null` zurück, wenn alles passt.
 */
export function pruefePosition(
  leistung: HkpLeistung,
  verordnung: HkpVerordnung | undefined,
  klient: HkpKlient | undefined
): HkpPositionsProblem | null {
  if (!verordnung || verordnung.verordnung_type !== HKP_VERORDNUNG_TYPE) return 'keine_verordnung'
  if (verordnung.genehmigung_status !== 'genehmigt') return 'verordnung_nicht_genehmigt'

  const von = verordnung.gueltig_von
  if (von && leistung.date < von) return 'verordnung_vor_beginn'

  const bis = gueltigBis(verordnung)
  if (bis && leistung.date > bis) return 'verordnung_abgelaufen'

  if (!verordnung.kostentraeger_ik_nummer || !/^\d{9}$/.test(verordnung.kostentraeger_ik_nummer)) {
    return 'kein_kostentraeger_ik'
  }
  if (!klient?.versichertennummer) return 'keine_versichertennummer'
  if (!leistung.amount || Number(leistung.amount) <= 0) return 'kein_betrag'

  return null
}

/**
 * Baut aus Leistungen, Verordnungen und Klienten die § 302-Fälle.
 *
 * Gruppierung: je Krankenkasse (IK) UND Klient — ein Abrechnungsfall gehört
 * immer zu genau einem Versicherten bei genau einer Kasse.
 *
 * Nicht abrechenbare Leistungen werden NICHT stillschweigend weggelassen,
 * sondern mit Begründung zurückgegeben. Alles andere würde eine unvollständige
 * Abrechnung wie eine vollständige aussehen lassen.
 */
export function bereiteHkpVor(
  leistungen: HkpLeistung[],
  verordnungen: HkpVerordnung[],
  klienten: HkpKlient[]
): HkpAufbereitung {
  const vById = new Map(verordnungen.map(v => [v.id, v]))
  const kById = new Map(klienten.map(k => [k.id, k]))

  const faelle = new Map<string, HkpFall>()
  const abgelehnt: HkpAbgelehntePosition[] = []

  for (const leistung of leistungen) {
    const verordnung = leistung.verordnung_id ? vById.get(leistung.verordnung_id) : undefined
    const klient = kById.get(leistung.client_id)

    const problem = pruefePosition(leistung, verordnung, klient)
    if (problem) {
      abgelehnt.push({
        leistung_id: leistung.id,
        client_id: leistung.client_id,
        klient_name: name(klient),
        datum: leistung.date,
        problem,
        hinweis: HKP_PROBLEM_TEXT[problem],
      })
      continue
    }

    // pruefePosition() hat alle Felder verifiziert.
    const v = verordnung as HkpVerordnung
    const k = klient as HkpKlient
    const ik = v.kostentraeger_ik_nummer as string
    // service_records.amount steht in EURO — Positionen rechnen in Cent.
    const betragCent = euroZuCent(leistung.amount as number | string | null)

    const position: HkpPosition = {
      leistung_id: leistung.id,
      client_id: leistung.client_id,
      klient_name: name(k),
      versichertennummer: k.versichertennummer as string,
      verordnung_id: v.id,
      verordnung_nummer: v.verordnung_nummer,
      aktenzeichen: v.genehmigung_aktenzeichen,
      kostentraeger_ik: ik,
      kostentraeger_name: v.kostentraeger_name,
      datum: leistung.date,
      dauer_minuten: leistung.duration_minutes,
      leistungsart: leistung.service_type,
      betrag_cent: betragCent,
    }

    const key = `${ik}|${leistung.client_id}`
    let fall = faelle.get(key)
    if (!fall) {
      fall = {
        kostentraeger_ik: ik,
        kostentraeger_name: v.kostentraeger_name,
        client_id: leistung.client_id,
        klient_name: name(k),
        versichertennummer: k.versichertennummer as string,
        positionen: [],
        betrag_cent: 0,
      }
      faelle.set(key, fall)
    }
    fall.positionen.push(position)
    fall.betrag_cent += betragCent
  }

  const liste = [...faelle.values()].sort(
    (a, b) => a.kostentraeger_ik.localeCompare(b.kostentraeger_ik) || a.klient_name.localeCompare(b.klient_name)
  )

  return {
    faelle: liste,
    abgelehnt,
    summe_cent: liste.reduce((s, f) => s + f.betrag_cent, 0),
    anzahl_positionen: liste.reduce((s, f) => s + f.positionen.length, 0),
  }
}
