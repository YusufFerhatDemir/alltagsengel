import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { requireAngehAdmin } from '@/lib/angehoerige/api-auth'
import { listeZugaenge, erstelleZugang, protokolliereZugriff } from '@/lib/angehoerige/angehoerige'
import type { FreigabeStatus, AngehoerigenRolle } from '@/lib/angehoerige/types'
import { logAuditEvent } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireAngehAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const client_id = url.searchParams.get('client_id') || undefined
  const status = url.searchParams.get('status') || undefined
  const rolle = url.searchParams.get('rolle') || undefined

  try {
    const supabase = await createClient()
    const zugaenge = await listeZugaenge(supabase, auth.ctx.organizationId, {
      client_id,
      status: status as FreigabeStatus | undefined,
      rolle: rolle as AngehoerigenRolle | undefined,
    })

    // Enrich: Benutzer- und Klientennamen zuordnen
    const userIds = [...new Set(zugaenge.map(z => z.user_id))]
    const clientIds = [...new Set(zugaenge.map(z => z.client_id))]

    const [{ data: profiles }, { data: clients }] = await Promise.all([
      userIds.length > 0
        ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', userIds)
        : Promise.resolve({ data: [] }),
      clientIds.length > 0
        ? supabase.from('clients').select('id, first_name, last_name').in('id', clientIds)
        : Promise.resolve({ data: [] }),
    ])

    const profileMap = new Map<string, { name: string; email: string }>()
    for (const p of profiles ?? []) {
      profileMap.set(p.id, {
        name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unbekannt',
        email: p.email || '',
      })
    }

    const clientMap = new Map<string, string>()
    for (const c of clients ?? []) {
      clientMap.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unbekannt')
    }

    const enriched = zugaenge.map(z => ({
      ...z,
      user_name: profileMap.get(z.user_id)?.name ?? undefined,
      user_email: profileMap.get(z.user_id)?.email ?? undefined,
      client_name: clientMap.get(z.client_id) ?? undefined,
    }))

    return NextResponse.json(enriched)
  } catch (err) {
    return safeApiError(err, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireAngehAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const supabase = await createClient()

    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', body.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const zugang = await erstelleZugang(supabase, auth.ctx.organizationId, auth.ctx.userId, body)

    await protokolliereZugriff(supabase, auth.ctx.organizationId, {
      zugang_id: zugang.id,
      user_id: auth.ctx.userId,
      client_id: zugang.client_id,
      aktion: 'zugang_erteilt',
      details: { rolle: zugang.rolle, bereiche: zugang.freigegebene_bereiche },
    })

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
      entityType: 'angehoerigen_zugang',
      entityId: zugang.id,
      details: { client_id: zugang.client_id, rolle: zugang.rolle, bereiche: zugang.freigegebene_bereiche },
      request: req,
    })

    return NextResponse.json(zugang, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('Pflichtfeld') || msg.includes('muss') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
})
