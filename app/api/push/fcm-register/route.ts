// ═══════════════════════════════════════════════════════════════════════
// POST/DELETE /api/push/fcm-register — Bestandspfad der nativen App
// ═══════════════════════════════════════════════════════════════════════
//
// components/NativePushProvider.tsx ruft diesen Pfad auf. Er bleibt
// deshalb bestehen und leitet auf denselben Token-Store wie der neue
// Endpunkt /api/notifications/push/register.
//
// WAS HIER KAPUTT WAR
// Der frühere Upsert nannte `onConflict: 'user_id,token'`, ohne dass es
// einen passenden Unique-Index gab (nachgereicht mit Migration
// 20260930000000). PostgREST konnte den Konflikt damit nicht aufloesen —
// jeder App-Start legte eine WEITERE Zeile an. Ein Nutzer haette
// dieselbe Nachricht so oft bekommen, wie er die App seit der
// Installation geoeffnet hat.
//
// Ausserdem fehlte die organization_id: Geraete waren mandantenlos.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { entferneGeraet, registriereGeraet } from '@/lib/notifications/push'
import { logger } from '@/lib/logger'

const log = logger.child('api:push')

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    if (!(await rateLimitPersistent(`push-register:${user.id}`, 30, 60_000))) {
      return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })
    }

    const { token, platform } = await request.json()
    if (typeof token !== 'string' || token.trim().length < 20) {
      return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine aktive Organisation' }, { status: 403 })
    }

    const ergebnis = await registriereGeraet({
      userId: user.id,
      organizationId,
      token,
      platform: typeof platform === 'string' ? platform : undefined,
      deviceInfo: (request.headers.get('user-agent') || '').slice(0, 200) || null,
    })

    if (!ergebnis.ok) {
      log.error('FCM register error', { grund: ergebnis.grund })
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    const { token } = await request.json()
    if (typeof token !== 'string' || !token.trim()) {
      return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
    }

    await entferneGeraet(user.id, token)
    return NextResponse.json({ success: true })
  } catch (err) {
    return safeApiError(err, request)
  }
}
