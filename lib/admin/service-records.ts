// ═══════════════════════════════════════════════════════════════════
// Leistungserfassung — gemeinsamer Insert-Pfad für service_records
// ═══════════════════════════════════════════════════════════════════
//
// WARUM DIESE DATEI EXISTIERT:
// Die Live-Datenbank hat noch die ALTEN Check-Constraints:
//   service_records_status_check       → nur ('draft','billed','paid','disputed')
//   service_records_budget_type_check  → nur ('entlastung')
// Die App kennt dagegen 'incomplete'/'complete'/'signed'/'invoiced' bzw.
// 'verhinderung'/'carryover'/'private'. Jeder Insert mit einem neuen Wert
// scheitert daher live mit Postgres-Fehler 23514 — der Datensatz geht verloren
// und die Betreuungskraft sieht nur eine kryptische Meldung.
//
// Der Fix für die Constraints liegt in
//   supabase/migrations/20260702_fix_service_records_check_constraints.sql
// und muss im Supabase-SQL-Editor angewendet werden (DDL ist von der App aus
// nicht möglich). SOLANGE das nicht passiert ist, degradiert diese Funktion
// kontrolliert: sie versucht den fachlich korrekten Wert und fällt bei 23514
// auf den live erlaubten Wert zurück, statt den Einsatz zu verwerfen.
//
// Nach Anwendung der Migration greift der Fallback einfach nie mehr — die
// Funktion kann dann unverändert bestehen bleiben.

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
const log = logger.child('leistungs-erfassung')

// Live erlaubte Rückfallwerte (kleinster gemeinsamer Nenner beider Constraint-Stände)
const FALLBACK_STATUS = 'draft'
const FALLBACK_BUDGET_TYPE = 'entlastung'

const CHECK_VIOLATION = '23514'

export interface ServiceRecordInput {
  client_id: string
  caregiver_id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  start_time: string
  /** HH:MM */
  end_time: string
  service_type: string
  budget_type: string
  /** Handzeichen der Betreuungskraft, z. B. "M.S." — in der DB NOT NULL */
  caregiver_initials: string
  amount?: number | null
  notes?: string | null
  client_signature?: string | null
  status: string
  completeness_check?: Record<string, unknown> | null
}

export interface SaveResult {
  id: string | null
  error: string | null
  /** true, wenn Status oder Budget-Topf wegen der alten Constraints abgewertet wurden */
  degraded: boolean
}

/**
 * Legt einen Leistungsnachweis an und überlebt die alten Check-Constraints.
 *
 * WICHTIG: `duration_minutes` wird bewusst NICHT mitgeschickt — die Spalte ist
 * in der DB GENERATED (aus start_time/end_time). Ein mitgeschickter Wert lässt
 * Postgres den Insert komplett ablehnen.
 */
export async function saveServiceRecord(
  supabase: SupabaseClient,
  input: ServiceRecordInput,
): Promise<SaveResult> {
  const attempts: { status: string; budget_type: string }[] = [
    { status: input.status, budget_type: input.budget_type },
  ]
  // Reihenfolge: erst Status abwerten, dann zusätzlich den Budget-Topf.
  if (input.status !== FALLBACK_STATUS) {
    attempts.push({ status: FALLBACK_STATUS, budget_type: input.budget_type })
  }
  if (input.budget_type !== FALLBACK_BUDGET_TYPE) {
    attempts.push({ status: FALLBACK_STATUS, budget_type: FALLBACK_BUDGET_TYPE })
  }

  let lastError = 'Unbekannter Fehler'

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('service_records')
      .insert({
        client_id: input.client_id,
        caregiver_id: input.caregiver_id,
        date: input.date,
        start_time: input.start_time,
        end_time: input.end_time,
        service_type: input.service_type,
        budget_type: attempt.budget_type,
        caregiver_initials: input.caregiver_initials,
        amount: input.amount ?? null,
        notes: input.notes || null,
        client_signature: input.client_signature || null,
        status: attempt.status,
        completeness_check: input.completeness_check ?? null,
      })
      .select('id')
      .single()

    if (!error) {
      const degraded =
        attempt.status !== input.status || attempt.budget_type !== input.budget_type
      if (degraded) {
        log.warn('Check-Constraint noch nicht migriert — abweichend gespeichert', {
          gespeichert: attempt,
          gewuenscht: { status: input.status, budget_type: input.budget_type },
        })
      }
      return { id: data?.id ?? null, error: null, degraded }
    }

    lastError = error.message
    // Nur bei Constraint-Verletzung erneut versuchen — bei allen anderen
    // Fehlern (RLS, fehlende FK, Netzwerk) sofort abbrechen.
    if (error.code !== CHECK_VIOLATION) break
  }

  return { id: null, error: lastError, degraded: false }
}
