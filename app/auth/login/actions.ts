'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

function extractIp(h: Headers): string | null {
  const xff = h.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip')?.trim() || null
}

function extractDevice(h: Headers): string {
  const ua = h.get('user-agent') || ''
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unbekannt'
}

// ── Fehlgeschlagenen Login protokollieren ─────────────────────

export async function logFailedLogin(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const h = await headers()
    const ip = extractIp(h)
    const device = extractDevice(h)

    const { error } = await supabase.from('mis_auth_log').insert({
      user_id: null,
      user_email: email,
      user_name: null,
      action: 'login_failed',
      ip_address: ip,
      device,
      status: 'failed',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Erfolgreichen Login protokollieren ────────────────────────

export async function logSuccessLogin(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return { ok: false, error: 'Nicht autorisiert.' }

    const h = await headers()
    const ip = extractIp(h)
    const device = extractDevice(h)

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const displayName = profile?.first_name
      ? `${profile.first_name} ${(profile.last_name || '').charAt(0)}.`.trim()
      : (user.user_metadata?.first_name as string) || user.email

    const { error } = await supabase.from('mis_auth_log').insert({
      user_id: user.id,
      user_email: user.email,
      user_name: displayName,
      action: 'login',
      ip_address: ip,
      device,
      status: 'success',
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
