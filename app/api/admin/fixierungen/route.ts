import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logAuditEvent } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ERLAUBTE_FELDER = [
  'client_id', 'art', 'grund', 'beginn_am',
  'richterlich_genehmigt', 'genehmigung_aktenzeichen', 'genehmigung_gueltig_bis',
  'eilfall', 'eilfall_nachtraeglich_beantragt_am',
  'einwilligung_betreuer', 'betreuer_name',
  'arzt_informiert', 'arzt_id',
  'ueberwachungsintervall_minuten', 'bemerkung',
] as const

function nurErlaubteFelder(roh: Record<string, unknown>): Record<string, unknown> {
  const sauber: Record<string, unknown> = {}
  for (const feld of ERLAUBTE_FELDER) {
    if (roh[feld] !== undefined) sauber[feld] = roh[feld]
  }
  return sauber
}

/** GET — Maßnahmen der aktiven Organisation, optional gefiltert nach Klient/Status. */
export async function GET(request: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const params = request.nextUrl.searchParams
    const admin = createAdminClient()
    let query = admin
      .from('freiheitsentziehende_massnahmen')
      .select('id, client_id, art, grund, beginn_am, ende_am, richterlich_genehmigt, genehmigung_aktenzeichen, genehmigung_gueltig_bis, eilfall, einwilligung_betreuer, betreuer_name, arzt_informiert, ueberwachungsintervall_minuten, status, beendigungsgrund, bemerkung, created_at, clients(first_name, last_name)')
      .eq('organization_id', auth.ctx.organizationId)
      .order('beginn_am', { ascending: false })

    const clientId = params.get('clientId')
    if (clientId) query = query.eq('client_id', clientId)
    const status = params.get('status')
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) {
      console.error('[admin/fixierungen] Laden fehlgeschlagen:', error.message)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    return NextResponse.json({ massnahmen: data ?? [] })
  } catch (e) {
    console.error('[admin/fixierungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

/** POST — neue freiheitsentziehende Maßnahme anlegen. */
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
    }

    const eingabe = nurErlaubteFelder(body)
    if (!eingabe.client_id || !eingabe.art || !eingabe.grund) {
      return NextResponse.json({ error: 'Klient, Art und Grund sind Pflichtfelder' }, { status: 400 })
    }
    if (!eingabe.richterlich_genehmigt && !eingabe.eilfall) {
      return NextResponse.json({
        error: 'Ohne richterliche Genehmigung muss die Maßnahme als Eilfall (§1846 BGB, nachträgliche Genehmigung binnen der Frist) markiert werden.',
      }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', eingabe.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const { data, error } = await admin
      .from('freiheitsentziehende_massnahmen')
      .insert({ ...eingabe, organization_id: auth.ctx.organizationId, erstellt_von: auth.ctx.userId })
      .select('id')
      .single()

    if (error) {
      console.error('[admin/fixierungen] Anlegen fehlgeschlagen:', error.message)
      return NextResponse.json({ error: `Speichern fehlgeschlagen: ${error.message}` }, { status: 500 })
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'freiheitsentziehende_massnahme',
      entityId: data.id,
      details: { client_id: eingabe.client_id, art: eingabe.art },
      request: req,
    })

    return NextResponse.json({ erfolg: true, id: data.id })
  } catch (e) {
    console.error('[admin/fixierungen] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
