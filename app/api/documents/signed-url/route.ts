import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
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
