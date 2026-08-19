'use server'

import { createClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Analytics (MIS)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

async function requireAuthenticated() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')
  return { supabase, userId: user.id }
}

// ── Auth-Event loggen (kein Admin-Check noetig) ───────────────

export async function logAuthEvent(data: {
  user_id: string
  user_email: string
  user_name: string
  action: string
  user_agent: string
  device: string
  status: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAuthenticated()

    const { error } = await supabase
      .from('mis_auth_log')
      .insert({
        user_id: data.user_id,
        user_email: data.user_email,
        user_name: data.user_name,
        action: data.action,
        user_agent: data.user_agent,
        device: data.device,
        status: data.status,
      })

    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
