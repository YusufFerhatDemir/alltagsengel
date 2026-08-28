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
import { UserFacingError } from '../../api/user-facing-error'
import { heuteBerlin } from '../../utils/timezone'
import { logBillingAction } from '../../billing/core/audit'
import { HKP_VERORDNUNG_TYPE, gueltigBis, type HkpVerordnung } from './positionen'

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Der Gueltigkeitszeitraum entscheidet ueber die Abrechenbarkeit jeder
 * angehaengten Leistung (siehe pruefePosition in ./positionen.ts). Ein
 * unlesbares Datum landete bisher ungeprueft in der Spalte; Postgres nimmt
 * dabei auch Formate an, die der Vergleich hier als Zeichenkette dann falsch
 * ordnet ('1.3.2026' < '2026-01-01').
 */
function pruefeDatum(wert: string | null | undefined, feld: string): string | null {
  if (wert === null || wert === undefined || wert === '') return null
  if (typeof wert !== 'string' || !DATUM_RE.test(wert) || Number.isNaN(Date.parse(`${wert}T12:00:00Z`))) {
    throw new UserFacingError(`${feld} muss ein Datum im Format JJJJ-MM-TT sein.`, 400)
  }
  return wert
}

/**
 * Genehmigen ist aus diesen Zustaenden zulaessig. 'abgelehnt' und
 * 'abgelaufen' fehlen bewusst: eine abgelehnte Verordnung per Genehmigung zu
 * ueberschreiben macht jede daran haengende Leistung schlagartig abrechenbar,
 * ohne dass die Ablehnung je aufgehoben wurde. Der Weg dorthin fuehrt ueber
 * 'widerspruch' bzw. eine neue Verordnung.
 */
