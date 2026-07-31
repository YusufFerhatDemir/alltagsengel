// Server-seitiger Admin-Check für die Abrechnungs-API-Routen.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireAdmin(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }) }
  }
  return { ok: true }
}
