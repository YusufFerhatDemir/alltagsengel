'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Abrechnung · Einstellungen
// Ersetzt client-seitige Supabase-Writes (datenannahmestellen)
// durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireAbrechnungEinstellungenAdmin() {
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

// ── Datenannahmestelle anlegen oder bearbeiten ────────────────────

export interface DasPayload {
  name: string
  ik_nummer: string | null
  sftp_host: string | null
  sftp_port: number
  sftp_user: string | null
  sftp_verzeichnis: string | null
  antwort_verzeichnis: string | null
  kim_adresse: string | null
  zustaendig_fuer: string[]
  aktiv: boolean
}

export async function saveDatenannahmestelle(
  dasEditId: string | null,
  payload: DasPayload,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireAbrechnungEinstellungenAdmin()

  // ── Validierung ──
  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length === 0) {
    throw new Error('Name der Datenannahmestelle ist Pflichtfeld.')
  }

  const dbPayload = {
    name: payload.name.trim(),
    ik_nummer: payload.ik_nummer?.replace(/\D/g, '') || null,
    sftp_host: payload.sftp_host || null,
    sftp_port: Number(payload.sftp_port) || 22,
    sftp_user: payload.sftp_user || null,
    sftp_verzeichnis: payload.sftp_verzeichnis || null,
    antwort_verzeichnis: payload.antwort_verzeichnis || null,
    kim_adresse: payload.kim_adresse || null,
    zustaendig_fuer: Array.isArray(payload.zustaendig_fuer) ? payload.zustaendig_fuer : [],
    aktiv: Boolean(payload.aktiv),
  }

  const isUpdate = dasEditId && typeof dasEditId === 'string'

  const { error: e } = isUpdate
    ? await supabase.from('datenannahmestellen').update(dbPayload).eq('id', dasEditId)
    : await supabase.from('datenannahmestellen').insert(dbPayload)

  if (e) throw new Error(`Speichern fehlgeschlagen: ${e.message}`)

  await logAuditEvent({
    action: isUpdate ? 'update' : 'create',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'datenannahmestelle',
    entityId: dasEditId,
    details: { aktion: isUpdate ? 'bearbeitet' : 'angelegt', name: dbPayload.name, ik_nummer: dbPayload.ik_nummer },
  }).catch(() => {})

  return { ok: true }
}

// ── Datenannahmestelle löschen ────────────────────────────────────

export async function removeDatenannahmestelle(id: string): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name: actorName } = await requireAbrechnungEinstellungenAdmin()

  if (!id || typeof id !== 'string') {
    throw new Error('Ungueltige ID.')
  }

  // Name für Audit-Log laden bevor wir löschen
  const { data: existing } = await supabase
    .from('datenannahmestellen')
    .select('name')
    .eq('id', id)
    .maybeSingle()

  const { error: e } = await supabase.from('datenannahmestellen').delete().eq('id', id)
  if (e) throw new Error(`Loeschen fehlgeschlagen: ${e.message}`)

  await logAuditEvent({
    action: 'delete',
    actorId: userId,
    actorRole: role,
    actorName: actorName,
    organizationId,
    entityType: 'datenannahmestelle',
    entityId: id,
    details: { aktion: 'geloescht', name: existing?.name ?? 'unbekannt' },
  }).catch(() => {})

  return { ok: true }
}
