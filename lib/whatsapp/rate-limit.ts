/**
 * WhatsApp Bot — Rate-Limiter (Spam-Schutz).
 *
 * Max. 20 Nachrichten pro Telefon-Nummer pro Stunde.
 * Liest aus whatsapp_conversations Tabelle (kein In-Memory-State, weil Vercel-Serverless).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_INBOUND_PER_HOUR = 20

export async function isRateLimited(
  supabase: SupabaseClient,
  phone: string
): Promise<{ limited: boolean; count: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('wa_phone', phone)
    .eq('direction', 'inbound')
    .gte('created_at', oneHourAgo)

  if (error) {
    // Bei Fehler: durchlassen (lieber falsch positiv als Service-Blockade)
    // eslint-disable-next-line no-console
    console.warn('[wa-bot rate-limit] supabase error:', error.message)
    return { limited: false, count: 0 }
  }

  const c = count ?? 0
  return { limited: c > MAX_INBOUND_PER_HOUR, count: c }
}

export const RATE_LIMIT_REPLY = `Vielen Dank für Ihre Nachrichten. Aus Sicherheitsgründen pausieren wir kurz die Antworten. Yusuf meldet sich bei dringenden Anliegen unter info@alltagsengel.care. 🙏`
