import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MIN_PASSWORD_LENGTH = 8

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Keine Admin-Berechtigung' }, { status: 403 })
    }

    const { userId, newPassword } = await request.json()

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId und newPassword erforderlich' }, { status: 400 })
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein` }, { status: 400 })
    }

    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return NextResponse.json({ error: 'Passwort muss Groß-, Kleinbuchstaben und Zahlen enthalten' }, { status: 400 })
    }

    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) {
      return NextResponse.json({ error: 'Passwort konnte nicht zurückgesetzt werden' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
