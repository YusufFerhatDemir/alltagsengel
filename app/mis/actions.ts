'use server'

import { createClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer MIS Layout (Root-Level)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

// ── MIS Auth-Event loggen (kein Admin-Check noetig) ───────────

export async function logMISAuthEvent(data: {
  action: string
  device: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { ok: false, error: 'Nicht autorisiert.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const userName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
      : 'Alltagsengel'

    const { error } = await supabase
      .from('mis_auth_log')
      .insert({
        user_id: user.id,
        user_email: user.email,
        user_name: userName,
        action: data.action,
        device: data.device,
        status: 'success',
      })

    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
