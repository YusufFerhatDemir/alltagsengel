'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { erfasseAnmeldung, erfasseSicherheitsereignis } from '@/lib/security'
import { kontoFuerEmail } from '@/lib/security/audit'

// ═══════════════════════════════════════════════════════════════════════
// ZWEI SPUREN, MIT ABSICHT
//
// mis_auth_log ist die bestehende Betriebsspur der An-/Abmeldungen; sie
// bleibt unveraendert, damit nichts bricht, was sie heute liest.
// security_audit_log (lib/security) ist die SICHERHEITSspur: sie traegt
// zusaetzlich Geraet, Plattform, Mandant, Schweregrad und loest die
// Meldungen aus (unbekanntes Geraet, auffaellige Anmeldeserie).
//
// Beide Schreibvorgaenge sind fail-soft: schlaegt einer fehl, meldet
// sich die Person trotzdem an. Eine Pflegekraft, die wegen eines
// Protokollfehlers vor der Tuer steht, waere der schlechtere Zustand.
// ═══════════════════════════════════════════════════════════════════════

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

    // Sicherheitsspur. Das Konto wird aufgeloest, damit der Fehlversuch
    // beim richtigen Mandanten landet — gibt es keines, bleibt die Zeile
    // bewusst mandantenlos.
    try {
      const konto = await kontoFuerEmail(createAdminClient(), email)
      await erfasseAnmeldung({
        userId: konto?.userId ?? null,
        email: konto?.email ?? email,
        erfolgreich: false,
        request: h,
        metadata: { konto_bekannt: !!konto },
      })
    } catch {
      // Fail-soft: siehe Kopf.
    }

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

    // Sicherheitsspur inklusive Geraetepruefung und Meldung.
    try {
      await erfasseAnmeldung({
        userId: user.id,
        email: user.email ?? null,
        erfolgreich: true,
        request: h,
      })
    } catch {
      // Fail-soft: siehe Kopf.
    }

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unbekannter Fehler' }
  }
}

// ── Abmeldung protokollieren ──────────────────────────────────────────

/**
 * Abmeldung in der Sicherheitsspur.
 *
 * Der Aufruf muss VOR `supabase.auth.signOut()` erfolgen — danach gibt
 * es keine Sitzung mehr, aus der sich das Konto serverseitig ermitteln
 * liesse. Genau deshalb nimmt diese Aktion auch KEINE Konto-Kennung vom
 * Client entgegen: sonst koennte jeder eine Abmeldung fuer ein fremdes
 * Konto in die Spur schreiben.
 *
 * Angebunden ist bisher die Abmeldung im Verwaltungsbereich
 * (app/admin/layout.tsx). Die uebrigen Abmeldewege (Engel-, Kunden- und
 * Fahrerprofil) schreiben noch keine Zeile — das ist bekannt und steht
 * so in docs/security/AUDIT_SYSTEM.md.
 */
export async function protokolliereAbmeldung(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    await erfasseSicherheitsereignis({
      eventType: 'logout',
      userId: user.id,
      userEmail: user.email ?? null,
      request: await headers(),
    })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
