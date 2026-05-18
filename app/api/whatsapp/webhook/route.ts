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
import { createClient } from '@supabase/supabase-js'
import { getBotReply, WaMessage } from '@/lib/whatsapp/ai'
import { shouldEscalate, ESCALATION_REPLY, sendEscalationEmail } from '@/lib/whatsapp/escalation'
import { isRateLimited, RATE_LIMIT_REPLY } from '@/lib/whatsapp/rate-limit'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

// Service-Role-Client (bypasst RLS, weil Webhook anonym aufgerufen wird)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service-role env missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * GET — Webhook Verifikation durch Meta beim Setup.
 * Meta ruft auf mit ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * Wir müssen das challenge zurückgeben wenn der Token stimmt.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token && token === expectedToken && challenge) {
    // eslint-disable-next-line no-console
    console.log('[wa-webhook] verification successful')
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Verification failed', { status: 403 })
}

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
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
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
}

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
    // eslint-disable-next-line no-console
    console.warn('[wa-webhook] extract error:', err)
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
    // eslint-disable-next-line no-console
    console.log('[wa-webhook] duplicate msg, skip:', msg.id)
    return
  }

  // 2. Inbound speichern
  await supabase.from('whatsapp_conversations').insert({
    wa_phone: msg.from,
    wa_msg_id: msg.id,
    direction: 'inbound',
    body: msg.body,
    raw: rawPayload as object,
  })

  // 3. Rate-Limit prüfen
  const rl = await isRateLimited(supabase, msg.from)
  if (rl.limited) {
    await replyAndLog(supabase, msg.from, RATE_LIMIT_REPLY, 'rate-limit', true)
    return
  }

  // 4. Eskalation prüfen (Beschwerde, Anwalt, Kündigung)
  const esc = shouldEscalate(msg.body)
  if (esc.escalate) {
    // Konversations-Historie holen für Eskalations-Mail
    const { data: history } = await supabase
      .from('whatsapp_conversations')
      .select('direction, body, created_at')
      .eq('wa_phone', msg.from)
      .order('created_at', { ascending: true })
      .limit(50)
    await sendEscalationEmail({
      fromPhone: msg.from,
      reason: esc.reason || 'unknown',
      conversation: (history || []) as Array<{
        direction: 'inbound' | 'outbound'
        body: string
        created_at: string
      }>,
    })
    await replyAndLog(supabase, msg.from, ESCALATION_REPLY, 'escalation', false, esc.reason)
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
  const { reply, model } = await getBotReply(waMessages)

  // 7. Antwort senden + loggen
  await replyAndLog(supabase, msg.from, reply, model, false)
}

async function replyAndLog(
  supabase: ReturnType<typeof getServiceClient>,
  to: string,
  body: string,
  modelOrReason: string,
  rateLimited: boolean,
  escalationReason?: string
): Promise<void> {
  const send = await sendWhatsAppMessage({ to, body })
  await supabase.from('whatsapp_conversations').insert({
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
