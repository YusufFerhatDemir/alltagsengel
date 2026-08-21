// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/termine — Termine des Klienten
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePortalAccess, erlaubteClientIds } from '@/lib/angehoerige/portal-helpers'
import { protokolliereZugriff } from '@/lib/angehoerige/angehoerige'
import { logger } from '@/lib/logger'
const log = logger.child('angehoerige-termine')

export async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const clientIds = erlaubteClientIds(ctx.zugaenge, 'termine')

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Termine.' }, { status: 403 })
  }

  const supabase = await createClient()

  // Bookings für die freigegebenen Klienten
  const { data: termine, error } = await supabase
    .from('bookings')
    .select(`
      id, service, date, time, duration_hours, status, notes, created_at,
      customer_id
    `)
    .in('customer_id', clientIds)
    .order('date', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Termine konnten nicht geladen werden.' }, { status: 500 })
  }

  // Klienten-Namen zuordnen
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, user_id')
    .in('id', clientIds)

  // user_id -> client mapping for bookings (bookings use customer_id = profiles.id)
  const userToClient = new Map<string, any>()
  for (const c of clients ?? []) {
    if (c.user_id) userToClient.set(c.user_id, c)
  }

  const enriched = (termine ?? []).map(t => {
    const client = userToClient.get(t.customer_id) ||
      (clients ?? []).find((c: any) => c.id === t.customer_id)
    return {
      ...t,
      client_name: client ? `${client.first_name} ${client.last_name}` : 'Klient',
    }
  })

  // Audit: Terminzugriff protokollieren (Best-Effort)
  const zugangFuerAudit = ctx.zugaenge.find(z => z.freigegebene_bereiche.includes('termine'))
  if (zugangFuerAudit) {
    protokolliereZugriff(supabase, ctx.organizationId, {
      zugang_id: zugangFuerAudit.id,
      user_id: ctx.userId,
      client_id: zugangFuerAudit.client_id,
      aktion: 'termine_eingesehen',
    }).catch((err) => log.warnWithException('Zugriffs-Protokollierung fehlgeschlagen (non-blocking)', err))
  }

  return NextResponse.json({ termine: enriched })
}
