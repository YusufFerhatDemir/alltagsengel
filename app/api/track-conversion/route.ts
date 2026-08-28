import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/rate-limit'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import crypto from 'node:crypto'
import { withTracking } from '@/lib/monitoring/tracker'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'

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

// Rate Limit: max 30 Conversions pro IP pro Minute.
//
// Track 13 B2: instanzuebergreifend in der Datenbank statt in einer Map
// im Modul-Scope. Auf Vercel startet jede neue Serverless-Instanz mit
// leerem Zaehler — ein Modul-Scope-Limit ist dort keine Grenze. Diese
// Route schreibt mit dem Dienstschluessel in `conversions` und legt dabei
// die IP-Adresse des Aufrufers ab; ohne wirksames Limit waechst diese
// Tabelle unbegrenzt. Derselbe Umbau ist am 19.08.2026 fuer
// /api/visitor-alert gemacht worden; diese Route war uebersehen worden.
const CONVERSION_LIMIT = 30
const CONVERSION_FENSTER_MS = 60_000

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex')
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)

    if (!(await rateLimitPersistent(`conversion:${ip}`, CONVERSION_LIMIT, CONVERSION_FENSTER_MS))) {
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
      // Die Stamm-Organisation steht hier AUSDRUECKLICH, statt sich auf den
      // Spalten-Default current_org_id() zu verlassen: dieser Weg laeuft mit
      // dem Dienstschluessel ohne auth.uid(), der Default faellt dann auf
      // genau diesen Wert zurueck — aber als fail-open-Rueckfall, nicht als
      // Aussage. Hier ist er eine Aussage: die oeffentliche Website gehoert
      // der Stamm-Organisation, es gibt keinen anderen Mandanten dahinter.
      organization_id: DEFAULT_ORG_ID,
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
  } catch (err) {
    return safeApiError(err, req)
  }
})
