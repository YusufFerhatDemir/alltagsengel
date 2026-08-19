/**
 * § 302 SGB V — Regelwerk (Validierung vor Abrechnung)
 *
 * Bündelt die Prüfungen, die eine einzelne HKP-Position vor Aufnahme in
 * einen Abrechnungslauf bestehen muss. Kombiniert:
 *
 *   - IK / Versichertennummer / Zeiträume  → ./positionen.ts (pruefePosition,
 *     dort bereits vollständig implementiert, hier nicht dupliziert)
 *   - Tarif-Verifizierung                  → lib/billing/core/price-resolver
 *     (fail-closed: ohne verifizierten § 37-Tarif keine Kassenabrechnung —
 *     schlägt heute IMMER fehl, weil noch keine § 37-Tarife hinterlegt sind.
 *     Das ist der korrekte Zustand, keine Lücke.)
 *   - Pflegegrad-Plausibilität             → informativ, KEIN § 302-Blocker
 *     (§ 37 SGB V setzt keinen Pflegegrad voraus; die Prüfung dient nur der
 *     Datenqualität, s. Kommentar unten)
 *
 * Ergebnis trennt `blocker` (verhindert Aufnahme in den Lauf) von `hinweise`
 * (informativ, blockiert nichts) — dieselbe Trennung wie bei der Readiness
 * (intern/extern) an anderer Stelle im Modul.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePrice } from '../../billing/core/price-resolver'
import { pflegegradVon } from '../../clients/pflegegrad'
import {
  HKP_PROBLEM_TEXT, pruefePosition,
  type HkpAufbereitung, type HkpFall, type HkpKlient, type HkpLeistung,
  type HkpPosition, type HkpVerordnung,
} from './positionen'

export interface RegelwerkErgebnis {
  ok: boolean
  blocker: string[]
  hinweise: string[]
}

/** § 37 SGB V — Rechtsgrundlage, wie sie in billing_tariffs stünde, sobald Tarife existieren. */
export const SGB_V_RECHTSGRUNDLAGE = '§37 SGB V'

async function pruefeTarif(
  supabase: SupabaseClient,
  organizationId: string,
  leistung: HkpLeistung,
  verordnung: HkpVerordnung,
): Promise<string | null> {
  if (!leistung.service_type) return 'Leistung hat keine Leistungsart — Tarifprüfung nicht möglich.'
  try {
    await resolvePrice(supabase, {
      organizationId,
      leistungsart: leistung.service_type,
      rechtsgrundlage: SGB_V_RECHTSGRUNDLAGE,
      datum: leistung.date,
      kostentraegerIk: verordnung.kostentraeger_ik_nummer ?? undefined,
    })
    return null
  } catch (err) {
    return `Kein verifizierter § 37-Tarif für "${leistung.service_type}": ${(err as Error).message}`
  }
}

/**
 * Pflegegrad ist für § 37 SGB V (Behandlungspflege) rechtlich NICHT
 * Voraussetzung — anders als §45b/§39 SGB XI. Diese Prüfung ist reine
 * Datenhygiene (ein erfasster, aber ausserhalb 1–5 liegender Wert deutet auf
 * einen Erfassungsfehler hin) und blockiert deshalb nichts.
 */
function pruefePflegegradHinweis(klient: HkpKlient & { care_level?: number | string | null; pflegegrad?: number | string | null }): string | null {
  const hatRohwert = klient.care_level !== undefined && klient.care_level !== null
    || klient.pflegegrad !== undefined && klient.pflegegrad !== null
  if (!hatRohwert) return null
  const wert = pflegegradVon(klient)
  if (wert === null) {
    return 'Erfasster Pflegegrad ist ausserhalb 1–5 oder nicht auswertbar (Datenhygiene, kein § 302-Blocker).'
  }
  return null
}

export async function pruefeRegelwerk(
  supabase: SupabaseClient,
  organizationId: string,
  leistung: HkpLeistung,
  verordnung: HkpVerordnung | undefined,
  klient: (HkpKlient & { care_level?: number | string | null; pflegegrad?: number | string | null }) | undefined,
): Promise<RegelwerkErgebnis> {
  const blocker: string[] = []
  const hinweise: string[] = []

  const grundproblem = pruefePosition(leistung, verordnung, klient)
  if (grundproblem) blocker.push(HKP_PROBLEM_TEXT[grundproblem])

  if (verordnung && !grundproblem) {
    const tarifProblem = await pruefeTarif(supabase, organizationId, leistung, verordnung)
    if (tarifProblem) blocker.push(tarifProblem)
  }

  if (klient) {
    const pflegegradHinweis = pruefePflegegradHinweis(klient)
    if (pflegegradHinweis) hinweise.push(pflegegradHinweis)
  }

  return { ok: blocker.length === 0, blocker, hinweise }
}