const GENEHMIGBARE_STATI = ['ausstehend', 'beantragt', 'widerspruch', 'genehmigt']

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
  // Berlin statt UTC: zwischen 00:00 und 02:00 MESZ liegt das UTC-Datum
  // noch auf gestern — eine heute ablaufende Verordnung galt dadurch laenger.
  const heute = heuteBerlin()
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

  if (error) throw new Error(`verordnungen select (Liste) fehlgeschlagen: ${error.message}`)
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

  if (error) throw new Error(`verordnungen select (Einzel) fehlgeschlagen: ${error.message}`)
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
    throw new UserFacingError('§ 37 SGB V verlangt eine ärztliche Verordnung (Muster 12) — Arzt fehlt.', 400)
  }
  if (!eingabe.clientId) {
    throw new UserFacingError('Klient ist Pflicht.', 400)
  }

  const ausstellungsdatum = pruefeDatum(eingabe.ausstellungsdatum, 'Ausstellungsdatum')
  if (!ausstellungsdatum) {
    throw new UserFacingError('Das Ausstellungsdatum der Verordnung ist Pflicht.', 400)
  }
  const gueltigVon = pruefeDatum(eingabe.gueltigVon, 'Gültig-ab-Datum')
  const gueltigBisDatum = pruefeDatum(eingabe.gueltigBis, 'Gültig-bis-Datum')

  // Ein umgedrehter Zeitraum laesst pruefePosition() JEDE Leistung als
  // ausserhalb der Verordnung gelten — die Leistungen fallen still aus der
  // Abrechnung, ohne dass die Verordnung als fehlerhaft auffaellt.
  if (gueltigVon && gueltigBisDatum && gueltigBisDatum < gueltigVon) {
    throw new UserFacingError('Das Gültig-bis-Datum liegt vor dem Gültig-ab-Datum.', 400)
  }

  // Klient gehört zur Organisation? (belt-and-braces, service_role umgeht RLS)
  const { data: klient } = await supabase
    .from('clients')
    .select('id')
    .eq('id', eingabe.clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!klient) throw new UserFacingError('Klient nicht gefunden oder gehört zu einer anderen Organisation.', 404)

  const { data: row, error } = await supabase
    .from('verordnungen')
    .insert({
      // Die Organisation steht fest — der Klient ist zwei Zeilen darueber
      // genau dagegen gefenced worden. Ohne sie greift der Spalten-Default
      // current_org_id(), der beim Dienstschluessel mangels auth.uid() in der
      // Stamm-Organisation endet: die Verordnung laege beim falschen Mandanten
      // und waere fuer den eigenen hinter verordnungen_org_fence unsichtbar.
      organization_id: organizationId,
      client_id: eingabe.clientId,
      verordnung_type: HKP_VERORDNUNG_TYPE,
      ist_verordnung: true,
      kostentraeger_typ: 'krankenkasse',
      genehmigung_status: 'ausstehend',
      ausstellungsdatum,
      arzt_name: eingabe.arztName,
      arzt_praxis: eingabe.arztPraxis ?? null,
      diagnose: eingabe.diagnose ?? null,
      leistung_beschreibung: eingabe.leistungBeschreibung ?? null,
      gueltig_von: gueltigVon,
      gueltig_bis: gueltigBisDatum,
      verordnung_nummer: eingabe.verordnungNummer ?? null,
      kostentraeger_ik_nummer: eingabe.kostentraegerIkNummer ?? null,
      kostentraeger_name: eingabe.kostentraegerName ?? null,
    })
    .select('id')
    .single()

  if (error || !row) throw new Error(`verordnungen insert fehlgeschlagen: ${error?.message}`)

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
  if (!bestehend) throw new UserFacingError('HKP-Verordnung nicht gefunden oder gehört zu einer anderen Organisation.', 404)

  if (!GENEHMIGBARE_STATI.includes(bestehend.genehmigung_status)) {
    throw new UserFacingError(
      `Eine Verordnung im Status "${bestehend.genehmigung_status}" kann nicht genehmigt werden. `
      + `Erlaubt: ${GENEHMIGBARE_STATI.join(', ')}.`,
      409,
    )
  }

  const genehmigungBis = pruefeDatum(genehmigung.genehmigungBis, 'Genehmigt-bis-Datum')
  const genehmigungDatum = heuteBerlin()
  if (genehmigungBis && genehmigungBis < genehmigungDatum) {
    throw new UserFacingError('Das Genehmigt-bis-Datum liegt in der Vergangenheit.', 400)
  }
  // gueltig_von ist der Verordnungsbeginn; eine Genehmigung, die davor
  // endet, deckt keinen einzigen Leistungstag ab.
  if (genehmigungBis && bestehend.gueltig_von && genehmigungBis < bestehend.gueltig_von) {
    throw new UserFacingError('Das Genehmigt-bis-Datum liegt vor dem Beginn der Verordnung.', 400)
  }

  // Die Mandantengrenze zieht die Lese-Abfrage oben (clients!inner) — sie
  // kann im UPDATE nicht wiederholt werden, weil `verordnungen` keine
  // organization_id hat und PostgREST im UPDATE nicht ueber den Join
  // filtert. Was hier dazukommt, sichert den Rest:
  //   - verordnung_type + deleted_at: derselbe Ausschnitt wie beim Lesen,
  //     sonst trifft das UPDATE eine Zeile, die die Pruefung nie gesehen hat,
  //   - genehmigung_status: Compare-and-Swap gegen den gelesenen Wert, damit
  //     zwei gleichzeitige Bearbeiter sich nicht gegenseitig ueberschreiben.
  const { data: geaendert, error } = await supabase
    .from('verordnungen')
    .update({
      genehmigung_status: 'genehmigt',
      genehmigung_datum: genehmigungDatum,
      genehmigung_bis: genehmigungBis,
      genehmigung_aktenzeichen: genehmigung.aktenzeichen ?? null,
    })
    .eq('id', verordnungId)
    .eq('verordnung_type', HKP_VERORDNUNG_TYPE)
    .eq('genehmigung_status', bestehend.genehmigung_status)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(`verordnungen update (Genehmigung) fehlgeschlagen: ${error.message}`)
  if (!geaendert || geaendert.length === 0) {
    throw new UserFacingError('Der Status der Verordnung hat sich zwischenzeitlich geändert.', 409)
  }

  await logBillingAction(supabase, {
    entityType: 'verordnung',
    organizationId,
    entityId: verordnungId,
    action: 'sgb_v_verordnung_genehmigt',
    previousState: { genehmigung_status: bestehend.genehmigung_status },
    newState: {
      genehmigung_status: 'genehmigt',
      aktenzeichen: genehmigung.aktenzeichen ?? null,
      genehmigung_bis: genehmigungBis,
    },
    actorId,
  })
}
