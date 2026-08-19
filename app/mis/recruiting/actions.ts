'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Recruiting (MIS)
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

// ── Bewerber erstellen ─────────────────────────────────────────

export async function createApplicant(data: {
  first_name: string
  last_name: string
  email: string
  phone: string
  position: string
  source: string
  notes: string
  job_posting_id: string | null
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_applicants')
      .insert({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        position: data.position,
        source: data.source,
        notes: data.notes,
        job_posting_id: data.job_posting_id,
        status: 'eingang',
        rating: 0,
        documents: [],
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'applicant',
      entityId: inserted?.id,
      details: { aktion: 'bewerber_erstellt', position: data.position },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Stellenanzeige erstellen ───────────────────────────────────

export async function createJobPosting(data: {
  title: string
  description: string
  location: string
  position_type: string
  channels: string[]
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { data: inserted, error } = await supabase
      .from('mis_job_postings')
      .insert({
        title: data.title,
        description: data.description,
        location: data.location,
        position_type: data.position_type,
        channels: data.channels,
        status: 'active',
        organization_id: organizationId,
        created_by: userId,
      })
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'job_posting',
      entityId: inserted?.id,
      details: { aktion: 'stellenanzeige_erstellt', title: data.title },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Bewerber-Status aktualisieren ──────────────────────────────

export async function updateApplicantStatus(
  id: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_applicants')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'applicant',
      entityId: id,
      details: { aktion: 'status_geaendert', neuer_status: status },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Bewerber-Bewertung aktualisieren ───────────────────────────

export async function updateApplicantRating(
  id: string,
  rating: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_applicants')
      .update({ rating })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'applicant',
      entityId: id,
      details: { aktion: 'bewertung_geaendert', rating },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Bewerber loeschen ──────────────────────────────────────────

export async function deleteApplicant(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_applicants')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'applicant',
      entityId: id,
      details: { aktion: 'bewerber_geloescht' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Stellenanzeige-Status aktualisieren ────────────────────────

export async function updatePostingStatus(
  id: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_job_postings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'job_posting',
      entityId: id,
      details: { aktion: 'posting_status_geaendert', neuer_status: status },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Stellenanzeige loeschen ────────────────────────────────────

export async function deleteJobPosting(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const { error } = await supabase
      .from('mis_job_postings')
      .delete()
      .eq('id', id)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'job_posting',
      entityId: id,
      details: { aktion: 'stellenanzeige_geloescht' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
