'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Einstellungen
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireSettingsAdmin() {
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

// ── Demo-Zugang aktivieren (10 Minuten Timer) ──────────────────

export async function enableDemoAccess(): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireSettingsAdmin()

    if (role !== 'superadmin') {
      return { ok: false, error: 'Nur Superadmins duerfen den Demo-Zugang steuern.' }
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    const [r1, r2] = await Promise.all([
      supabase.from('app_settings').update({ value: true, updated_at: now, updated_by: userId }).eq('key', 'demo_enabled'),
      supabase.from('app_settings').update({ value: expiresAt, updated_at: now, updated_by: userId }).eq('key', 'demo_expires_at'),
    ])

    if (r1.error || r2.error) {
      return { ok: false, error: r1.error?.message || r2.error?.message || 'Unbekannter Fehler' }
    }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'app_settings',
      entityId: 'demo_enabled',
      details: { aktion: 'demo_aktiviert', expires_at: expiresAt },
    }).catch(() => {})

    return { ok: true, expiresAt }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Demo-Zugang deaktivieren ────────────────────────────────────

export async function disableDemoAccess(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireSettingsAdmin()

    if (role !== 'superadmin') {
      return { ok: false, error: 'Nur Superadmins duerfen den Demo-Zugang steuern.' }
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('app_settings').update({ value: false, updated_at: now, updated_by: userId }).eq('key', 'demo_enabled')

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'app_settings',
      entityId: 'demo_enabled',
      details: { aktion: 'demo_deaktiviert' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Abgelaufenen Demo-Zugang automatisch deaktivieren ───────────

export async function autoDisableExpiredDemo(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { ok: false, error: 'Nicht autorisiert.' }

    const { error } = await supabase.from('app_settings').update({ value: false }).eq('key', 'demo_enabled')

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Demo-Passwort speichern ─────────────────────────────────────

export async function saveDemoPassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireSettingsAdmin()

    if (role !== 'superadmin') {
      return { ok: false, error: 'Nur Superadmins duerfen das Demo-Passwort aendern.' }
    }

    if (!password || password.length < 6) {
      return { ok: false, error: 'Mindestens 6 Zeichen.' }
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('app_settings').update({ value: password, updated_at: now, updated_by: userId }).eq('key', 'demo_password')

    if (error) {
      return { ok: false, error: error.message }
    }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'app_settings',
      entityId: 'demo_password',
      details: { aktion: 'demo_passwort_geaendert' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Eigenes Passwort aendern ────────────────────────────────────

export async function changeOwnPassword(newPassword: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { ok: false, error: 'Nicht autorisiert.' }

    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'Mindestens 6 Zeichen.' }
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      return { ok: false, error: error.message }
    }

    // Nur fuer die Audit-Zuordnung; ein null wird von logAuditEvent
    // ausgelassen und blockiert die bereits erfolgte Aktion nicht.
    const organizationId = await getActiveOrgId()

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single()

    const actorRole = profile?.role ?? null
    const actorName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'

    await logAuditEvent({
      action: 'update',
      actorId: user.id,
      actorRole,
      actorName,
      organizationId,
      entityType: 'profile',
      entityId: user.id,
      details: { aktion: 'eigenes_passwort_geaendert' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
