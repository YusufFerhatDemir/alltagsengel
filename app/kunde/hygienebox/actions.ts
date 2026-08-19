'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Hygienebox-Bestellung
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

// ── Hygienebox bestellen ────────────────────────────────────────

interface SubmitHygieneboxOrderInput {
  deliveryAddress: string
  pflegegrad: number
  insuranceCompany: string
  insuranceNumber: string
  products: string[]
  consent: boolean
}

export async function submitHygieneboxOrderAction(
  input: SubmitHygieneboxOrderInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId, role, name } = await requireKunde()

    if (!input.deliveryAddress?.trim()) return { ok: false, error: 'Lieferadresse fehlt.' }
    if (!input.insuranceCompany?.trim()) return { ok: false, error: 'Krankenkasse fehlt.' }
    if (!input.insuranceNumber?.trim()) return { ok: false, error: 'Versichertennummer fehlt.' }
    if (!input.products || input.products.length === 0) return { ok: false, error: 'Bitte mindestens ein Produkt waehlen.' }
    if (!input.consent) return { ok: false, error: 'Bitte Beauftragung akzeptieren.' }
    if (input.pflegegrad < 1 || input.pflegegrad > 5) return { ok: false, error: 'Pflegegrad muss zwischen 1 und 5 liegen.' }

    const { data: order, error: dbError } = await supabase
      .from('hygienebox_orders')
      .insert({
        user_id: userId,
        delivery_address: input.deliveryAddress.trim(),
        pflegegrad: input.pflegegrad,
        insurance_company: input.insuranceCompany.trim(),
        insurance_number: input.insuranceNumber.trim(),
        products: input.products,
        consent: input.consent,
        status: 'submitted',
      })
      .select('id')
      .single()

    if (dbError) {
      return { ok: false, error: dbError.message }
    }

    await logAuditEventOrWarn({
      action: 'create',
      actorId: userId,
      actorRole: role,
      actorName: name,
      organizationId,
      entityType: 'hygienebox_orders',
      entityId: order?.id ?? null,
      details: { pflegegrad: input.pflegegrad, product_count: input.products.length },
    })

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
