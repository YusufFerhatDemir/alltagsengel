import type {
  KimClient,
  CreateKimMessageInput,
  KimMessage,
  KimMessageFilter,
  KimMessageStatus,
} from './types'
import { writeKimAuditLog } from './audit-service'

const KIM_ADDRESS_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Erlaubte Statusübergänge — jede andere Kombination ist ein Programmfehler. */
const ALLOWED_TRANSITIONS: Record<KimMessageStatus, KimMessageStatus[]> = {
  entwurf: ['wartend', 'storniert'],
  wartend: ['gesendet', 'fehler', 'storniert'],
  gesendet: ['zugestellt', 'gelesen', 'fehler'],
  zugestellt: ['gelesen', 'fehler'],
  gelesen: [],
  fehler: ['wartend', 'storniert'],
  storniert: [],
}

export function validateStatusTransition(from: KimMessageStatus, to: KimMessageStatus): void {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Ungültiger Statusübergang: "${from}" → "${to}".`)
  }
}

export function validateCreateMessage(input: CreateKimMessageInput): void {
  if (!input.kim_address_to || !KIM_ADDRESS_PATTERN.test(input.kim_address_to)) {
    throw new Error('Pflichtfeld: gültige Empfänger-KIM-Adresse.')
  }
  if (!input.kim_address_from || !KIM_ADDRESS_PATTERN.test(input.kim_address_from)) {
    throw new Error('Pflichtfeld: gültige Absender-KIM-Adresse.')
  }
  if (!input.subject || input.subject.trim().length === 0) {
    throw new Error('Pflichtfeld: Betreff.')
  }
  if (!input.body_text && !input.body_html) {
    throw new Error('Pflichtfeld: Nachrichtentext.')
  }
}

export async function createDraftMessage(
  supabase: KimClient,
  organizationId: string,
  userId: string,
  input: CreateKimMessageInput
): Promise<KimMessage> {
  validateCreateMessage(input)

  const { data, error } = await supabase
    .from('kim_messages')
    .insert({
      organization_id: organizationId,
      direction: 'outbound',
      kim_address_from: input.kim_address_from,
      kim_address_to: input.kim_address_to,
      subject: input.subject.trim(),
      body_text: input.body_text ?? null,
      body_html: input.body_html ?? null,
      priority: input.priority ?? 'normal',
      message_type: input.message_type ?? 'sonstig',
      related_client_id: input.related_client_id ?? null,
      related_caregiver_id: input.related_caregiver_id ?? null,
      metadata: input.metadata ?? {},
      status: 'entwurf',
      created_by: userId,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, {
    organizationId,
    aktion: 'erstellt',
    messageId: data.id,
    actorId: userId,
    details: { message_type: data.message_type },
  })

  return data as KimMessage
}

export async function updateDraftMessage(
  supabase: KimClient,
  organizationId: string,
  messageId: string,
  userId: string,
  patch: Partial<CreateKimMessageInput>
): Promise<KimMessage> {
  const existing = await getMessage(supabase, organizationId, messageId)
  if (existing.status !== 'entwurf') {
    throw new Error(`Nur Entwürfe können bearbeitet werden (aktueller Status: "${existing.status}").`)
  }

  const merged: CreateKimMessageInput = {
    kim_address_from: patch.kim_address_from ?? existing.kim_address_from,
    kim_address_to: patch.kim_address_to ?? existing.kim_address_to,
    subject: patch.subject ?? existing.subject,
    body_text: patch.body_text !== undefined ? patch.body_text : existing.body_text,
    body_html: patch.body_html !== undefined ? patch.body_html : existing.body_html,
    priority: patch.priority ?? existing.priority,
    message_type: patch.message_type ?? existing.message_type,
    related_client_id: patch.related_client_id !== undefined ? patch.related_client_id : existing.related_client_id,
    related_caregiver_id: patch.related_caregiver_id !== undefined ? patch.related_caregiver_id : existing.related_caregiver_id,
    metadata: patch.metadata ?? existing.metadata,
  }
  validateCreateMessage(merged)

  const { data, error } = await supabase
    .from('kim_messages')
    .update({
      kim_address_from: merged.kim_address_from,
      kim_address_to: merged.kim_address_to,
      subject: merged.subject.trim(),
      body_text: merged.body_text ?? null,
      body_html: merged.body_html ?? null,
      priority: merged.priority,
      message_type: merged.message_type,
      related_client_id: merged.related_client_id ?? null,
      related_caregiver_id: merged.related_caregiver_id ?? null,
      metadata: merged.metadata ?? {},
    })
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, { organizationId, aktion: 'bearbeitet', messageId, actorId: userId })

  return data as KimMessage
}

export async function getMessage(supabase: KimClient, organizationId: string, messageId: string): Promise<KimMessage> {
  const { data, error } = await supabase
    .from('kim_messages')
    .select('*')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(`Nachricht konnte nicht geladen werden: ${error.message}`)
  if (!data) throw new Error('Nachricht nicht gefunden.')
  return data as KimMessage
}

export async function listMessages(
  supabase: KimClient,
  organizationId: string,
  filter: KimMessageFilter = {}
): Promise<KimMessage[]> {
  let query = supabase
    .from('kim_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filter.direction) query = query.eq('direction', filter.direction)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.message_type) query = query.eq('message_type', filter.message_type)
  if (filter.related_client_id) query = query.eq('related_client_id', filter.related_client_id)
  if (filter.related_caregiver_id) query = query.eq('related_caregiver_id', filter.related_caregiver_id)
  if (filter.search) query = query.ilike('subject', `%${filter.search}%`)
  query = query.limit(filter.limit ?? 200)

  const { data, error } = await query
  if (error) throw new Error(`Nachrichten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as KimMessage[]
}

export async function queueForSending(
  supabase: KimClient,
  organizationId: string,
  messageId: string,
  userId: string
): Promise<KimMessage> {
  const existing = await getMessage(supabase, organizationId, messageId)
  validateStatusTransition(existing.status, 'wartend')
  validateCreateMessage(existing)

  const { data, error } = await supabase
    .from('kim_messages')
    .update({ status: 'wartend', error_details: null, next_retry_at: null })
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht zum Versand freigegeben werden: ${error?.message ?? 'unbekannt'}`)
  return data as KimMessage
}

export async function cancelMessage(
  supabase: KimClient,
  organizationId: string,
  messageId: string,
  userId: string
): Promise<KimMessage> {
  const existing = await getMessage(supabase, organizationId, messageId)
  validateStatusTransition(existing.status, 'storniert')

  const { data, error } = await supabase
    .from('kim_messages')
    .update({ status: 'storniert' })
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht storniert werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, { organizationId, aktion: 'storniert', messageId, actorId: userId })

  return data as KimMessage
}

export async function markMessageRead(
  supabase: KimClient,
  organizationId: string,
  messageId: string,
  userId: string
): Promise<KimMessage> {
  const existing = await getMessage(supabase, organizationId, messageId)
  if (existing.status === 'gelesen') return existing
  validateStatusTransition(existing.status, 'gelesen')

  const { data, error } = await supabase
    .from('kim_messages')
    .update({ status: 'gelesen', read_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) throw new Error(`Nachricht konnte nicht als gelesen markiert werden: ${error?.message ?? 'unbekannt'}`)

  await writeKimAuditLog(supabase, { organizationId, aktion: 'gelesen', messageId, actorId: userId })

  return data as KimMessage
}
