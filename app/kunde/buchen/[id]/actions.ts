'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer die Buchungsseite
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

  const organizationId = await getActiveOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Kunde'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ── PLZ im Profil speichern ─────────────────────────────────────

export async function savePlzAction(
  input: { plz: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.plz || !/^\d{5}$/.test(input.plz)) {
      return { ok: false, error: 'Bitte eine gueltige 5-stellige PLZ eingeben.' }
    }

    const { error: dbError } = await supabase
      .from('profiles')
      .update({ postal_code: input.plz })
      .eq('id', userId)

    if (dbError) return { ok: false, error: `PLZ-Update fehlgeschlagen: ${dbError.message}` }

    await logAuditEvent({
      action: 'update',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'profiles',
      entityId: userId,
      details: { field: 'postal_code' },
    }).catch(() => {})

    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unerwarteter Fehler.'
    return { ok: false, error: message }
  }
}

// ── Buchung erstellen ───────────────────────────────────────────

interface CreateBookingInput {
  angelId: string
  service: string
  date: string
  time: string
  durationHours: number
  paymentMethod: string
  insuranceType: string | null
  insuranceProvider: string | null
  totalAmount: number
  platformFee: number
  notes: string | null
  careRecipientId: string | null
}

export async function createBookingAction(
  input: CreateBookingInput,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    // Validierung
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
        status: 'pending',
        payment_method: input.paymentMethod,
        insurance_type: input.insuranceType,
        insurance_provider: input.insuranceProvider,
        total_amount: input.totalAmount,
        platform_fee: input.platformFee,
        notes: input.notes,
        care_recipient_id: input.careRecipientId,
      })
      .select('id')
      .single()

    if (dbError || !booking) {
      return { ok: false, error: `Buchung fehlgeschlagen: ${dbError?.message || 'Kein Datensatz zurueckgegeben.'}` }
    }

    await logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'bookings',
      entityId: booking.id,
      details: { service: input.service, angel_id: input.angelId },
    }).catch(() => {})

    return { ok: true, data: { id: booking.id } }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unerwarteter Fehler.'
    return { ok: false, error: message }
  }
}
