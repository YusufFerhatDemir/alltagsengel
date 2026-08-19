import type { IKimProvider } from './provider-interface'
import type { KimAttachment, KimClient, KimMessage } from './types'
import { writeKimAuditLog } from './audit-service'
import { downloadKimAttachmentBytes } from './attachment-service'
import { mitSimulationsMarker, pruefeVersandModus, simulationsMarker } from './versandmodus'

export const RETRY_BACKOFF_BASE_MS = 60_000 // 1 Minute
export const RETRY_BACKOFF_MAX_MS = 24 * 60 * 60 * 1000 // 24 Stunden

/** Exponentielles Backoff: 1min, 2min, 4min, 8min, … gedeckelt auf 24h. */
export function computeBackoffMs(retryCount: number): number {
  const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, retryCount)
  return Math.min(backoff, RETRY_BACKOFF_MAX_MS)
}

export interface SendAttemptResult {
  messageId: string
  outcome: 'gesendet' | 'wird_wiederholt' | 'endgueltig_fehlgeschlagen'
  errorDetails?: string
}

/**
 * Nachrichten, die JETZT gesendet werden dürfen: frisch freigegeben
 * ("wartend") oder nach abgelaufenem Backoff erneut fällig ("fehler"
 * mit next_retry_at in der Vergangenheit und Retry-Budget übrig).
 */
