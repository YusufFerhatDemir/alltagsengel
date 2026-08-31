// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/termine — Termine des Klienten
// ═══════════════════════════════════════════════════════════════
//
// Quelle sind die Einsätze (`assignments`), nicht `bookings` — warum,
// steht ausführlich in lib/angehoerige/termine.ts. Kurz: `bookings`
// hat per Fremdschlüssel keine Verbindung zu `clients`, der bisherige
// Filter `.in('customer_id', <clients.id>)` verglich zwei getrennte
// ID-Räume und konnte nie treffen. Die Terminseite war dauerhaft leer.

import { NextResponse } from 'next/server'
import {
  requirePortalAccess,
  erlaubteClientIds,
  protokollEintraege,
  portalDatenClient,
  protokolliereOderVerweigere,
} from '@/lib/angehoerige/portal-helpers'
import {
  SICHTBARE_TERMIN_STATUS,
  TERMIN_SPALTEN,
  zuPortalTermin,
  type AssignmentZeile,
} from '@/lib/angehoerige/termine'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const clientIds = erlaubteClientIds(ctx.zugaenge, 'termine')

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Termine.' }, { status: 403 })
  }

  const supabase = portalDatenClient()

  const { data: termine, error } = await supabase
    .from('assignments')
    .select(TERMIN_SPALTEN)
    .eq('organization_id', ctx.organizationId)
    .in('client_id', clientIds)
    .in('status', [...SICHTBARE_TERMIN_STATUS])
    .order('assignment_date', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Termine konnten nicht geladen werden.' }, { status: 500 })
  }

  // Klienten-Namen zuordnen
  // Der Namens-Lookup war die einzige Abfrage dieser Route ohne
  // Fehlerpruefung. Fiel sie aus, trug JEDE Zeile den Platzhalter „Klient" —
  // bei mehreren freigegebenen Klienten ist das keine Anzeige, sondern eine
  // Verwechslungsgefahr.
  const { data: clients, error: clientsFehler } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .eq('organization_id', ctx.organizationId)
    .in('id', clientIds)

  if (clientsFehler) {
    return NextResponse.json({ error: 'Klientennamen konnten nicht geladen werden.' }, { status: 500 })
  }

  const namen = new Map<string, string>()
  for (const c of (clients ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    namen.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Klient')
  }

  const enriched = ((termine ?? []) as unknown as AssignmentZeile[])
    .map(t => zuPortalTermin(t, namen.get(t.client_id) ?? 'Klient'))

  // Zugriffsprotokoll fail-closed VOR der Ausgabe — bisher lief es als
  // „non-blocking" ins Leere (keine RLS-Policy) und das Log blieb leer.
  const protokoll = await protokolliereOderVerweigere(
    ctx,
    protokollEintraege(ctx.zugaenge, 'termine', 'termine_eingesehen'),
  )
  if (protokoll) return protokoll

  return NextResponse.json({ termine: enriched })
})
