// ═══════════════════════════════════════════════════════════════
// GET/POST /api/angehoerige/portal/kommunikation — Nachrichten
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePortalAccess, hatPortalBereichZugriff } from '@/lib/angehoerige/portal-helpers'
import { protokolliereZugriff } from '@/lib/angehoerige/angehoerige'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('angehoerige-kommunikation')

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth

  if (!hatPortalBereichZugriff(ctx.zugaenge, 'nachrichten')) {
    return NextResponse.json({ error: 'Kein Zugriff auf Nachrichten.' }, { status: 403 })
  }

  const supabase = await createClient()
  const zugangIds = ctx.zugaenge
    .filter(z => z.freigegebene_bereiche.includes('nachrichten'))
    .map(z => z.id)

  const { data: nachrichten, error } = await supabase
    .from('angehoerigen_nachrichten')
    .select('*')
    .in('zugang_id', zugangIds)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Nachrichten konnten nicht geladen werden.' }, { status: 500 })
  }

  // Klienten-Namen zuordnen
  const clientIds = [...new Set((nachrichten ?? []).map(n => n.client_id))]
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('id', clientIds.length > 0 ? clientIds : ['__none__'])

  const clientMap = new Map<string, string>()
  for (const c of clients ?? []) {
    clientMap.set(c.id, `${c.first_name} ${c.last_name}`)
  }

  const enriched = (nachrichten ?? []).map(n => ({
    ...n,
    client_name: clientMap.get(n.client_id) || 'Klient',
  }))

  return NextResponse.json({ nachrichten: enriched })
})

export const POST = withTracking(async function POST(request: NextRequest) {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth

  if (!hatPortalBereichZugriff(ctx.zugaenge, 'nachrichten')) {
    return NextResponse.json({ error: 'Kein Zugriff auf Nachrichten.' }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const { zugang_id, betreff, inhalt } = body
  if (!zugang_id || !betreff?.trim() || !inhalt?.trim()) {
    return NextResponse.json({ error: 'Zugang, Betreff und Inhalt sind Pflichtfelder.' }, { status: 400 })
  }

  // Prüfe ob der Zugang zum User gehört
  const zugang = ctx.zugaenge.find(z => z.id === zugang_id)
  if (!zugang) {
    return NextResponse.json({ error: 'Ungültiger Zugang.' }, { status: 403 })
  }

  const supabase = await createClient()

  const { data: nachricht, error } = await supabase
    .from('angehoerigen_nachrichten')
    .insert({
      organization_id: ctx.organizationId,
      zugang_id,
      client_id: zugang.client_id,
      absender_id: ctx.userId,
      absender_typ: 'angehoeriger',
      betreff: betreff.trim(),
      inhalt: inhalt.trim(),
      status: 'gesendet',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Nachricht konnte nicht gesendet werden.' }, { status: 500 })
  }

  // Audit: Nachricht gesendet protokollieren (Best-Effort)
  protokolliereZugriff(supabase, ctx.organizationId, {
    zugang_id: zugang_id,
    user_id: ctx.userId,
    client_id: zugang.client_id,
    aktion: 'nachricht_gesendet',
    details: { nachricht_id: nachricht?.id },
  }).catch((err) => log.warnWithException('Zugriffs-Protokollierung fehlgeschlagen (non-blocking)', err))

  return NextResponse.json({ nachricht })
})
