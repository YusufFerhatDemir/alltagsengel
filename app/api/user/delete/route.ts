import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createRawClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase/keys'
import { randomBytes } from 'node:crypto'
import { logAuditEvent } from '@/lib/audit-log'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { sendAccountDeletionEmail } from '@/lib/emails/account-deletion'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api:user')

/**
 * DELETE /api/user/delete
 *
 * AUTH-003 (v2): Soft-Delete mit 60-Tage-Widerrufsfrist.
 *
 * Ablauf:
 *   1. Session-Check: User muss eingeloggt sein.
 *   2. Body parsen: password erforderlich.
 *   3. Re-Auth mit frischem Client (persistSession:false), damit die
 *      laufende Session nicht ueberschrieben wird.
 *   4. Snapshot: Profil-Daten fuers Audit + Mail.
 *   5. profiles.deleted_at = now()  →  der Zugang ist gesperrt. Seit
 *      Track 11 pruefen proxy.ts, lib/auth/rollen-quelle.ts,
 *      lib/auth/guard.ts und das Angehoerigenportal diese Spalte; vorher
 *      wirkte nur der signOut() darunter, und eine erneute Anmeldung
 *      stellte den vollen Zugriff wieder her.
 *   6. Token generieren (64 Hex), expires_at = now() + 60 Tage, in
 *      account_deletion_tokens einfuegen.
 *   7. Widerruf-Mail an die User-Mail schicken (enthaelt /api/user/delete/undo
 *      ?token=… Link). Mail-Fehler ist fail-soft — Soft-Delete bleibt.
 *   8. Audit-Event 'user_self_soft_delete' loggen.
 *   9. signOut() → Client hat keine Session mehr, Kunde landet auf /login.
 *
 * Die eigentliche Loeschung (Auth-User + Kind-Tabellen) uebernimmt seit
 * Track 11 der Cron-Lauf /api/cron/konto-loeschung nach dem Loeschkatalog
 * in lib/dsgvo/loeschkatalog.ts. Die frueher zustaendige Edge Function
 * account-hard-delete ist stillgelegt: ihr pg_cron-Aufruf lief gegen eine
 * NULL-URL und ist nie ausgefuehrt worden.
 *
 * Die Route ist damit:
 *   - idempotent-robust: wenn deleted_at schon gesetzt ist, regenerieren wir
 *     nur den Token (falls der User die Mail nicht mehr hat).
 *   - schnell: keine Cascade-Deletes mehr synchron. <200ms.
 *
 * Analogie:
 *   Wie ein Konto-Kuendigungs-Schreiben bei der Bank. Sofort wirksam,
 *   aber die Kontonummer wird erst nach 60 Tagen geloescht, falls
 *   man sich's nicht anders ueberlegt.
 */

const GRACE_DAYS = 60

