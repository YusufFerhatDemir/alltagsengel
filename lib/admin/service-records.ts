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
import { pruefeZeitraum } from '@/lib/leistungsnachweis/zeitraum'
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
  /** Name der unterzeichnenden Person — gehoert zum Beleg, nicht zur Deko. */
  client_signer_name?: string | null
  /** Rolle der unterzeichnenden Person (Klient, Angehoerige, Betreuung). */
  client_signer_role?: string | null
  /**
   * GPS des Erfassungsorts. Gehoert in DENSELBEN Insert und nicht in ein
   * Folge-UPDATE: sobald eine Unterschrift mitkommt, setzt der Trigger
   * `compute_signature_hash` `is_locked = true`, und danach weist
   * `prevent_locked_record_change()` jedes weitere UPDATE ab.
   */
  gps_lat?: number | null
  gps_lng?: number | null
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
/**
 * Die Belegfelder zur Unterschrift — oder nichts.
 *
 * BEFUND (14.09.2026, Block 35)
 *
 * Dieser Weg schrieb `client_signature` und sonst nichts. Der Trigger
 * `compute_signature_hash` verlangt aber BEIDES:
 *
 *     IF NEW.proof_status = 'UNTERSCHRIEBEN'
 *        AND NEW.client_signed_at IS NOT NULL THEN …
 *
 * Ohne die zwei Felder blieb der Nachweis auf `proof_status = 'ENTWURF'`,
 * bekam keinen `signature_hash` und wurde nicht gesperrt — mit einem
 * Unterschriftsbild in der Zeile, das nichts belegt.
 *
 * Live am 14.09.2026 (alle am 02.07.2026 angelegt):
 *
 *     26 von 30 Nachweisen: Bild vorhanden, client_signed_at NULL
 *     30 von 30 Nachweisen: kein signature_hash, is_locked = false
 *
 * Das ist der Ursprung von BUSINESS_DECISION #5 („10 von 13 =
 * Datenproblem, client_signed_at NULL trotz Bild"). Der Bestand wird
 * hier NICHT angefasst — das ist eine Geschaeftsentscheidung. Was diese
 * Funktion aendert, ist, dass KEIN NEUER Nachweis mehr so entsteht.
 *
 * Ohne Unterschrift bleibt alles wie bisher: kein Zeitstempel, kein
 * Status, keine Sperre. Ein Nachweis ohne Unterschrift ist ein Entwurf,
 * und das soll er auch bleiben.
 */
function belegFelder(input: ServiceRecordInput): Record<string, unknown> {
  const unterschrift = (input.client_signature ?? '').trim()
  if (!unterschrift) return {}
  return {
    client_signed_at: new Date().toISOString(),
    proof_status: 'UNTERSCHRIEBEN',
    ...(input.client_signer_name ? { client_signer_name: input.client_signer_name } : {}),
    ...(input.client_signer_role ? { client_signer_role: input.client_signer_role } : {}),
  }
}

export async function saveServiceRecord(
  supabase: SupabaseClient,
  input: ServiceRecordInput,
): Promise<SaveResult> {
  /*
   * ZEITFENSTER — die Regel gehoert an den Engpass, nicht in die Aufrufer.
   *
   * BEFUND (Block 44, 14.09.2026): Die Regel „Ende nach Beginn" stand an
   * vier Stellen in vier Formulierungen — im Tourenweg, in
   * /api/leistungsnachweis/crud, im SGB-V-Dienst und als DB-CHECK
   * `service_records_zeitfenster_gueltig` (live: end_time > start_time).
   * HIER, wo jeder dieser Wege durchkommt, stand sie nicht. Ein neuer
   * Aufrufer erbte damit nichts.
   *
   * Was ohne diese Pruefung passierte, ist nicht „der Insert scheitert":
   * die Schleife unten wertet bei 23514 den Status ab und versucht es ein
   * ZWEITES Mal. Ein Zeitfenster-Verstoss hat denselben Fehlercode wie ein
   * Status-Verstoss — der zweite Versuch scheitert also genauso, und die
   * Meldung, die beim Menschen ankommt, ist der rohe Datenbanktext. Der
   * Tourenweg sagt an derselben Stelle „bitte als zwei Nachweise erfassen
   * (bis 23:59 und ab 00:00)"; ueber /admin/records/new kam bisher der
   * Constraint-Name.
   *
   * Bewusst NICHT ueber 24 Stunden hinweg gerechnet: `duration_minutes`
   * ist GENERATED und rechnet ohne diesen Zuschlag weiter — die Anwendung
   * meldete dann eine andere Dauer als die abgerechnete. Begruendung in
   * lib/leistungsnachweis/zeitraum.ts.
   */
  const zeitraum = pruefeZeitraum(input.start_time, input.end_time)
  if (zeitraum.befund !== 'gueltig') {
    return { id: null, error: zeitraum.meldung ?? 'Ungültiger Einsatzzeitraum.', degraded: false }
  }

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
        ...(input.gps_lat != null ? { gps_lat: input.gps_lat } : {}),
        ...(input.gps_lng != null ? { gps_lng: input.gps_lng } : {}),
        ...belegFelder(input),
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
