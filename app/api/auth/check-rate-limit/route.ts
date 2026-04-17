import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ═══════════════════════════════════════════════════════════
// Server-Side Login Rate Limiter (Persistent via Supabase)
// Max 5 Versuche pro IP + E-Mail in 15 Minuten
// Nach 5 Fehlversuchen: 15 Min Sperre
// Nach 10 Fehlversuchen: 60 Min Sperre
// Nach 20 Fehlversuchen: 24h Sperre (Brute-Force-Verdacht)
// ═══════════════════════════════════════════════════════════

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function getLockDuration(attempts: number): number {
  if (attempts >= 20) return 86400000   // 24 Stunden
  if (attempts >= 10) return 3600000    // 60 Minuten
  if (attempts >= 5) return 900000      // 15 Minuten
  return 0
}

function formatLockMessage(remainingMs: number): string {
  const remainingMin = Math.ceil(remainingMs / 60000)
  return remainingMin > 60
    ? `Zu viele Fehlversuche. Konto für ${Math.ceil(remainingMin / 60)} Stunden gesperrt.`
    : `Zu viele Fehlversuche. Bitte warten Sie ${remainingMin} Minuten.`
}

async function getEntry(supabase: any, key: string) {
  const { data } = await supabase
    .from('login_rate_limits')
    .select('*')
    .eq('key', key)
    .single()
  return data
}

async function upsertEntry(supabase: any, key: string, attempts: number, firstAttempt: string, lockedUntil: string) {
  await supabase
    .from('login_rate_limits')
    .upsert({
      key,
      attempts,
      first_attempt: firstAttempt,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
}

export async function POST(req: NextRequest) {
  try {
    const { email, action } = await req.json()
    const ip = getClientIP(req)

    if (!email || !action) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const keyByIP = `ip:${ip}`
    const keyByEmail = `email:${email.toLowerCase()}`
    const now = new Date()

    if (action === 'check') {
      for (const key of [keyByIP, keyByEmail]) {
        const entry = await getEntry(supabase, key)
        if (entry && new Date(entry.locked_until) > now) {
          const remainingMs = new Date(entry.locked_until).getTime() - now.getTime()
          return NextResponse.json({
            allowed: false,
            locked: true,
            remainingSeconds: Math.ceil(remainingMs / 1000),
            message: formatLockMessage(remainingMs),
            attempts: entry.attempts,
          })
        }
      }
      return NextResponse.json({ allowed: true })
    }

    if (action === 'fail') {
      for (const key of [keyByIP, keyByEmail]) {
        let entry = await getEntry(supabase, key)

        let attempts = 0
        let firstAttempt = now.toISOString()
        let lockedUntil = now.toISOString()

        if (entry) {
          const entryAge = now.getTime() - new Date(entry.first_attempt).getTime()
          const stillLocked = new Date(entry.locked_until) > now

          // Reset wenn Window abgelaufen (24h) und nicht gesperrt
          if (entryAge > 86400000 && !stillLocked) {
            attempts = 1
            firstAttempt = now.toISOString()
            lockedUntil = now.toISOString()
          } else {
            attempts = entry.attempts + 1
            firstAttempt = entry.first_attempt
            const lockDuration = getLockDuration(attempts)
            lockedUntil = lockDuration > 0
              ? new Date(now.getTime() + lockDuration).toISOString()
              : entry.locked_until
          }
        } else {
          attempts = 1
        }

        await upsertEntry(supabase, key, attempts, firstAttempt, lockedUntil)
      }

      // Aktuelle Werte für Response laden
      const ipEntry = await getEntry(supabase, keyByIP)
      const emailEntry = await getEntry(supabase, keyByEmail)
      const maxAttempts = Math.max(ipEntry?.attempts || 0, emailEntry?.attempts || 0)

      if (maxAttempts >= 5) {
        const lockDuration = getLockDuration(maxAttempts)
        return NextResponse.json({
          locked: true,
          remainingSeconds: Math.ceil(lockDuration / 1000),
          message: formatLockMessage(lockDuration),
          attempts: maxAttempts,
        })
      }

      const remaining = 5 - maxAttempts
      return NextResponse.json({
        locked: false,
        attemptsRemaining: remaining,
        message: remaining <= 2
          ? `Noch ${remaining} Versuch${remaining === 1 ? '' : 'e'} bevor Ihr Konto gesperrt wird.`
          : undefined,
      })
    }

    if (action === 'success') {
      // AUTH-006: Bisher wurde der IP-Counter bei Success GAR NICHT resettet.
      // Das hat ein reales Problem in Shared-IP-Settings (Pflegeheim, Büro,
      // Hotel-WLAN, NAT-Gateway): Ein Kollege tippt 5x falsch → 15min Sperre
      // für alle 50 Leute hinter der NAT.
      //
      // Neuer Trade-off:
      //  1) E-Mail-Counter: komplett löschen (wie bisher — Login-Success
      //     beweist, dass der Account-Inhaber da ist).
      //  2) IP-Counter: **halbieren** statt löschen. Das bewahrt Schutz
      //     gegen Credential-Stuffing (Angreifer, der viele E-Mails
      //     von derselben IP probiert, baut trotzdem Druck auf), gibt
      //     aber einem ehrlichen User ein „Atmen" nach jedem erfolgreichen
      //     Login.
      //  3) Wenn der IP-Eintrag aktuell gesperrt ist, lassen wir die
      //     Sperre unangetastet — Success von einem gesperrten Key sollte
      //     gar nicht stattfinden, aber falls doch, nicht als Exploit-Weg.
      await supabase.from('login_rate_limits').delete().eq('key', keyByEmail)

      const ipEntry = await getEntry(supabase, keyByIP)
      if (ipEntry) {
        const stillLocked = new Date(ipEntry.locked_until) > now
        if (!stillLocked) {
          const halvedAttempts = Math.floor(ipEntry.attempts / 2)
          if (halvedAttempts <= 0) {
            // Komplett löschen bei <=1 verbleibender Markierung
            await supabase.from('login_rate_limits').delete().eq('key', keyByIP)
          } else {
            await upsertEntry(
              supabase,
              keyByIP,
              halvedAttempts,
              ipEntry.first_attempt,
              // Lock zurücksetzen, da halvedAttempts < 5 (Lock-Schwelle)
              now.toISOString()
            )
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    // AUTH-002-Pattern: niemals rohes err-Objekt loggen
    console.error('Rate limit error:', { code: err?.code, name: err?.name })
    // FAIL-OPEN bei Rate Limiter Fehler (Login nicht blockieren)
    return NextResponse.json({ allowed: true })
  }
}
