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
  type HkpKlient, type HkpLeistung, type HkpVerordnung,
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