export async function listSendableMessages(supabase: KimClient, organizationId: string): Promise<KimMessage[]> {
  const nowIso = new Date().toISOString()

  const { data: wartend, error: err1 } = await supabase
    .from('kim_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .eq('status', 'wartend')

  if (err1) throw new Error(`Warteschlange konnte nicht geladen werden: ${err1.message}`)

  const { data: retryFaellig, error: err2 } = await supabase
    .from('kim_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .eq('status', 'fehler')
    .not('next_retry_at', 'is', null)
    .lte('next_retry_at', nowIso)

  if (err2) throw new Error(`Retry-Warteschlange konnte nicht geladen werden: ${err2.message}`)

  return [...(wartend ?? []), ...(retryFaellig ?? [])] as KimMessage[]
}

async function loadAttachments(supabase: KimClient, messageId: string): Promise<KimAttachment[]> {
  const { data, error } = await supabase.from('kim_attachments').select('*').eq('message_id', messageId)
  if (error) throw new Error(`Anhänge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as KimAttachment[]
}

/**
 * `supabase` muss ein service_role-Client sein (createAdminClient()) —
 * der Anhang-Bucket ist privat und für den Versand müssen die
 * tatsächlichen Rohdaten geladen werden, nicht nur signierte URLs.
 */
export async function sendQueuedMessage(
  supabase: KimClient,
  provider: IKimProvider,
  organizationId: string,
  message: KimMessage,
  actorId?: string | null
): Promise<SendAttemptResult> {
  // Vor jedem Provider-Zugriff, der Zustand schreibt: wirft, wenn im
  // Echtbetrieb (KIM_AKTIV=true) ein simulierter Provider aktiv wäre.
  const modus = pruefeVersandModus(provider)
  const marker = simulationsMarker(modus)

  const attachmentRows = await loadAttachments(supabase, message.id)
  const attachments = await Promise.all(
    attachmentRows.map(async a => ({
      filename: a.filename,
      mimeType: a.mime_type,
      content: await downloadKimAttachmentBytes(supabase, a),
    }))
  )

  const result = await provider.sendMessage({
    fromAddress: message.kim_address_from,
    toAddress: message.kim_address_to,
    subject: message.subject,
    bodyText: message.body_text,
    bodyHtml: message.body_html,
    attachments,
  })

  if (result.success) {
    const { error } = await supabase
      .from('kim_messages')
      .update({
        status: 'gesendet',
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId ?? null,
        error_details: null,
        next_retry_at: null,
        // Die Kennzeichnung entsteht im selben Update wie der Statuswechsel:
        // es gibt keinen Zwischenzustand, in dem 'gesendet' ohne Herkunft steht.
        metadata: mitSimulationsMarker(message.metadata, marker),
      })
      .eq('id', message.id)
      .eq('organization_id', organizationId)

    if (error) throw new Error(`Versand-Status konnte nicht gespeichert werden: ${error.message}`)

    await writeKimAuditLog(supabase, {
      organizationId,
      aktion: 'gesendet',
      messageId: message.id,
      actorId: actorId ?? null,
      details: { provider_message_id: result.providerMessageId, simuliert: modus.simuliert, provider_typ: modus.providerTyp },
    })

    return { messageId: message.id, outcome: 'gesendet' }
  }

  const retryCount = message.retry_count + 1
  const exhausted = retryCount > message.max_retries

  const { error } = await supabase
    .from('kim_messages')
    .update({
      status: 'fehler',
      retry_count: retryCount,
      error_details: result.errorDetails ?? 'Unbekannter Fehler beim Versand.',
      next_retry_at: exhausted ? null : new Date(Date.now() + computeBackoffMs(retryCount)).toISOString(),
      metadata: mitSimulationsMarker(message.metadata, marker),
    })
    .eq('id', message.id)
    .eq('organization_id', organizationId)

  if (error) throw new Error(`Fehler-Status konnte nicht gespeichert werden: ${error.message}`)

  await writeKimAuditLog(supabase, {
    organizationId,
    aktion: 'sendefehler',
    messageId: message.id,
    actorId: actorId ?? null,
    details: { retry_count: retryCount, exhausted, error: result.errorDetails, simuliert: modus.simuliert, provider_typ: modus.providerTyp },
  })

  return {
    messageId: message.id,
    outcome: exhausted ? 'endgueltig_fehlgeschlagen' : 'wird_wiederholt',
    errorDetails: result.errorDetails,
  }
}

export interface ProcessOutboxSummary {
  gesendet: number
  wirdWiederholt: number
  endgueltigFehlgeschlagen: number
  results: SendAttemptResult[]
}

export async function processOutbox(
  supabase: KimClient,
  provider: IKimProvider,
  organizationId: string,
  actorId?: string | null
): Promise<ProcessOutboxSummary> {
  const queued = await listSendableMessages(supabase, organizationId)
  const results: SendAttemptResult[] = []

  for (const message of queued) {
    results.push(await sendQueuedMessage(supabase, provider, organizationId, message, actorId))
  }

  return {
    gesendet: results.filter(r => r.outcome === 'gesendet').length,
    wirdWiederholt: results.filter(r => r.outcome === 'wird_wiederholt').length,
    endgueltigFehlgeschlagen: results.filter(r => r.outcome === 'endgueltig_fehlgeschlagen').length,
    results,
  }
}

/** Fragt beim Provider den Zustellstatus bereits gesendeter Nachrichten ab. */
export async function pollDeliveryStatuses(
  supabase: KimClient,
  provider: IKimProvider,
  organizationId: string,
  actorId?: string | null
): Promise<number> {
  const { data, error } = await supabase
    .from('kim_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .eq('status', 'gesendet')
    .not('provider_message_id', 'is', null)

  if (error) throw new Error(`Nachrichten für Statusabfrage konnten nicht geladen werden: ${error.message}`)

  // 'zugestellt'/'gelesen' sind die Werte, die im Gesundheitswesen als
  // Zustellnachweis gelesen werden. Sie dürfen erst recht nicht ohne
  // Herkunftskennzeichnung aus einem Simulator kommen.
  const modus = pruefeVersandModus(provider)
  const marker = simulationsMarker(modus)

  let updated = 0
  for (const message of (data ?? []) as KimMessage[]) {
    if (!message.provider_message_id) continue
    const delivery = await provider.checkDeliveryStatus(message.provider_message_id)

    if (delivery.status === 'gesendet') continue

    const patch: Record<string, unknown> = {}
    if (delivery.status === 'zugestellt') patch.status = 'zugestellt'
    if (delivery.status === 'zugestellt' && !message.delivered_at) patch.delivered_at = delivery.occurredAt
    if (delivery.status === 'gelesen') {
      patch.status = 'gelesen'
      if (!message.delivered_at) patch.delivered_at = delivery.occurredAt
      if (!message.read_at) patch.read_at = delivery.occurredAt
    }
    if (delivery.status === 'fehler') {
      patch.status = 'fehler'
      patch.error_details = delivery.errorDetails ?? 'Zustellfehler laut Provider.'
    }
    if (Object.keys(patch).length === 0) continue
    patch.metadata = mitSimulationsMarker(message.metadata, marker)

    const { error: updateError } = await supabase
      .from('kim_messages')
      .update(patch)
      .eq('id', message.id)
      .eq('organization_id', organizationId)
    if (updateError) throw new Error(`Zustellstatus konnte nicht gespeichert werden: ${updateError.message}`)

    const aktion = delivery.status === 'fehler' ? 'sendefehler' : delivery.status === 'gelesen' ? 'gelesen' : 'zugestellt'
    await writeKimAuditLog(supabase, {
      organizationId,
      aktion,
      messageId: message.id,
      actorId: actorId ?? null,
    })
    updated += 1
  }

  return updated
}
