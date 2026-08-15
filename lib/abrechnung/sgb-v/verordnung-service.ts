/**
 * § 302 SGB V — Verordnungs-Service (HKP-Verordnungen, § 37 SGB V)
 *
 * CRUD + Gültigkeitsprüfung für häusliche Krankenpflege-Verordnungen
 * (Muster 12). Reine Admin-Verwaltung der Verordnungen selbst — die
 * Zuordnung zu Leistungen und die Abrechenbarkeitsprüfung stehen in
 * ./positionen.ts (pruefePosition/gueltigBis), hier nicht dupliziert.
 *
 * `verordnungen` ist eine geteilte Tabelle für alle Verordnungs-/
 * Bewilligungstypen (§37, §36, §45b, ...) und hat KEINE organization_id
 * (Stand: siehe Migration 20260719000200 ff.). Die Mandantengrenze kommt
 * hier über den Join auf `clients.organization_id` — jede Abfrage MUSS
 * diesen Join tragen, sonst sind Verordnungen fremder Mandanten sichtbar.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'
import { HKP_VERORDNUNG_TYPE, gueltigBis, type HkpVerordnung } from './positionen'

export interface HkpVerordnungListEintrag extends HkpVerordnung {
  client_id: string
  klient_name: string
  arzt_name: string | null
  arzt_praxis: string | null
  diagnose: string | null
  ausstellungsdatum: string
  aktuell_gueltig: boolean
}

export interface HkpVerordnungEingabe {
  clientId: string
  ausstellungsdatum: string
  arztName?: string | null
  arztPraxis?: string | null
  diagnose?: string | null
  leistungBeschreibung?: string | null
  gueltigVon?: string | null
  gueltigBis?: string | null
  verordnungNummer?: string | null
  kostentraegerIkNummer?: string | null
  kostentraegerName?: string | null
}

const SELECT = `
  id, client_id, verordnung_type, genehmigung_status, gueltig_von, gueltig_bis,
  genehmigung_bis, verordnung_nummer, genehmigung_aktenzeichen,
  kostentraeger_ik_nummer, kostentraeger_name, arzt_name, arzt_praxis,
  diagnose, ausstellungsdatum,
  clients!inner(id, organization_id, first_name, last_name)
`

function toEintrag(row: any): HkpVerordnungListEintrag {
  const klient = Array.isArray(row.clients) ? row.clients[0] : row.clients
  const heute = new Date().toISOString().slice(0, 10)
  const bis = gueltigBis(row)
  return {
    id: row.id,
    client_id: row.client_id,
    verordnung_type: row.verordnung_type,
    genehmigung_status: row.genehmigung_status,
    gueltig_von: row.gueltig_von,
    gueltig_bis: row.gueltig_bis,
    genehmigung_bis: row.genehmigung_bis,
    verordnung_nummer: row.verordnung_nummer,
    genehmigung_aktenzeichen: row.genehmigung_aktenzeichen,
    kostentraeger_ik_nummer: row.kostentraeger_ik_nummer,
    kostentraeger_name: row.kostentraeger_name,
    arzt_name: row.arzt_name,
    arzt_praxis: row.arzt_praxis,
    diagnose: row.diagnose,
    ausstellungsdatum: row.ausstellungsdatum,
    klient_name: [klient?.first_name, klient?.last_name].filter(Boolean).join(' ') || '—',
    aktuell_gueltig:
      row.genehmigung_status === 'genehmigt' &&
      (!row.gueltig_von || row.gueltig_von <= heute) &&
      (!bis || bis >= heute),
  }
}

export async function listeHkpVerordnungen(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<HkpVerordnungListEintrag[]> {
  const { data, error } = await supabase
    .from('verordnungen')
    .select(SELECT)
    .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
    .eq('clients.organization_id', organizationId)
    .is('deleted_at', null)
    .order('ausstellungsdatum', { ascending: false })

  if (error) throw new Error(`HKP-Verordnungen konnten nicht geladen werden: ${error.message}`)
  return (data || []).map(toEintrag)
}

export async function ladeHkpVerordnung(
  supabase: SupabaseClient,
  organizationId: string,
  verordnungId: string,
): Promise<HkpVerordnungListEintrag | null> {
  const { data, error } = await supabase
    .from('verordnungen')
    .select(SELECT)
    .eq('id', verordnungId)
    .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
    .eq('clients.organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(`HKP-Verordnung konnte nicht geladen werden: ${error.message}`)
  return data ? toEintrag(data) : null
}

/**
 * Legt eine neue HKP-Verordnung an. Prüft NICHT die Kassengenehmigung — die
 * kommt separat über die bestehende Verordnungs-Workflow-UI (Genehmigung
 * beantragen/eintragen); dieser Service deckt nur den § 302-spezifischen
 * Anlegepfad ab (Muster 12: Arzt/Diagnose Pflichtangaben).
 */
