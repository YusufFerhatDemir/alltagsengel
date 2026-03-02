import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const pathname = request.nextUrl.pathname

  const redirectToLogin = () => {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
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

    if (!user && (pathname.startsWith('/kunde') || pathname.startsWith('/engel') || pathname.startsWith('/admin'))) {
      return redirectToLogin()
    }

    if (user && pathname.startsWith('/admin')) {
      try {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role !== 'admin') {
          return redirectToLogin()
        }
      } catch {
        return redirectToLogin()
      }
    }

    return supabaseResponse
  } catch (err) {
    console.error('Proxy error:', err)
    if (pathname.startsWith('/kunde') || pathname.startsWith('/engel') || pathname.startsWith('/admin')) {
      return redirectToLogin()
    }
    return supabaseResponse
  }
}

export const config = {
  matcher: ['/kunde/:path*', '/engel/:path*', '/admin/:path*'],
}
