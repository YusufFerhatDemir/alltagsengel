import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getStorageKeyFromEnv } from '@/lib/supabase/storage-key'
import { supabasePublishableKey, supabaseUrl } from '@/lib/supabase/keys'
import { handleRateLimit } from '@/lib/middleware/rate-limit'
import { darfPfad } from '@/lib/auth/bereiche'
import { wirksameRolle } from '@/lib/auth/rollen'
import { istZurLoeschungVorgemerkt, KONTO_GELOESCHT_CODE } from '@/lib/auth/konto-status'
import { logger } from '@/lib/logger'
const log = logger.child('proxy')

// ═══ Cookie-Format Kompatibilität zwischen Browser-Client und Middleware ═══
// Key wird dynamisch aus NEXT_PUBLIC_SUPABASE_URL abgeleitet.
// FAIL-CLOSED: Wenn die URL fehlt oder ungültig ist, ist der Key null
// → alle geschützten Routen werden blockiert (Redirect zu Login).
//
// Lazy-Evaluation statt Modul-Konstante: getStorageKeyFromEnv() wird erst
// beim Request-Handling aufgerufen, nicht beim Import. So können Tests
// die Umgebungsvariablen in beforeEach setzen, ohne dass der Wert schon
// zum Import-Zeitpunkt eingefroren ist.
function getStorageKey(): string | null {
  return getStorageKeyFromEnv()
}
const BASE64_PREFIX = 'base64-'

function decodeSessionCookie(name: string, value: string): string {
  const storageKey = getStorageKey()
  if (storageKey && name === storageKey && value.startsWith(BASE64_PREFIX)) {
    try {
      return Buffer.from(value.substring(BASE64_PREFIX.length), 'base64').toString('utf-8')
    } catch {
      return value
    }
  }
  return value
}

function encodeSessionCookie(name: string, value: string): string {
  const storageKey = getStorageKey()
  if (storageKey && name === storageKey) {
    return BASE64_PREFIX + Buffer.from(value).toString('base64')
  }
  return value
}

// ═══════════════════════════════════════════════════════════════
// Rollenzuordnung: welche Rolle darf welche Bereiche betreten?
// admin/superadmin dürfen ALLE geschützten Bereiche.
// ═══════════════════════════════════════════════════════════════
const ROLE_ACCESS: Record<string, string[]> = {
  admin:      ['/admin', '/mis', '/kunde', '/engel', '/fahrer', '/angehoerige'],
  superadmin: ['/admin', '/mis', '/kunde', '/engel', '/fahrer', '/angehoerige'],
  // Fachrollen (Rollenkonzept, lib/auth/rollen.ts). Der Bereich allein
  // sagt noch nichts: WELCHE Seite unter /admin sie sehen, entscheidet
  // darfPfad() weiter unten anhand der Berechtigungsmatrix. Ohne diesen
  // zweiten Schritt haette eine Buchhaltung Zugriff auf die
  // Pflegedokumentation, nur weil beides unter /admin liegt.
  pdl:         ['/admin', '/mis'],
  qm:          ['/admin', '/mis'],
  buchhaltung: ['/admin', '/mis'],
  kunde:      ['/kunde'],
  engel:      ['/engel'],
  fahrer:     ['/fahrer'],
  // Das Angehoerigenportal war bis 2026-08-23 serverseitig ungeschuetzt:
  // /angehoerige stand weder im matcher noch in PROTECTED_PREFIXES, der
  // Schutz haftete allein am Client-Guard in app/angehoerige/layout.tsx
  // (Lueckenanalyse Bereich 13, P2). Die erlaubten Rollen sind exakt
  // dieselben, die lib/angehoerige/api-auth.ts und der Layout-Guard
  // schon pruefen — angehoerige plus admin/superadmin.
  angehoerige: ['/angehoerige'],
}

// ═══ Startseite pro Rolle (für Redirect bei falschem Bereich) ═══
const ROLE_HOME: Record<string, string> = {
  admin:      '/admin/home',
  superadmin: '/admin/home',
  // /admin/home verlangt 'berichte.lesen' — das hat jede Fachrolle.
  // Damit kann der Rueckverweis unten keine Schleife bilden.
  pdl:         '/admin/home',
  qm:          '/admin/home',
  buchhaltung: '/admin/home',
  kunde:      '/kunde/home',
  engel:      '/engel/home',
  fahrer:     '/fahrer/home',
  angehoerige: '/angehoerige',
}

