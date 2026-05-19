/**
 * WhatsApp Bot — Eskalations-Detektion.
 *
 * Zwei Eskalations-Typen:
 *   - MEDICAL: Kunde fragt nach Symptomen, Diagnose, Medikamenten, Notfall etc.
 *       → MEDICAL_ESCALATION_REPLY (mit 116 117 / 112 / Hausarzt-Hinweis)
 *   - GENERAL: juristisch, Wut, B2B, Engel-Vermittlung etc.
 *       → ESCALATION_REPLY ("Team meldet sich")
 *
 * Beide Typen: Mail an info@alltagsengel.care mit voller Konversation.
 *
 * WICHTIG: nirgendwo ein Personenname. Immer "das Alltagsengel-Team".
 */

import { ESCALATION_KEYWORDS, MEDICAL_KEYWORDS } from './system-prompt'

export type EscalationKind = 'medical' | 'general'

export function shouldEscalate(
  messageBody: string
): { escalate: boolean; kind?: EscalationKind; reason?: string } {
  const lower = messageBody.toLowerCase()

  // 1) Medizinisch zuerst — höchste Priorität, eigene Antwort
  for (const keyword of MEDICAL_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { escalate: true, kind: 'medical', reason: `medical:${keyword}` }
    }
  }

  // 2) Allgemeine Eskalation
  for (const keyword of ESCALATION_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { escalate: true, kind: 'general', reason: `keyword:${keyword}` }
    }
  }

  return { escalate: false }
}

/**
 * Antwort an den Kunden bei medizinischen Anfragen.
 * Wortlaut vom Team festgelegt — NICHT ohne Rückfrage ändern.
 */
export const MEDICAL_ESCALATION_REPLY = `Wir sind kein medizinischer Anbieter — bitte wende dich an deinen Hausarzt, die 116 117 (ärztlicher Bereitschaftsdienst) oder im Notfall die 112. Falls es um eine Pflege-Box oder Krankenfahrt geht, helfen wir gern weiter.`

/**
 * Antwort an den Kunden bei allgemeinen Eskalationen (Beschwerden, Recht, B2B, Engel-Vermittlung etc.)
 */
export const ESCALATION_REPLY = `Vielen Dank für Ihre Nachricht. Das Alltagsengel-Team meldet sich in Kürze persönlich bei Ihnen. Für dringende Anliegen erreichen Sie uns auch unter info@alltagsengel.care. 🙏`

/**
 * Wählt die passende Reply je nach Eskalations-Typ.
 */
export function escalationReplyFor(kind: EscalationKind | undefined): string {
  return kind === 'medical' ? MEDICAL_ESCALATION_REPLY : ESCALATION_REPLY
}

/**
 * Sendet Eskalations-Mail an info@alltagsengel.care via Resend.
 */
export async function sendEscalationEmail(params: {
  fromPhone: string
  reason: string
  kind?: EscalationKind
  conversation: Array<{ direction: 'inbound' | 'outbound'; body: string; created_at: string }>
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot escalation] RESEND_API_KEY missing — no escalation mail sent')
    return false
  }

  const kindLabel = params.kind === 'medical' ? 'MEDIZINISCH' : 'allgemein'
  const subject = `[WhatsApp-Bot] Eskalation (${kindLabel}) von ${params.fromPhone} — ${params.reason}`
  const bodyLines = [
    `Eskalations-Typ: ${kindLabel}`,
    `Eskalations-Grund: ${params.reason}`,
    `WhatsApp-Nummer: ${params.fromPhone}`,
    '',
    params.kind === 'medical'
      ? 'ACHTUNG: medizinische Anfrage. Bot hat Notruf-Hinweis (116 117 / 112) gesendet. Bitte zeitnah persönlich nachfassen — und prüfen, ob es einen versteckten Pflege-Box-/Krankenfahrt-Bedarf gibt.'
      : 'Bitte zeitnah persönlich antworten.',
    '',
    'Konversation (chronologisch):',
    '─────────────────────────────',
    ...params.conversation.map(
      (m) =>
        `[${new Date(m.created_at).toLocaleString('de-DE')}] ${m.direction === 'inbound' ? 'KUNDE' : 'BOT  '}: ${m.body}`
    ),
    '─────────────────────────────',
    '',
    '— Alltagsengel WhatsApp-Bot',
  ]

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alltagsengel Bot <bot@alltagsengel.care>',
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

/**
 * Sendet eine Draft-Notification an info@alltagsengel.care:
 * "Bot war unsicher, hier sein Entwurf — bitte freigeben oder umschreiben."
 */
export async function sendDraftNotificationEmail(params: {
  fromPhone: string
  customerMessage: string
  botDraft: string
  conversation: Array<{ direction: 'inbound' | 'outbound'; body: string; created_at: string }>
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot draft] RESEND_API_KEY missing — no draft mail sent')
    return false
  }

  const subject = `[WhatsApp-Bot] Entwurf zur Freigabe — ${params.fromPhone}`
  const bodyLines = [
    `Der Bot war sich unsicher und hat NICHT an den Kunden geantwortet.`,
    `Dem Kunden wurde eine Holding-Message gesendet ("Team meldet sich").`,
    '',
    `WhatsApp-Nummer: ${params.fromPhone}`,
    `Letzte Kunden-Nachricht: ${params.customerMessage}`,
    '',
    'Bot-Entwurf (NICHT gesendet):',
    '─────────────────────────────',
    params.botDraft,
    '─────────────────────────────',
    '',
    'Konversation (chronologisch):',
    '─────────────────────────────',
    ...params.conversation.map(
      (m) =>
        `[${new Date(m.created_at).toLocaleString('de-DE')}] ${m.direction === 'inbound' ? 'KUNDE' : 'BOT  '}: ${m.body}`
    ),
    '─────────────────────────────',
    '',
    'Bitte Entwurf prüfen, anpassen oder eigene Antwort senden.',
    '— Alltagsengel WhatsApp-Bot',
  ]

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alltagsengel Bot <bot@alltagsengel.care>',
        to: ['info@alltagsengel.care', 'y.cilcioglu@googlemail.com'],
        subject,
        text: bodyLines.join('\n'),
      }),
    })
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn('[wa-bot draft] Resend failed:', response.status, await response.text())
      return false
    }
    return true
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[wa-bot draft] Resend error:', err)
    return false
  }
}
