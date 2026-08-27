// ═══════════════════════════════════════════════════════════════
// GET /api/angehoerige/portal — Dashboard-Daten für das Angehörigenportal
// Liefert: Zugänge mit Klientendaten, Zusammenfassung
// ═══════════════════════════════════════════════════════════════
//
// BEFUND (27.08.2026): Diese Route hat die Bereichsfreigaben GAR NICHT
// ausgewertet. Sie sammelte `clientIds` aus ALLEN Zugängen und lieferte
// darauf Pflegegrad, Terminzahl, ungelesene Nachrichten und die letzten
// fünf Leistungen — auch dem Angehörigen, dem ausschliesslich der
// Bereich „Dokumente" freigegeben war und dessen Zugang
// `pflegeberichte_freigegeben = false` trägt. Die abgestufte Freigabe
// ist der Kern des Moduls; auf der Startseite gab es sie nicht.
//
// Dass daraus bisher kein Datenabfluss wurde, lag allein daran, dass die
// Abfragen mit dem RLS-Client liefen und mangels Policy überall `[]`
// zurückkamen (siehe lib/angehoerige/portal-helpers.ts). Mit dem
// Dienstschlüssel liefern sie jetzt echte Daten — die Bereichsprüfung
// muss deshalb VOR der Abfrage sitzen, nicht daneben.

import { NextResponse } from 'next/server'
import {
  requirePortalAccess,
  erlaubteClientIds,
  zugaengeMitBereich,
  protokollEintraege,
  portalDatenClient,
  protokolliereOderVerweigere,
} from '@/lib/angehoerige/portal-helpers'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { OFFENE_TERMIN_STATUS } from '@/lib/angehoerige/termine'
import { withTracking } from '@/lib/monitoring/tracker'

interface ClientZeile {
  id: string
  first_name: string | null
  last_name: string | null
  care_level: number | null
  pflegegrad: number | null
  status: string | null
}

export const GET = withTracking(async function GET() {
  const auth = await requirePortalAccess()
  if (!auth.ok) return auth.response

  const { ctx } = auth
  const supabase = portalDatenClient()

  // Der Name des Klienten gehört zu jedem Zugang — ohne ihn ist die
  // Startseite nicht bedienbar. Pflegegrad ist Gesundheitsdatum und
  // hängt deshalb an einer inhaltlichen Freigabe (Leistungen oder
  // Pflegeberichte), nicht am blossen Bestehen des Zugangs.
  const alleClientIds = [...new Set(ctx.zugaenge.map(z => z.client_id))]
  const idsTermine = erlaubteClientIds(ctx.zugaenge, 'termine')
  const idsLeistungen = erlaubteClientIds(ctx.zugaenge, 'leistungen')
  const idsBerichte = erlaubteClientIds(ctx.zugaenge, 'pflegeberichte')
  const idsPflegegrad = new Set([...idsLeistungen, ...idsBerichte])

  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, care_level, pflegegrad, status')
    .eq('organization_id', ctx.organizationId)
    .in('id', alleClientIds)

  // Kommende Termine zählen — Quelle sind die Einsätze (assignments).
  // NICHT `bookings`: dort zeigt `customer_id` per Fremdschlüssel auf
  // profiles und `care_recipient_id` auf care_recipients; ein
  // clients.id-Filter darauf konnte per Schema nie treffen.
  const heute = new Date().toISOString().split('T')[0]
  let termineKommend = 0
  if (idsTermine.length > 0) {
    const { count } = await supabase
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .in('client_id', idsTermine)
      .gte('assignment_date', heute)
      .in('status', [...OFFENE_TERMIN_STATUS])
    termineKommend = count ?? 0
  }

  // Ungelesene Nachrichten zählen — nur Zugänge mit Nachrichten-Freigabe.
  const zugangIdsNachrichten = zugaengeMitBereich(ctx.zugaenge, 'nachrichten').map(z => z.id)
  let nachrichtenUngelesen = 0
  if (zugangIdsNachrichten.length > 0) {
    const { count } = await supabase
      .from('angehoerigen_nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .in('zugang_id', zugangIdsNachrichten)
      .eq('absender_typ', 'pflegedienst')
      .eq('status', 'gesendet')
    nachrichtenUngelesen = count ?? 0
  }

  // Letzte Leistungen (service_records) — nur für freigegebene Klienten
  // und ohne stornierte Nachweise: ein widerrufener Einsatz bleibt auf
  // status='signed' stehen (lib/leistungsnachweis/status-sync.ts) und
  // wäre dem Angehörigen sonst als erbrachte Leistung angezeigt worden.
  let letzteLeistungen: unknown[] = []
  if (idsLeistungen.length > 0) {
    const { data } = await supabase
      .from('service_records')
      .select('id, client_id, date, service_type, duration_minutes, status, proof_status, billing_status')
      .eq('organization_id', ctx.organizationId)
      .in('client_id', idsLeistungen)
      .order('date', { ascending: false })
      .limit(20)
    letzteLeistungen = ohneStornierte(data ?? [])
      .slice(0, 5)
      .map(({ proof_status: _p, billing_status: _b, ...rest }) => rest)
  }

  // Protokoll VOR der Ausgabe — je Klient, dessen Leistungsdaten die
  // Antwort trägt. Schlägt es fehl, werden gar keine Daten geliefert.
  const protokoll = await protokolliereOderVerweigere(
    ctx,
    idsLeistungen.length > 0
      ? protokollEintraege(ctx.zugaenge, 'leistungen', 'leistungen_eingesehen', { quelle: 'portal_start' })
      : [],
  )
  if (protokoll) return protokoll

  const clientMap = new Map<string, ClientZeile>()
  for (const c of (clients ?? []) as ClientZeile[]) clientMap.set(c.id, c)

  return NextResponse.json({
    zugaenge: ctx.zugaenge.map(z => {
      const client = clientMap.get(z.client_id)
      return {
        ...z,
        client_name: client ? `${client.first_name} ${client.last_name}` : 'Unbekannt',
        client_pflegegrad: idsPflegegrad.has(z.client_id)
          ? (client?.pflegegrad ?? client?.care_level ?? null)
          : null,
        client_status: client?.status ?? 'active',
      }
    }),
    zusammenfassung: {
      termine_kommend: termineKommend,
      nachrichten_ungelesen: nachrichtenUngelesen,
      letzte_leistungen: letzteLeistungen,
    },
  })
})
