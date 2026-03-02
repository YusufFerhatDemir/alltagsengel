import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, type, title, bodyText, data } = body

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const targetUserId = typeof userId === 'string' && userId ? userId : user.id
    const canNotifyOthers = profile?.role === 'admin'
    if (!canNotifyOthers && targetUserId !== user.id) {
      return NextResponse.json({ error: 'Keine Berechtigung für fremde Benachrichtigungen' }, { status: 403 })
    }

    // Benachrichtigung in DB speichern
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: targetUserId,
        type: type || 'system',
        title,
        body: bodyText,
        data: data || {},
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // E-Mail senden (Hinweis: Echte Integration benötigt E-Mail-Service)
    // Beispiel mit Resend:
    // const resend = new Resend(process.env.RESEND_API_KEY)
    // const { data: profile } = await supabase.from('profiles').select('email, first_name').eq('id', userId).single()
    // if (profile?.email) {
    //   await resend.emails.send({
    //     from: 'ALLTAGSENGEL <noreply@alltagsengel.de>',
    //     to: profile.email,
    //     subject: title,
    //     html: `<h2>${title}</h2><p>${bodyText}</p>`,
    //   })
    // }

    return NextResponse.json({ success: true, notification })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unerwarteter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unerwarteter Fehler'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
