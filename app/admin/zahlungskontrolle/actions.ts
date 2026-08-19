'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Zahlungskontrolle
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireZahlungskontrolleAdmin() {
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

// ── Mahnung senden (Reminder-Count hochzählen) ──────────────────

export async function sendPaymentReminder(
  paymentId: string,
  currentReminderCount: number,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireZahlungskontrolleAdmin()

  if (!paymentId || typeof paymentId !== 'string') {
    throw new Error('Ungueltige Zahlungs-ID.')
  }
  if (typeof currentReminderCount !== 'number' || currentReminderCount < 0) {
    throw new Error('Ungueltiger Mahnungszaehler.')
  }

  const { error } = await supabase.from('payment_status').update({
    reminder_count: currentReminderCount + 1,
    last_reminder_at: new Date().toISOString(),
  }).eq('id', paymentId)

  if (error) throw new Error(`Mahnung fehlgeschlagen: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'payment_status',
    entityId: paymentId,
    details: { aktion: 'mahnung_gesendet', neuer_zaehler: currentReminderCount + 1 },
  })

  return { ok: true }
}

// ── Zahlung erfassen ─────────────────────────────────────────────

export async function recordPayment(
  paymentId: string,
  amountPaid: number,
  paidDate: string,
  paymentMethod: string,
  amountDue: number,
): Promise<{ ok: true }> {
  const { supabase, userId, organizationId, role, name } = await requireZahlungskontrolleAdmin()

  if (!paymentId || typeof paymentId !== 'string') {
    throw new Error('Ungueltige Zahlungs-ID.')
  }
  if (typeof amountPaid !== 'number' || isNaN(amountPaid) || amountPaid < 0) {
    throw new Error('Ungueltiger Betrag.')
  }
  if (!paidDate || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
    throw new Error('Ungueltiges Zahlungsdatum.')
  }
  if (!paymentMethod || typeof paymentMethod !== 'string') {
    throw new Error('Bitte eine Zahlungsart waehlen.')
  }

  const newStatus = amountPaid >= amountDue ? 'bezahlt' : 'teilbezahlt'

  const { error } = await supabase.from('payment_status').update({
    amount_paid: amountPaid,
    paid_date: paidDate,
    payment_method: paymentMethod,
    status: newStatus,
  }).eq('id', paymentId)

  if (error) throw new Error(`Zahlung konnte nicht gespeichert werden: ${error.message}`)

  await logAuditEventOrWarn({
    action: 'update',
    actorId: userId,
    actorRole: role,
    actorName: name,
    organizationId,
    entityType: 'payment_status',
    entityId: paymentId,
    details: {
      aktion: 'zahlung_erfasst',
      amount_paid: amountPaid,
      paid_date: paidDate,
      payment_method: paymentMethod,
      neuer_status: newStatus,
    },
  })

  return { ok: true }
}
