import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit-log'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'

export async function POST(request: NextRequest) {
  try {
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

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
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

    // 5. Ziel-User muss zur selben Organisation gehören
    const { data: membership } = await adminSupabase
      .from('organization_members')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Benutzer gehört nicht zu Ihrer Organisation' }, { status: 403 })
    }

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
      return safeApiError(error, request)
    }

    // 7. app_metadata (serverseitig, NICHT vom User editierbar) setzen — das ist
    //    die vertrauenswürdige Quelle für den Middleware-Fast-Path. user_metadata
    //    zusätzlich nur für UI-Anzeige; es ist NICHT autoritativ (siehe middleware.ts).
    await adminSupabase.auth.admin.updateUserById(userId, {
      app_metadata: { role: newRole },
      user_metadata: { role: newRole },
    })

    // AUTH-012: Audit-Log — Rollenwechsel dokumentieren (Fail-soft).
    await logAuditEvent({
      action: action === 'grant' ? 'role_grant' : 'role_revoke',
      actorId: user.id,
      actorRole: callerProfile.role,
      organizationId,
      targetId: userId,
      targetEmail: targetProfile.email ?? null,
      entityType: 'profile',
      entityId: userId,
      details: {
        old_role: targetProfile.role,
        new_role: newRole,
        target_name: [targetProfile.first_name, targetProfile.last_name].filter(Boolean).join(' ') || null,
      },
      request,
    })

    return NextResponse.json({
      success: true,
      message: action === 'grant'
        ? `${targetProfile.first_name} ${targetProfile.last_name} ist jetzt Admin`
        : `Admin-Rolle von ${targetProfile.first_name} ${targetProfile.last_name} entzogen`,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
