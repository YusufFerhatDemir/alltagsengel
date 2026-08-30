import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { erfasseSicherheitsereignis } from '@/lib/security'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const type = searchParams.get('type')

  // SAFETY NET (2026-05-28): Wenn diese Callback-Route aus einem Recovery-Flow
  // aufgerufen wird (entweder explizit via ?type=recovery oder via
  // ?next=/auth/reset-password), MUSS der User auf der Reset-Password-Seite
  // landen — niemals auf einem Rollen-Home. Das verhindert, dass der Bug
  // "User klickt Passwort-vergessen-Link, landet auf Startseite" erneut auftritt,
  // egal aus welcher Quelle der Recovery-Link kommt (eigene Mail, Supabase-Default,
  // Admin-Reset, oder externe Integration).
  const isRecoveryFlow =
    type === 'recovery' ||
    type === 'magiclink' ||
    (next && next.startsWith('/auth/reset-password'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Sitzungsbeginn in die Sicherheitsspur. Diese Route ist der Weg
      // fuer Magic-Link, Bestaetigungsmail und Passwort-Zuruecksetzung —
      // Anmeldungen also, die NICHT ueber das Anmeldeformular laufen und
      // von app/auth/login/actions.ts deshalb nie gesehen wuerden.
      // Fail-soft: eine Protokollzeile darf keine Weiterleitung
      // verhindern.
      try {
        const { data: { user: angemeldet } } = await supabase.auth.getUser()
        if (angemeldet) {
          await erfasseSicherheitsereignis({
            eventType: 'session_start',
            userId: angemeldet.id,
            userEmail: angemeldet.email ?? null,
            request,
            metadata: { weg: isRecoveryFlow ? 'wiederherstellung' : 'callback', typ: type ?? null },
            geraetePruefung: true,
          })
        }
      } catch {
        // bewusst still — siehe oben
      }

      // Recovery hat IMMER Vorrang — nicht ins Rollen-Home schicken
      if (isRecoveryFlow) {
        return NextResponse.redirect(`${origin}/auth/reset-password`)
      }

      // If a specific redirect target was requested (e.g. password reset), go there
      if (next && next.startsWith('/')) {
        return NextResponse.redirect(`${origin}${next}`)
      }

      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Create profile if it doesn't exist yet (from user metadata set during signup)
        // SICHERHEIT: Nur erlaubte Rollen — admin/superadmin NIEMALS automatisch erstellen
        const ALLOWED_SIGNUP_ROLES = ['kunde', 'engel', 'fahrer']
        const meta = user.user_metadata
        if (meta?.role) {
          const safeRole = ALLOWED_SIGNUP_ROLES.includes(meta.role) ? meta.role : 'kunde'
          await supabase.from('profiles').upsert({
            id: user.id,
            role: safeRole,
            first_name: meta.first_name || '',
            last_name: meta.last_name || '',
            email: user.email,
          })
        }

        // Redirect based on role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin') return NextResponse.redirect(`${origin}/admin/home`)
        if (profile?.role === 'engel') {
          // Check if angel profile exists — if not, redirect to registration
          const { data: angel } = await supabase
            .from('angels')
            .select('id')
            .eq('id', user.id)
            .single()
          if (!angel) return NextResponse.redirect(`${origin}/engel/register`)
          return NextResponse.redirect(`${origin}/engel/home`)
        }
        return NextResponse.redirect(`${origin}/kunde/home`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`)
}
