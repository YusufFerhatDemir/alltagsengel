'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen für Fahrer-Registrierung
// Ersetzt client-seitige Supabase-Writes durch geprüfte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireAuthUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')
  const organizationId = await getActiveOrgId()
  return { supabase, userId: user.id, organizationId }
}

// ── Fahrer-Profil registrieren ──────────────────────────────────

export interface RegisterFahrerInput {
  firstName: string
  lastName: string
  phone: string
  plz: string
  city: string
  companyName: string
  licenseNumber: string
  taxId: string
  address: string
  email: string
}

const REQUIRED_FIELDS: (keyof RegisterFahrerInput)[] = [
  'firstName',
  'lastName',
  'phone',
  'plz',
  'city',
  'companyName',
  'licenseNumber',
  'taxId',
  'address',
  'email',
]

export async function registerFahrerProfile(
  input: RegisterFahrerInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, userId, organizationId } = await requireAuthUser()

    // ── Validate all inputs are non-empty strings ──
    for (const field of REQUIRED_FIELDS) {
      const value = input[field]
      if (typeof value !== 'string' || value.trim().length === 0) {
        return { ok: false, error: `Feld "${field}" darf nicht leer sein.` }
      }
    }

    // ── 1. Update profile with fahrer role ──
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        role: 'fahrer',
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone.trim(),
        location: [input.plz, input.city].filter(Boolean).join(' '),
        postal_code:
          input.plz && input.plz.trim().length === 5
            ? input.plz.trim()
            : null,
      })
      .eq('id', userId)

    if (profileError) {
      return { ok: false, error: `Profil-Update fehlgeschlagen: ${profileError.message}` }
    }

    // ── 2. Insert krankenfahrt_providers entry ──
    const { error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .insert({
        user_id: userId,
        company_name: input.companyName.trim(),
        license_number: input.licenseNumber.trim(),
        tax_id: input.taxId.trim(),
        address: input.address.trim(),
        city: input.city.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        status: 'pending',
        is_verified: false,
      })

    if (providerError) {
      return { ok: false, error: `Provider-Eintrag fehlgeschlagen: ${providerError.message}` }
    }

    // ── Audit-Log (fail-soft) ──
    logAuditEvent({
      action: 'create',
      actorId: userId,
      organizationId: organizationId ?? null,
      actorRole: 'fahrer',
      actorName: [input.firstName, input.lastName].filter(Boolean).join(' ') || null,
      entityType: 'krankenfahrt_provider',
      entityId: userId,
      details: {
        company_name: input.companyName.trim(),
        license_number: input.licenseNumber.trim(),
      },
    }).catch(() => {})

    return { ok: true }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unbekannter Fehler bei der Registrierung.'
    return { ok: false, error: message }
  }
}
