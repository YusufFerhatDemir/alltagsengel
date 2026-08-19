'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Rechnungsverwaltung
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireInvoiceAdmin() {
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

// Status → nächster Schritt (muss mit Client synchron bleiben)
const SIMPLE_ADVANCES: Record<string, { to: string }> = {
  draft: { to: 'sent' },
  entwurf: { to: 'geprueft' },
  geprueft: { to: 'freigegeben' },
  freigegeben: { to: 'uebermittelt' },
  uebermittelt: { to: 'quittiert' },
  abgelehnt: { to: 'erneut_eingereicht' },
  erneut_eingereicht: { to: 'uebermittelt' },
  korrektur_erforderlich: { to: 'entwurf' },
}

// ── Einfacher Status-Vorschub (draft→sent, entwurf→geprueft, …) ──

export async function advanceInvoiceSimple(
  invoiceId: string,
  currentStatus: string,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireInvoiceAdmin()

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new Error('Ungueltige Rechnungs-ID.')
  }

  const advance = SIMPLE_ADVANCES[currentStatus]
  if (!advance) {
    throw new Error(`Status "${currentStatus}" hat keinen einfachen Nachfolger.`)
  }

  const extra: Record<string, unknown> = {}
  if (['draft', 'freigegeben', 'erneut_eingereicht'].includes(currentStatus)) {
    extra.sent_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status: advance.to, ...extra })
    .eq('id', invoiceId)

  if (error) throw new Error(`Status-Update fehlgeschlagen: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'invoice',
    entityId: invoiceId,
    details: { von: currentStatus, nach: advance.to, ...extra },
  })

  return { ok: true }
}

// ── Zahlung erfassen ─────────────────────────────────────────────

export async function recordInvoicePayment(
  invoiceId: string,
  currentStatus: string,
  paidAmount: number,
  totalAmount: number,
): Promise<{ ok: true; fullyPaid: boolean; difference: number }> {
  const { supabase, userId, organizationId, role, name } = await requireInvoiceAdmin()

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new Error('Ungueltige Rechnungs-ID.')
  }
  if (typeof paidAmount !== 'number' || isNaN(paidAmount) || paidAmount < 0) {
    throw new Error('Ungueltiger Betrag.')
  }

  const diff = totalAmount - paidAmount
  const fullyPaid = paidAmount >= totalAmount
  const isGerman = ['quittiert', 'teilweise_bezahlt', 'strittig'].includes(currentStatus)

  const { error } = await supabase.from('invoices').update({
    status: fullyPaid ? (isGerman ? 'bezahlt' : 'paid') : (isGerman ? 'teilweise_bezahlt' : 'partial'),
    paid_amount: paidAmount,
    paid_at: new Date().toISOString(),
  }).eq('id', invoiceId)

  if (error) throw new Error(`Zahlungserfassung fehlgeschlagen: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'invoice',
    entityId: invoiceId,
    details: { aktion: 'zahlung_erfasst', paid_amount: paidAmount, total_amount: totalAmount, fully_paid: fullyPaid },
  })

  return { ok: true, fullyPaid, difference: diff }
}

// ── Kürzung dokumentieren ────────────────────────────────────────

export async function recordInvoiceDispute(
  invoiceId: string,
  originalAmount: number,
  paidAmount: number,
  difference: number,
  reason: string,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireInvoiceAdmin()

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new Error('Ungueltige Rechnungs-ID.')
  }

  const { error } = await supabase.from('invoice_disputes').insert({
    invoice_id: invoiceId,
    original_amount: originalAmount,
    paid_amount: paidAmount,
    difference,
    reason: reason || 'Kuerzung durch Kostentraeger',
    status: 'open',
  })

  if (error) throw new Error(`Kuerzung konnte nicht dokumentiert werden: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'create',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'invoice_dispute',
    entityId: invoiceId,
    details: { original_amount: originalAmount, paid_amount: paidAmount, difference, reason },
  })

  return { ok: true }
}

// ── Kürzung akzeptieren / Korrektur anfordern ────────────────────

export async function decideInvoiceKuerzung(
  invoiceId: string,
  accept: boolean,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireInvoiceAdmin()

  if (!invoiceId || typeof invoiceId !== 'string') {
    throw new Error('Ungueltige Rechnungs-ID.')
  }

  const newStatus = accept ? 'akzeptiert' : 'korrektur_erforderlich'
  const { error } = await supabase.from('invoices').update({
    status: newStatus,
  }).eq('id', invoiceId)

  if (error) throw new Error(`Entscheidung fehlgeschlagen: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'invoice',
    entityId: invoiceId,
    details: { aktion: accept ? 'kuerzung_akzeptiert' : 'korrektur_angefordert', neuer_status: newStatus },
  })

  return { ok: true }
}
