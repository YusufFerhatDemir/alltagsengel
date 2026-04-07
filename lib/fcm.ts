import { createAdminClient } from '@/lib/supabase/admin'

// ─── FCM Config ───
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || ''

export interface FCMPayload {
  title: string
  body: string
  icon?: string
  tag?: string
  url?: string
  data?: Record<string, string>
}

// ─── Send FCM to a Single Token ───
async function sendToToken(
  token: string,
  payload: FCMPayload
): Promise<boolean> {
  if (!FCM_SERVER_KEY) return false

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || '/icon-192x192.png',
          tag: payload.tag || 'default',
          click_action: payload.url
            ? `https://alltagsengel.care${payload.url}`
            : 'https://alltagsengel.care',
          sound: 'default',
        },
        data: {
          title: payload.title,
          body: payload.body,
          url: payload.url || '/',
          tag: payload.tag || 'default',
          ...(payload.data || {}),
        },
        priority: 'high',
        content_available: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('FCM send error:', response.status, text)
      return false
    }

    const result = await response.json()

    // Check for invalid/unregistered tokens
    if (result.failure > 0 && result.results) {
      for (const res of result.results) {
        if (
          res.error === 'NotRegistered' ||
          res.error === 'InvalidRegistration'
        ) {
          // Remove invalid token
          const supabase = createAdminClient()
          await supabase.from('fcm_tokens').delete().eq('token', token)
          console.log(`FCM token removed (${res.error}):`, token.slice(0, 20) + '...')
          return false
        }
      }
    }

    return result.success > 0
  } catch (err) {
    console.error('FCM send error:', err)
    return false
  }
}

// ─── Send FCM to All Tokens of a User ───
export async function sendFCMToUser(
  userId: string,
  payload: FCMPayload
): Promise<{ sent: number; failed: number }> {
  if (!FCM_SERVER_KEY) {
    console.log('FCM_SERVER_KEY not configured — FCM push skipped')
    return { sent: 0, failed: 0 }
  }

  const supabase = createAdminClient()

  const { data: tokens, error } = await supabase
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', userId)

  if (error || !tokens?.length) {
    if (error) console.error('FCM: Error fetching tokens:', error.message)
    return { sent: 0, failed: 0 }
  }

  const results = await Promise.allSettled(
    tokens.map((t) => sendToToken(t.token, payload))
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length
  const failed = results.length - sent

  console.log(`FCM sent to user ${userId}: ${sent}/${results.length} successful`)
  return { sent, failed }
}
