import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createRawClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { logAuditEvent } from '@/lib/audit-log'
import { sendAccountDeletionEmail } from '@/lib/emails/account-deletion'

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
 *   5. profiles.deleted_at = now()  →  RLS blendet den User ueberall aus.
 *   6. Token generieren (64 Hex), expires_at = now() + 60 Tage, in
 *      account_deletion_tokens einfuegen.
 *   7. Widerruf-Mail an die User-Mail schicken (enthaelt /api/user/delete/undo
 *      ?token=… Link). Mail-Fehler ist fail-soft — Soft-Delete bleibt.
 *   8. Audit-Event 'user_self_soft_delete' loggen.
 *   9. signOut() → Client hat keine Session mehr, Kunde landet auf /login.
 *
 * Die eigentliche Cascade-Loeschung (Auth-User + Kind-Tabellen) uebernimmt
 * eine Supabase-Edge-Function, die via pg_cron nach 60 Tagen laeuft.
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

export async function DELETE(request: NextRequest) {
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('user/delete: Supabase-Env-Vars fehlen')
      return NextResponse.json({ error: 'Konfigurationsfehler' }, { status: 500 })
    }
    const verifier = createRawClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    })
    if (signInError) {
      console.error('user/delete re-auth error:', {
        code: (signInError as any)?.code,
        name: signInError?.name,
      })
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
        console.error('user/delete soft-delete error:', {
          code: (softErr as any)?.code,
          name: (softErr as any)?.name,
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
      console.error('user/delete token upsert error:', {
        code: (tokenErr as any)?.code,
        name: (tokenErr as any)?.name,
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
      console.error('user/delete mail error:', {
        name: mailErr?.name,
        code: mailErr?.code,
      })
    }

    // ── 8. Audit-Log ─────────────────────────────────────────────
    await logAuditEvent({
      action: 'user_self_soft_delete',
      actorId: userId,
      actorRole: snapshotRole,
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
  } catch (err: any) {
    console.error('user/delete unexpected error:', {
      code: err?.code,
      name: err?.name,
      status: err?.status,
    })
    return NextResponse.json({ error: 'Fehler beim Loeschen des Kontos' }, { status: 500 })
  }
}
