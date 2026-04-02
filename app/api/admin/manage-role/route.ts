import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  // 1. Auth prüfen
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // 2. NUR superadmin darf Rollen ändern
  const adminSupabase = createAdminClient()
  const { data: callerProfile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Nur Superadmins dürfen Rollen verwalten' }, { status: 403 })
  }

  // 3. Request-Body lesen
  const { userId, action } = await request.json()

  if (!userId || !action) {
    return NextResponse.json({ error: 'userId und action erforderlich' }, { status: 400 })
  }

  if (!['grant', 'revoke'].includes(action)) {
    return NextResponse.json({ error: 'Ungültige Aktion (grant/revoke)' }, { status: 400 })
  }

  // 4. Sich selbst nicht entfernen
  if (userId === user.id && action === 'revoke') {
    return NextResponse.json({ error: 'Du kannst dir selbst nicht die Rolle entziehen' }, { status: 400 })
  }

  // 5. Ziel-User prüfen
  const { data: targetProfile } = await adminSupabase
    .from('profiles')
    .select('role, first_name, last_name, email')
    .eq('id', userId)
    .single()

  if (!targetProfile) {
    return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 })
  }

  // 6. Rolle ändern
  const newRole = action === 'grant' ? 'admin' : 'kunde'

  const { error } = await adminSupabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 7. Auch user_metadata aktualisieren (für JWT-Check in Middleware)
  await adminSupabase.auth.admin.updateUserById(userId, {
    user_metadata: { role: newRole },
  })

  return NextResponse.json({
    success: true,
    message: action === 'grant'
      ? `${targetProfile.first_name} ${targetProfile.last_name} ist jetzt Admin`
      : `Admin-Rolle von ${targetProfile.first_name} ${targetProfile.last_name} entzogen`,
  })
}
