import type { IKimProvider } from './provider-interface'
import type { KimClient, KimMessage } from './types'
import { writeKimAuditLog } from './audit-service'
import { uploadKimAttachment, pruefeKimAnhang } from './attachment-service'
import { mitSimulationsMarker, pruefeVersandModus, simulationsMarker } from './versandmodus'

export interface FetchInboundSummary {
  inserted: number
  duplicates: number
  messages: KimMessage[]
}

async function isDuplicate(supabase: KimClient, organizationId: string, providerMessageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('kim_messages')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle()
  if (error) throw new Error(`Duplikatsprüfung fehlgeschlagen: ${error.message}`)
  return !!data
}

/**
 * Holt eingehende Nachrichten vom Provider und persistiert sie.
 * `supabase` muss ein service_role-Client sein (createAdminClient()) —
 * für den privaten Anhang-Bucket beim Speichern von Attachments.
 * Deduplizierung über die eindeutige (organization_id, provider_message_id)
 * -Kombination: ein zweiter Abruf derselben Nachricht erzeugt keine Dopplung.
 */
export async function fetchAndStoreInbound(
  supabase: KimClient,
  provider: IKimProvider,
  organizationId: string
): Promise<FetchInboundSummary> {
  // Auch der Abruf wird geprüft und gekennzeichnet: eine simulierte
  // Eingangsnachricht mit status='zugestellt' sähe sonst aus wie ein echter
  // Arztbrief aus der TI — und würde in der Akte genauso behandelt.
  const modus = pruefeVersandModus(provider)
  const marker = simulationsMarker(modus)

  const inbound = await provider.fetchInbound()
  const messages: KimMessage[] = []
  let duplicates = 0

  for (const item of inbound) {
    if (await isDuplicate(supabase, organizationId, item.providerMessageId)) {
      duplicates += 1
      continue
    }

    const { data, error } = await supabase
      .from('kim_messages')
      .insert({
        organization_id: organizationId,
        direction: 'inbound',
        kim_address_from: item.fromAddress,
        kim_address_to: item.toAddress,
        subject: item.subject,
        body_text: item.bodyText ?? null,
        body_html: item.bodyHtml ?? null,
        status: 'zugestellt',
        delivered_at: item.receivedAt,
        provider_message_id: item.providerMessageId,
        metadata: mitSimulationsMarker(null, marker),
      })
      .select('*')
      .single()

    if (error || !data) throw new Error(`Eingehende Nachricht konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)

    const message = data as KimMessage

    // Anhaenge einzeln und fehlertolerant: Inhalt und Typ bestimmt der
    // absendende Fremdsystem. Ein einziger unzulaessiger Anhang riss vorher
    // den gesamten Abruf mit — und weil die Nachricht beim naechsten Lauf
    // erneut geholt wurde, blieb das Postfach dauerhaft stehen. Der Anhang
    // wird stattdessen verworfen und im Audit-Log als solcher vermerkt.
    for (const attachment of item.attachments ?? []) {
      const datei = { name: attachment.filename, type: attachment.mimeType, arrayBuffer: attachment.content }
      try {
        pruefeKimAnhang(datei)
      } catch (err) {
        await writeKimAuditLog(supabase, {
          organizationId,
          aktion: 'anhang_abgewiesen',
          messageId: message.id,
          details: {
            filename: attachment.filename,
            mime_type: attachment.mimeType,
            grund: err instanceof Error ? err.message : 'unbekannt',
          },
        })
        continue
      }
      await uploadKimAttachment(supabase, {
        organizationId,
        messageId: message.id,
        datei,
      })
    }

    await writeKimAuditLog(supabase, {
      organizationId,
      aktion: 'empfangen',
      messageId: message.id,
      details: { from: item.fromAddress, provider_message_id: item.providerMessageId },
    })

    messages.push(message)
  }

  return { inserted: messages.length, duplicates, messages }
}
