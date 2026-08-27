// ═══════════════════════════════════════════════════════════════
// EINSATZ-KONFLIKTE — Datenbeschaffung
// ═══════════════════════════════════════════════════════════════
// Getrennt von `konflikte.ts`, damit die reine Prüflogik ohne
// Supabase-Import auch im Browser-Bundle (Kalender) landen kann.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { findeKonflikte, type Konflikt, type KonfliktEinsatz } from './konflikte'

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function personName(wert: unknown): string | null {
  const p = Array.isArray(wert) ? wert[0] : wert
  if (!p || typeof p !== 'object') return null
  const r = p as { first_name?: string | null; last_name?: string | null }
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
  return name === '' ? null : name
}

const SELECT = `
  id, client_id, caregiver_id, assignment_date, weekday, valid_from, valid_until,
  start_time, end_time, status,
  client:clients(first_name, last_name),
  caregiver:caregivers(first_name, last_name)
`

function mapZeile(r: Record<string, unknown>): KonfliktEinsatz {
  return {
    id: String(r.id),
    client_id: (r.client_id as string | null) ?? null,
    caregiver_id: (r.caregiver_id as string | null) ?? null,
    assignment_date: (r.assignment_date as string | null) ?? null,
    weekday: (r.weekday as number | null) ?? null,
    valid_from: (r.valid_from as string | null) ?? null,
    valid_until: (r.valid_until as string | null) ?? null,
    start_time: (r.start_time as string | null) ?? null,
    end_time: (r.end_time as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    client_name: personName(r.client),
    caregiver_name: personName(r.caregiver),
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `caregiver_id` und `client_id` landen als Textbaustein in einem
 * PostgREST-`or()`-Ausdruck. Kommt dort ein Wert mit Komma oder Punkt an —
 * beides sind Trennzeichen der Filtersprache —, entsteht ein ANDERER Filter
 * als gemeint. Das Ergebnis ist im besten Fall HTTP 400 (und damit,
 * zusammen mit dem Fail-Open unten, eine stillschweigend ausgefallene
 * Konfliktpruefung), im schlechteren ein Bestand, der nichts mit dem
 * Kandidaten zu tun hat.
 *
 * Beide Werte kommen aus dem Request-Body von /api/einsatzplanung. Sie
 * werden deshalb hier geprueft, bevor sie in den Ausdruck wandern.
 */
function assertFilterId(wert: string, feld: string): void {
  if (!UUID.test(wert)) {
    throw new UserFacingError(`${feld} ist keine gültige ID.`)
  }
}

/**
 * Lädt alle Einsätze, die für den Kandidaten überhaupt kollidieren können
 * (gleiche Betreuungskraft ODER gleicher Klient), und gibt die gefundenen
 * Überschneidungen zurück.
 *
 * Zwei Fälle, wie in `findeKonflikte()`: mit `assignment_date` wird gegen
 * denselben Tag geprüft, mit `weekday` (Serie ohne Einzeldatum) gegen andere
 * Serien desselben Wochentags. Fehlt beides, wird nicht geprüft — der
 * Aufrufer bekommt dann eine leere Liste.
 */
export async function ladeKonflikte(
  supabase: SupabaseClient,
  organizationId: string,
  kandidat: KonfliktEinsatz,
): Promise<Konflikt[]> {
  const istSerie = !kandidat.assignment_date && kandidat.weekday != null
  if (!kandidat.assignment_date && !istSerie) return []
  if (!kandidat.caregiver_id && !kandidat.client_id) return []

  if (kandidat.caregiver_id) assertFilterId(kandidat.caregiver_id, 'caregiver_id')
  if (kandidat.client_id) assertFilterId(kandidat.client_id, 'client_id')
  if (!istSerie && !ISO_DATUM.test(String(kandidat.assignment_date ?? ''))) {
    throw new UserFacingError('assignment_date ist kein gültiges Datum (JJJJ-MM-TT).')
  }
  if (istSerie && !Number.isInteger(kandidat.weekday)) {
    throw new UserFacingError('weekday muss eine ganze Zahl von 0 bis 7 sein.')
  }

  const oderFilter = [
    kandidat.caregiver_id ? `caregiver_id.eq.${kandidat.caregiver_id}` : null,
    kandidat.client_id ? `client_id.eq.${kandidat.client_id}` : null,
  ].filter(Boolean).join(',')

  let query = supabase
    .from('assignments')
    .select(SELECT)
    .eq('organization_id', organizationId)
    .or(oderFilter)

  query = istSerie
    ? query.is('assignment_date', null).eq('weekday', kandidat.weekday as number)
    : query.eq('assignment_date', kandidat.assignment_date as string)

  const { data, error } = await query

  // Fail-closed wäre hier falsch: der DB-Trigger fängt die Doppelbelegung
  // weiterhin ab. Ein Lesefehler darf die Planung nicht blockieren, er darf
  // nur die schöne Vorab-Meldung kosten.
  if (error || !data) return []

  const bestand: KonfliktEinsatz[] = (data as Record<string, unknown>[]).map(mapZeile)

  return findeKonflikte(kandidat, bestand)
}
