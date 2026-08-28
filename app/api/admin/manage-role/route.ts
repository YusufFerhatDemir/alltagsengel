import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit-log'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { ROLLEN, ROLLEN_BEZEICHNUNG, istRolle, istVerwaltungsrolle, type Rolle } from '@/lib/auth/rollen'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenSindRolle } from '@/lib/auth/rollen-quelle'

/**
 * Rollen, die ueber diese Route vergeben werden duerfen.
 *
 * 'superadmin' fehlt bewusst: die hoechste Stufe wird nicht ueber eine
 * API vergeben, sondern direkt in der Datenbank. Derselbe Riegel steckt
 * im Trigger prevent_role_escalation (Migration 20260924000000) — waere
 * er nur hier, koennte man ihn mit einem direkten PostgREST-Aufruf
 * umgehen.
 */
const VERGEBBAR: readonly Rolle[] = ROLLEN.filter(r => r !== 'superadmin')

export const POST = withTracking(async function POST(request: NextRequest) {
  try {
    // 1. Auth prüfen
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }

    // 2. NUR superadmin darf Rollen ändern
    const adminSupabase = createAdminClient()
    const callerProfileQuellen = await holeRollenQuellenFuer(adminSupabase, user)

    if (!quellenSindRolle(callerProfileQuellen, 'superadmin')) {
      return NextResponse.json({ error: 'Nur Superadmins dürfen Rollen verwalten' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    // 3. Request-Body lesen
    //
    // Zwei Formen:
    //   { userId, rolle }            — Rollenkonzept (pdl/qm/buchhaltung/…)
    //   { userId, action: grant|revoke } — Altform, entspricht admin bzw. kunde
    const body = await request.json()
    const userId: unknown = body?.userId
    const action: unknown = body?.action
    const rolleRoh: unknown = body?.rolle

    if (typeof userId !== 'string' || !userId) {
      return NextResponse.json({ error: 'userId erforderlich' }, { status: 400 })
    }

    let newRole: Rolle
    if (rolleRoh !== undefined) {
      if (!istRolle(rolleRoh) || !VERGEBBAR.includes(rolleRoh)) {
        return NextResponse.json(
          { error: `Unbekannte oder nicht vergebbare Rolle. Zulässig: ${VERGEBBAR.join(', ')}` },
          { status: 400 },
        )
      }
      newRole = rolleRoh
    } else if (action === 'grant' || action === 'revoke') {
      newRole = action === 'grant' ? 'admin' : 'kunde'
    } else {
      return NextResponse.json({ error: 'rolle oder action (grant/revoke) erforderlich' }, { status: 400 })
    }

    // 4. Sich selbst nicht herabstufen — sonst sperrt sich der letzte
    //    Superadmin mit einem Klick selbst aus.
    if (userId === user.id && newRole !== callerProfileQuellen.rolle) {
      return NextResponse.json({ error: 'Die eigene Rolle kann hier nicht geändert werden' }, { status: 400 })
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
      // Der Audit-Katalog kennt grant/revoke. Massgeblich ist, ob die neue
      // Rolle Verwaltungsrechte traegt — 'kunde' nach 'pdl' ist ein grant,
      // 'buchhaltung' nach 'kunde' ein revoke.
      action: istVerwaltungsrolle(newRole) ? 'role_grant' : 'role_revoke',
      actorId: user.id,
      actorRole: callerProfileQuellen.rolle,
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

    const anzeigeName =
      [targetProfile.first_name, targetProfile.last_name].filter(Boolean).join(' ') || 'Benutzer'

    return NextResponse.json({
      success: true,
      rolle: newRole,
      message: `${anzeigeName}: Rolle jetzt „${ROLLEN_BEZEICHNUNG[newRole]}"`,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
