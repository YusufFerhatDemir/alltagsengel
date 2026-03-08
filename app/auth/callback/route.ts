import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Create profile if it doesn't exist yet (from user metadata set during signup)
        const meta = user.user_metadata
        if (meta?.role) {
          await supabase.from('profiles').upsert({
            id: user.id,
            role: meta.role,
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
