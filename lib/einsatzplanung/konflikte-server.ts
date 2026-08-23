// ═══════════════════════════════════════════════════════════════
// EINSATZ-KONFLIKTE — Datenbeschaffung
// ═══════════════════════════════════════════════════════════════
// Getrennt von `konflikte.ts`, damit die reine Prüflogik ohne
// Supabase-Import auch im Browser-Bundle (Kalender) landen kann.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { findeKonflikte, type Konflikt, type KonfliktEinsatz } from './konflikte'

function personName(wert: unknown): string | null {
  const p = Array.isArray(wert) ? wert[0] : wert
  if (!p || typeof p !== 'object') return null
  const r = p as { first_name?: string | null; last_name?: string | null }
  const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
  return name === '' ? null : name
}

/**
 * Lädt alle Einsätze desselben Tages, die für den Kandidaten überhaupt
 * kollidieren können (gleiche Betreuungskraft ODER gleicher Klient), und
 * gibt die gefundenen Überschneidungen zurück.
 *
 * Ohne `assignment_date` wird nicht geprüft — siehe Begründung in
 * `findeKonflikte()`. Der Aufrufer bekommt dann eine leere Liste.
 */
export async function ladeKonflikte(
  supabase: SupabaseClient,
  organizationId: string,
  kandidat: KonfliktEinsatz,
): Promise<Konflikt[]> {
  if (!kandidat.assignment_date) return []
  if (!kandidat.caregiver_id && !kandidat.client_id) return []

  const oderFilter = [
    kandidat.caregiver_id ? `caregiver_id.eq.${kandidat.caregiver_id}` : null,
    kandidat.client_id ? `client_id.eq.${kandidat.client_id}` : null,
  ].filter(Boolean).join(',')

  const { data, error } = await supabase
    .from('assignments')
    .select(`
      id, client_id, caregiver_id, assignment_date, start_time, end_time, status,
      client:clients(first_name, last_name),
      caregiver:caregivers(first_name, last_name)
    `)
    .eq('organization_id', organizationId)
    .eq('assignment_date', kandidat.assignment_date)
    .or(oderFilter)

  // Fail-closed wäre hier falsch: der DB-Trigger fängt die Doppelbelegung
  // weiterhin ab. Ein Lesefehler darf die Planung nicht blockieren, er darf
  // nur die schöne Vorab-Meldung kosten.
  if (error || !data) return []

  const bestand: KonfliktEinsatz[] = data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    client_id: (r.client_id as string | null) ?? null,
    caregiver_id: (r.caregiver_id as string | null) ?? null,
    assignment_date: (r.assignment_date as string | null) ?? null,
    start_time: (r.start_time as string | null) ?? null,
    end_time: (r.end_time as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    client_name: personName(r.client),
    caregiver_name: personName(r.caregiver),
  }))

  return findeKonflikte(kandidat, bestand)
}
