'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import {
  CLIENT_PIPELINE, LEAD_STATUS, istClientPipelineStatus, istLeadStatus, statusLabel,
} from '@/lib/admin/crm-katalog'
import { pruefeNeuerLead } from '@/lib/leads/anfrage-felder'
import { logger } from '@/lib/logger'
const log = logger.child('mis:crm')

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer MIS CRM
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

// ── Kunden-Pipeline-Status aktualisieren ───────────────────────

export async function updateClientPipeline(id: string, newStatus: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    // Erlaubnisliste vor der Datenbank: ein unbekannter Wert liefe sonst
    // entweder in einen CHECK-Fehler oder — schlimmer — in eine Spalte
    // ohne CHECK und bliebe dort stehen.
    if (!istClientPipelineStatus(newStatus)) {
      return { ok: false, error: `Unbekannte Pipeline-Stufe: ${String(newStatus)}` }
    }
    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Kunden-ID.' }

    const now = new Date().toISOString()

    // `.select('id')` ist Pflicht, nicht Zierde: ohne sie meldet PostgREST
    // bei NULL getroffenen Zeilen keinen Fehler. Die Oberflaeche zeigte dann
    // den neuen Status an, waehrend in der Datenbank der alte steht.
    const { data: geaendert, error: updateErr } = await supabase
      .from('clients')
      .update({ pipeline_status: newStatus, updated_at: now })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id')

    if (updateErr) return { ok: false, error: updateErr.message }
    if (!geaendert || geaendert.length === 0) {
      return { ok: false, error: 'Kunde nicht gefunden oder kein Zugriff — bitte Seite neu laden.' }
    }

    const { error: activityErr } = await supabase
      .from('mis_crm_activities')
      .insert({
        client_id: id,
        activity_type: 'status_change',
        title: `Status → ${statusLabel(CLIENT_PIPELINE, newStatus)}`,
        performed_by: name,
        organization_id: organizationId,
      })

    if (activityErr) {
      // Aktivitaet ist sekundaer — das Pipeline-Update ist bereits geschrieben.
      log.error('Aktivitaet konnte nicht erstellt werden', { errorMessage: activityErr.message })
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'clients',
      entityId: id,
      details: { aktion: 'pipeline_status_aktualisiert', neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Lead-Status aktualisieren ──────────────────────────────────

export async function updateLeadStatus(id: string, newStatus: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireMISAdmin()

    if (!istLeadStatus(newStatus)) {
      return { ok: false, error: `Unbekannter Lead-Status: ${String(newStatus)}` }
    }
    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Lead-ID.' }

    const now = new Date().toISOString()

    // Vorher lesen, damit der Verlauf den WECHSEL nennen kann und nicht nur
    // das Ziel. „Kontaktiert → Qualifiziert" sagt jemandem, der die Zeile
    // spaeter liest, etwas; „Status → Qualifiziert" sagt ihm nicht, woher.
    const { data: vorher } = await supabase
      .from('lead_inquiries')
      .select('status')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    const { data: geaendert, error } = await supabase
      .from('lead_inquiries')
      .update({ status: newStatus, updated_at: now })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id')

    if (error) return { ok: false, error: error.message }
    if (!geaendert || geaendert.length === 0) {
      return { ok: false, error: 'Lead nicht gefunden oder kein Zugriff — bitte Seite neu laden.' }
    }

    // Bis zum 13.09.2026 hat ein Lead-Statuswechsel KEINE Aktivitaet
    // geschrieben, waehrend der Kunden-Wechsel eine schrieb. Live trug
    // deshalb kein einziger der 50 Leads eine Bearbeitungsspur — der
    // Verlauf, an dem man ablesen koennte, was mit einer Anfrage geschehen
    // ist, existierte fuer Leads schlicht nicht.
    const von = vorher?.status ? statusLabel(LEAD_STATUS, vorher.status) : 'unbekannt'
    const { error: activityErr } = await supabase
      .from('mis_crm_activities')
      .insert({
        lead_id: id,
        activity_type: 'status_change',
        title: `${von} → ${statusLabel(LEAD_STATUS, newStatus)}`,
        performed_by: name,
        organization_id: organizationId,
      })
    if (activityErr) {
      log.error('Lead-Aktivitaet konnte nicht erstellt werden', { errorMessage: activityErr.message })
    }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'lead_inquiries',
      entityId: id,
      details: { aktion: 'lead_status_aktualisiert', von: vorher?.status ?? null, neuer_status: newStatus },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Neuen Lead erstellen ───────────────────────────────────────

export async function createLead(data: {
  name: string
  phone: string
  plz: string
  message: string
  source: string
  service: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    // Der oeffentliche Weg (app/api/lead-inquiry/route.ts) prueft Laengen
    // und Telefonnummer seit jeher; dieser Weg pruefte NICHTS. Ein
    // Admin-Login macht unbegrenzten Text nicht in Ordnung, nur seltener.
    //
    // Wichtigste Einzelpruefung: `source`. Mit 'engel-bewerbung' waere die
    // Zeile nach der Regel in lib/admin/ops.ts eine BEWERBUNG — sie
    // verschwaende aus dem Anfragen-Posteingang und taucht in der
    // Bewerberliste auf, ohne dass jemand das getippt haette.
    const { lead, fehler } = pruefeNeuerLead(data as unknown as Record<string, unknown>)
    if (fehler || !lead) return { ok: false, error: fehler ?? 'Eingabe unvollstaendig.' }

    const row = {
      name: lead.name,
      phone: lead.phone,
      plz: lead.plz ?? null,
      message: lead.message ?? null,
      source: lead.source,
      service: lead.service ?? null,
      status: 'new',
      art: 'anfrage',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('lead_inquiries')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'lead_inquiries',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'lead_erstellt', name: lead.name, source: lead.source },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Kooperationspartner erstellen ──────────────────────────────

export async function createPartner(data: {
  name: string
  type: string
  city: string
  phone: string
  email: string
  contact_person: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row = {
      name: data.name,
      type: data.type,
      city: data.city,
      phone: data.phone,
      email: data.email,
      contact_person: data.contact_person,
      status: 'active',
      organization_id: organizationId,
    }

    const { data: inserted, error } = await supabase
      .from('cooperation_partners')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'cooperation_partners',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'partner_erstellt', name: data.name, type: data.type },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── CRM-Aktivitaet erstellen ───────────────────────────────────

export async function createActivity(data: {
  activity_type: string
  title: string
  description: string
  performed_by: string
  client_id?: string
  lead_id?: string
}): Promise<{ ok: true; data?: any } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name: actorName } = await requireMISAdmin()

    const row: Record<string, any> = {
      activity_type: data.activity_type,
      title: data.title,
      description: data.description,
      performed_by: data.performed_by,
      organization_id: organizationId,
    }

    if (data.client_id) row.client_id = data.client_id
    if (data.lead_id) row.lead_id = data.lead_id

    const { data: inserted, error } = await supabase
      .from('mis_crm_activities')
      .insert(row)
      .select()
      .single()

    if (error) return { ok: false, error: error.message }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: actorName,
      organizationId,
      entityType: 'mis_crm_activities',
      entityId: inserted?.id ?? 'unknown',
      details: { aktion: 'aktivitaet_erstellt', title: data.title, activity_type: data.activity_type },
    })

    return { ok: true, data: inserted }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
