import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser, type PushPayload } from '@/lib/push'

/**
 * POST /api/push/send
 * Internal endpoint to send push notifications to a user.
 * Requires service role key or internal auth.
 */
export async function POST(request: Request) {
  try {
    // Verify internal call via service role key header.
    // Waehrend der Supabase-Key-Migration zaehlt sowohl der neue Secret-Key
    // (`sb_secret_…`) als auch der Legacy-`service_role`-Key. Leere/nicht
    // gesetzte Werte gelten nie als Treffer (fail-closed).
    const authHeader = request.headers.get('x-service-key')
    const erlaubteKeys = [
      process.env.SUPABASE_SECRET_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ].filter((k): k is string => Boolean(k))

    if (!authHeader || !erlaubteKeys.includes(authHeader)) {
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
    return safeApiError(err, request)
  }
}
