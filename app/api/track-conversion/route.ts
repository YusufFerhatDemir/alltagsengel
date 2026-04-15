import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'node:crypto'

/**
 * Server-seitiges Conversion-Tracking.
 *
 * Warum?
 * - iOS Safari ITP / AdBlocker können gtag() blockieren → Google Ads sieht keine Conversions.
 * - Speichert jede Conversion zusätzlich in der DB mit gclid → 100% Attribution-Integrität.
 * - Kann später via Google Ads Offline-Conversion-Upload (oder API) nachgemeldet werden.
 *
 * Was wird gespeichert?
 * - gclid (für Offline-Conversion-Import)
 * - Gehashte Email / Telefon (für Enhanced Conversions)
 * - Label, Wert, Zeitstempel
 */

// Rate Limit: max 30 Conversions pro IP pro Minute
const rateLimit = new Map<string, { count: number; resetAt: number }>()

function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimit.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  if (entry.count >= 30) return false
  entry.count++
  return true
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex')
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    if (!checkRate(ip)) {
      return NextResponse.json({ ok: true })
    }

    const body = await req.json()

    const label: string = typeof body.label === 'string' ? body.label.slice(0, 100) : 'unknown'
    const value: number = typeof body.value === 'number' ? body.value : 0
    const currency: string = typeof body.currency === 'string' ? body.currency.slice(0, 3) : 'EUR'
    const gclid: string | null = typeof body.gclid === 'string' && body.gclid ? body.gclid.slice(0, 500) : null
    const email: string | null = typeof body.email === 'string' && body.email ? body.email.slice(0, 200) : null
    const phone: string | null = typeof body.phone === 'string' && body.phone ? body.phone.slice(0, 30) : null

    const supabase = createAdminClient()

    await supabase.from('conversions').insert({
      label,
      value,
      currency,
      gclid,
      email_hash: email ? sha256(email) : null,
      phone_hash: phone ? sha256(normalizePhone(phone)) : null,
      ip: ip !== 'unknown' ? ip : null,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
