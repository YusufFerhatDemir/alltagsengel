/**
 * WhatsApp Bot — Meta Cloud API Send-Funktion.
 *
 * Sendet Text-Nachricht via WhatsApp Cloud API (Graph API v22.0).
 * Doku: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */

export async function sendWhatsAppMessage(params: {
  to: string // Empfänger-Telefon im E.164 Format (z.B. "491701234567")
  body: string // Text-Nachricht (max 4096 Zeichen)
}): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
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
      return {
        ok: false,
        error: data.error?.message || `HTTP ${response.status}`,
      }
    }
    return { ok: true, wamid: data.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
