// ═══════════════════════════════════════════════════════════════════════
// DELETE /api/notifications/push/unregister — Geraet abmelden
// ═══════════════════════════════════════════════════════════════════════
//
// Aufrufer: die App beim Logout oder wenn der Nutzer Push in den
// Einstellungen abschaltet.
//
// Immer nur das EIGENE Geraet: der Loeschbefehl wird im Token-Store
// zusaetzlich auf die user_id der Sitzung eingeschraenkt. Ein fremder
// Token, der hier hereingereicht wird, trifft deshalb keine Zeile.
//
// Das Ergebnis ist bewusst nicht unterscheidbar ("ok" auch fuer einen
// Token, den es nie gab): sonst waere der Endpunkt ein Orakel dafuer, ob
// ein bestimmter Token existiert.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { entferneGeraet } from '@/lib/notifications/push'
import { logger } from '@/lib/logger'

const log = logger.child('api:push-unregister')

async function abmelden(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  if (!(await rateLimitPersistent(`push-unregister:${user.id}`, 30, 60_000))) {
    return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
  }

  let koerper: unknown
  try {
    koerper = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltige Anfrage' }, { status: 400 })
  }

  const { token } = (koerper ?? {}) as { token?: unknown }
  if (typeof token !== 'string' || !token.trim()) {
    return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
  }

  const ergebnis = await entferneGeraet(user.id, token)
  if (!ergebnis.ok) {
    log.error('Geraet nicht abgemeldet', { grund: ergebnis.grund })
    return NextResponse.json({ error: 'Loeschfehler' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  try {
    return await abmelden(request)
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST ist derselbe Vorgang. Grund: manche HTTP-Stacks in mobilen Apps
 * senden bei DELETE keinen Body — der Token kaeme dann nie an. Ein
 * zweiter Weg ist billiger als ein Abmeldeversuch, der still ins Leere
 * laeuft und den Nutzer weiter benachrichtigt.
 */
export async function POST(request: NextRequest) {
  try {
    return await abmelden(request)
  } catch (err) {
    return safeApiError(err, request)
  }
}
