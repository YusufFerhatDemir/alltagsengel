import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { holeKonflikt, loeseKonfliktAuf, schreibeSyncAudit } from '@/lib/sync/audit'
import { entscheideManuelleAufloesung } from '@/lib/sync/conflict'
import { SYNC_ENTITY_REGISTRY, resolveSyncRoute } from '@/lib/sync/entity-registry'
import { wendeAenderungAn } from '@/lib/sync/apply'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════════
// PATCH /api/admin/sync-konflikte/[id]
// ═══════════════════════════════════════════════════════════════
// Manuelle Konfliktauflösung für konflikt_strategie = 'manuell'
// (app/admin/sync-konflikte/). Body: { resolution: 'lokal' | 'server' | 'verwerfen' }
//
//   'lokal'    — wendet die ursprünglich lokale Änderung jetzt nachträglich
//                über den gleichen Modul-Endpunkt an, den der Sync-Server
//                auch beim automatischen Sync genutzt hätte (keine
//                Fachlogik-Duplizierung).
//   'server'   — Server-Stand bleibt unverändert, Konflikt wird nur als
//                aufgelöst markiert.
//   'verwerfen'— Konflikt wird geschlossen, ohne dass irgendeine Seite
//                angewendet wird (z. B. Karteileiche).
// ═══════════════════════════════════════════════════════════════

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json().catch(() => null)
    const resolution = body?.resolution as 'lokal' | 'server' | 'verwerfen' | undefined
    if (!resolution || !['lokal', 'server', 'verwerfen'].includes(resolution)) {
      return NextResponse.json({ error: "resolution muss 'lokal', 'server' oder 'verwerfen' sein." }, { status: 400 })
    }

    const admin = createAdminClient()
    const konflikt = await holeKonflikt(admin, id, auth.ctx.organizationId)
    if (!konflikt) {
      return NextResponse.json({ error: 'Konflikt nicht gefunden.' }, { status: 404 })
    }
    if (konflikt.status !== 'offen') {
      return NextResponse.json({ error: 'Konflikt ist bereits aufgelöst/verworfen.' }, { status: 409 })
    }

    const istVerwerfen = resolution === 'verwerfen'
    const entscheidung = istVerwerfen ? null : entscheideManuelleAufloesung(resolution)

    if (resolution === 'lokal') {
      const registryEintrag = SYNC_ENTITY_REGISTRY[konflikt.entity_typ]
      const route = resolveSyncRoute(registryEintrag, 'update', konflikt.entity_id)
      if (!route) {
        return NextResponse.json({ error: 'Für diesen Entity-Typ ist keine Update-Route hinterlegt.' }, { status: 400 })
      }

      const origin = new URL(request.url).origin
      const cookieHeader = request.headers.get('cookie') ?? ''
      const antwort = await wendeAenderungAn({
        origin,
        endpoint: route.endpoint,
        methode: route.methode,
        payload: konflikt.lokale_daten,
        cookieHeader,
      })

      if (!antwort.ok) {
        return NextResponse.json(
          { error: `Anwenden der lokalen Änderung fehlgeschlagen: HTTP ${antwort.status} ${antwort.text}`.slice(0, 500) },
          { status: 502 },
        )
      }
    }

    const aktualisiert = await loeseKonfliktAuf(admin, id, auth.ctx.organizationId, {
      status: istVerwerfen ? 'verworfen' : entscheidung!.status,
      aufgeloestMit: istVerwerfen ? null : entscheidung!.aufgeloestMit,
      aufgeloestVon: auth.ctx.userId,
    })

    await schreibeSyncAudit(admin, {
      organizationId: auth.ctx.organizationId,
      userId: auth.ctx.userId,
      queueItemId: konflikt.queue_item_id,
      idempotencyKey: konflikt.idempotency_key,
      entityTyp: konflikt.entity_typ,
      aktion: 'conflict_resolved',
      details: { resolution, manuell: true },
    })

    return NextResponse.json({ konflikt: aktualisiert })
  } catch (err) {
    return safeApiError(err, request)
  }
})
