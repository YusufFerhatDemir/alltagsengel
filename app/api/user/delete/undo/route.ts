import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAuditEvent } from '@/lib/audit-log'

/**
 * GET /api/user/delete/undo?token=…
 *
 * Widerrufs-Endpoint fuer Soft-Deleted-Accounts (AUTH-003 v2).
 *
 * Token-Validierung:
 *   - existiert in account_deletion_tokens
 *   - expires_at > now()
 *   - confirmed_at IS NULL  (Token wurde noch nicht eingeloest)
 *
 * Bei Erfolg:
 *   1. profiles.deleted_at = NULL  → User ist wieder aktiv
 *   2. account_deletion_tokens.confirmed_at = now()  → Token verbrannt
 *   3. Audit-Event 'user_self_undelete'
 *   4. Redirect zu /login mit ?reactivated=1
 *
 * Bei Fehler (Token weg / abgelaufen / schon eingeloest):
 *   Redirect zu /login?undo_error=<grund>
 *
 * Wir nutzen GET (nicht POST), damit der Link in der Mail einfach
 * klickbar ist. Der Token ist 64 Hex-Zeichen lang (256 Bit Entropie),
 * praktisch nicht erratbar.
 *
 * Analogie:
 *   Wie ein Magic-Link beim Login. Einmal-Token, unique, expires.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://alltagsengel.care'

function redirect(path: string) {
  return NextResponse.redirect(`${APP_URL}${path}`, { status: 303 })
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const token = (url.searchParams.get('token') || '').trim()
    if (!token || token.length < 16) {
      return redirect('/login?undo_error=invalid_token')
    }

    const adminClient = createAdminClient()

    // 1) Token-Lookup
    const { data: tokenRow, error: tokErr } = await adminClient
      .from('account_deletion_tokens')
      .select('user_id, expires_at, confirmed_at')
      .eq('token', token)
      .maybeSingle()

    if (tokErr || !tokenRow) {
      return redirect('/login?undo_error=token_not_found')
    }

    // 2) Validitaet pruefen
    if (tokenRow.confirmed_at) {
      return redirect('/login?undo_error=already_used')
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return redirect('/login?undo_error=expired')
    }

    // 3) Profil reaktivieren
    const userId = tokenRow.user_id

    // Snapshot fuer Audit
    const { data: profileSnapshot } = await adminClient
      .from('profiles')
      .select('role, first_name, last_name, deleted_at')
      .eq('id', userId)
      .single()

    if (!profileSnapshot) {
      // Profil existiert nicht mehr (Hard-Delete bereits durchgelaufen?)
      return redirect('/login?undo_error=account_already_deleted')
    }

    // Wenn deleted_at bereits NULL ist, ist der Account schon aktiv —
    // trotzdem Token verbrennen, damit er nicht doppelt funktioniert.
    if (profileSnapshot.deleted_at) {
      const { error: undelErr } = await adminClient
        .from('profiles')
        .update({ deleted_at: null })
        .eq('id', userId)
      if (undelErr) {
        console.error('user/delete/undo: profile-update fehlgeschlagen', {
          code: (undelErr as any)?.code,
          name: (undelErr as any)?.name,
        })
        return redirect('/login?undo_error=server_error')
      }
    }

    // 4) Token verbrennen
    await adminClient
      .from('account_deletion_tokens')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('user_id', userId)

    // 5) Audit
    await logAuditEvent({
      action: 'user_self_undelete',
      actorId: userId,
      actorRole: profileSnapshot.role ?? null,
      targetId: userId,
      targetEmail: null,
      entityType: 'profile',
      entityId: userId,
      details: {
        reason: 'soft_delete_reverted_via_token',
        was_soft_deleted: Boolean(profileSnapshot.deleted_at),
        target_name: [profileSnapshot.first_name, profileSnapshot.last_name]
          .filter(Boolean)
          .join(' ') || null,
      },
      request,
    })

    return redirect('/login?reactivated=1')
  } catch (err: any) {
    console.error('user/delete/undo unexpected error:', {
      code: err?.code,
      name: err?.name,
    })
    return redirect('/login?undo_error=server_error')
  }
}
