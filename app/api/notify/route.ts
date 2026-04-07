import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmailNotification } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, type, title, bodyText, data } = body

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    // Sicherheit: Nur Admins dürfen Benachrichtigungen an andere User senden
    // Normale User dürfen nur an sich selbst senden
    if (userId !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Keine Berechtigung, Benachrichtigungen an andere User zu senden' }, { status: 403 })
      }
    }

    // Benachrichtigung in DB speichern
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: type || 'system',
        title,
        body: bodyText,
        data: data || {},
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // E-Mail senden (mit Resend, falls konfiguriert)
    const { data: profile } = await supabase.from('profiles').select('email, first_name').eq('id', userId).single()
    if (profile?.email) {
      const emailSent = await sendEmailNotification(
        profile.email,
        profile.first_name || 'Nutzer',
        title,
        `<p>${bodyText}</p>`
      )
      if (emailSent) {
        await supabase.from('notifications').update({ email_sent: true }).eq('id', notification.id)
      }
    }

    return NextResponse.json({ success: true, notification })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: Benachrichtigungen abrufen
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ notifications: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH: Als gelesen markieren
export async function PATCH(req: NextRequest) {
  try {
    const { ids } = await req.json()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    if (ids && Array.isArray(ids)) {
      await supabase.from('notifications').update({ is_read: true }).in('id', ids).eq('user_id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
