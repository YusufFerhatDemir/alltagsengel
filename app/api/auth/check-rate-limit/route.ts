import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════
// Server-Side Login Rate Limiter
// Max 5 Versuche pro IP + E-Mail in 15 Minuten
// Nach 5 Fehlversuchen: 15 Min Sperre
// Nach 10 Fehlversuchen: 60 Min Sperre
// Nach 20 Fehlversuchen: 24h Sperre (Brute-Force-Verdacht)
// ═══════════════════════════════════════════════════════════

interface RateLimitEntry {
  attempts: number
  firstAttempt: number
  lockedUntil: number
}

// In-Memory Store (wird bei Serverless-Restart zurückgesetzt — für Produktion: Redis/Supabase)
const loginAttempts = new Map<string, RateLimitEntry>()

// Aufräumen: Alte Einträge alle 10 Minuten entfernen
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginAttempts.entries()) {
    // Einträge älter als 24h entfernen
    if (now - entry.firstAttempt > 86400000 && now > entry.lockedUntil) {
      loginAttempts.delete(key)
    }
  }
}, 600000)

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

export async function POST(req: NextRequest) {
  try {
    const { email, action } = await req.json()
    const ip = getClientIP(req)

    if (!email || !action) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    // Composite Key: IP + E-Mail (schützt gegen IP-Wechsel UND Credential Stuffing)
    const keyByIP = `ip:${ip}`
    const keyByEmail = `email:${email.toLowerCase()}`

    if (action === 'check') {
      // Prüfe ob gesperrt
      const now = Date.now()

      for (const key of [keyByIP, keyByEmail]) {
        const entry = loginAttempts.get(key)
        if (entry && entry.lockedUntil > now) {
          const remainingMs = entry.lockedUntil - now
          const remainingMin = Math.ceil(remainingMs / 60000)
          return NextResponse.json({
            allowed: false,
            locked: true,
            remainingSeconds: Math.ceil(remainingMs / 1000),
            message: remainingMin > 60
              ? `Zu viele Fehlversuche. Konto für ${Math.ceil(remainingMin / 60)} Stunden gesperrt.`
              : `Zu viele Fehlversuche. Bitte warten Sie ${remainingMin} Minuten.`,
            attempts: entry.attempts,
          })
        }
      }

      return NextResponse.json({ allowed: true })
    }

    if (action === 'fail') {
      const now = Date.now()

      for (const key of [keyByIP, keyByEmail]) {
        const entry = loginAttempts.get(key) || { attempts: 0, firstAttempt: now, lockedUntil: 0 }

        // Reset wenn Window abgelaufen (24h) und nicht gesperrt
        if (now - entry.firstAttempt > 86400000 && now > entry.lockedUntil) {
          entry.attempts = 0
          entry.firstAttempt = now
          entry.lockedUntil = 0
        }

        entry.attempts++

        const lockDuration = getLockDuration(entry.attempts)
        if (lockDuration > 0) {
          entry.lockedUntil = now + lockDuration
        }

        loginAttempts.set(key, entry)
      }

      const ipEntry = loginAttempts.get(keyByIP)
      const emailEntry = loginAttempts.get(keyByEmail)
      const maxAttempts = Math.max(ipEntry?.attempts || 0, emailEntry?.attempts || 0)

      if (maxAttempts >= 5) {
        const lockDuration = getLockDuration(maxAttempts)
        const remainingMin = Math.ceil(lockDuration / 60000)
        return NextResponse.json({
          locked: true,
          remainingSeconds: Math.ceil(lockDuration / 1000),
          message: remainingMin > 60
            ? `Zu viele Fehlversuche. Konto für ${Math.ceil(remainingMin / 60)} Stunden gesperrt.`
            : `Zu viele Fehlversuche. Bitte warten Sie ${remainingMin} Minuten.`,
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
      // Bei erfolgreichem Login: E-Mail-Counter zurücksetzen
      loginAttempts.delete(keyByEmail)
      // IP-Counter NICHT zurücksetzen (schützt gegen Credential Stuffing)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Rate limit error:', err)
    // FAIL-OPEN bei Rate Limiter Fehler (Login nicht blockieren)
    return NextResponse.json({ allowed: true })
  }
}
