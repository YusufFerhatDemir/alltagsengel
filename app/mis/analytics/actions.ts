'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// Server-seitige Aktionen fuer Analytics (MIS)
// Ersetzt client-seitige Supabase-Writes durch gepruefte Server Actions
// ═══════════════════════════════════════════════════════════════

// A-2 (Master-Audit 2026-08-19): Die Identitaetsfelder des Audit-Eintrags
// duerfen NICHT aus dem Client-Body stammen — sonst kann jeder eingeloggte
// Nutzer Zeilen unter fremdem Namen erzeugen und der Trail ist wertlos.
// Identitaet kommt ausschliesslich aus der Session (Muster:
// app/mis/actions.ts:logMISAuthEvent), User-Agent aus den Request-Headern.

/** Nur diese Aktionen darf der Client anstossen. */
const ERLAUBTE_AKTIONEN = ['login', 'logout'] as const
type ErlaubteAktion = (typeof ERLAUBTE_AKTIONEN)[number]

/** Geraete-Klassifikation — feste Liste, kein Freitext aus dem Browser. */
const ERLAUBTE_GERAETE = [
  'iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Linux', 'Unbekannt',
] as const

function normalisiereGeraet(v: unknown): string {
  const s = String(v ?? '')
  return (ERLAUBTE_GERAETE as readonly string[]).includes(s) ? s : 'Unbekannt'
}

async function requireAuthenticated() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Nicht autorisiert.')
  return { supabase, user }
}

// ── Auth-Event loggen (kein Admin-Check noetig) ───────────────

export async function logAuthEvent(data: {
  action: ErlaubteAktion
  device: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!(ERLAUBTE_AKTIONEN as readonly string[]).includes(data?.action)) {
      return { ok: false, error: 'Unbekannte Aktion.' }
    }

    const { supabase, user } = await requireAuthenticated()

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single()

    const userName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
      : 'Alltagsengel'

    // User-Agent aus dem Request-Header, nicht aus dem Body.
    const userAgent = (await headers()).get('user-agent')?.slice(0, 500) || null

    const { error } = await supabase
      .from('mis_auth_log')
      .insert({
        user_id: user.id,
        user_email: user.email,
        user_name: userName,
        action: data.action,
        user_agent: userAgent,
        device: normalisiereGeraet(data.device),
        // Der Status wird serverseitig gesetzt: die Action laeuft nur mit
        // gueltiger Session, ein "failed"-Login kann sie gar nicht melden.
        status: 'success',
      })

    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}
