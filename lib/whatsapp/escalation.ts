/**
 * WhatsApp Bot — Eskalations-Detektion.
 *
 * Wenn Kunde Wörter wie "Anwalt", "kündigen", "Beschwerde" nutzt:
 * → Bot antwortet ESKALATIONS-Nachricht ("Yusuf meldet sich")
 * → Mail an info@alltagsengel.care mit voller Konversation
 */

import { ESCALATION_KEYWORDS } from './system-prompt'

export function shouldEscalate(messageBody: string): { escalate: boolean; reason?: string } {
  const lower = messageBody.toLowerCase()
  for (const keyword of ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { escalate: true, reason: `keyword:${keyword}` }
    }
  }
  return { escalate: false }
}

export const ESCALATION_REPLY = `Vielen Dank — das gebe ich direkt an Yusuf weiter. Er meldet sich heute persönlich bei Ihnen. Für dringende Anliegen erreichen Sie ihn auch unter info@alltagsengel.care. 🙏`

/**
 * Sendet Eskalations-Mail an info@alltagsengel.care via Resend.
 */
export async function sendEscalationEmail(params: {
  fromPhone: string
  reason: string
  conversation: Array<{ direction: 'inbound' | 'outbound'; body: string; created_at: string }>
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot escalation] RESEND_API_KEY missing — no escalation mail sent')
    return false
  }

  const subject = `[WhatsApp-Bot] Eskalation von ${params.fromPhone} — ${params.reason}`
  const bodyLines = [
    `Eskalations-Grund: ${params.reason}`,
    `WhatsApp-Nummer: ${params.fromPhone}`,
    '',
    'Konversation (chronologisch):',
    '─────────────────────────────',
    ...params.conversation.map(
      (m) =>
        `[${new Date(m.created_at).toLocaleString('de-DE')}] ${m.direction === 'inbound' ? 'KUNDE' : 'BOT  '}: ${m.body}`
    ),
    '─────────────────────────────',
    '',
    'Bitte zeitnah persönlich antworten.',
    '— AlltagsEngel WhatsApp-Bot',
  ]

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AlltagsEngel Bot <bot@alltagsengel.care>',
        to: ['info@alltagsengel.care', 'y.cilcioglu@googlemail.com'],
        subject,
        text: bodyLines.join('\n'),
      }),
    })
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[wa-bot escalation] Resend failed:', response.status, await response.text())
      return false
    }
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot escalation] Resend error:', err)
    return false
  }
}
