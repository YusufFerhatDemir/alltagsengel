import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { erfasseSicherheitsereignis } from '@/lib/security'
import { istRolle, wirksameRolle } from '@/lib/auth/rollen'
import { startseiteNachAnmeldung } from '@/lib/auth/startseite'
import { logger } from '@/lib/logger'

const log = logger.child('auth-callback')

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
        // ── Profil anlegen, falls es noch keines gibt ──────────────
        //
        // BEFUND (Block 97, 14.09.2026): hier stand ein `upsert` ohne
        // Konfliktbehandlung, dessen Ergebnis verworfen wurde. Beides war
        // falsch, und das erste davon schwer.
        //
        // `safeRole` bildet JEDE Rolle ausserhalb der Signup-Liste auf
        // 'kunde' ab — auch 'admin' und 'superadmin'. Ein `upsert` trifft
        // aber auch eine BESTEHENDE Zeile. Wer also eine privilegierte
        // Rolle in `user_metadata` traegt und einen Bestaetigungs- oder
        // Magic-Link anklickt, bekam damit `profiles.role = 'kunde'`
        // geschrieben — und `profiles` ist die bindende Rollenquelle
        // (lib/auth/rollen.ts).
        //
        // Der Datenbank-Riegel greift dagegen NICHT: prevent_role_escalation
        // wirft nur, wenn der Handelnde kein Admin ist. Hier ist der
        // Handelnde der Betroffene selbst — `is_admin()` ist wahr, die
        // Herabstufung ist erlaubt. Ein Administrator stuft sich mit einem
        // Klick auf einen Link aus seiner eigenen Mail selbst ab.
        //
        // Live gemessen am 14.09.2026 ueber die GoTrue-Admin-API: drei
        // Konten tragen eine `user_metadata.role` ausserhalb der
        // Signup-Liste, darunter zwei mit `profiles.role = 'superadmin'`.
        //
        // Nebenwirkung derselben Zeile: Vor- und Nachname und die Adresse
        // wurden bei jedem Aufruf aus den Signup-Metadaten
        // ueberschrieben — jede spaetere Korrektur im Profil ging damit
        // verloren.
        //
        // RICHTIG IST: nur ANLEGEN, nie ueberschreiben. Existiert die
        // Zeile schon, ist SIE die Wahrheit, nicht die Anmelde-Metadaten.
        // `insert` kann eine bestehende Zeile gar nicht erst beruehren;
        // 23505 ist hier deshalb kein Fehler, sondern der Normalfall.
        const ALLOWED_SIGNUP_ROLES = ['kunde', 'engel', 'fahrer']
        const meta = user.user_metadata
        if (meta?.role) {
          const safeRole = ALLOWED_SIGNUP_ROLES.includes(meta.role) ? meta.role : 'kunde'
          const { error: profilAnlage } = await supabase.from('profiles').insert({
            id: user.id,
            role: safeRole,
            first_name: meta.first_name || '',
            last_name: meta.last_name || '',
            email: user.email,
          })

          // 23505 = die Zeile gibt es bereits. Genau das ist die Absicht.
          if (profilAnlage && profilAnlage.code !== '23505') {
            // Ohne Profil traegt das Konto keine Rolle, und jeder Guard
            // antwortet 403 — ohne dass irgendwo stuende, warum. Die
            // Weiterleitung nach /kunde/home waere hier die stille
            // Falschaussage: angemeldet, aber ohne Zugang.
            log.error('Profil konnte nicht angelegt werden', {
              userId: user.id,
              code: profilAnlage.code,
              errorMessage: profilAnlage.message,
            })
            return NextResponse.redirect(`${origin}/auth/login?error=rolle_nicht_pruefbar`)
          }
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
