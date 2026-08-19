'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer MIS Training
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireMISAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Administratoren.')
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Standard-Schulungskatalog befuellen ────────────────────────

const DEFAULT_TRAININGS = [
  { name: 'Erste-Hilfe-Kurs', category: 'pflicht', validity_months: 24, duration_hours: 9, description: 'Erste-Hilfe-Grundausbildung (9 UE) gemaess DGUV Vorschrift 1', provider: '' },
  { name: 'Hygieneschulung', category: 'pflicht', validity_months: 12, duration_hours: 4, description: 'Hygiene in der Alltagsbegleitung, Infektionsschutz, Haendehygiene', provider: '' },
  { name: '§45b SGB XI Nachweis', category: 'pflicht', validity_months: 0, duration_hours: 40, description: 'Qualifikationsnachweis fuer Angebote zur Unterstuetzung im Alltag nach §45b SGB XI', provider: '' },
  { name: 'Datenschutz (DSGVO)', category: 'pflicht', validity_months: 12, duration_hours: 2, description: 'Datenschutz-Grundunterweisung, Umgang mit personenbezogenen Daten', provider: '' },
  { name: 'Demenz-Betreuung', category: 'pflicht', validity_months: 24, duration_hours: 8, description: 'Grundlagen der Demenzbetreuung, Validation, Kommunikationstechniken', provider: '' },
  { name: 'Sturzpraevention', category: 'empfohlen', validity_months: 24, duration_hours: 4, description: 'Sturzrisiko erkennen und vorbeugen im haeuslichen Umfeld', provider: '' },
  { name: 'Ernaehrung im Alter', category: 'optional', validity_months: 36, duration_hours: 3, description: 'Grundlagen gesunder Ernaehrung und Mangelernaehrung bei Senioren', provider: '' },
]

export async function seedTrainingCatalog(): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const rows = DEFAULT_TRAININGS.map((t) => ({
      ...t,
      organization_id: organizationId,
    }))

    const { data, error } = await supabase
      .from('mis_training_catalog')
      .insert(rows)
      .select()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_training_catalog',
      entityId: 'seed',
      details: { aktion: 'standard_schulungskatalog_befuellt', anzahl: rows.length },
    }).catch(() => {})

    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Neuen Katalogeintrag erstellen ─────────────────────────────

export async function createTrainingCatalogEntry(data: {
  name: string
  description: string
  category: string
  validity_months: string
  provider: string
  duration_hours: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      name: data.name,
      description: data.description,
      category: data.category,
      validity_months: parseInt(data.validity_months, 10) || 0,
      provider: data.provider,
      duration_hours: parseInt(data.duration_hours, 10) || 0,
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_training_catalog')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName,
      organizationId,
      entityType: 'mis_training_catalog',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'schulung_erstellt', name: data.name },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schulungsnachweis erstellen ─────────────────────────────────

export async function createTrainingRecord(data: {
  training_id: string
  engel_id: string
  engel_name: string
  completed_date: string
  expires_date: string | null
  certificate_url: string
  notes: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      training_id: data.training_id,
      engel_id: data.engel_id,
      engel_name: data.engel_name,
      completed_date: data.completed_date,
      expires_date: data.expires_date || null,
      certificate_url: data.certificate_url,
      notes: data.notes,
      status: 'valid',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('mis_training_records')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName,
      organizationId,
      entityType: 'mis_training_records',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'schulungsnachweis_erstellt', engel_name: data.engel_name, training_id: data.training_id },
    }).catch(() => {})

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schulungsnachweis loeschen ──────────────────────────────────

export async function deleteTrainingRecord(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_training_records')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_training_records',
      entityId: id,
      details: { aktion: 'schulungsnachweis_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Katalogeintrag loeschen ────────────────────────────────────

export async function deleteTrainingCatalogEntry(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_training_catalog')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_training_catalog',
      entityId: id,
      details: { aktion: 'schulung_geloescht' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Schulungsnachweis-Status aktualisieren ──────────────────────

export async function updateTrainingRecordStatus(id: string, status: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_training_records')
      .update({ status })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'mis_training_records',
      entityId: id,
      details: { aktion: 'schulungsstatus_aktualisiert', neuer_status: status },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
