import type { IKimProvider, KimAddressVerification } from './provider-interface'
import type { KimAddress, KimAddressType, KimClient } from './types'
import { writeKimAuditLog } from './audit-service'
import { postgrestSuchwert } from '@/lib/supabase/postgrest-filter'

const KIM_ADDRESS_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export interface CreateKimAddressInput {
  kim_address: string
  display_name: string
  address_type?: KimAddressType
  lanr?: string | null
  bsnr?: string | null
  ik_nummer?: string | null
}

function validateAddressInput(input: CreateKimAddressInput): void {
  if (!input.kim_address || !KIM_ADDRESS_PATTERN.test(input.kim_address)) {
    throw new Error('Pflichtfeld: gültige KIM-Adresse.')
  }
  if (!input.display_name || input.display_name.trim().length === 0) {
    throw new Error('Pflichtfeld: Anzeigename.')
  }
}

export interface ListKimAddressFilter {
  address_type?: KimAddressType
  is_active?: boolean
  search?: string
}

export async function listKimAddresses(
  supabase: KimClient,
  organizationId: string,
  filter: ListKimAddressFilter = {}
): Promise<KimAddress[]> {
  let query = supabase
    .from('kim_addresses')
    .select('*')
    .eq('organization_id', organizationId)
    .order('display_name', { ascending: true })

  if (filter.address_type) query = query.eq('address_type', filter.address_type)
  if (filter.is_active !== undefined) query = query.eq('is_active', filter.is_active)
  if (filter.search) {
    // BEFUND (28.08.2026, Track 7): der Suchbegriff stand hier ROH in der
    // PostgREST-Filterzeichenkette. Ein Komma im Begriff haengte eine
    // zweite Bedingung an — ueber jede beliebige Spalte der Tabelle,
    // `ik_nummer` und `lanr` eingeschlossen. Die Mandantengrenze blieb
    // dabei zwar stehen (`.eq('organization_id', …)` ist ein eigener,
    // UND-verknuepfter Parameter), die Suche war aber ein frei
    // formulierbares Abfragewerkzeug statt einer Suche.
    const s = postgrestSuchwert(filter.search)
    query = query.or(`display_name.ilike.${s},kim_address.ilike.${s}`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Adressbuch konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as KimAddress[]
}

export async function createKimAddress(
  supabase: KimClient,
  organizationId: string,
  actorId: string,
  input: CreateKimAddressInput
): Promise<KimAddress> {
  validateAddressInput(input)

  const { data, error } = await supabase
    .from('kim_addresses')
    .insert({
      organization_id: organizationId,
      kim_address: input.kim_address,
      display_name: input.display_name.trim(),
      address_type: input.address_type ?? 'sonstig',
      lanr: input.lanr ?? null,
      bsnr: input.bsnr ?? null,
      ik_nummer: input.ik_nummer ?? null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw new Error('Diese KIM-Adresse ist bereits im Adressbuch erfasst.')
    throw new Error(`Adresse konnte nicht angelegt werden: ${error.message}`)
  }

  await writeKimAuditLog(supabase, {
    organizationId,
    aktion: 'adresse_angelegt',
    actorId,
    details: { kim_address: input.kim_address },
  })

  return data as KimAddress
}

export async function updateKimAddress(
  supabase: KimClient,
  organizationId: string,
  addressId: string,
  actorId: string,
  patch: Partial<CreateKimAddressInput> & { is_active?: boolean }
): Promise<KimAddress> {
  const { data, error } = await supabase
    .from('kim_addresses')
    .update({
      ...(patch.kim_address !== undefined ? { kim_address: patch.kim_address } : {}),
      ...(patch.display_name !== undefined ? { display_name: patch.display_name.trim() } : {}),
      ...(patch.address_type !== undefined ? { address_type: patch.address_type } : {}),
      ...(patch.lanr !== undefined ? { lanr: patch.lanr } : {}),
      ...(patch.bsnr !== undefined ? { bsnr: patch.bsnr } : {}),
      ...(patch.ik_nummer !== undefined ? { ik_nummer: patch.ik_nummer } : {}),
      ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
    })
    .eq('id', addressId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`Adresse konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, { organizationId, aktion: 'adresse_geaendert', actorId, details: { addressId } })

  return data as KimAddress
}

export async function verifyKimAddress(
  supabase: KimClient,
  provider: IKimProvider,
  organizationId: string,
  addressId: string,
  actorId: string
): Promise<KimAddressVerification> {
  const { data: address, error } = await supabase
    .from('kim_addresses')
    .select('*')
    .eq('id', addressId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Adresse konnte nicht geladen werden: ${error.message}`)
  if (!address) throw new Error('Adresse nicht gefunden.')

  const verification = await provider.verifyAddress(address.kim_address)

  if (verification.isValid) {
    const { error: updateError } = await supabase
      .from('kim_addresses')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', addressId)
      .eq('organization_id', organizationId)
    if (updateError) throw new Error(`Verifikation konnte nicht gespeichert werden: ${updateError.message}`)
  }

  await writeKimAuditLog(supabase, {
    organizationId,
    aktion: 'adresse_verifiziert',
    actorId,
    details: { addressId, isValid: verification.isValid, reason: verification.reason },
  })

  return verification
}
