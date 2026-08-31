// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/dokumente — Freigegebene Dokumente
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026): Die Abfrage filterte auf `status='aktiv'` und
// die Sichtbarkeiten 'kunde'/'alle' — aber NICHT auf `gesperrt`.
// `akten_dokumente` führt beides getrennt: `status` ('entwurf', 'aktiv',
// 'archiviert', 'gesperrt', 'abgelaufen') UND das Kennzeichen
// `gesperrt` (boolean, mit gesperrt_grund/-am/-von). Ein Dokument, das
// über das Kennzeichen gesperrt wurde und dabei auf status='aktiv'
// stehenblieb, ging weiter an den Angehörigen hinaus. Die Sperre ist
// genau der Fall, in dem das nicht passieren darf.

import { NextResponse } from 'next/server'
import {
  requirePortalAccess,
  erlaubteClientIds,
  protokollEintraege,
  portalDatenClient,
  protokolliereOderVerweigere,
} from '@/lib/angehoerige/portal-helpers'
import { withTracking } from '@/lib/monitoring/tracker'

interface DokumentZeile {
  id: string
  titel: string | null
  dokument_typ: string | null
  kategorie: string | null
  dateiname: string | null
  mime_type: string | null
  dokument_datum: string | null
  status: string | null
  sichtbarkeit: string | null
  client_id: string | null
  created_at: string | null
}

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const clientIds = erlaubteClientIds(ctx.zugaenge, 'dokumente')

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Dokumente.' }, { status: 403 })
  }

  const supabase = portalDatenClient()

  // Akten-Dokumente mit Sichtbarkeit "kunde" oder "alle" für die freigegebenen Klienten
  const { data: dokumente, error } = await supabase
    .from('akten_dokumente')
    .select(`
      id, titel, dokument_typ, kategorie, dateiname, mime_type,
      dokument_datum, status, sichtbarkeit, client_id, created_at
    `)
    .eq('organization_id', ctx.organizationId)
    .in('client_id', clientIds)
    .in('sichtbarkeit', ['kunde', 'alle'])
    .eq('status', 'aktiv')
    .eq('gesperrt', false)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Dokumente konnten nicht geladen werden.' }, { status: 500 })
  }

  const zeilen = (dokumente ?? []) as unknown as DokumentZeile[]

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

  const enriched = zeilen.map(d => ({
    ...d,
    client_name: d.client_id ? (namen.get(d.client_id) ?? 'Klient') : 'Allgemein',
  }))

  // Zugriffsprotokoll fail-closed VOR der Ausgabe.
  const protokoll = await protokolliereOderVerweigere(
    ctx,
    protokollEintraege(ctx.zugaenge, 'dokumente', 'dokument_eingesehen'),
  )
  if (protokoll) return protokoll

  return NextResponse.json({ dokumente: enriched })
})
