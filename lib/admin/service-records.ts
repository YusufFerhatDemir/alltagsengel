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
// nicht möglich). SOLANGE das nicht passiert ist, wertet diese Funktion den
// STATUS kontrolliert auf 'draft' ab, statt den Einsatz zu verwerfen.
//
// Der BUDGET-TOPF wird dagegen NIE ersetzt. Er entscheidet, welcher Topf des
// Kunden verbraucht wird (§ 45b Entlastungsbetrag, § 39 Verhinderungspflege,
// privat) — ein Ersatzwert wäre eine stille Umbuchung fremden Geldes, kein
// Rückfall. Scheitert er am Constraint, bricht die Funktion mit einer
// deutlichen Meldung ab. Begründung ausführlich an der Stelle selbst.
//
// Nach Anwendung der Migration greift der Fallback einfach nie mehr — die
// Funktion kann dann unverändert bestehen bleiben.

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
const log = logger.child('leistungs-erfassung')

// Live erlaubter Rückfallwert für den STATUS (kleinster gemeinsamer Nenner
// beider Constraint-Stände). Für den Budget-Topf gibt es bewusst keinen —
// siehe die Begründung an der Abwertung unten.
const FALLBACK_STATUS = 'draft'

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
  /**
   * Mandant des Nachweises. PFLICHT, sobald der uebergebene Client der
   * Dienstschluessel ist (createAdminClient) — dort gibt es kein auth.uid(),
   * der Spalten-Default current_org_id() laeuft ins Leere und endet in der
   * fest verdrahteten Stamm-Organisation. Ein so abgelegter Nachweis ist fuer
   * den eigenen Mandanten hinter service_records_org_fence (RESTRICTIVE)
   * unsichtbar und wird nie abgerechnet.
   *
   * Beim RLS-Client des angemeldeten Nutzers ist der Default richtig; dort
   * darf das Feld fehlen. Angegeben ist besser, weil es nicht raet.
   */
  organization_id?: string | null
}

export interface SaveResult {
  id: string | null
  error: string | null
  /**
   * true, wenn der STATUS wegen der alten Constraints auf 'draft'
   * abgewertet wurde. Der Budget-Topf wird nie abgewertet — dort führt
   * ein Constraint-Verstoß zu `error`, nicht zu `degraded`.
   */
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
  /*
   * Abgewertet wird NUR der Status — der Budget-Topf niemals.
   *
   * Vorher gab es einen dritten Versuch, der zusätzlich `budget_type` auf
   * 'entlastung' zurückstellte. Das ist keine Abwertung, das ist eine
   * Umbuchung: eine Leistung, die auf die Verhinderungspflege (§ 39) oder
   * auf Privatzahlung lief, verbrauchte dann den Entlastungsbetrag nach
   * § 45b — 131 EUR im Monat, die dem Kunden woanders fehlen. Der Fehler
   * fällt niemandem auf: der Datensatz sieht vollständig aus, die
   * Abrechnung läuft durch, nur aus dem falschen Topf.
   *
   * Der Status ist der andere Fall: 'draft' ist sichtbar unfertig und
   * NICHT abrechenbar (nur `status` steuert Rechnung und Budget). Die
   * erfasste Arbeit geht nicht verloren, sie wartet. Das ist der
   * Unterschied zwischen „später nacharbeiten" und „still falsch gebucht".
   *
   * Wenn der Budget-Topf am Check-Constraint scheitert, ist die richtige
   * Antwort deshalb eine Fehlermeldung an den Menschen davor — nicht ein
   * stiller Ersatzwert. Behoben wird das mit
   * supabase/migrations/20260702_fix_service_records_check_constraints.sql.
   */
  const attempts: { status: string; budget_type: string }[] = [
    { status: input.status, budget_type: input.budget_type },
  ]
  if (input.status !== FALLBACK_STATUS) {
    attempts.push({ status: FALLBACK_STATUS, budget_type: input.budget_type })
  }

  let lastError = 'Unbekannter Fehler'

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('service_records')
      .insert({
        ...(input.organization_id ? { organization_id: input.organization_id } : {}),
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
      const degraded = attempt.status !== input.status
      if (degraded) {
        log.warn('Check-Constraint noch nicht migriert — Status abgewertet', {
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

  // Bis hierhin heisst: auch mit abgewertetem Status abgelehnt. Der wahr-
  // scheinlichste Grund ist der Budget-Topf — und der wird nicht ersetzt.
  // Die Meldung sagt das ausdruecklich, damit vor dem Bildschirm niemand
  // raet und niemand auf 'entlastung' ausweicht, um „es zum Laufen zu
  // bringen".
  const budgetVerdacht = lastError.includes('budget_type')
  return {
    id: null,
    degraded: false,
    error: budgetVerdacht
      ? `Der Budget-Topf "${input.budget_type}" wird von der Datenbank noch nicht `
        + 'akzeptiert (Migration 20260702 steht aus). Der Eintrag wurde NICHT '
        + 'gespeichert — er wird bewusst nicht auf den Entlastungsbetrag '
        + `umgebucht. Urspruengliche Meldung: ${lastError}`
      : lastError,
  }
}
