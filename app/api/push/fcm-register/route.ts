import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/push/fcm-register
 * Saves an FCM token for the authenticated user (native app).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    const { token, platform } = await request.json()
    if (!token) {
      return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
    }

    // Upsert FCM token
    const { error } = await supabase.from('fcm_tokens').upsert({
      user_id: user.id,
      token,
      platform: platform || 'android',
      device_info: request.headers.get('user-agent') || '',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,token',
    })

    if (error) {
      console.error('FCM register error:', error)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('FCM register error:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}

/**
 * DELETE /api/push/fcm-register
 * Removes an FCM token.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    const { token } = await request.json()
    if (!token) {
      return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
    }

    await supabase.from('fcm_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('token', token)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('FCM unregister error:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
