'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Notfall- & Medikamentenplan
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireKunde() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['kunde', 'client', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Kunden.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Kunde'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Medikament speichern (anlegen oder aktualisieren) ──────────

interface SaveMedicationInput {
  id?: string
  medikament_name: string
  wirkstoff?: string
  dosierung: number
  einheit: string
  einnahme_morgens: boolean
  einnahme_mittags: boolean
  einnahme_abends: boolean
  einnahme_nachts: boolean
  einnahme_hinweis?: string
  verordnet_von?: string
  dauermedikation: boolean
  beginn_datum?: string
  end_datum?: string
  notizen?: string
}

export async function saveMedicationAction(
  input: SaveMedicationInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    // Validierung
    if (!input.medikament_name || input.medikament_name.trim().length === 0) {
      return { ok: false, error: 'Medikamentenname darf nicht leer sein.' }
    }
    if (typeof input.dosierung !== 'number' || input.dosierung <= 0) {
      return { ok: false, error: 'Dosierung muss groesser als 0 sein.' }
    }

    const payload = {
      medikament_name: input.medikament_name.trim(),
      wirkstoff: input.wirkstoff?.trim() || null,
      dosierung: input.dosierung,
      einheit: input.einheit,
      einnahme_morgens: input.einnahme_morgens,
      einnahme_mittags: input.einnahme_mittags,
      einnahme_abends: input.einnahme_abends,
      einnahme_nachts: input.einnahme_nachts,
      einnahme_hinweis: input.einnahme_hinweis?.trim() || null,
      verordnet_von: input.verordnet_von?.trim() || null,
      dauermedikation: input.dauermedikation,
      beginn_datum: input.beginn_datum || null,
      end_datum: input.end_datum || null,
      notizen: input.notizen?.trim() || null,
    }

    if (input.id) {
      // Update — Ownership-Check via WHERE
      const { error: updateError } = await supabase
        .from('medikamentenplan')
        .update(payload)
        .eq('id', input.id)
        .eq('user_id', userId)

      if (updateError) {
        return { ok: false, error: updateError.message }
      }

      await logAuditEvent({
        action: 'update',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: 'medikamentenplan',
        entityId: input.id,
        details: { medikament_name: payload.medikament_name },
      }).catch(() => {})
    } else {
      // Insert
      const { data: inserted, error: insertError } = await supabase
        .from('medikamentenplan')
        .insert({ ...payload, user_id: userId, aktiv: true })
        .select('id')
        .single()

      if (insertError) {
        return { ok: false, error: insertError.message }
      }

      await logAuditEvent({
        action: 'create',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: 'medikamentenplan',
        entityId: inserted?.id ?? null,
        details: { medikament_name: payload.medikament_name },
      }).catch(() => {})
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Medikament loeschen (Soft-Delete: aktiv=false) ─────────────

export async function deleteMedicationAction(
  input: { id: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.id || input.id.trim().length === 0) {
      return { ok: false, error: 'Medikamenten-ID fehlt.' }
    }

    const { error: updateError } = await supabase
      .from('medikamentenplan')
      .update({ aktiv: false })
      .eq('id', input.id)
      .eq('user_id', userId)

    if (updateError) {
      return { ok: false, error: updateError.message }
    }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'medikamentenplan',
      entityId: input.id,
      details: { aktion: 'soft_delete' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Notfall-Informationen speichern (Upsert) ──────────────────

interface SaveNotfallInfoInput {
  blutgruppe?: string
  allergien?: string
  vorerkrankungen?: string
  notfallkontakt_name?: string
  notfallkontakt_telefon?: string
  notfallkontakt_beziehung?: string
  versicherung?: string
  versicherungsnummer?: string
  hausarzt_name?: string
  hausarzt_telefon?: string
  notfall_pin?: string
}

export async function saveNotfallInfoAction(
  input: SaveNotfallInfoInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    // PIN-Validierung: maximal 4 Ziffern
    if (input.notfall_pin && !/^\d{0,4}$/.test(input.notfall_pin)) {
      return { ok: false, error: 'Notfall-PIN darf maximal 4 Ziffern enthalten.' }
    }

    const payload = {
      blutgruppe: input.blutgruppe?.trim() || null,
      allergien: input.allergien?.trim() || null,
      vorerkrankungen: input.vorerkrankungen?.trim() || null,
      notfallkontakt_name: input.notfallkontakt_name?.trim() || null,
      notfallkontakt_telefon: input.notfallkontakt_telefon?.trim() || null,
      notfallkontakt_beziehung: input.notfallkontakt_beziehung?.trim() || null,
      versicherung: input.versicherung?.trim() || null,
      versicherungsnummer: input.versicherungsnummer?.trim() || null,
      hausarzt_name: input.hausarzt_name?.trim() || null,
      hausarzt_telefon: input.hausarzt_telefon?.trim() || null,
      notfall_pin: input.notfall_pin || null,
    }

    // Pruefen ob bereits ein Eintrag existiert
    const { data: existing } = await supabase
      .from('notfall_info')
      .select('user_id')
      .eq('user_id', userId)
      .single()

    if (existing) {
      // Update
      const { error: updateError } = await supabase
        .from('notfall_info')
        .update(payload)
        .eq('user_id', userId)

      if (updateError) {
        return { ok: false, error: updateError.message }
      }

      await logAuditEvent({
        action: 'update',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: 'notfall_info',
        entityId: userId,
        details: { aktion: 'notfall_info_aktualisiert' },
      }).catch(() => {})
    } else {
      // Insert
      const { error: insertError } = await supabase
        .from('notfall_info')
        .insert({ ...payload, user_id: userId })

      if (insertError) {
        return { ok: false, error: insertError.message }
      }

      await logAuditEvent({
        action: 'create',
        actorId: userId,
        actorRole: role,
        actorName: name,
        organizationId,
        entityType: 'notfall_info',
        entityId: userId,
        details: { aktion: 'notfall_info_erstellt' },
      }).catch(() => {})
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
