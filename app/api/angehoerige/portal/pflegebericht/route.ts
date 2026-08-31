// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal/pflegebericht — Leistungsnachweise / Berichte
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026): Der Kopfkommentar dieser Route hielt fest,
// Pflegeberichte brauchten „sowohl leistungen als auch pflegeberichte"
// — der Code bildete aber die VEREINIGUNG beider Erlaubnislisten. Wer
// nur den Bereich „Leistungen" freigegeben hatte (und dessen Zugang
// ausdrücklich `pflegeberichte_freigegeben = false` trug), bekam den
// vollen Datensatz inklusive `notes` — und `notes` IST der Pflege-
// bericht: der Freitext zum Einsatz. Das gesonderte Kennzeichen
// `pflegeberichte_freigegeben` existiert genau als zweite, strengere
// Hürde; hier war sie folgenlos.
//
// Jetzt: die Liste der Einsätze folgt dem Bereich „Leistungen", der
// Freitext dem Bereich „Pflegeberichte". Beides je Klient getrennt —
// ein Angehöriger kann für den einen Klienten Berichte sehen und für
// den anderen nur die Leistungsliste.

import { NextResponse } from 'next/server'
import {
  requirePortalAccess,
  erlaubteClientIds,
  protokollEintraege,
  portalDatenClient,
  protokolliereOderVerweigere,
} from '@/lib/angehoerige/portal-helpers'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Statuswerte, in denen ein Nachweis noch Entwurf ist.
 * Der Freitext eines Entwurfs ist unfertig und wird noch korrigiert —
 * er gehört nicht in die Hand eines Dritten.
 */
const ENTWURF_STATUS = ['draft', 'incomplete']

interface RecordZeile {
  id: string
  client_id: string
  date: string | null
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  service_type: string | null
  budget_type: string | null
  notes: string | null
  status: string | null
  proof_status: string | null
  billing_status: string | null
  created_at: string | null
}

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth

  const idsLeistungen = erlaubteClientIds(ctx.zugaenge, 'leistungen')
  const idsBerichte = new Set(erlaubteClientIds(ctx.zugaenge, 'pflegeberichte'))
  // Ein Klient, für den NUR „Pflegeberichte" freigegeben ist, gehört
  // ebenfalls in die Liste — sonst hätte die strengere Freigabe weniger
  // Wirkung als die schwächere.
  const clientIds = [...new Set([...idsLeistungen, ...idsBerichte])]

  if (clientIds.length === 0) {
    return NextResponse.json({ error: 'Kein Zugriff auf Pflegeberichte.' }, { status: 403 })
  }

  const supabase = portalDatenClient()

  const { data: records, error } = await supabase
    .from('service_records')
    .select(`
      id, client_id, date, start_time, end_time, duration_minutes,
      service_type, budget_type, notes, status, proof_status,
      billing_status, created_at
    `)
    .eq('organization_id', ctx.organizationId)
    .in('client_id', clientIds)
    .order('date', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: 'Berichte konnten nicht geladen werden.' }, { status: 500 })
  }

  // Stornierte Nachweise raus: ein widerrufener Einsatz bleibt auf
  // status='signed' stehen (lib/leistungsnachweis/status-sync.ts) und
  // wäre sonst als erbrachte Leistung ausgewiesen worden.
  const sichtbar = ohneStornierte((records ?? []) as unknown as RecordZeile[])

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

  const enriched = sichtbar.map(r => {
    const berichtFreigegeben =
      idsBerichte.has(r.client_id) && !ENTWURF_STATUS.includes(String(r.status ?? ''))
    const { proof_status: _p, billing_status: _b, notes, ...rest } = r
    return {
      ...rest,
      notes: berichtFreigegeben ? notes : null,
      bericht_freigegeben: berichtFreigegeben,
      client_name: namen.get(r.client_id) ?? 'Klient',
    }
  })

  // Zugriffsprotokoll fail-closed VOR der Ausgabe — je Bereich und
  // Klient getrennt, damit im Log steht, WAS eingesehen wurde.
  const protokoll = await protokolliereOderVerweigere(ctx, [
    ...protokollEintraege(ctx.zugaenge, 'leistungen', 'leistungen_eingesehen'),
    ...protokollEintraege(ctx.zugaenge, 'pflegeberichte', 'pflegebericht_eingesehen'),
  ])
  if (protokoll) return protokoll

  return NextResponse.json({ berichte: enriched })
})
