/**
 * WhatsApp Bot — Meta Cloud API Send-Funktion.
 *
 * Sendet Text-Nachricht via WhatsApp Cloud API (Graph API v22.0).
 * Doku: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

import {
  protokolliereZustellung,
  type ZustellKontext,
} from '@/lib/notifications/delivery-log'


export async function sendWhatsAppMessage(params: {
  to: string // Empfänger-Telefon im E.164 Format (z.B. "491701234567")
  body: string // Text-Nachricht (max 4096 Zeichen)
  /**
   * Optionaler Zustellkontext. Ist er gesetzt, landet jeder Versuch in
   * notification_delivery_log (Kanal 'whatsapp', Provider
   * 'whatsapp_api'). Ohne ihn verhaelt sich die Funktion wie bisher.
   */
  zustellung?: ZustellKontext
}): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  // Best effort — die Zustellspur darf den Versand nie aufhalten.
  const spur = async (
    status: 'sent' | 'failed' | 'skipped',
    zusatz: { wamid?: string; fehler?: unknown } = {}
  ): Promise<void> => {
    if (!params.zustellung) return
    await protokolliereZustellung({
      ...params.zustellung,
      channel: 'whatsapp',
      recipient: params.to,
      status,
      provider: 'whatsapp_api',
      providerMessageId: zusatz.wamid ?? null,
      fehler: zusatz.fehler,
    })
  }

  if (!accessToken || !phoneNumberId) {
    await spur('skipped', { fehler: 'WhatsApp-Zugangsdaten nicht konfiguriert' })
    return { ok: false, error: 'WhatsApp credentials missing in env' }
  }

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        type: 'text',
        text: {
          preview_url: false,
          body: params.body.substring(0, 4096),
        },
      }),
    })

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>
      error?: { message?: string }
    }

    if (!response.ok) {
      const fehler = data.error?.message || `HTTP ${response.status}`
      await spur('failed', { fehler })
      return { ok: false, error: fehler }
    }
    const wamid = data.messages?.[0]?.id
    await spur('sent', { wamid })
    return { ok: true, wamid }
  } catch (err) {
    await spur('failed', { fehler: err })
    return { ok: false, error: String(err) }
  }
}