// ── Batch-Prüfung einer ganzen Aufbereitung ──────────────────────
//
// pruefeRegelwerk() prüft eine einzelne Leistung. Bis Track 4 (19.08.2026)
// wurde die Funktion NUR von Tests aufgerufen — im Produktivpfad (Vorschau,
// Abrechnungslauf) lief ausschliesslich pruefePosition() aus positionen.ts.
// Damit war die Tarif-Fail-Closed-Regel (kein verifizierter § 37-Tarif → nicht
// abrechenbar) faktisch wirkungslos: eine Position ohne hinterlegten Tarif
// wäre als abrechenbar durchgelaufen.
//
// Die Batch-Funktion unten schliesst diese Lücke, ohne bereiteHkpVor() zu
// verändern: die Aufbereitung bleibt rein synchron und ohne DB-Zugriff, die
// Tarifprüfung ist eine zweite, ausdrücklich aufgerufene Stufe darüber.

export interface TarifBefund {
  leistung_id: string
  client_id: string
  klient_name: string
  datum: string
  leistungsart: string | null
  kostentraeger_ik: string
  hinweis: string
}

export interface AufbereitungsPruefung {
  /** true nur, wenn KEINE Position an der Tarifprüfung scheitert. */
  ok: boolean
  /** Fälle, deren Positionen alle einen verifizierten Tarif haben. */
  faelle: HkpFall[]
  /** Positionen ohne verifizierten § 37-Tarif — nicht abrechenbar. */
  ohneTarif: TarifBefund[]
  geprueftePositionen: number
}

/**
 * Prüft jede Position einer Aufbereitung gegen den Tarif-Resolver und gibt
 * eine bereinigte Fallliste zurück.
 *
 * Fail-closed: eine Position, deren Tarif nicht auflösbar ist, fällt heraus.
 * Ein Fall, dessen Positionen dadurch alle wegfallen, fällt ebenfalls heraus —
 * ein Fall mit 0 Positionen wäre eine leere Forderung.
 *
 * Die Preise werden je (Leistungsart, Datum, Kassen-IK) genau einmal
 * aufgelöst; identische Kombinationen teilen sich das Ergebnis. Ohne diesen
 * Cache würde ein Monatslauf mit 500 Positionen 500 Einzelabfragen auslösen,
 * obwohl es typischerweise eine Handvoll verschiedener Leistungsarten gibt.
 */
export async function pruefeAufbereitungTarife(
  supabase: SupabaseClient,
  organizationId: string,
  aufbereitung: Pick<HkpAufbereitung, 'faelle'>,
): Promise<AufbereitungsPruefung> {
  const cache = new Map<string, string | null>()
  const ohneTarif: TarifBefund[] = []
  const faelle: HkpFall[] = []
  let geprueftePositionen = 0

  const tarifProblem = async (p: HkpPosition): Promise<string | null> => {
    if (!p.leistungsart) return 'Position hat keine Leistungsart — Tarifprüfung nicht möglich.'
    const key = `${p.leistungsart}|${p.datum}|${p.kostentraeger_ik}`
    if (cache.has(key)) return cache.get(key) as string | null

    let problem: string | null = null
    try {
      await resolvePrice(supabase, {
        organizationId,
        leistungsart: p.leistungsart,
        rechtsgrundlage: SGB_V_RECHTSGRUNDLAGE,
        datum: p.datum,
        kostentraegerIk: p.kostentraeger_ik,
      })
    } catch (err) {
      problem = `Kein verifizierter § 37-Tarif für "${p.leistungsart}" (${p.datum}): ${(err as Error).message}`
    }
    cache.set(key, problem)
    return problem
  }

  for (const fall of aufbereitung.faelle) {
    const behalten: HkpPosition[] = []
    for (const position of fall.positionen) {
      geprueftePositionen++
      const problem = await tarifProblem(position)
      if (problem) {
        ohneTarif.push({
          leistung_id: position.leistung_id,
          client_id: position.client_id,
          klient_name: position.klient_name,
          datum: position.datum,
          leistungsart: position.leistungsart,
          kostentraeger_ik: position.kostentraeger_ik,
          hinweis: problem,
        })
        continue
      }
      behalten.push(position)
    }

    if (behalten.length === 0) continue
    faelle.push({
      ...fall,
      positionen: behalten,
      betrag_cent: behalten.reduce((s, p) => s + p.betrag_cent, 0),
    })
  }

  return { ok: ohneTarif.length === 0, faelle, ohneTarif, geprueftePositionen }
}
