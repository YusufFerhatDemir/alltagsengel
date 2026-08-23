// ═══════════════════════════════════════════════════════════════════════
// POST /api/notifications/push/register — Geraet fuer Push anmelden
// ═══════════════════════════════════════════════════════════════════════
//
// Aufrufer ist die App (Capacitor/Expo), unmittelbar nachdem das
// Betriebssystem die Push-Erlaubnis erteilt hat.
//
// WOHER DIE IDENTITAET KOMMT
// user_id und organization_id werden NIE aus dem Request uebernommen,
// sondern aus der Sitzung gelesen. Andernfalls koennte jeder Angemeldete
// ein Geraet auf einen fremden Nutzer registrieren und dessen
// Benachrichtigungen mitlesen — inhaltlich Gesundheitsdaten.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { registriereGeraet, istPushPlattform } from '@/lib/notifications/push'
import { logger } from '@/lib/logger'

const log = logger.child('api:push-register')

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
    }

    // Ein Geraet meldet sich beim App-Start an, nicht im Sekundentakt.
    // Das Limit haengt am Nutzer, nicht an der IP: hinter einem Mobilfunk-
    // NAT teilen sich viele echte Geraete dieselbe Adresse.
    if (!(await rateLimitPersistent(`push-register:${user.id}`, 30, 60_000))) {
      return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
    }

    let koerper: unknown
    try {
      koerper = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ungueltige Anfrage' }, { status: 400 })
    }

    const { token, platform } = (koerper ?? {}) as { token?: unknown; platform?: unknown }
    if (typeof token !== 'string' || token.trim().length < 20) {
      return NextResponse.json({ error: 'Token fehlt oder ist ungueltig' }, { status: 400 })
    }
    if (platform !== undefined && !istPushPlattform(platform)) {
      return NextResponse.json({ error: 'Unbekannte Plattform' }, { status: 400 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      // getActiveOrgId ist fail-closed (Security-Audit 2026-08-19). Ohne
      // Mandant gibt es keine Zeile — die Spalte ist NOT NULL und traegt
      // die Mandantengrenze.
      return NextResponse.json({ error: 'Keine aktive Organisation' }, { status: 403 })
    }

    const ergebnis = await registriereGeraet({
      userId: user.id,
      organizationId,
      token,
      platform: typeof platform === 'string' ? platform : undefined,
      // User-Agent gekuerzt: er dient der Wiedererkennung eines Geraets
      // in der Verwaltung, nicht der Profilbildung.
      deviceInfo: (request.headers.get('user-agent') || '').slice(0, 200) || null,
    })

    if (!ergebnis.ok) {
      log.error('Geraet nicht registriert', { grund: ergebnis.grund })
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, bekannt: ergebnis.bekannt })
  } catch (err) {
    return safeApiError(err, request)
  }
}
