'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Leistungspreise
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

// ── Preis anlegen oder aktualisieren ─────────────────────────────

interface PreisPayload {
  bundesland: string
  leistungsart: string
  preis_cent: number
  gueltig_ab: string
  gueltig_bis: string | null
}

export async function upsertLeistungspreis(
  editingId: string | null,
  payload: PreisPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!payload.leistungsart || typeof payload.leistungsart !== 'string') {
      return { ok: false, error: 'Leistungsart ist Pflichtfeld.' }
    }
    if (typeof payload.preis_cent !== 'number' || isNaN(payload.preis_cent)) {
      return { ok: false, error: 'Preis ist Pflichtfeld.' }
    }

    const row = {
      bundesland: payload.bundesland,
      leistungsart: payload.leistungsart,
      preis_cent: payload.preis_cent,
      gueltig_ab: payload.gueltig_ab,
      gueltig_bis: payload.gueltig_bis,
    }

    // Nur die Fehlerbehandlung: kein Preiswert wird hier veraendert.
    //
    // Beim UPDATE ist `.select('id')` noetig, weil PostgREST bei NULL
    // getroffenen Zeilen keinen Fehler meldet — die Maske zeigte danach
    // den neuen Preis, waehrend in der Tabelle der alte steht. Bei einem
    // Preis ist das der Unterschied zwischen richtiger und falscher
    // Rechnungsstellung.
    //
    // Der INSERT bleibt ohne Mandantenfilter: `organization_id` traegt den
    // Default `current_org_id()`, und dieser Client ist an die Sitzung
    // gebunden. Das ist der dokumentierte Weg, deshalb steht die Tabelle
    // auch in scripts/org-default-tables.json.
    const { data: gespeichert, error: dbError } = editingId
      ? await supabase.from('leistungspreise').update(row)
          .eq('id', editingId).eq('organization_id', organizationId).select('id')
      : await supabase.from('leistungspreise').insert(row).select('id')

    if (dbError) return { ok: false, error: `Speichern fehlgeschlagen: ${dbError.message}` }
    if (!gespeichert || gespeichert.length === 0) {
      return { ok: false, error: 'Preiszeile nicht gefunden oder kein Zugriff — nichts gespeichert.' }
    }

    await logAuditEventOrWarn({
      action: editingId ? 'update' : 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'leistungspreis',
      entityId: editingId || 'neu',
      details: row,
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}

// ── Preis löschen ────────────────────────────────────────────────

export async function deleteLeistungspreis(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') {
      return { ok: false, error: 'Ungueltige ID.' }
    }

    const { data: geloescht, error: dbError } = await supabase
      .from('leistungspreise').delete()
      .eq('id', id).eq('organization_id', organizationId).select('id')
    if (dbError) return { ok: false, error: `Loeschen fehlgeschlagen: ${dbError.message}` }
    if (!geloescht || geloescht.length === 0) {
      // Ein „geloescht" ueber eine Zeile, die noch steht, ist die
      // gefaehrlichste Rueckmeldung von allen: der Preis gilt weiter.
      return { ok: false, error: 'Preiszeile nicht gefunden oder kein Zugriff — nichts geloescht.' }
    }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'leistungspreis',
      entityId: id,
      details: {},
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler.' }
  }
}
