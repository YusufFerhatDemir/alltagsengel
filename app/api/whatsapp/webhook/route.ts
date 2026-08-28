/**
 * WhatsApp Bot — Webhook Endpoint.
 *
 * Empfängt eingehende Nachrichten von Meta Cloud API:
 *   GET  → Verifikation (Meta ruft beim Setup mit hub.challenge auf)
 *   POST → eingehende Nachricht oder Status-Update
 *
 * Setup in Meta Business Suite:
 *   Webhook-URL: https://alltagsengel.care/api/whatsapp/webhook
 *   Verify Token: process.env.WHATSAPP_VERIFY_TOKEN (random string, frei wählbar)
 *
 * Sicherheit:
 *   - Verifiziert Meta-Signatur (App-Secret)
 *   - Rate-Limit pro Telefon-Nummer
 *   - Logged jede Konversation
 *   - Eskaliert kritische Themen automatisch an info@alltagsengel.care
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBotReply, WaMessage } from '@/lib/whatsapp/ai'
import {
  shouldEscalate,
  escalationReplyFor,
  sendEscalationEmail,
  sendDraftNotificationEmail,
} from '@/lib/whatsapp/escalation'
import { isRateLimited, RATE_LIMIT_REPLY } from '@/lib/whatsapp/rate-limit'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { vorgangsId } from '@/lib/notifications/delivery-log'
import { isLowConfidenceReply, sanitizeNames, HOLDING_REPLY } from '@/lib/whatsapp/confidence'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
const log = logger.child('wa-webhook')

/**
 * Meta-Signaturprüfung (x-hub-signature-256).
 *
 * Meta signiert JEDEN Webhook-POST mit HMAC-SHA256 über den ROHEN Request-Body,
 * Schlüssel = App-Secret. Header-Format: "sha256=<hex>".
 * Ohne diese Prüfung könnte jeder gefälschte Nachrichten an den Bot schicken
 * (Spoofing → Bot antwortet / eskaliert / verschickt Mails).
 * Doku: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating-payloads
 *
 * WICHTIG: Über den ROH-Body verifizieren, NICHT über neu-serialisiertes JSON
 * (Whitespace/Key-Reihenfolge würden die Signatur brechen).
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    // FAIL-CLOSED: Ohne App-Secret kann die Meta-Signatur nicht verifiziert
    // werden. Früher wurde hier `true` zurückgegeben (FAIL-OPEN) — das erlaubte
    // JEDEM, gefälschte Webhook-Payloads einzuschleusen (Bot antwortet, eskaliert,
    // verschickt Mails, schreibt in die DB). Jetzt: ablehnen, bis das Secret gesetzt ist.
     
    log.error('WHATSAPP_APP_SECRET fehlt — Webhook FAIL-CLOSED, Request abgelehnt. App-Secret in den Env-Vars setzen!')
    return false
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const received = Buffer.from(signatureHeader)
  const computed = Buffer.from(expected)
  // Längen-Check vor timingSafeEqual (wirft sonst bei ungleicher Länge)
  if (received.length !== computed.length) return false
  return timingSafeEqual(received, computed)
}

// Service-Role-Client (bypasst RLS, weil Webhook anonym aufgerufen wird)
function getServiceClient() {
  return createAdminClient()
}

/**
 * GET — Webhook Verifikation durch Meta beim Setup.
 * Meta ruft auf mit ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * Wir müssen das challenge zurückgeben wenn der Token stimmt.
 */
export const GET = withTracking(async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token && token === expectedToken && challenge) {
     
    log.info('verification successful')
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Verification failed', { status: 403 })
})

/**
 * POST — eingehende Nachricht oder Status-Update.
 *
 * Meta-Payload-Struktur (vereinfacht):
 * {
 *   entry: [{
 *     changes: [{
 *       value: {
 *         messages: [{ from, id, timestamp, text: { body }, type }]
 *       }
 *     }]
 *   }]
 * }
 */
