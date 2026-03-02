import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const { success } = rateLimit(`signed-url:${ip}`, 30, 60_000)
    if (!success) {
      return NextResponse.json({ error: 'Zu viele Anfragen. Bitte warten Sie.' }, { status: 429 })
    }

    const { filePath } = await req.json()
    if (!filePath) return NextResponse.json({ error: 'filePath erforderlich' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

    if (!filePath.startsWith(`${user.id}/`)) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 })
      }
    }

    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 300)

    if (error) return NextResponse.json({ error: 'URL konnte nicht erstellt werden' }, { status: 500 })

    return NextResponse.json({ signedUrl: data.signedUrl })
  } catch {
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
