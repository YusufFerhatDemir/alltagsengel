'use server'

// ═══════════════════════════════════════════════════════════════════════
// Server Action fuer Pflegenotizen (care_notes)
//
// Security-Audit 2026-08-19, MITTEL-3:
// components/admin/CareNotesPanel.tsx schrieb Pflegenotizen direkt aus dem
// Browser nach `care_notes`. RLS trug den Fall (author_id = auth.uid(),
// author_role-Bindung, care_notes_org_fence) — es entstand also kein
// Rechteproblem. Das Problem war die Protokollierung: Pflegedokumentation
// entstand vollstaendig ohne Audit-Eintrag, und `author_role`/`author_name`
// kamen ungeprueft aus dem Browser.
//
// Diese Action ersetzt den Direktschreibpfad:
//   * Rolle wird serverseitig gegen profiles.role geprueft
//   * author_id/author_name kommen aus der Session, nicht aus dem Formular
//   * author_role wird gegen eine feste Liste validiert
//   * jeder Insert erzeugt ein logAuditEvent('create', 'care_notes')
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { NOTE_AUTHOR_ROLE, NOTE_CATEGORY } from '@/lib/admin/ops'

// Erlaubte Werte NICHT abschreiben, sondern aus den geteilten Maps ableiten —
// sie sind ihrerseits mit den CHECK-Constraints aus
// 20260719000200_eylem_audit_complete_features.sql synchron
// (author_role IN engel|kunde|buero|pdl|admin,
//  category IN allgemein|gesundheit|verhalten|medikamente|vorfall|uebergabe|wunsch|beschwerde).
// Ein ungueltiger Wert wuerde sonst erst als 23514 aus der DB zurueckkommen.
const AUTOR_ROLLEN = Object.keys(NOTE_AUTHOR_ROLE)
const KATEGORIEN = Object.keys(NOTE_CATEGORY)

const MAX_INHALT = 5000

export interface CareNoteEingabe {
  clientId: string
  content: string
  category?: string
  authorRole?: string
  isUrgent?: boolean
  isInternal?: boolean
}

export interface CareNoteAusgabe {
  id: string
  client_id: string
  service_record_id: string | null
  author_id: string
  author_role: string
  author_name: string
  category: string
  content: string
  is_urgent: boolean
  is_internal: boolean
  created_at: string
}

async function requireNotizAdmin() {
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

  // Fail-closed (Audit MITTEL-1): ohne Organisation kein Schreibrecht.
  const organizationId = await getActiveOrgId()
  if (!organizationId) throw new Error('Keine Organisation zugewiesen.')

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel Büro'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

export async function createCareNoteAction(
  eingabe: CareNoteEingabe
): Promise<{ ok: true; data: CareNoteAusgabe } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireNotizAdmin()

    const clientId = eingabe.clientId?.trim()
    if (!clientId) return { ok: false, error: 'Bitte einen Klienten auswählen.' }

    const content = eingabe.content?.trim()
    if (!content) return { ok: false, error: 'Bitte einen Notiz-Text eingeben.' }
    if (content.length > MAX_INHALT) {
      return { ok: false, error: `Die Notiz ist zu lang (max. ${MAX_INHALT} Zeichen).` }
    }

    const kategorie = KATEGORIEN.includes(eingabe.category ?? '')
      ? (eingabe.category as string)
      : 'allgemein'
    const autorRolle = AUTOR_ROLLEN.includes(eingabe.authorRole ?? '')
      ? (eingabe.authorRole as string)
      : 'buero'

    const { data, error: dbError } = await supabase
      .from('care_notes')
      .insert({
        client_id: clientId,
        author_id: userId,
        author_role: autorRolle,
        author_name: name,
        category: kategorie,
        content,
        is_urgent: eingabe.isUrgent === true,
        is_internal: eingabe.isInternal === true,
      })
      .select('id, client_id, service_record_id, author_id, author_role, author_name, category, content, is_urgent, is_internal, created_at')
      .single()

    if (dbError || !data) {
      return { ok: false, error: dbError?.message || 'Notiz konnte nicht gespeichert werden.' }
    }

    // MITTEL-3: Pflegedokumentation darf nicht ohne Audit-Eintrag entstehen.
    // logAuditEvent ist fail-soft und blockiert die Notiz nicht.
    logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'care_notes',
      entityId: data.id,
      details: {
        client_id: clientId,
        category: kategorie,
        author_role: autorRolle,
        is_urgent: data.is_urgent,
        is_internal: data.is_internal,
      },
    }).catch(() => {})

    return { ok: true, data: data as CareNoteAusgabe }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}