export const POST = withTracking(async function POST(req: NextRequest) {
  // ROH-Body zuerst lesen — für die Signaturprüfung zwingend nötig.
  const rawBody = await req.text()

  // ═══ Meta-Signatur verifizieren (x-hub-signature-256) ═══
  const signature = req.headers.get('x-hub-signature-256')
  if (!verifyMetaSignature(rawBody, signature)) {
     
    log.warn('Ungültige/fehlende Meta-Signatur — Request abgelehnt')
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  // Meta sendet 2 Arten von Events: Nachrichten + Status-Updates (sent/delivered/read).
  // Wir verarbeiten nur Nachrichten.
  const messages = extractMessages(body)
  if (messages.length === 0) {
    // Status-Update oder leerer Webhook → einfach 200 zurück (sonst retry-storm)
    return NextResponse.json({ ok: true, skipped: 'no_message' })
  }

  const supabase = getServiceClient()

  for (const msg of messages) {
    await processIncomingMessage(supabase, msg, body)
  }

  return NextResponse.json({ ok: true })
})

type IncomingMessage = {
  from: string
  id: string
  body: string
  timestamp: number
}

function extractMessages(payload: unknown): IncomingMessage[] {
  const result: IncomingMessage[] = []
  try {
    const entries = (payload as { entry?: Array<unknown> }).entry || []
    for (const entry of entries) {
      const changes = (entry as { changes?: Array<unknown> }).changes || []
      for (const change of changes) {
        const value = (change as { value?: { messages?: Array<unknown> } }).value
        const msgs = value?.messages || []
        for (const m of msgs) {
          const mm = m as {
            from?: string
            id?: string
            timestamp?: string
            type?: string
            text?: { body?: string }
          }
          if (mm.type === 'text' && mm.from && mm.id && mm.text?.body) {
            result.push({
              from: mm.from,
              id: mm.id,
              body: mm.text.body,
              timestamp: parseInt(mm.timestamp || '0', 10),
            })
          }
        }
      }
    }
  } catch (err) {
     
    log.warnWithException('extract error', err)
  }
  return result
}

async function processIncomingMessage(
  supabase: ReturnType<typeof getServiceClient>,
  msg: IncomingMessage,
  rawPayload: unknown
): Promise<void> {
  // 1. Idempotenz-Check: schon mal verarbeitet?
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('wa_msg_id', msg.id)
    .maybeSingle()
  if (existing) {
     
    log.info('duplicate msg, skip', { id: msg.id })
    return
  }

  // 2. Inbound speichern
  await supabase.from('whatsapp_conversations').insert({
    // Die Stamm-Organisation steht hier AUSDRUECKLICH, statt sich auf den
    // Spalten-Default current_org_id() zu verlassen: dieser Weg laeuft mit
    // dem Dienstschluessel ohne auth.uid(), der Default faellt dann auf
    // genau diesen Wert zurueck — aber als fail-open-Rueckfall, nicht als
    // Aussage. Hier ist er eine Aussage: die WhatsApp-Nummer gehoert der
    // Stamm-Organisation, es gibt keinen anderen Mandanten dahinter.
    organization_id: DEFAULT_ORG_ID,
    wa_phone: msg.from,
    wa_msg_id: msg.id,
    direction: 'inbound',
    body: msg.body,
    raw: rawPayload as object,
  })

  // 3. Rate-Limit prüfen
  const rl = await isRateLimited(supabase, msg.from)
  if (rl.limited) {
    await replyAndLog(supabase, msg.from, RATE_LIMIT_REPLY, 'rate-limit', true, undefined, msg.id)
    return
  }

  // 4. Eskalation prüfen
  //    - 'medical': Bot sendet Notruf-Hinweis (116 117 / 112 / Hausarzt)
  //    - 'general': Bot sendet Holding-Message ("Team meldet sich")
  //    Beide Fälle: Mail an info@alltagsengel.care mit voller Konversation.
  const esc = shouldEscalate(msg.body)
  if (esc.escalate) {
    const { data: history } = await supabase
      .from('whatsapp_conversations')
      .select('direction, body, created_at')
      .eq('wa_phone', msg.from)
      .order('created_at', { ascending: true })
      .limit(50)
    await sendEscalationEmail({
      fromPhone: msg.from,
      reason: esc.reason || 'unknown',
      kind: esc.kind,
      conversation: (history || []) as Array<{
        direction: 'inbound' | 'outbound'
        body: string
        created_at: string
      }>,
    })
    const reply = escalationReplyFor(esc.kind)
    const tag = esc.kind === 'medical' ? 'escalation-medical' : 'escalation'
    await replyAndLog(supabase, msg.from, reply, tag, false, esc.reason, msg.id)
    return
  }

  // 5. Konversations-Historie für KI laden (letzte 10 Nachrichten)
  const { data: history } = await supabase
    .from('whatsapp_conversations')
    .select('direction, body')
    .eq('wa_phone', msg.from)
    .order('created_at', { ascending: true })
    .limit(20)
  const waMessages: WaMessage[] = (history || []).map((h) => ({
    role: h.direction === 'inbound' ? 'user' : 'assistant',
    content: h.body,
  }))

  // 6. KI-Antwort generieren
  const { reply: rawReply, model } = await getBotReply(waMessages)

  // 6a. Name-Sanitizer: KI darf NIE einen persönlichen Namen einbauen.
  // Falls doch (Halluzination) → ersetze defensiv durch "das Alltagsengel-Team".
  const sanitized = sanitizeNames(rawReply)
  if (sanitized.didReplace) {
     
    log.warn('persona drift: KI hat Namen verwendet, sanitisiert', { ersetzteNamen: sanitized.replaced.join(', ') })
  }
  const cleanReply = sanitized.sanitized

  // 6b. Confidence-Check: signalisiert die KI Unsicherheit?
  // Wenn ja → NICHT senden, sondern Draft speichern + Holding-Message senden + Team benachrichtigen.
  const confidence = isLowConfidenceReply(cleanReply)
  if (confidence.lowConfidence) {
    // Konversations-Historie für Draft-Mail
    const { data: fullHistory } = await supabase
      .from('whatsapp_conversations')
      .select('direction, body, created_at')
      .eq('wa_phone', msg.from)
      .order('created_at', { ascending: true })
      .limit(50)

    // Draft als outbound mit escalation_reason='draft_pending' speichern.
    // body = Holding-Message (was Kunde sieht).
    // raw.bot_draft = Bot-Entwurf (für späteren Admin-Review).
    const send = await sendWhatsAppMessage({
      to: msg.from,
      body: HOLDING_REPLY,
      zustellung: {
        organizationId: WHATSAPP_ORG_ID,
        correlationId: vorgangsId('whatsapp-holding', msg.from, msg.id),
      },
    })
    await supabase.from('whatsapp_conversations').insert({
      organization_id: DEFAULT_ORG_ID,
      wa_phone: msg.from,
      wa_msg_id: send.wamid || null,
      direction: 'outbound',
      body: HOLDING_REPLY,
      raw: {
        sent_ok: send.ok,
        send_error: send.error || null,
        bot_draft: cleanReply,
        bot_draft_model: model,
        confidence_marker: confidence.marker || null,
      },
      ai_model: 'draft-pending',
      escalated: true,
      escalation_reason: `draft_pending:${confidence.marker || 'low_confidence'}`,
      rate_limited: false,
    })

    await sendDraftNotificationEmail({
      fromPhone: msg.from,
      customerMessage: msg.body,
      botDraft: cleanReply,
      conversation: (fullHistory || []) as Array<{
        direction: 'inbound' | 'outbound'
        body: string
        created_at: string
      }>,
    })
    return
  }

  // 7. Antwort senden + loggen
  await replyAndLog(supabase, msg.from, cleanReply, model, false, undefined, msg.id)
}

/**
 * Mandant fuer die Zustellspur.
 *
 * Der Webhook hat keine Sitzung — er wird von Meta aufgerufen. Eine
 * Zuordnung ueber current_org_id() gibt es hier also nicht. Die Zuordnung
 * ist trotzdem eindeutig: es gibt genau EINE WhatsApp-Rufnummer
 * (WHATSAPP_PHONE_NUMBER_ID) und die gehoert der Stamm-Organisation.
 * Kommt je eine zweite Nummer dazu, muss hier ueber die Nummer aufgeloest
 * werden statt ueber diese Konstante.
 */
const WHATSAPP_ORG_ID = DEFAULT_ORG_ID

async function replyAndLog(
  supabase: ReturnType<typeof getServiceClient>,
  to: string,
  body: string,
  modelOrReason: string,
  rateLimited: boolean,
  escalationReason?: string,
  /** Eingehende Meta-Nachrichten-ID — Vorgangsbezug der Zustellspur. */
  eingangsId?: string
): Promise<void> {
  const send = await sendWhatsAppMessage({
    to,
    body,
    zustellung: {
      organizationId: WHATSAPP_ORG_ID,
      correlationId: vorgangsId('whatsapp-antwort', to, eingangsId ?? modelOrReason),
    },
  })
  await supabase.from('whatsapp_conversations').insert({
    organization_id: DEFAULT_ORG_ID,
    wa_phone: to,
    wa_msg_id: send.wamid || null,
    direction: 'outbound',
    body,
    raw: { sent_ok: send.ok, send_error: send.error || null },
    ai_model: modelOrReason,
    escalated: !!escalationReason,
    escalation_reason: escalationReason || null,
    rate_limited: rateLimited,
  })
}