export const DELETE = withTracking(async function DELETE(request: NextRequest) {
  try {
    // ── 1. Session-Check ─────────────────────────────────────────
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }
    if (!user.email) {
      return NextResponse.json({ error: 'Konto konnte nicht verifiziert werden' }, { status: 400 })
    }

    // ── 2. Body parsen ───────────────────────────────────────────
    let body: { password?: string } = {}
    try {
      body = await request.json()
    } catch {
      // ignore
    }
    const password = (body.password || '').trim()
    if (!password) {
      return NextResponse.json(
        { error: 'Passwort-Bestaetigung erforderlich' },
        { status: 400 }
      )
    }

    // ── 3. Re-Auth via Isolations-Client ─────────────────────────
    const projektUrl = supabaseUrl()
    const oeffentlicherKey = supabasePublishableKey()
    if (!projektUrl || !oeffentlicherKey) {
      log.error('user/delete: Supabase-Env-Vars fehlen')
      return NextResponse.json({ error: 'Konfigurationsfehler' }, { status: 500 })
    }
    // RATENBEGRENZUNG (Track 11): der Block darunter probiert ein Passwort
    // gegen GoTrue. Die Anmeldeseite hat dafuer eine Sperre nach fuenf
    // Fehlversuchen und schreibt jeden davon nach mis_auth_log — diese
    // Route hatte beides nicht. Wer eine Sitzung uebernommen hat (fremdes
    // Geraet, gestohlenes Cookie), konnte hier unbegrenzt und unprotokolliert
    // Passwoerter durchprobieren. Zehn Versuche je Stunde und Konto decken
    // jeden echten Loeschwunsch ab.
    if (!(await rateLimitPersistent(`user-delete:${user.id}`, 10, 3_600_000))) {
      return NextResponse.json(
        { error: 'Zu viele Versuche. Bitte versuchen Sie es in einer Stunde erneut.' },
        { status: 429 },
      )
    }

    const verifier = createRawClient(projektUrl, oeffentlicherKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (signInError) {
      log.error('user/delete re-auth error', {
        code: signInError?.code,
        name: signInError?.name,
      })
      // Der Fehlversuch gehoert ins Protokoll — sonst ist genau der Weg
      // unsichtbar, auf dem jemand mit fremder Sitzung Passwoerter probiert.
      //
      // Geschrieben wird nach mis_auth_log mit 'login_failed', also in
      // dieselbe Spur, die die Anmeldeseite fuehrt (app/auth/login/actions.ts).
      // NICHT nach mis_audit_log: dessen action-Spalte traegt live einen
      // CHECK ueber eine feste Werteliste, ein neuer Wert wuerde den Insert
      // scheitern lassen — der Fehlversuch waere dann wieder unsichtbar.
      try {
        await createAdminClient().from('mis_auth_log').insert({
          user_id: user.id,
          user_email: user.email,
          user_name: null,
          action: 'login_failed',
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          device: 'api:user/delete',
          status: 'failed',
        })
      } catch {
        /* Protokollfehler darf die Abweisung nicht kippen */
      }
      return NextResponse.json({ error: 'Passwort ist falsch.' }, { status: 401 })
    }

    // ── 4. Snapshot (vor Soft-Delete, weil RLS uns sonst aussperrt) ──
    const adminClient = createAdminClient()
    const userId = user.id
    const { data: snapshotProfile } = await adminClient
      .from('profiles')
      .select('role, first_name, last_name, deleted_at')
      .eq('id', userId)
      .single()
    const snapshotRole: string | null = snapshotProfile?.role ?? null
    const firstName: string = snapshotProfile?.first_name ?? ''
    const snapshotName: string | null =
      [snapshotProfile?.first_name, snapshotProfile?.last_name].filter(Boolean).join(' ') ||
      null
    const alreadySoftDeleted = Boolean(snapshotProfile?.deleted_at)

    // ── 5. Soft-Delete setzen (oder idempotent ueberspringen) ────
    if (!alreadySoftDeleted) {
      const { error: softErr } = await adminClient
        .from('profiles')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', userId)
      if (softErr) {
        log.error('user/delete soft-delete error', {
          code: softErr?.code,
          name: softErr?.name,
        })
        return NextResponse.json(
          { error: 'Konto konnte nicht geloescht werden' },
          { status: 500 }
        )
      }
    }

    // ── 6. Token generieren + speichern (upsert) ─────────────────
    const token = randomBytes(32).toString('hex') // 64 hex chars
    const expiresAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000)

    const { error: tokenErr } = await adminClient
      .from('account_deletion_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          expires_at: expiresAt.toISOString(),
          confirmed_at: null,
        },
        { onConflict: 'user_id' }
      )
    if (tokenErr) {
      log.error('user/delete token upsert error', {
        code: tokenErr?.code,
        name: tokenErr?.name,
      })
      // fail-soft: Soft-Delete ist trotzdem aktiv, Admin kann manuell reaktivieren
    }

    // ── 7. Widerruf-Mail (fail-soft) ─────────────────────────────
    try {
      await sendAccountDeletionEmail({
        email: user.email,
        firstName,
        token,
      })
    } catch (mailErr: any) {
      log.error('user/delete mail error', {
        name: mailErr?.name,
        code: mailErr?.code,
      })
    }

    // ── 8. Audit-Log ─────────────────────────────────────────────
    const { data: userMembership } = await adminClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle()

    await logAuditEvent({
      action: 'user_self_soft_delete',
      actorId: userId,
      actorRole: snapshotRole,
      organizationId: userMembership?.organization_id ?? null,
      targetId: userId,
      targetEmail: user.email,
      entityType: 'profile',
      entityId: userId,
      details: {
        reason: 'dsgvo_art_17_self_deletion',
        target_name: snapshotName,
        grace_days: GRACE_DAYS,
        expires_at: expiresAt.toISOString(),
        already_soft_deleted: alreadySoftDeleted,
      },
      request,
    })

    // ── 9. signOut (Cookie-Session zerstoeren) ───────────────────
    await supabase.auth.signOut()

    return NextResponse.json({
      success: true,
      message:
        'Konto wurde deaktiviert. Du hast 60 Tage Zeit, die Loeschung per E-Mail-Link zu widerrufen.',
      grace_days: GRACE_DAYS,
      expires_at: expiresAt.toISOString(),
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
