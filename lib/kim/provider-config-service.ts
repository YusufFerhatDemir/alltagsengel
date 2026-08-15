import type { IKimProvider } from './provider-interface'
import type { KimClient, KimProviderConfig, KimProviderType } from './types'
import { writeKimAuditLog } from './audit-service'
import { createKimProvider } from './provider-factory'

/** Liefert die aktuell aktive Provider-Konfiguration der Organisation, falls vorhanden. */
export async function getActiveProviderConfig(supabase: KimClient, organizationId: string): Promise<KimProviderConfig | null> {
  const { data, error } = await supabase
    .from('kim_provider_config')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw new Error(`Provider-Konfiguration konnte nicht geladen werden: ${error.message}`)
  return (data as KimProviderConfig) ?? null
}

export async function listProviderConfigs(supabase: KimClient, organizationId: string): Promise<KimProviderConfig[]> {
  const { data, error } = await supabase
    .from('kim_provider_config')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Provider-Konfigurationen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as KimProviderConfig[]
}

export interface SetProviderConfigInput {
  provider_type: KimProviderType
  config?: Record<string, unknown>
  konfiguration_id?: string | null
}

/**
 * Setzt den aktiven Provider der Organisation. Nur EIN Provider ist
 * gleichzeitig aktiv — bestehende aktive Konfigurationen werden zuerst
 * deaktiviert.
 */
export async function setActiveProviderConfig(
  supabase: KimClient,
  organizationId: string,
  actorId: string,
  input: SetProviderConfigInput
): Promise<KimProviderConfig> {
  const { error: deactivateError } = await supabase
    .from('kim_provider_config')
    .update({ is_active: false })
    .eq('organization_id', organizationId)
    .eq('is_active', true)
  if (deactivateError) throw new Error(`Bestehende Provider-Konfiguration konnte nicht deaktiviert werden: ${deactivateError.message}`)

  const { data, error } = await supabase
    .from('kim_provider_config')
    .upsert(
      {
        organization_id: organizationId,
        provider_type: input.provider_type,
        config: input.config ?? {},
        konfiguration_id: input.konfiguration_id ?? null,
        is_active: true,
      },
      { onConflict: 'organization_id,provider_type' }
    )
    .select('*')
    .single()

  if (error || !data) throw new Error(`Provider-Konfiguration konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, {
    organizationId,
    aktion: 'provider_konfiguriert',
    actorId,
    details: { provider_type: input.provider_type },
  })

  return data as KimProviderConfig
}

/**
 * Baut den für die Organisation aktiven Provider. Ohne explizite
 * Konfiguration wird der Mock-Provider ohne Fehlerrate verwendet —
 * so funktioniert die Fachlogik (Outbox, Inbox, UI) auch ohne
 * vorherige Einrichtung.
 */
export async function resolveOrgProvider(supabase: KimClient, organizationId: string): Promise<IKimProvider> {
  const active = await getActiveProviderConfig(supabase, organizationId)
  if (!active) return createKimProvider({ provider_type: 'mock', config: {} })
  return createKimProvider({ provider_type: active.provider_type, config: active.config })
}
