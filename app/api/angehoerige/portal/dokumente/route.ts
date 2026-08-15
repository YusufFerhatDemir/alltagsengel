// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/dokumente — Freigegebene Dokumente
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePortalAccess, erlaubteClientIds } from '@/lib/angehoerige/portal-helpers'

export async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const clientIds = erlaubteClientIds(ctx.zugaenge, 'dokumente')

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Dokumente.' }, { status: 403 })
  }

  const supabase = await createClient()

  // Akten-Dokumente mit Sichtbarkeit "kunde" oder "alle" für die freigegebenen Klienten
  const { data: dokumente, error } = await supabase
    .from('akten_dokumente')
    .select(`
      id, titel, dokument_typ, kategorie, dateiname, mime_type,
      dokument_datum, status, sichtbarkeit, client_id, created_at
    `)
    .in('client_id', clientIds)
    .in('sichtbarkeit', ['kunde', 'alle'])
    .eq('status', 'aktiv')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Dokumente konnten nicht geladen werden.' }, { status: 500 })
  }

  // Klienten-Namen zuordnen
  const uniqueClientIds = [...new Set((dokumente ?? []).map(d => d.client_id).filter(Boolean))]
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('id', uniqueClientIds.length > 0 ? uniqueClientIds : ['__none__'])

  const clientMap = new Map<string, string>()
  for (const c of clients ?? []) {
    clientMap.set(c.id, `${c.first_name} ${c.last_name}`)
  }

  const enriched = (dokumente ?? []).map(d => ({
    ...d,
    client_name: d.client_id ? (clientMap.get(d.client_id) || 'Klient') : 'Allgemein',
  }))

  return NextResponse.json({ dokumente: enriched })
}
