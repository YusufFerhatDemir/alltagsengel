import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ═══ Cookie-Format Kompatibilität zwischen Browser-Client und Middleware ═══
const STORAGE_KEY = 'sb-nnwyktkqibdjxgimjyuq-auth-token'
const BASE64_PREFIX = 'base64-'

function decodeSessionCookie(name: string, value: string): string {
  if (name === STORAGE_KEY && value.startsWith(BASE64_PREFIX)) {
    try {
      return Buffer.from(value.substring(BASE64_PREFIX.length), 'base64').toString('utf-8')
    } catch {
      return value
    }
  }
  return value
}

function encodeSessionCookie(name: string, value: string): string {
  if (name === STORAGE_KEY) {
    return BASE64_PREFIX + Buffer.from(value).toString('base64')
  }
  return value
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // ═══ Referral-Code in Cookie speichern ═══
  const refCode = request.nextUrl.searchParams.get('ref')
  if (refCode) {
    supabaseResponse.cookies.set('ref_code', refCode, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 Tage
      sameSite: 'lax',
    })
  }

  // ═══ CSRF Protection: Block cross-origin state-changing requests ═══
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    if (origin && host) {
      const originHost = new URL(origin).host
      if (originHost !== host && !originHost.endsWith('.alltagsengel.care') && originHost !== 'localhost:3000') {
        return NextResponse.json({ error: 'CSRF: Ungültige Anfrage' }, { status: 403 })
      }
    }
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => {
            // Decode base64-encoded session cookie so @supabase/ssr can parse it
            return request.cookies.getAll().map(c => ({
              name: c.name,
              value: decodeSessionCookie(c.name, c.value),
            }))
          },
          setAll: (cookiesToSet) => {
            // Re-encode session cookie to match browser client format
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, encodeSessionCookie(name, value))
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, encodeSessionCookie(name, value), options)
            )
          },
        },
      }
    )

    // ═══ Session-Prüfung: getUser verifiziert den JWT serverseitig ═══
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const pathname = request.nextUrl.pathname

    // Protected routes - redirect to login if not authenticated
    const isProtected = pathname.startsWith('/kunde') || pathname.startsWith('/engel') || pathname.startsWith('/admin') || pathname.startsWith('/mis') || (pathname.startsWith('/fahrer') && !pathname.startsWith('/fahrer/register'))

    // ═══ AUTH-007: FAIL-CLOSED für sensible Routen ═══
    // Die FAIL-SOFT-Strategie für /kunde + /engel ist gut für UX
    // (WhatsApp-Style: Session im Hintergrund wiederherstellen, nicht
    // sofort zum Login). Nur ECHTE Geheimdaten (Zahlungsinfos, Dokumente)
    // bleiben fail-closed — dort ist das Risiko eines 3-5s Sichtbar-Fensters
    // während Token-Refresh zu hoch.
    //
    // Profil + Chat sind BEWUSST fail-soft: Der User ist ohnehin nur er
    // selbst dort, und die Client-Seite macht einen zusaetzlichen Session-
    // Check. Haeufiges Rauswerfen bei kleinstem Token-Hickup ist schlimmer
    // als das theoretische Risiko eines 3-Sekunden-Screenshots.
    const sensitivePaths = [
      '/kunde/zahlungsdaten',
      '/kunde/dokumente',
      '/engel/dokumente',
    ]
    // ═══ AUTH-009 (P0): /mis und /admin sind IMMER fail-closed ═══
    // Vorher: /mis lief fail-soft (UX-Reasoning für Profil/Chat). Resultat:
    // nicht-authentifizierte Besucher konnten /mis-Seiten kurzzeitig sehen
    // (bis Client-side AdminAuthGuard greift). Bei Admin-/MIS-Daten ist
    // das ein KRITISCHES Sicherheits-Leak — niemals akzeptabel.
    const adminPaths = ['/admin', '/mis']
    const isSensitive = sensitivePaths.some(p => pathname === p || pathname.startsWith(p + '/'))
    const isAdminPath = adminPaths.some(p => pathname === p || pathname.startsWith(p + '/'))

    if (!user && (isSensitive || isAdminPath)) {
      // FAIL-CLOSED — direkt zum Login, keine Gnade.
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      url.searchParams.set('error', 'auth_required')
      return NextResponse.redirect(url)
    }

    if (!user && isProtected) {
      // ═══ FAIL-SOFT für restliche geschützte Routen ═══
      // Nicht sofort zum Login schicken! Der Client-Side SessionKeepAlive
      // kann den Token noch via Refresh Token / IndexedDB / Cookie refreshen.
      // Genau wie WhatsApp/Instagram: App öffnen → Session wird im Hintergrund
      // wiederhergestellt, ohne dass der User erneut einloggen muss.
      //
      // Die Client-Seite (AdminAuthGuard / Seitenlogik) prüft nach kurzer
      // Wartezeit ob die Session wiederhergestellt wurde. Falls nicht,
      // redirected sie selbst zum Login.
      return supabaseResponse
    }

    // ═══ Admin & MIS routes — Rolle AUTORITATIV prüfen ═══
    // SICHERHEIT: user_metadata ist vom User selbst editierbar
    // (supabase.auth.updateUser({ data: { role: 'admin' } })) und darf
    // NIEMALS für Autorisierung genutzt werden — sonst macht sich jeder
    // Nutzer selbst zum Admin. Wir prüfen daher ausschließlich:
    //   1) app_metadata.role — nur serverseitig (Admin-API) setzbar → vertrauenswürdig
    //   2) Fallback: profiles.role in der DB (autoritativ, gegen Self-Escalation
    //      durch Trigger prevent_role_escalation geschützt).
    if (user && (pathname.startsWith('/admin') || pathname.startsWith('/mis'))) {
      const appRole = (user.app_metadata?.role as string | undefined) || ''
      let isAdmin = appRole === 'admin' || appRole === 'superadmin'

      if (!isAdmin) {
        try {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
          isAdmin = !!profile && ['admin', 'superadmin'].includes(profile.role)
        } catch (dbError) {
          // FAIL-CLOSED: DB-Check fehlgeschlagen → Zugriff verweigern.
          console.error('Admin DB check failed:', dbError)
          isAdmin = false
        }
      }

      if (!isAdmin) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/login'
        url.searchParams.set('error', 'admin_required')
        return NextResponse.redirect(url)
      }
    }

    return supabaseResponse
  } catch (err) {
    // FAIL-CLOSED: If middleware errors on protected routes, deny access
    console.error('Middleware error:', err)
    const pathname = request.nextUrl.pathname
    if (pathname.startsWith('/admin') || pathname.startsWith('/mis')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('error', 'admin_required')
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }
}

export const config = {
  matcher: ['/kunde/:path*', '/engel/:path*', '/admin/:path*', '/mis/:path*', '/mis', '/fahrer/home', '/fahrer/fahrzeuge', '/fahrer/auftraege', '/fahrer/profil', '/fahrer/chat/:path*', '/api/:path*'],
}
