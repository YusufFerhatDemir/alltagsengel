'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Datenannahmestellen
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireAdmin() {
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

// ── Verbindungsstatus aktualisieren ──────────────────────────────

export async function updateVerbindungStatus(
  id: string,
  success: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'Ungueltige Annahmestellen-ID.' }
    }

    const { error: dbError } = await supabase
      .from('datenannahmestellen')
      .update({
        verbindung_status: success ? 'erfolgreich' : 'fehlgeschlagen',
        letzte_verbindung_am: new Date().toISOString(),
      })
      .eq('id', id)

    if (dbError) return { ok: false, error: `Status-Update fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'datenannahmestelle',
      entityId: id,
      details: { aktion: 'verbindungstest', ergebnis: success ? 'erfolgreich' : 'fehlgeschlagen' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