export async function legeHkpVerordnungAn(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: HkpVerordnungEingabe,
  actorId: string,
): Promise<string> {
  if (!eingabe.arztName?.trim()) {
    throw new Error('§ 37 SGB V verlangt eine ärztliche Verordnung (Muster 12) — Arzt fehlt.')
  }

  // Klient gehört zur Organisation? (belt-and-braces, service_role umgeht RLS)
  const { data: klient } = await supabase
    .from('clients')
    .select('id')
    .eq('id', eingabe.clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!klient) throw new Error('Klient nicht gefunden oder gehört zu einer anderen Organisation.')

  const { data: row, error } = await supabase
    .from('verordnungen')
    .insert({
      client_id: eingabe.clientId,
      verordnung_type: HKP_VERORDNUNG_TYPE,
      ist_verordnung: true,
      kostentraeger_typ: 'krankenkasse',
      genehmigung_status: 'ausstehend',
      ausstellungsdatum: eingabe.ausstellungsdatum,
      arzt_name: eingabe.arztName,
      arzt_praxis: eingabe.arztPraxis ?? null,
      diagnose: eingabe.diagnose ?? null,
      leistung_beschreibung: eingabe.leistungBeschreibung ?? null,
      gueltig_von: eingabe.gueltigVon ?? null,
      gueltig_bis: eingabe.gueltigBis ?? null,
      verordnung_nummer: eingabe.verordnungNummer ?? null,
      kostentraeger_ik_nummer: eingabe.kostentraegerIkNummer ?? null,
      kostentraeger_name: eingabe.kostentraegerName ?? null,
    })
    .select('id')
    .single()

  if (error || !row) throw new Error(`HKP-Verordnung konnte nicht angelegt werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'verordnung',
    organizationId,
    entityId: row.id,
    action: 'sgb_v_verordnung_angelegt',
    newState: { client_id: eingabe.clientId, arzt_name: eingabe.arztName },
    actorId,
  })

  return row.id
}

/** Trägt die Kassengenehmigung ein — der zweite Pflichtschritt vor Abrechenbarkeit. */
export async function genehmigeHkpVerordnung(
  supabase: SupabaseClient,
  organizationId: string,
  verordnungId: string,
  genehmigung: { genehmigungBis?: string | null; aktenzeichen?: string | null },
  actorId: string,
): Promise<void> {
  const bestehend = await ladeHkpVerordnung(supabase, organizationId, verordnungId)
  if (!bestehend) throw new Error('HKP-Verordnung nicht gefunden oder gehört zu einer anderen Organisation.')

  const { error } = await supabase
    .from('verordnungen')
    .update({
      genehmigung_status: 'genehmigt',
      genehmigung_datum: new Date().toISOString().slice(0, 10),
      genehmigung_bis: genehmigung.genehmigungBis ?? null,
      genehmigung_aktenzeichen: genehmigung.aktenzeichen ?? null,
    })
    .eq('id', verordnungId)

  if (error) throw new Error(`Genehmigung konnte nicht eingetragen werden: ${error.message}`)

  await logBillingAction(supabase, {
    entityType: 'verordnung',
    organizationId,
    entityId: verordnungId,
    action: 'sgb_v_verordnung_genehmigt',
    previousState: { genehmigung_status: bestehend.genehmigung_status },
    newState: { genehmigung_status: 'genehmigt', aktenzeichen: genehmigung.aktenzeichen ?? null },
    actorId,
  })
}
