import type { SupabaseClient } from '@supabase/supabase-js'

export type KimClient = SupabaseClient

export type KimDirection = 'inbound' | 'outbound'

export type KimMessageStatus =
  | 'entwurf'
  | 'wartend'
  | 'gesendet'
  | 'zugestellt'
  | 'gelesen'
  | 'fehler'
  | 'storniert'

export type KimPriority = 'niedrig' | 'normal' | 'hoch'

export type KimMessageType = 'arztbrief' | 'verordnung' | 'befund' | 'abrechnung' | 'sonstig'

export type KimAddressType = 'arzt' | 'kasse' | 'leistungserbringer' | 'sonstig'

export type KimProviderType = 'mock' | 'test' | 'kim_plus' | 'kim_basis'

export const KIM_MESSAGE_STATUS_LABELS: Record<KimMessageStatus, string> = {
  entwurf: 'Entwurf',
  wartend: 'Wartend',
  gesendet: 'Gesendet',
  zugestellt: 'Zugestellt',
  gelesen: 'Gelesen',
  fehler: 'Fehler',
  storniert: 'Storniert',
}

export const KIM_MESSAGE_TYPE_LABELS: Record<KimMessageType, string> = {
  arztbrief: 'Arztbrief',
  verordnung: 'Verordnung',
  befund: 'Befund',
  abrechnung: 'Abrechnung',
  sonstig: 'Sonstiges',
}

export const KIM_ADDRESS_TYPE_LABELS: Record<KimAddressType, string> = {
  arzt: 'Arzt/Praxis',
  kasse: 'Krankenkasse',
  leistungserbringer: 'Leistungserbringer',
  sonstig: 'Sonstige',
}

export interface KimMessage {
  id: string
  organization_id: string
  direction: KimDirection
  kim_address_from: string
  kim_address_to: string
  subject: string
  body_text: string | null
  body_html: string | null
  status: KimMessageStatus
  priority: KimPriority
  message_type: KimMessageType
  related_client_id: string | null
  related_caregiver_id: string | null
  sent_at: string | null
  delivered_at: string | null
  read_at: string | null
  error_details: string | null
  retry_count: number
  max_retries: number
  next_retry_at: string | null
  metadata: Record<string, unknown>
  provider_message_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface KimAttachment {
  id: string
  message_id: string
  organization_id: string
  filename: string
  mime_type: string
  size_bytes: number
  storage_path: string
  checksum_sha256: string
  created_at: string
}

export interface KimAttachmentMitUrl extends KimAttachment {
  signed_url: string
}

export interface KimAddress {
  id: string
  organization_id: string
  kim_address: string
  display_name: string
  address_type: KimAddressType
  lanr: string | null
  bsnr: string | null
  ik_nummer: string | null
  is_active: boolean
  verified_at: string | null
  created_at: string
}

export interface KimProviderConfig {
  id: string
  organization_id: string
  provider_type: KimProviderType
  konfiguration_id: string | null
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface KimAuditLogEntry {
  id: string
  organization_id: string
  message_id: string | null
  aktion: string
  actor_id: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface KimMessageFilter {
  direction?: KimDirection
  status?: KimMessageStatus
  message_type?: KimMessageType
  related_client_id?: string
  related_caregiver_id?: string
  search?: string
  limit?: number
}

export interface CreateKimMessageInput {
  kim_address_to: string
  kim_address_from: string
  subject: string
  body_text?: string | null
  body_html?: string | null
  priority?: KimPriority
  message_type?: KimMessageType
  related_client_id?: string | null
  related_caregiver_id?: string | null
  metadata?: Record<string, unknown>
}
