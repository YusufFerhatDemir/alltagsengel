import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import {
  protokolliereZustellung,
  type ZustellKontext,
} from '@/lib/notifications/delivery-log'
const log = logger.child('push')

// ─── VAPID Config ───
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = 'mailto:info@alltagsengel.care'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

// ─── Types ───
export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  actions?: Array<{ action: string; title: string }>
}

// ─── Send Push to a Single Subscription ───
async function sendToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    }

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icon-192x192.png',
        badge: payload.badge || '/icon-192x192.png',
        tag: payload.tag || 'default',
        url: payload.url || '/',
        actions: payload.actions || [],
      }),
      { TTL: 60 * 60 } // 1 hour TTL
    )
    return true
  } catch (err: any) {
    // 410 Gone or 404 = subscription expired, remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      log.info(`Push subscription expired (${err.statusCode}), removing:`, { endpoint: subscription.endpoint })
      const supabase = createAdminClient()
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', subscription.endpoint)
    } else {
      log.error('Push send error', { statusCode: err.statusCode, body: err.body })
    }
    return false
  }
}

// ─── Send Push to All Subscriptions of a User ───
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  zustellung?: ZustellKontext
): Promise<{ sent: number; failed: number }> {
  // Best effort — die Zustellspur darf den Push nie aufhalten.
  const spur = async (
    status: 'sent' | 'failed' | 'skipped',
    fehler?: unknown
  ): Promise<void> => {
    if (!zustellung) return
    await protokolliereZustellung({
      ...zustellung,
      channel: 'push',
      recipient: userId,
      status,
      provider: 'web_push',
      fehler,
    })
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    log.info('VAPID keys not configured — push skipped')
    await spur('skipped', 'VAPID-Schluessel nicht konfiguriert')
    return { sent: 0, failed: 0 }
  }

  const supabase = createAdminClient()

  // Get all subscriptions for this user
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    log.error('Push: Error fetching subscriptions', { errorMessage: error.message })
    await spur('failed', error.message)
    return { sent: 0, failed: 0 }
  }

  if (!subscriptions?.length) {
    // Kein Geraet registriert ist kein Fehler, aber auch keine Zustellung.
    await spur('skipped', 'Keine Push-Registrierung fuer diesen Nutzer')
    return { sent: 0, failed: 0 }
  }

  // Send to all devices in parallel
  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendToSubscription(sub, payload))
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length
  const failed = results.length - sent

  log.info(`Push sent to user ${userId}: ${sent}/${results.length} successful`)
  // Ein einziges erreichtes Geraet zaehlt als zugestellt — der Nutzer hat
  // die Nachricht gesehen. Erst wenn ALLE Registrierungen scheitern, ist
  // der Kanal fuer diesen Vorgang fehlgeschlagen.
  await spur(
    sent > 0 ? 'sent' : 'failed',
    sent > 0 ? undefined : `Alle ${results.length} Push-Registrierungen fehlgeschlagen`
  )
  return { sent, failed }
}