// ═══ Geschützte Pfad-Präfixe ═══
const PROTECTED_PREFIXES = ['/admin', '/kunde', '/engel', '/fahrer', '/mis', '/angehoerige']

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
  // Rate-Limiting für API-Routen (ehemals middleware.ts)
  const rateLimited = handleRateLimit(request)
  if (rateLimited) return rateLimited

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
  const storageKey = getStorageKey()
  if (!storageKey) {
    log.error('FAIL-CLOSED: NEXT_PUBLIC_SUPABASE_URL fehlt oder ungültig — alle geschützten Routen blockiert')
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    url.searchParams.set('error', 'auth_required')
    return NextResponse.redirect(url)
  }

  try {
    const supabase = createServerClient(
      supabaseUrl(),
      supabasePublishableKey(),
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
    // Beide Quellen, eine Antwort:
    //   app_metadata.role — nur serverseitig (Admin-API) setzbar
    //   profiles.role     — durch prevent_role_escalation geschützt
    //   user_metadata.role NICHT verwendet (vom Nutzer selbst schreibbar)
    //
    // Bis 2026-08-28 stand hier „app_metadata gewinnt, profiles nur als
    // Fallback" — profiles wurde gar nicht erst abgefragt, sobald
    // app_metadata.role gesetzt war. Eine Herabstufung in der Datenbank
    // (der dokumentierte Weg für 'superadmin' und für jede Korrektur
    // außerhalb von /api/admin/manage-role) ließ diesen Torwächter damit
    // unberührt: der alte, höhere Wert im Token entschied weiter, während
    // die Fach-Guards in lib/**/api-auth.ts bereits abwiesen.
    //
    // Jetzt ist profiles bindend und app_metadata wirkt nur einschränkend
    // (wirksameRolle, lib/auth/rollen.ts). Das kostet bei gesetztem
    // app_metadata.role eine zusätzliche, indizierte Abfrage pro Anfrage —
    // bei allen übrigen Konten lief sie ohnehin schon.
    let profilRole = ''
    let dbFehler = false
    let vorgemerkt = false
    try {
      const { data: profile, error: profilFehler } = await supabase
        .from('profiles')
        .select('role, deleted_at')
        .eq('id', user.id)
        .maybeSingle()
      // Ein zurueckgegebener Fehler ist dasselbe wie ein geworfener: die
      // bindende Quelle ist nicht lesbar, also wird nicht entschieden.
      // supabase-js wirft bei PostgREST-Fehlern NICHT — ohne diese Zeile
      // bliebe der Fall unbemerkt.
      if (profilFehler) {
        dbFehler = true
        log.error(`Role DB check failed: ${profilFehler.message}`)
      } else if (istZurLoeschungVorgemerkt(profile)) {
        // Track 11: `deleted_at` gesetzt heisst „zur Loeschung vorgemerkt".
        // Die Selbstlese-Policy auf profiles filtert das nicht, und
        // auth.users bleibt unangetastet — ohne diese Zeile arbeitet ein
        // geloeschtes Konto nach erneuter Anmeldung einfach weiter.
        vorgemerkt = true
      } else if (profile?.role) {
        profilRole = profile.role
      }
    } catch (dbError) {
      // FAIL-CLOSED: DB-Check fehlgeschlagen → Zugriff verweigern.
      dbFehler = true
      log.errorWithException('Role DB check failed', dbError)
    }

    const appRole = (user.app_metadata?.role as string | undefined) || ''
    const role: string = dbFehler || vorgemerkt ? '' : wirksameRolle(appRole, profilRole)

    // ═══ Keine Rolle bestimmbar → Login ═══
    // Bei einem zur Loeschung vorgemerkten Konto steht ein eigener Grund
    // in der URL: die Person soll erfahren, WARUM sie nicht mehr
    // hineinkommt, und den Weg zum Widerruf finden.
    if (!role) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', pathname)
      url.searchParams.set('error', vorgemerkt ? KONTO_GELOESCHT_CODE : 'auth_required')
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

    // ═══ Feinsteuerung innerhalb des Bereichs ═══
    // /admin und /mis sind keine Einheit: die Pflegedokumentation, die
    // Bankdaten und die Benutzerverwaltung liegen dort nebeneinander.
    // darfPfad() entscheidet pro Unterpfad anhand der Berechtigungsmatrix
    // (lib/auth/bereiche.ts) und ist fail-closed — ein Unterpfad ohne
    // Regel bleibt admin/superadmin vorbehalten.
    //
    // Das ersetzt KEINEN Guard in der API: diese Sperre gilt der
    // Oberflaeche. Die Datenzugriffe haengen an den Guards in
    // lib/**/api-auth.ts und an RLS.
    if (
      (area === '/admin' || area === '/mis') &&
      !darfPfad(role, pathname, request.method)
    ) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = ROLE_HOME[role] || '/auth/login'
      homeUrl.search = ''
      return NextResponse.redirect(homeUrl)
    }

    // ═══ Alles OK — Request durchlassen (mit ggf. aktualisierten Cookies) ═══
    return supabaseResponse
  } catch (err) {
    // ═══ FAIL-CLOSED: Exception → kein Zugriff auf geschützte Routen ═══
    log.errorWithException('Proxy auth error', err)
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
    '/angehoerige/:path*',
    '/api/:path*',
  ],
}
