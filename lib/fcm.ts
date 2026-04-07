import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleAuth } from 'google-auth-library'

// ─── FCM V1 API Config ───
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID || 'alltagsengel-2bbe9'

// Service Account credentials from environment
function getServiceAccountCredentials() {
  const clientEmail = process.env.FCM_CLIENT_EMAIL
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) return null

  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: FCM_PROJECT_ID,
  }
}

// ─── Get OAuth2 Access Token ───
let cachedAuth: GoogleAuth | null = null

async function getAccessToken(): Promise<string | null> {
  const credentials = getServiceAccountCredentials()
  if (!credentials) return null

  try {
    if (!cachedAuth) {
      cachedAuth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      })
    }

    const client = await cachedAuth.getClient()
    const tokenResponse = await client.getAccessToken()
    return tokenResponse?.token || null
  } catch (err) {
    console.error('FCM: Error getting access token:', err)
    // Reset cache on error
    cachedAuth = null
    return null
  }
}

export interface FCMPayload {
  title: string
  body: string
  icon?: string
  tag?: string
  url?: string
  data?: Record<string, string>
}

// ─── Send FCM V1 to a Single Token ───
async function sendToToken(
  token: string,
  payload: FCMPayload,
  accessToken: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            android: {
              priority: 'HIGH',
              notification: {
                icon: payload.icon || 'ic_notification',
                tag: payload.tag || 'default',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default',
                channel_id: 'alltagsengel_default',
              },
            },
            webpush: {
              notification: {
                icon: payload.icon || '/icon-192x192.png',
                tag: payload.tag || 'default',
              },
              fcm_options: {
                link: payload.url
                  ? `https://alltagsengel.care${payload.url}`
                  : 'https://alltagsengel.care',
              },
            },
            data: {
              title: payload.title,
              body: payload.body,
              url: payload.url || '/',
              tag: payload.tag || 'default',
              ...(payload.data || {}),
            },
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('FCM V1 send error:', response.status, errorBody)

      // Check for unregistered/invalid token errors
      if (
        response.status === 404 ||
        errorBody.includes('UNREGISTERED') ||
        errorBody.includes('INVALID_ARGUMENT')
      ) {
        // Remove invalid token
        const supabase = createAdminClient()
        await supabase.from('fcm_tokens').delete().eq('token', token)
        console.log('FCM token removed (invalid):', token.slice(0, 20) + '...')
      }

      return false
    }

    return true
  } catch (err) {
    console.error('FCM V1 send error:', err)
    return false
  }
}

// ─── Send FCM to All Tokens of a User ───
export async function sendFCMToUser(
  userId: string,
  payload: FCMPayload
): Promise<{ sent: number; failed: number }> {
  const accessToken = await getAccessToken()
  if (!accessToken) {
    console.log('FCM: No access token available — FCM push skipped')
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
    tokens.map((t) => sendToToken(t.token, payload, accessToken))
  )

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length
  const failed = results.length - sent

  console.log(`FCM V1 sent to user ${userId}: ${sent}/${results.length} successful`)
  return { sent, failed }
}
