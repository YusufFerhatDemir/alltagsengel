import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

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
    if (!user && (pathname.startsWith('/kunde') || pathname.startsWith('/engel') || pathname.startsWith('/admin') || pathname.startsWith('/mis'))) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    // Admin & MIS routes - check admin role
    if (user && (pathname.startsWith('/admin') || pathname.startsWith('/mis'))) {
      try {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
          const url = request.nextUrl.clone()
          url.pathname = '/auth/login'
          url.searchParams.set('error', 'admin_required')
          return NextResponse.redirect(url)
        }
      } catch {
        // If profile check fails, allow through rather than blocking
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
  matcher: ['/kunde/:path*', '/engel/:path*', '/admin/:path*', '/mis/:path*', '/mis'],
}
