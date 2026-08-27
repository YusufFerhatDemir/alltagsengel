// ═══════════════════════════════════════════════════════════════
// GET/PATCH /api/admin/angehoerige/[id] — einzelner Zugang
// ═══════════════════════════════════════════════════════════════
//
// Dienstschlüssel statt RLS-Client — Begründung im Kopf von
// app/api/admin/angehoerige/route.ts. Kurz: pdl/qm dürfen laut
// Berechtigungsmodell hierher, `is_admin()` schliesst sie aber aus, und
// das Ergebnis war eine leere Liste bzw. ein HTTP 500 nach einer
// Änderung, die gar nicht stattgefunden hat.

import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAngehAdmin } from '@/lib/angehoerige/api-auth'
import {
  holeZugang,
  widerrufeZugang,
  reaktiviereZugang,
  aktualisiereFreigaben,
  protokolliereZugriff,
} from '@/lib/angehoerige/angehoerige'
import { logAuditEventOrWarn } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAngehAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    const supabase = createAdminClient()
    const zugang = await holeZugang(supabase, auth.ctx.organizationId, id)
    if (!zugang) {
      return NextResponse.json({ error: 'Zugang nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json(zugang)
  } catch (err) {
    return safeApiError(err, _req)
  }
})

export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAngehAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    if (body.action === 'widerrufen') {
      const zugang = await widerrufeZugang(
        supabase, auth.ctx.organizationId, id, auth.ctx.userId,
        typeof body.grund === 'string' ? body.grund : undefined,
      )
      await protokolliereZugriff(supabase, auth.ctx.organizationId, {
        zugang_id: id,
        user_id: auth.ctx.userId,
        client_id: zugang.client_id,
        aktion: 'zugang_widerrufen',
        details: { grund: body.grund ?? null },
      })
      await logAuditEventOrWarn({
        action: 'update',
        actorId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        entityType: 'angehoerigen_zugang',
        entityId: id,
        details: { vorgang: 'widerrufen', grund: body.grund ?? null },
        request: req,
      })
      return NextResponse.json(zugang)
    }

    // BEFUND: Ein widerrufener Zugang war eine Sackgasse. `unique_user_client`
    // verhindert einen zweiten Zugang für dasselbe Paar, und der Widerruf
    // kannte keinen Weg zurück — nach einem versehentlichen Widerruf liess
    // sich der Angehörige nie wieder freischalten. Die Reaktivierung setzt
    // die Widerrufsspuren zurück und verlangt eine frische Bereichsliste,
    // damit nicht stillschweigend der alte Umfang wieder gilt.
    if (body.action === 'reaktivieren') {
      const zugang = await reaktiviereZugang(
        supabase, auth.ctx.organizationId, id,
        body.freigegebene_bereiche as string[] | undefined,
        !!body.pflegeberichte_freigegeben,
        typeof body.gueltig_bis === 'string' ? body.gueltig_bis : null,
      )
      await protokolliereZugriff(supabase, auth.ctx.organizationId, {
        zugang_id: id,
        user_id: auth.ctx.userId,
        client_id: zugang.client_id,
        aktion: 'zugang_erteilt',
        details: { reaktivierung: true, bereiche: zugang.freigegebene_bereiche },
      })
      await logAuditEventOrWarn({
        action: 'update',
        actorId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        entityType: 'angehoerigen_zugang',
        entityId: id,
        details: { vorgang: 'reaktiviert', bereiche: zugang.freigegebene_bereiche },
        request: req,
      })
      return NextResponse.json(zugang)
    }

    if (body.freigegebene_bereiche) {
      const zugang = await aktualisiereFreigaben(
        supabase, auth.ctx.organizationId, id,
        body.freigegebene_bereiche as never,
        !!body.pflegeberichte_freigegeben,
      )
      await protokolliereZugriff(supabase, auth.ctx.organizationId, {
        zugang_id: id,
        user_id: auth.ctx.userId,
        client_id: zugang.client_id,
        aktion: 'freigabe_geaendert',
        details: { bereiche: body.freigegebene_bereiche },
      })
      await logAuditEventOrWarn({
        action: 'update',
        actorId: auth.ctx.userId,
        organizationId: auth.ctx.organizationId,
        entityType: 'angehoerigen_zugang',
        entityId: id,
        details: { vorgang: 'freigabe_geaendert', bereiche: body.freigegebene_bereiche },
        request: req,
      })
      return NextResponse.json(zugang)
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 })
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('Pflichtfeld') || msg.startsWith('Ungültige') || msg.includes('muss ') || msg.includes('gewählt werden')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (msg.includes('nicht gefunden') || msg.includes('bereits aktiv')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return safeApiError(err, req)
  }
})
