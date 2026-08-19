'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Krankenfahrt + Bewertung
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

// ── Krankenfahrt buchen ─────────────────────────────────────────

interface CreateKrankenfahrtInput {
  abholadresse: string
  zieladresse: string
  datum: string
  uhrzeit: string
  rueckfahrt: boolean
  selectedTier: string
  hinweise: string | null
  paymentMethod: string
  insuranceType: string | null
  insuranceProvider: string | null
  totalAmount: number
  pricingSnapshot: any | null
}

export async function createKrankenfahrtAction(
  input: CreateKrankenfahrtInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.abholadresse?.trim()) return { ok: false, error: 'Abholadresse fehlt.' }
    if (!input.zieladresse?.trim()) return { ok: false, error: 'Zieladresse fehlt.' }
    if (!input.datum) return { ok: false, error: 'Datum fehlt.' }
    if (!input.uhrzeit) return { ok: false, error: 'Uhrzeit fehlt.' }

    const { data: booking, error: dbError } = await supabase
      .from('krankenfahrten')
      .insert({
        customer_id: userId,
        abholadresse: input.abholadresse.trim(),
        zieladresse: input.zieladresse.trim(),
        datum: input.datum,
        uhrzeit: input.uhrzeit,
        rueckfahrt: input.rueckfahrt,
        rollstuhl_benoetig: input.selectedTier === 'rollstuhl',
        tragestuhl_benoetig: input.selectedTier === 'tragestuhl',
        hinweise: input.hinweise?.trim() || null,
        payment_method: input.paymentMethod,
        insurance_type: input.insuranceType,
        insurance_provider: input.insuranceProvider,
        total_amount: input.totalAmount,
        pricing_snapshot: input.pricingSnapshot,
        status: 'pending',
      })
      .select('id')
      .single()

    if (dbError || !booking) {
      return { ok: false, error: dbError?.message || 'Buchung konnte nicht erstellt werden.' }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'krankenfahrten',
      entityId: booking.id,
      details: { tier: input.selectedTier },
    }).catch(() => {})

    return { ok: true, data: { id: booking.id } }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Krankenfahrt bewerten ───────────────────────────────────────

interface SubmitRideReviewInput {
  krankenfahrtId: string
  providerId: string
  rating: number
  puenktlichkeit: number | null
  freundlichkeit: number | null
  fahrzeugZustand: number | null
  comment: string | null
}

export async function submitRideReviewAction(
  input: SubmitRideReviewInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.krankenfahrtId) return { ok: false, error: 'Krankenfahrt-ID fehlt.' }
    if (!input.rating || input.rating < 1 || input.rating > 5) {
      return { ok: false, error: 'Bewertung muss zwischen 1 und 5 liegen.' }
    }

    // Ownership-Check: Fahrt gehoert dem Kunden
    const { data: ride } = await supabase
      .from('krankenfahrten')
      .select('id')
      .eq('id', input.krankenfahrtId)
      .eq('customer_id', userId)
      .single()

    if (!ride) {
      return { ok: false, error: 'Fahrt nicht gefunden oder keine Berechtigung.' }
    }

    // Doppel-Bewertung verhindern
    const { data: existing } = await supabase
      .from('krankenfahrt_reviews')
      .select('id')
      .eq('krankenfahrt_id', input.krankenfahrtId)
      .maybeSingle()

    if (existing) {
      return { ok: false, error: 'Diese Fahrt wurde bereits bewertet.' }
    }

    const { error: dbError } = await supabase
      .from('krankenfahrt_reviews')
      .insert({
        krankenfahrt_id: input.krankenfahrtId,
        customer_id: userId,
        provider_id: input.providerId,
        rating: input.rating,
        puenktlichkeit: input.puenktlichkeit,
        freundlichkeit: input.freundlichkeit,
        fahrzeug_zustand: input.fahrzeugZustand,
        comment: input.comment?.trim() || null,
      })

    if (dbError) {
      return { ok: false, error: dbError.message }
    }

    logAuditEvent({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'krankenfahrt_reviews',
      entityId: input.krankenfahrtId,
      details: { rating: input.rating, provider_id: input.providerId },
    }).catch(() => {})

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
