'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { sendEmailNotification } from '@/lib/notifications'
import { esc } from '@/lib/notifications/html'
import { istBewerbungsStatus, BEWERBUNG_FILTER } from '@/lib/admin/ops'
import { logger } from '@/lib/logger'

const log = logger.child('applications:actions')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Bewerbungen
//
// ZIELTABELLE IST `lead_inquiries`, NICHT `applications`.
// `applications` ist laut Migration 20261027000000 bewusst tot und traegt
// produktiv null Zeilen. Die echten Bewerbungen kommen ueber
// components/EngelBewerbungForm.tsx → POST /api/lead-inquiry und landen
// dort. Diese Aktionen haben vorher in die tote Tabelle geschrieben —
// fehlerfrei, folgenlos und fuer niemanden sichtbar.
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
    // Fail-closed gegen den CHECK auf lead_inquiries.status: ein Wert
    // ausserhalb der fuenf erlaubten wuerde die Datenbank mit 23514
    // abweisen — und die Verwaltung saehe eine rohe Postgres-Meldung.
    if (!istBewerbungsStatus(status)) {
      return { ok: false, error: 'Ungueltiger Status fuer eine Bewerbung.' }
    }

    // Bewerbungsdaten laden — fuer die Freigabe-E-Mail brauchen wir Name und
    // E-Mail-Adresse. `.single()` bleibt richtig: die ID ist der
    // Primaerschluessel. Der Bewerbungsfilter steht trotzdem dabei, damit
    // ueber diese Aktion keine Kundenanfrage aus derselben Tabelle
    // umgestempelt werden kann.
    const { data: bewerbung, error: lesenFehler } = await supabase
      .from('lead_inquiries')
      .select('name, email')
      .eq('id', applicationId)
      .or(BEWERBUNG_FILTER)
      .single()

    if (lesenFehler) return { ok: false, error: `Bewerbung nicht gefunden: ${lesenFehler.message}` }

    const { error: dbError } = await supabase
      .from('lead_inquiries')
      .update({ status })
      .eq('id', applicationId)
      .or(BEWERBUNG_FILTER)

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
    // Bei Freigabe automatische E-Mail an den Bewerber.
    // Absender immer „Alltagsengel", nie ein persoenlicher Name.
    //
    // `converted` ist der Freigabezustand im Wortschatz von lead_inquiries.
    // Die frueher hier geprueften Werte (approved/freigegeben/angenommen/
    // active) kann die Spalte gar nicht annehmen — der Zweig war unerreichbar.
    //
    // ZWEITE EINSCHRAENKUNG, die man kennen muss: das Website-Formular fragt
    // keine E-Mail ab (siehe Migration 20261027000000). Produktiv traegt
    // heute KEINE der eingegangenen Bewerbungen eine Adresse, die Mail geht
    // also nur bei hier von Hand erfassten Bewerbungen raus. Der Rueckruf
    // ueber die Telefonnummer bleibt der eigentliche Weg.
    if (status === 'converted' && bewerbung?.email) {
      const empfaengerName = esc(bewerbung.name || 'Bewerber')
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
  /** Ein Feld, kein Vor-/Nachname: `lead_inquiries` fuehrt nur `name`. */
  name: string
  email: string | null
  phone: string | null
  /** Qualifikation/Stelle — liegt in `service`, es gibt keine Spalte `position`. */
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

    if (!payload.name?.trim()) {
      return { ok: false, error: 'Name ist ein Pflichtfeld.' }
    }
    // `phone` ist in der Praxis der einzige Rueckweg zur Bewerberin: das
    // Website-Formular fragt keine E-Mail ab. Eine Bewerbung ohne beides
    // waere ein Datensatz, den niemand beantworten kann.
    if (!payload.phone?.trim() && !payload.email?.trim()) {
      return { ok: false, error: 'Bitte Telefon oder E-Mail angeben — sonst gibt es keinen Rueckweg.' }
    }

    const row = {
      // Ausdruecklich gesetzt statt auf den Spalten-Default current_org_id()
      // zu vertrauen: der ist fail-open und liefert bei fehlender
      // Mitgliedschaft die Stamm-Organisation. Hier ist die Organisation
      // bekannt, also wird sie genannt.
      organization_id: organizationId,
      art: 'bewerbung',
      name: payload.name.trim(),
      email: payload.email,
      phone: payload.phone,
      service: payload.position,
      source: payload.source,
      message: payload.notes,
      status: 'new',
      eingereicht_am: new Date().toISOString(),
      // `lead_inquiries` hat keine Spalte fuer die Empfehlung. Sie hier
      // wegzulassen hiesse, die Mitarbeiter-werben-Mitarbeiter-Angabe
      // stillschweigend zu verwerfen; `bewerbung_daten` ist das dafuer
      // vorgesehene jsonb-Feld.
      bewerbung_daten: payload.referred_by_caregiver_id
        ? { empfohlen_von_caregiver_id: payload.referred_by_caregiver_id }
        : null,
    }

    const { data: angelegt, error: dbError } = await supabase
      .from('lead_inquiries')
      .insert(row)
      .select('id')
      .single()
    if (dbError) return { ok: false, error: `Anlegen fehlgeschlagen: ${dbError.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'application',
      entityId: angelegt?.id ?? 'neu',
      details: { name: row.name, source: row.source },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
