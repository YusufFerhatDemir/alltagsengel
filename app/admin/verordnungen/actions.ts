'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { euroToCent, statusMeta, LEISTUNGSART_LABELS } from '@/lib/admin/ops'
import { heuteBerlin } from '@/lib/utils/timezone'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Verordnungsverwaltung
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
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

// ── 1–4. Verordnung speichern (Erstellen/Bearbeiten + Leistungspositionen) ──
// Deckt 4 DB-Operationen ab:
//   insert verordnungen | update verordnungen
//   delete verordnung_leistungen | insert verordnung_leistungen

export async function saveVerordnungAction(
  editingId: string | null,
  payload: Record<string, unknown>,
  positionen: Array<{
    leistungsart: string
    haeufigkeit: string
    menge: string
    dauer_minuten: string
    leistungskomplex: string
    bemerkung: string
  }>,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    let verordnungId = editingId
    if (editingId) {
      const { error: e } = await supabase.from('verordnungen').update(payload).eq('id', editingId)
      if (e) return { ok: false, error: `Speichern fehlgeschlagen: ${e.message}` }
    } else {
      const { data: inserted, error: e } = await supabase
        .from('verordnungen')
        .insert(payload)
        .select('id')
        .single()
      if (e || !inserted) return { ok: false, error: `Speichern fehlgeschlagen: ${e?.message || 'Kein Datensatz zurueckgegeben'}` }
      verordnungId = inserted.id
    }

    // Leistungspositionen synchronisieren (alte ersetzen, nur ausgefuellte Zeilen speichern)
    if (verordnungId) {
      const gueltige = positionen.filter(p => p.leistungsart)
      const { error: delErr } = await supabase
        .from('verordnung_leistungen')
        .delete()
        .eq('verordnung_id', verordnungId)
      if (delErr) return { ok: false, error: `Leistungspositionen aktualisieren fehlgeschlagen: ${delErr.message}` }

      if (gueltige.length > 0) {
        const { error: posErr } = await supabase.from('verordnung_leistungen').insert(
          gueltige.map(p => ({
            verordnung_id: verordnungId,
            leistungsart: p.leistungsart,
            haeufigkeit: p.haeufigkeit || null,
            menge: p.menge ? Number(p.menge) : 1,
            dauer_minuten: p.dauer_minuten ? Number(p.dauer_minuten) : null,
            leistungskomplex: p.leistungskomplex || null,
            bemerkung: p.bemerkung || null,
          })),
        )
        if (posErr) return { ok: false, error: `Leistungspositionen speichern fehlgeschlagen: ${posErr.message}` }
      }
    }

    await logAuditEventOrWarn({
      action: editingId ? 'update' : 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: verordnungId!,
      details: {
        aktion: editingId ? 'verordnung_aktualisiert' : 'verordnung_erstellt',
        positionen_anzahl: positionen.filter(p => p.leistungsart).length,
      },
    })

    return { ok: true, id: verordnungId! }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 5. Soft-Delete (Revisionssicherheit) ──

export async function softDeleteVerordnung(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Verordnungs-ID.' }

    const { error: e } = await supabase
      .from('verordnungen')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
    if (e) return { ok: false, error: `Loeschen fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: id,
      details: { aktion: 'soft_delete' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 6. Neuantrag-Markierung toggle ──

export async function toggleNeuantragAction(
  id: string,
  currentValue: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Verordnungs-ID.' }

    const { error: e } = await supabase
      .from('verordnungen')
      .update({ neuantrag_erforderlich: !currentValue })
      .eq('id', id)
    if (e) return { ok: false, error: `Update fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: id,
      details: { aktion: 'neuantrag_toggle', neuer_wert: !currentValue },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 7. Kassengenehmigung beantragen ──

export async function beantragenVerordnung(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Verordnungs-ID.' }

    const { error: e } = await supabase
      .from('verordnungen')
      .update({
        genehmigung_status: 'beantragt',
        kassengenehmigung_beantragt_am: new Date().toISOString(),
      })
      .eq('id', id)
    if (e) return { ok: false, error: `Antrag fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: id,
      details: { aktion: 'kassengenehmigung_beantragt' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 8. Kassenantwort speichern (inkl. Leistungsart-Abgleich) ──

export async function saveKassenantwort(
  id: string,
  antwort: {
    ergebnis: string
    aktenzeichen: string
    datum: string
    bis: string
    genehmigte_leistungsart: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Verordnungs-ID.' }
    if (antwort.ergebnis === 'genehmigt' && !antwort.aktenzeichen) {
      return { ok: false, error: 'Bei Genehmigung ist die Genehmigungsnummer (Aktenzeichen) Pflicht.' }
    }

    // Abgleich: beantragte vs. genehmigte Leistungsart — Abweichung als Warnung
    const { data: original } = await supabase
      .from('verordnungen')
      .select('leistungsart')
      .eq('id', id)
      .single()

    let abgleichOk: boolean | null = null
    let abweichung: string | null = null
    if (antwort.ergebnis === 'genehmigt' && original?.leistungsart && antwort.genehmigte_leistungsart) {
      abgleichOk = original.leistungsart === antwort.genehmigte_leistungsart
      if (!abgleichOk) {
        abweichung = `Beantragt: ${statusMeta(LEISTUNGSART_LABELS, original.leistungsart).label} — Genehmigt: ${statusMeta(LEISTUNGSART_LABELS, antwort.genehmigte_leistungsart).label}`
      }
    }

    const { error: e } = await supabase
      .from('verordnungen')
      .update({
        genehmigung_status: antwort.ergebnis,
        genehmigung_aktenzeichen: antwort.aktenzeichen || null,
        genehmigung_datum: antwort.datum || null,
        genehmigung_bis: antwort.ergebnis === 'genehmigt' ? (antwort.bis || null) : null,
        kassengenehmigung_antwort_am: new Date().toISOString(),
        genehmigte_leistungsart: antwort.genehmigte_leistungsart || null,
        genehmigung_abgleich_ok: abgleichOk,
        genehmigung_abweichung: abweichung,
      })
      .eq('id', id)
    if (e) return { ok: false, error: `Speichern fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: id,
      details: { aktion: 'kassenantwort_erfasst', ergebnis: antwort.ergebnis, aktenzeichen: antwort.aktenzeichen },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 9. Einsatz (Assignment) entfernen ──

export async function removeAssignmentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Einsatz-ID.' }

    const { error: e } = await supabase.from('assignments').delete().eq('id', id)
    if (e) return { ok: false, error: `Entfernen fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'assignment',
      entityId: id,
      details: { aktion: 'einsatz_entfernt' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 10. Abrechnungsstatus aktualisieren ──

export async function setAbrechnungsStatusAction(
  id: string,
  status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Verordnungs-ID.' }

    const { error: e } = await supabase
      .from('verordnungen')
      .update({ abrechnungs_status: status })
      .eq('id', id)
    if (e) return { ok: false, error: `Update fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'verordnung',
      entityId: id,
      details: { aktion: 'abrechnungsstatus_geaendert', neuer_status: status },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 11. Rechnung SOLL/IST/Kuerzung bearbeiten ──

export async function saveVerordnungInvoiceEdit(
  id: string,
  soll: string,
  ist: string,
  kuerzung: string,
  kuerzungGrund: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Rechnungs-ID.' }

    const { error: e } = await supabase
      .from('invoices')
      .update({
        soll_betrag_cent: euroToCent(soll),
        ist_betrag_cent: euroToCent(ist),
        kuerzung_cent: euroToCent(kuerzung) ?? 0,
        kuerzung_grund: kuerzungGrund || null,
      })
      .eq('id', id)
    if (e) return { ok: false, error: `Speichern fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'invoice',
      entityId: id,
      details: { aktion: 'soll_ist_kuerzung_aktualisiert', soll, ist, kuerzung },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 12. Bezahlt-Status toggle ──

export async function toggleInvoiceBezahlt(
  id: string,
  currentBezahlt: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Rechnungs-ID.' }

    const { error: e } = await supabase
      .from('invoices')
      .update({
        bezahlt: !currentBezahlt,
        bezahlt_am: !currentBezahlt ? heuteBerlin() : null,
      })
      .eq('id', id)
    if (e) return { ok: false, error: `Update fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'invoice',
      entityId: id,
      details: { aktion: 'bezahlt_toggle', neuer_wert: !currentBezahlt },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 13. Versand-Status toggle ──

export async function toggleInvoiceVersand(
  id: string,
  field: 'versand_elektronisch' | 'versand_post',
  currentValue: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Rechnungs-ID.' }
    if (!['versand_elektronisch', 'versand_post'].includes(field)) {
      return { ok: false, error: 'Ungueltiges Feld.' }
    }

    const { error: e } = await supabase
      .from('invoices')
      .update({ [field]: !currentValue })
      .eq('id', id)
    if (e) return { ok: false, error: `Update fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'invoice',
      entityId: id,
      details: { aktion: 'versand_toggle', feld: field, neuer_wert: !currentValue },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 14. Absage erfassen ──

export async function saveAbsageAction(
  data: {
    assignment_id: string
    abgesagt_von: string
    grund: string
    ersatz_mitarbeiterin_id: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!data.assignment_id) return { ok: false, error: 'Bitte einen Einsatz auswaehlen.' }

    const { error: e } = await supabase.from('einsatz_absagen').insert({
      assignment_id: data.assignment_id,
      abgesagt_von: data.abgesagt_von,
      grund: data.grund || null,
      ersatz_mitarbeiterin_id: data.ersatz_mitarbeiterin_id || null,
      ersatz_gefunden: !!data.ersatz_mitarbeiterin_id,
    })
    if (e) return { ok: false, error: `Speichern fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'einsatz_absage',
      entityId: data.assignment_id,
      details: { aktion: 'absage_erfasst', abgesagt_von: data.abgesagt_von },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 15. Absage-Ersatz setzen ──

export async function setAbsageErsatz(
  id: string,
  caregiverId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Absage-ID.' }

    const { error: e } = await supabase
      .from('einsatz_absagen')
      .update({ ersatz_mitarbeiterin_id: caregiverId || null, ersatz_gefunden: !!caregiverId })
      .eq('id', id)
    if (e) return { ok: false, error: `Update fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'einsatz_absage',
      entityId: id,
      details: { aktion: 'ersatz_zugewiesen', ersatz_mitarbeiterin_id: caregiverId || null },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}

// ── 16. Absage loeschen ──

export async function removeAbsageAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireAdmin()

    if (!id || typeof id !== 'string') return { ok: false, error: 'Ungueltige Absage-ID.' }

    const { error: e } = await supabase.from('einsatz_absagen').delete().eq('id', id)
    if (e) return { ok: false, error: `Loeschen fehlgeschlagen: ${e.message}` }

    await logAuditEventOrWarn({
      action: 'delete',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'einsatz_absage',
      entityId: id,
      details: { aktion: 'absage_geloescht' },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || 'Unerwarteter Fehler' }
  }
}
