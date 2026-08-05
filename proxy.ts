import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getStorageKeyFromEnv } from '@/lib/supabase/storage-key'

// ═══ Cookie-Format Kompatibilität zwischen Browser-Client und Middleware ═══
// Key wird dynamisch aus NEXT_PUBLIC_SUPABASE_URL abgeleitet.
// FAIL-CLOSED: Wenn die URL fehlt oder ungültig ist, ist STORAGE_KEY null
// → alle geschützten Routen werden blockiert (Redirect zu Login).
const STORAGE_KEY = getStorageKeyFromEnv()
const BASE64_PREFIX = 'base64-'

function decodeSessionCookie(name: string, value: string): string {
  if (STORAGE_KEY && name === STORAGE_KEY && value.startsWith(BASE64_PREFIX)) {
    try {
      return Buffer.from(value.substring(BASE64_PREFIX.length), 'base64').toString('utf-8')
    } catch {
      return value
    }
  }
  return value
}

function encodeSessionCookie(name: string, value: string): string {
  if (STORAGE_KEY && name === STORAGE_KEY) {
    return BASE64_PREFIX + Buffer.from(value).toString('base64')
  }
  return value
}

// ═══════════════════════════════════════════════════════════════
// Rollenzuordnung: welche Rolle darf welche Bereiche betreten?
// admin/superadmin dürfen ALLE geschützten Bereiche.
// ═══════════════════════════════════════════════════════════════
const ROLE_ACCESS: Record<string, string[]> = {
  admin:      ['/admin', '/mis', '/kunde', '/engel', '/fahrer'],
  superadmin: ['/admin', '/mis', '/kunde', '/engel', '/fahrer'],
  kunde:      ['/kunde'],
  engel:      ['/engel'],
  fahrer:     ['/fahrer'],
}

// ═══ Startseite pro Rolle (für Redirect bei falschem Bereich) ═══
const ROLE_HOME: Record<string, string> = {
  admin:      '/admin/home',
  superadmin: '/admin/home',
  kunde:      '/kunde/home',
  engel:      '/engel/home',
  fahrer:     '/fahrer/home',
}

// ═══ Geschützte Pfad-Präfixe ═══
const PROTECTED_PREFIXES = ['/admin', '/kunde', '/engel', '/fahrer', '/mis']

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

function getAreaPrefix(pathname: string): string | null {
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return prefix
    }
  }
  return null
}

// ═══ Öffentlich zugängliche Seiten unter geschützten Präfixen ═══
// /fahrer/register ist die Fahrer-Registrierung und muss OHNE Login erreichbar sein.
const PUBLIC_EXCEPTIONS = ['/fahrer/register']

function isPublicException(pathname: string): boolean {
  return PUBLIC_EXCEPTIONS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
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

  const pathname = request.nextUrl.pathname

  // ═══ Öffentliche Ausnahmen direkt durchlassen ═══
  if (isPublicException(pathname)) {
    return supabaseResponse
  }

  // ═══ Nur geschützte Pfade durchlaufen den Auth-Check ═══
  if (!isProtectedPath(pathname)) {
    return supabaseResponse
  }

  // ═══ FAIL-CLOSED: Ohne gültigen Storage-Key keine Auth möglich ═══
  if (!STORAGE_KEY) {
    console.error('FAIL-CLOSED: NEXT_PUBLIC_SUPABASE_URL fehlt oder ungültig — alle geschützten Routen blockiert')
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    url.searchParams.set('error', 'auth_required')
    return NextResponse.redirect(url)
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
    const { data: { user } } = await supabase.auth.getUser()

    // ═══ FAIL-CLOSED für ALLE geschützten Routen ═══
    // Kein Flash-of-Content: Ohne gültige serverseitige Session wird
    // sofort zum Login redirected. Der Zielpfad bleibt über ?next= erhalten.
    //
    // Hinweis: Die Client-Seite (SessionKeepAlive) kann den Token ggf.
    // via IndexedDB/localStorage refreshen — das ist aber ein Client-
    // Mechanismus. Serverseitig gilt: kein JWT → kein Zugriff.
    // Die bestehenden clientseitigen Guards (AdminAuthGuard, requireUser)
    // bleiben als Defense-in-Depth erhalten.
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      url.searchParams.set('error', 'auth_required')
      return NextResponse.redirect(url)
    }

    // ═══ Rolle AUTORITATIV bestimmen ═══
    // SICHERHEIT: user_metadata ist vom User selbst editierbar
    // (supabase.auth.updateUser({ data: { role: 'admin' } })) und darf
    // NIEMALS allein für Autorisierung genutzt werden — sonst macht sich
    // jeder Nutzer selbst zum Admin.
    //
    // Hierarchie:
    //   1) app_metadata.role — nur serverseitig (Admin-API) setzbar → tamper-proof
    //   2) Fallback: profiles.role in der DB (autoritativ, durch DB-Trigger
    //      prevent_role_escalation gegen Self-Escalation geschützt)
    //   3) user_metadata.role NICHT verwendet (unsicher)
    let role: string = ''

    const appRole = (user.app_metadata?.role as string | undefined) || ''
    if (appRole) {
      role = appRole
    }

    // DB-Fallback: profiles-Tabelle abfragen (mit User-Token, NICHT service_role)
    if (!role) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profile?.role) {
          role = profile.role
        }
      } catch (dbError) {
        // FAIL-CLOSED: DB-Check fehlgeschlagen → Zugriff verweigern.
        console.error('Role DB check failed:', dbError)
      }
    }

    // ═══ Keine Rolle bestimmbar → Login ═══
    if (!role) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      url.searchParams.set('error', 'auth_required')
      return NextResponse.redirect(url)
    }

    // ═══ Rollen-Check: darf der User diesen Bereich betreten? ═══
    const area = getAreaPrefix(pathname)
    const allowedAreas = ROLE_ACCESS[role] || []

    if (area && !allowedAreas.includes(area)) {
      // User ist eingeloggt, hat aber keinen Zugriff auf diesen Bereich.
      // → Redirect zur eigenen Startseite (keine Redirect-Loop,
      //   weil die eigene Startseite in allowedAreas enthalten ist).
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = ROLE_HOME[role] || '/auth/login'
      homeUrl.search = '' // Keine Query-Parameter mitnehmen
      return NextResponse.redirect(homeUrl)
    }

    // ═══ Alles OK — Request durchlassen (mit ggf. aktualisierten Cookies) ═══
    return supabaseResponse
  } catch (err) {
    // ═══ FAIL-CLOSED: Exception → kein Zugriff auf geschützte Routen ═══
    console.error('Proxy auth error:', err)
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    url.searchParams.set('error', 'auth_required')
    return NextResponse.redirect(url)
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/kunde/:path*',
    '/engel/:path*',
    '/fahrer/:path*',
    '/mis/:path*',
    '/api/:path*',
  ],
}
