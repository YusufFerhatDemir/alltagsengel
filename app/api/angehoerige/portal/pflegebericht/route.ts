// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/pflegebericht — Leistungsnachweise / Berichte
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePortalAccess, erlaubteClientIds } from '@/lib/angehoerige/portal-helpers'
import { protokolliereZugriff } from '@/lib/angehoerige/angehoerige'

export async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth

  // Pflegeberichte brauchen sowohl "leistungen" als auch "pflegeberichte" Zugriff
  const clientIdsLeistungen = erlaubteClientIds(ctx.zugaenge, 'leistungen')
  const clientIdsBerichte = erlaubteClientIds(ctx.zugaenge, 'pflegeberichte')
  const clientIds = [...new Set([...clientIdsLeistungen, ...clientIdsBerichte])]

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Pflegeberichte.' }, { status: 403 })
  }

  const supabase = await createClient()

  // Service Records (Leistungsnachweise)
  const { data: records, error } = await supabase
    .from('service_records')
    .select(`
      id, client_id, date, start_time, end_time, duration_minutes,
      service_type, budget_type, notes, status, created_at
    `)
    .in('client_id', clientIds)
    .order('date', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Berichte konnten nicht geladen werden.' }, { status: 500 })
  }

  // Klienten-Namen zuordnen
  const uniqueClientIds = [...new Set((records ?? []).map(r => r.client_id))]
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('id', uniqueClientIds.length > 0 ? uniqueClientIds : ['__none__'])

  const clientMap = new Map<string, string>()
  for (const c of clients ?? []) {
    clientMap.set(c.id, `${c.first_name} ${c.last_name}`)
  }

  const enriched = (records ?? []).map(r => ({
    ...r,
    client_name: clientMap.get(r.client_id) || 'Klient',
  }))

  // Audit: Pflegebericht-Zugriff protokollieren (Best-Effort)
  const zugangFuerAudit = ctx.zugaenge.find(z =>
    z.freigegebene_bereiche.includes('leistungen') || z.freigegebene_bereiche.includes('pflegeberichte')
  )
  if (zugangFuerAudit) {
    protokolliereZugriff(supabase, ctx.organizationId, {
      zugang_id: zugangFuerAudit.id,
      user_id: ctx.userId,
      client_id: zugangFuerAudit.client_id,
      aktion: 'pflegebericht_eingesehen',
    }).catch(() => {})
  }

  return NextResponse.json({ berichte: enriched })
}
