'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { sendEmailNotification } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { logger } from '@/lib/logger'

const log = logger.child('applications:actions')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Bewerbungen
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

// ── Bewerbungsstatus ändern ──────────────────────────────────────

export async function updateApplicationStatus(
  applicationId: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!applicationId || typeof applicationId !== 'string') {
      return { ok: false, error: 'Ungueltige Bewerbungs-ID.' }
    }
    if (!status || typeof status !== 'string') {
      return { ok: false, error: 'Ungueltiger Status.' }
    }

    // Bewerbungsdaten laden — fuer die Freigabe-E-Mail brauchen wir
    // Name und E-Mail-Adresse des Bewerbers.
    const { data: bewerbung, error: lesenFehler } = await supabase
      .from('applications')
      .select('first_name, last_name, email')
      .eq('id', applicationId)
      .single()

    if (lesenFehler) return { ok: false, error: `Bewerbung nicht gefunden: ${lesenFehler.message}` }

    const { error: dbError } = await supabase
      .from('applications')
      .update({ status })
      .eq('id', applicationId)

    if (dbError) return { ok: false, error: `Status-Update fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: applicationId,
      details: { neuer_status: status },
    })

    // ── Freigabe-Bestätigung per E-Mail ──────────────────────────
    // Bei Freigabe/Genehmigung automatische E-Mail an den Bewerber.
    // Absender immer „Alltagsengel", nie ein persoenlicher Name.
    const FREIGABE_STATUS = new Set(['approved', 'freigegeben', 'angenommen', 'active'])
    if (FREIGABE_STATUS.has(status.toLowerCase()) && bewerbung?.email) {
      const empfaengerName = esc([bewerbung.first_name, bewerbung.last_name].filter(Boolean).join(' ') || 'Bewerber')
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://alltagsengel.care'

      try {
        await sendEmailNotification(
          bewerbung.email,
          empfaengerName,
          'Ihre Bewerbung bei Alltagsengel wurde freigegeben!',
          `
            <p style="font-size:16px;font-weight:600;color:#C9963C;margin-bottom:4px;">
              Herzlichen Glückwunsch — Sie sind freigeschaltet!
            </p>
            <p>
              Wir freuen uns, Ihnen mitteilen zu können, dass Ihre Bewerbung als
              Alltagsengel erfolgreich geprüft und freigegeben wurde.
            </p>
            <p>
              Sie können sich ab sofort einloggen und Aufträge in Ihrer Nähe annehmen.
              Sobald Kunden nach Begleitung suchen, erhalten Sie eine Benachrichtigung.
            </p>
            <div style="background:rgba(201,150,60,0.08);border-radius:12px;padding:18px 20px;margin:20px 0;">
              <p style="font-weight:600;color:#C9963C;margin:0 0 10px;">Ihre nächsten Schritte:</p>
              <ul style="color:#333;padding-left:20px;margin:10px 0;font-size:14px;">
                <li style="margin-bottom:8px;">Profil vervollständigen (Foto, Beschreibung)</li>
                <li style="margin-bottom:8px;">Verfügbarkeiten hinterlegen</li>
                <li style="margin-bottom:8px;">Erste Aufträge annehmen</li>
              </ul>
            </div>
            <a href="${siteUrl}/auth/login"
               style="display:inline-block;padding:14px 32px;background:#C9963C;color:#1A1612;
                      text-decoration:none;border-radius:10px;font-weight:600;margin:16px 0;">
              JETZT EINLOGGEN
            </a>
          `,
        )
      } catch (err) {
        // Freigabe-Mail ist best-effort — Fehler darf den Statuswechsel
        // nicht rueckgaengig machen.
        log.errorWithException('Freigabe-E-Mail konnte nicht gesendet werden', err)
      }
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Neue Bewerbung anlegen ───────────────────────────────────────

interface NewApplicationPayload {
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  position: string | null
  source: string
  referred_by_caregiver_id: string | null
  notes: string | null
}

export async function createApplication(
  payload: NewApplicationPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.first_name?.trim() || !payload.last_name?.trim()) {
      return { ok: false, error: 'Vor- und Nachname sind Pflichtfelder.' }
    }

    const row = {
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      email: payload.email,
      phone: payload.phone,
      position: payload.position,
      source: payload.source,
      referred_by_caregiver_id: payload.referred_by_caregiver_id,
      notes: payload.notes,
      status: 'new',
    }

    const { error: dbError } = await supabase.from('applications').insert(row)
    if (dbError) return { ok: false, error: `Anlegen fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: 'neu',
      details: { first_name: row.first_name, last_name: row.last_name, source: row.source },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
