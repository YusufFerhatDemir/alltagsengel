import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createRawClient } from '@supabase/supabase-js'

/**
 * DELETE /api/user/delete
 *
 * AUTH-003 Fix: Konto-Löschung erfordert JETZT eine Re-Authentifizierung
 * durch Passwort-Eingabe. Verhindert, dass jemand mit kurzem Gerät-Zugriff
 * (entsperrtes Handy, offener Browser) irreversibel alle Daten zerstört.
 *
 * Request-Body: { "password": "…" }
 *
 * Ablauf:
 *   1. Session-Check: ist der User authentifiziert?
 *   2. Passwort-Check: kann der User sich mit Email+Passwort neu einloggen?
 *   3. Kaskaden-Löschung: Notifications → Messages → Bookings → Angels → Profile → Auth
 *
 * Hinweis zum Passwort-Check:
 *   Wir nutzen einen **neuen** Supabase-Client (ohne Session), damit der
 *   signInWithPassword-Aufruf die laufende Session NICHT überschreibt.
 *   Sonst hätten wir einen Race-Condition (neue Session vor Delete →
 *   Admin-Delete bekommt falsche User-ID, wenn Session-Handling zickt).
 */
export async function DELETE(request: NextRequest) {
  try {
    // 1. Session-Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
    }
    if (!user.email) {
      // Sollte nicht vorkommen — Supabase-Auth braucht Email. Abbruch.
      return NextResponse.json({ error: 'Konto konnte nicht verifiziert werden' }, { status: 400 })
    }

    // 2. Body parsen
    let body: { password?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Kein/ungültiger Body
    }
    const password = (body.password || '').trim()
    if (!password) {
      return NextResponse.json(
        { error: 'Passwort-Bestätigung erforderlich' },
        { status: 400 }
      )
    }

    // 3. Re-Authentifizierung: frischer Client ohne Cookie-Session,
    //    damit unsere aktive Session unberührt bleibt.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('user/delete: Supabase-Env-Vars fehlen')
      return NextResponse.json(
        { error: 'Konfigurationsfehler' },
        { status: 500 }
      )
    }
    // Frischer Client ohne Cookie-Sync — reine Isolations­instanz nur
    // für den Passwort-Check. Keine Session wird persistiert.
    const verifier = createRawClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    })

    if (signInError) {
      // AUTH-002-Style: Error-Details nie nach außen leaken
      console.error('user/delete re-auth error:', {
        code: (signInError as any)?.code,
        name: signInError?.name,
      })
      return NextResponse.json(
        { error: 'Passwort ist falsch.' },
        { status: 401 }
      )
    }

    // 4. Jetzt Kaskaden-Löschung — wie bisher, aber mit zusätzlichen Tabellen.
    const adminClient = createAdminClient()
    const userId = user.id

    // Order matters (FK-Constraints von "leichtesten" zu "schwersten")
    await adminClient.from('notifications').delete().eq('user_id', userId)
    await adminClient
      .from('messages')
      .delete()
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    await adminClient.from('care_eligibility').delete().eq('user_id', userId)

    // Bookings: sowohl als Kunde als auch als Engel
    await adminClient.from('bookings').delete().eq('customer_id', userId)
    await adminClient.from('bookings').delete().eq('angel_id', userId)

    // Engel-Profil
    await adminClient.from('angels').delete().eq('id', userId)

    // Profil
    await adminClient.from('profiles').delete().eq('id', userId)

    // 5. Auth-User (invalidiert alle Sessions)
    const { error: authError } = await adminClient.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('user/delete auth-delete error:', {
        code: (authError as any)?.code,
        name: authError?.name,
      })
      return NextResponse.json(
        { error: 'Konto konnte nicht gelöscht werden' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Konto und alle Daten wurden gelöscht',
    })
  } catch (err: any) {
    // AUTH-002: Kein rohes err-Objekt loggen, kein err.message an Client.
    console.error('user/delete unexpected error:', {
      code: err?.code,
      name: err?.name,
      status: err?.status,
    })
    return NextResponse.json(
      { error: 'Fehler beim Löschen des Kontos' },
      { status: 500 }
    )
  }
}
