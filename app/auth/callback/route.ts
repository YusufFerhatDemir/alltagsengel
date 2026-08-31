import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { erfasseSicherheitsereignis } from '@/lib/security'
import { istRolle, wirksameRolle } from '@/lib/auth/rollen'
import { startseiteNachAnmeldung } from '@/lib/auth/startseite'

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

        // ── Weiterleitung nach Rolle ────────────────────────────────
        // Bis 31.08.2026 stand hier eine eigene, kuerzere Kette: sie kannte
        // nur 'admin' und 'engel', las allein `profiles` und schickte alle
        // uebrigen Rollen nach /kunde/home. superadmin, pdl, qm,
        // buchhaltung, fahrer und angehoerige landeten damit ueber den
        // Bestaetigungs- oder Magic-Link in der Kunden-App — fuer fahrer
        // und angehoerige in einem Bereich, den sie gar nicht betreten
        // duerfen, sodass der Proxy sie sofort wieder herauswarf.
        //
        // Rollenquelle jetzt wie in der Anmeldeseite und im Proxy: BEIDE
        // nicht selbst beschreibbaren Quellen, bei Widerspruch die engere.
        const { data: profile, error: profilFehler } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()

        // Ein Fehler beim Rollenabruf ist KEINE Rolle. Vorher fiel er als
        // `profile === undefined` durch bis nach /kunde/home — eine
        // Pflegedienstleitung landete bei einer Netzstoerung in der
        // Kunden-App. Lieber zurueck zur Anmeldung als in den falschen
        // Bereich.
        if (profilFehler) {
          return NextResponse.redirect(`${origin}/auth/login?error=rolle_nicht_pruefbar`)
        }

        const role = wirksameRolle(
          (user.app_metadata?.role as string) || '',
          (profile?.role as string) || '',
        )

        if (role === 'engel') {
          // Ohne Engel-Datensatz geht es in die Registrierung. Ein FEHLER
          // beim Nachsehen ist aber kein fehlender Datensatz: bis
          // 31.08.2026 verwarf diese Abfrage ihren Fehler, und ein laengst
          // registrierter Engel wurde bei jeder Stoerung erneut in die
          // Registrierung geschickt.
          const { data: angel, error: engelFehler } = await supabase
            .from('angels')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()
          if (engelFehler) return NextResponse.redirect(`${origin}/auth/login?error=rolle_nicht_pruefbar`)
          if (!angel) return NextResponse.redirect(`${origin}/engel/register`)
          return NextResponse.redirect(`${origin}/engel/home`)
        }

        if (istRolle(role) && role !== 'kunde') {
          return NextResponse.redirect(`${origin}${startseiteNachAnmeldung(role)}`)
        }
        return NextResponse.redirect(`${origin}/kunde/home`)
      }
    }
  }

  return NextResponse.redirect(`${origin}/auth/login`)
}
