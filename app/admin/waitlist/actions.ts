'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { istWartelisteStatus } from '@/lib/warteliste/katalog'

// ═══════════════════════════════════════════════════════════════════════
// Warteliste — Statuswechsel
//
// Schreibt unter der Sitzung der Verwaltung (RLS greift), nicht mit dem
// Dienstschluessel: Anders als der oeffentliche Eintragsweg gibt es hier
// eine angemeldete Person, und ihre Rechte sind die richtige Grenze.
// ═══════════════════════════════════════════════════════════════════════

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

export async function updateWaitlistStatus(
  eintragId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!eintragId || typeof eintragId !== 'string') {
      return { ok: false, error: 'Ungueltige Eintrags-ID.' }
    }
    // Fail-closed gegen waitlist_customers_status_check: ein Wert ausserhalb
    // der fuenf erlaubten wuerde die Datenbank mit 23514 abweisen — und die
    // Verwaltung saehe eine rohe Postgres-Meldung statt eines Satzes.
    if (!istWartelisteStatus(status)) {
      return { ok: false, error: 'Ungueltiger Status fuer einen Wartelisteneintrag.' }
    }

    const { error: dbFehler } = await supabase
      .from('waitlist_customers')
      .update({ status })
      .eq('id', eintragId)

    if (dbFehler) {
      if (dbFehler.code === 'PGRST205') {
        return {
          ok: false,
          error: 'Die Tabelle waitlist_customers steht noch nicht — Migration 20261031000000 ist nicht angewendet.',
        }
      }
      return { ok: false, error: `Status-Update fehlgeschlagen: ${dbFehler.message}` }
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'waitlist_customer',
      entityId: eintragId,
      details: { neuer_status: status },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
