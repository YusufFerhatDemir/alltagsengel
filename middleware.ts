import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    const pathname = request.nextUrl.pathname

    // Protected routes - redirect to login if not authenticated
    if (!user && (pathname.startsWith('/kunde') || pathname.startsWith('/engel') || pathname.startsWith('/admin') || pathname.startsWith('/mis') || (pathname.startsWith('/fahrer') && !pathname.startsWith('/fahrer/register')))) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    // Admin & MIS routes - check admin role via JWT metadata (no DB query needed)
    if (user && (pathname.startsWith('/admin') || pathname.startsWith('/mis'))) {
      const metaRole = user.user_metadata?.role || ''
      const isAdmin = metaRole === 'admin' || metaRole === 'superadmin'

      if (!isAdmin) {
        // Fallback: check profiles table
        try {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
          if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
            const url = request.nextUrl.clone()
            url.pathname = '/auth/login'
            url.searchParams.set('error', 'admin_required')
            return NextResponse.redirect(url)
          }
        } catch (dbError) {
          // FAIL-CLOSED: If DB check fails, DENY access (don't allow through)
          console.error('Admin DB check failed:', dbError)
          const url = request.nextUrl.clone()
          url.pathname = '/auth/login'
          url.searchParams.set('error', 'admin_required')
          return NextResponse.redirect(url)
        }
      }


    }

    return supabaseResponse
  } catch (err) {
    // If middleware errors, allow the request through rather than hanging
    console.error('Middleware error:', err)
    return supabaseResponse
  }
}

export const config = {
  matcher: ['/kunde/:path*', '/engel/:path*', '/admin/:path*', '/mis/:path*', '/mis', '/fahrer/home', '/fahrer/fahrzeuge', '/fahrer/auftraege', '/fahrer/profil', '/fahrer/chat/:path*', '/api/:path*'],
}
