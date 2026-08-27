// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal — Dashboard-Daten für das Angehörigenportal
// Liefert: Zugänge mit Klientendaten, Zusammenfassung
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePortalAccess } from '@/lib/angehoerige/portal-helpers'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const supabase = await createClient()

  // Klienten-Daten zu allen Zugängen laden
  const clientIds = ctx.zugaenge.map(z => z.client_id)

  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, care_level, pflegegrad, status')
    .in('id', clientIds)

  // Kommende Termine zählen (bookings)
  const today = new Date().toISOString().split('T')[0]
  const { count: termineCount } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .in('customer_id', clientIds)
    .gte('date', today)
    .in('status', ['pending', 'accepted'])

  // Ungelesene Nachrichten zählen
  const zugangIds = ctx.zugaenge.map(z => z.id)
  const { count: unreadCount } = await supabase
    .from('angehoerigen_nachrichten')
    .select('id', { count: 'exact', head: true })
    .in('zugang_id', zugangIds)
    .eq('absender_typ', 'pflegedienst')
    .eq('status', 'gesendet')

  // Letzte Leistungen (service_records)
  const { data: letzteLeistungen } = await supabase
    .from('service_records')
    .select('id, client_id, date, service_type, duration_minutes, status')
    .in('client_id', clientIds)
    .order('date', { ascending: false })
    .limit(5)

  return NextResponse.json({
    zugaenge: ctx.zugaenge.map(z => {
      const client = (clients ?? []).find((c: any) => c.id === z.client_id)
      return {
        ...z,
        client_name: client ? `${client.first_name} ${client.last_name}` : 'Unbekannt',
        client_pflegegrad: client?.pflegegrad ?? client?.care_level ?? null,
        client_status: client?.status ?? 'active',
      }
    }),
    zusammenfassung: {
      termine_kommend: termineCount ?? 0,
      nachrichten_ungelesen: unreadCount ?? 0,
      letzte_leistungen: letzteLeistungen ?? [],
    },
  })
})
