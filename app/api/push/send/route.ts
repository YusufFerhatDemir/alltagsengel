import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser, type PushPayload } from '@/lib/push'

/**
 * POST /api/push/send
 * Internal endpoint to send push notifications to a user.
 * Requires service role key or internal auth.
 */
export async function POST(request: Request) {
  try {
    // Verify internal call via service role key header
    const authHeader = request.headers.get('x-service-key')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || authHeader !== serviceKey) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const { userId, payload } = (await request.json()) as {
      userId: string
      payload: PushPayload
    }

    if (!userId || !payload?.title) {
      return NextResponse.json({ error: 'userId und payload.title erforderlich' }, { status: 400 })
    }

    const result = await sendPushToUser(userId, payload)

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
    })
  } catch (err) {
    console.error('Push send API error:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
