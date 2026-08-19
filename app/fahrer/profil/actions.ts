'use server'

import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'
import { logAuditEventOrWarn } from '@/lib/audit-log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveFahrerProfileInput {
  phone: string
  companyName: string
  address: string
  city: string
  licenseNumber: string
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireFahrer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['fahrer', 'admin', 'superadmin'].includes(profile.role)) {
    throw new Error('Nur fuer Fahrer.')
  }

  // Org des Nutzers aus Mitgliedschaft/caregivers/clients (Audit MITTEL-1:
  // fail-closed statt stillem Rueckfall auf die Stamm-Org).
  const organizationId = await resolveUserOrgId()
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Fahrer'
  return { supabase, userId: user.id, organizationId, role: profile.role, name }
}

// ---------------------------------------------------------------------------
// Server Action
// ---------------------------------------------------------------------------

export async function saveFahrerProfile(
  input: SaveFahrerProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // 1. Auth & role check
    const { supabase, userId, organizationId, role, name } = await requireFahrer()

    // 2. Validate inputs
    const phone = input.phone?.trim() ?? ''
    const companyName = input.companyName?.trim() ?? ''
    const address = input.address?.trim() ?? ''
    const city = input.city?.trim() ?? ''
    const licenseNumber = input.licenseNumber?.trim() ?? ''

    if (!phone) {
      return { ok: false, error: 'Telefonnummer darf nicht leer sein.' }
    }

    // 3. Update profile phone (ownership: id = userId)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ phone })
      .eq('id', userId)

    if (profileError) {
      return { ok: false, error: 'Profil konnte nicht gespeichert werden.' }
    }

    // 4. Look up provider for this user
    const { data: provider, error: providerLookupError } = await supabase
      .from('krankenfahrt_providers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (providerLookupError || !provider) {
      return { ok: false, error: 'Kein Anbieter-Datensatz gefunden.' }
    }

    // 5. Update provider record (ownership: user_id = userId)
    const { error: providerError } = await supabase
      .from('krankenfahrt_providers')
      .update({
        company_name: companyName,
        address,
        city,
        license_number: licenseNumber,
      })
      .eq('user_id', userId)

    if (providerError) {
      return { ok: false, error: 'Anbieterdaten konnten nicht gespeichert werden.' }
    }

    // 6. Audit log (fail-soft)
    await logAuditEventOrWarn({
      action: 'update',
      actorId: userId,
      organizationId,
      actorRole: role,
      actorName: name,
      entityType: 'fahrer_profile',
      entityId: provider.id,
      details: { phone, companyName, address, city, licenseNumber },
    })

    // 7. Success
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler.'
    return { ok: false, error: message }
  }
}
