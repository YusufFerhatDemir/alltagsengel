'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer die Service-Buchung
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireKunde() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['kunde', 'client', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Kunden.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Kunde'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── Service-Buchung erstellen ───────────────────────────────────

interface CreateServiceBookingInput {
  angelId: string
  service: string
  date: string
  time: string
  durationHours: number
  totalAmount: number
  isFlexible: boolean
  paymentMethod: string
  notes: string | null
}

export async function createServiceBookingAction(
  input: CreateServiceBookingInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.angelId) return { ok: false, error: 'Kein Engel ausgewaehlt.' }
    if (!input.service) return { ok: false, error: 'Keine Leistung ausgewaehlt.' }
    if (!input.date) return { ok: false, error: 'Kein Datum angegeben.' }
    if (!input.time) return { ok: false, error: 'Keine Uhrzeit angegeben.' }
    if (!input.durationHours || input.durationHours <= 0) {
      return { ok: false, error: 'Dauer muss groesser als 0 sein.' }
    }
    if (input.totalAmount == null || input.totalAmount < 0) {
      return { ok: false, error: 'Ungueltiger Gesamtbetrag.' }
    }

    const { data: booking, error: dbError } = await supabase
      .from('bookings')
      .insert({
        customer_id: userId,
        angel_id: input.angelId,
        service: input.service,
        date: input.date,
        time: input.time,
        duration_hours: input.durationHours,
        total_amount: input.totalAmount,
        is_flexible: input.isFlexible,
        status: 'pending',
        payment_method: input.paymentMethod,
        notes: input.notes,
      })
      .select('id')
      .single()

    if (dbError || !booking) {
      return { ok: false, error: dbError?.message || 'Buchung konnte nicht erstellt werden.' }
    }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'bookings',
      entityId: booking.id,
      details: { service: input.service, angel_id: input.angelId, is_flexible: input.isFlexible },
    })

    return { ok: true, data: { id: booking.id } }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
