'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Dokumentenmanagement (MIS)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// Hinweis: Storage-Upload bleibt client-seitig, nur DB-Writes hier
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

// ── Dokument erstellen (DB-Eintrag nach Storage-Upload) ───────

export async function createDocument(data: {
  title: string
  description: string
  category_id: string | null
  file_path: string
  file_name: string
  file_size: number
  file_type: string
  classification: string
  iso_doc_number: string
  tags: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const parsedTags = data.tags
      ? data.tags.split(',').map(s => s.trim()).filter(Boolean)
      : []

    const { data: inserted, error } = await supabase
      .from('mis_documents')
      .insert({
        title: data.title,
        description: data.description,
        category_id: data.category_id,
        file_path: data.file_path,
        file_name: data.file_name,
        file_size: data.file_size,
        file_type: data.file_type,
        classification: data.classification,
        iso_doc_number: data.iso_doc_number,
        tags: parsedTags,
        owner_id: userId,
        status: 'draft',
        organization_id: organizationId,
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
      entityType: 'document',
      entityId: inserted?.id,
      details: { aktion: 'dokument_erstellt', title: data.title, file_name: data.file_name },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Dokument-Status aktualisieren ──────────────────────────────

export async function updateDocumentStatus(
  docId: string,
  newStatus: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    const updateData: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    if (newStatus === 'approved') {
      updateData.approved_by = userId
      updateData.approved_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('mis_documents')
      .update(updateData)
      .eq('id', docId)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: newStatus === 'approved' ? 'approve' : 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'document',
      entityId: docId,
      details: { aktion: 'dokument_status_geaendert', neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Download-Zaehler inkrementieren ────────────────────────────

export async function incrementDownloadCount(
  docId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    // Aktuellen Zaehler holen
    const { data: doc, error: fetchErr } = await supabase
      .from('mis_documents')
      .select('download_count')
      .eq('id', docId)
      .single()

    if (fetchErr || !doc) {
      return { ok: false, error: fetchErr?.message || 'Dokument nicht gefunden.' }
    }

    const newCount = (doc.download_count || 0) + 1

    const { error } = await supabase
      .from('mis_documents')
      .update({ download_count: newCount })
      .eq('id', docId)

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'download',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'document',
      entityId: docId,
      details: { aktion: 'dokument_heruntergeladen', download_count: newCount },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
