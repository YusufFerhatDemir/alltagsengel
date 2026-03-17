import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
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

  if (!profile?.role || !['admin', 'superadmin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Keine Admin-Berechtigung' }, { status: 403 })
  }

  const { userId, newPassword } = await request.json()

  if (!userId || !newPassword) {
    return NextResponse.json({ error: 'userId und newPassword erforderlich' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' }, { status: 400 })
  }

  // Prevent admins from resetting other admins' passwords (only superadmin can)
  const adminSupabase = createAdminClient()
  const { data: targetProfile } = await adminSupabase.from('profiles').select('role').eq('id', userId).single()
  if (targetProfile?.role && ['admin', 'superadmin'].includes(targetProfile.role) && profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Nur Superadmins können Admin-Passwörter zurücksetzen' }, { status: 403 })
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
