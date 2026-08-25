/**
 * Kassenabrechnung-Engine — Orchestrierung des vollständigen DTA-Workflows
 *
 * Ablauf:
 *   1. Pre-Flight-Validierung (Anerkennung, Tarife, Signaturen, Duplikate)
 *   2. Lauf erstellen (abrechnungslaeufe + dta_lauf_rechnungen)
 *   3. EDIFACT generieren (bestehender Generator)
 *   4. Optional: SECON-Verschlüsselung + Auftragsdatei
 *   5. DAKOTA-Auftrag erstellen (Status: bereit_zur_uebermittlung)
 *   6. Audit-Trail schreiben
 *
 * KEINE Simulation: Ohne DAKOTA-Zugangsdaten bleibt der Status bei
 * BEREIT_ZUR_ÜBERMITTLUNG — niemals fälschlich als ÜBERMITTELT markieren.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction, computeContentHash } from '../billing/core/audit'
import { pflegegradVon } from '../clients/pflegegrad'
import { euroZuCent } from '@/lib/geld'
import { generateAlleDateien, type AbrechnungsFall, type GeneratorOptionen, type EdifactDatei } from './edifact-generator'
import { validateEDIFACT, validateIK } from './edifact-validator'
import { generateAuftragsdatei, auftragsdateiName } from './auftragsdatei'
import { dateiindikatorFuer } from './betriebsmodus'

function encodeToLatin1(text: string): ArrayBuffer {
  const buf = new ArrayBuffer(text.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    view[i] = code > 255 ? 0x3F : code // '?' for unmappable chars
  }
  return buf
}

/**
 * Byte-Laenge des Dateiinhalts in der Kodierung, in der er auch abgelegt wird.
 * `encodeToLatin1` schreibt genau ein Byte je Zeichen — die Auftragsdatei muss
 * dieselbe Zahl melden. Die Funktion haelt beide Stellen aneinander: wer die
 * Kodierung aendert, muss hier ebenfalls vorbeikommen.
 */
function byteLaengeLatin1(text: string): number {
  return encodeToLatin1(text).byteLength
}

// ── Types ───────────────────────────────────────────────────────

export type LaufStatus =
  | 'erstellt' | 'validierung_laeuft' | 'validierung_fehlgeschlagen'
  | 'geprueft' | 'freigegeben' | 'export_laeuft'
  | 'bereit_zum_export' | 'exportiert'
  | 'bereit_zur_uebermittlung' | 'uebermittlung_laeuft'
  | 'uebermittelt' | 'quittiert'
  | 'angenommen' | 'teilweise_abgelehnt' | 'abgelehnt'
  | 'korrektur_erforderlich' | 'korrigiert' | 'abgeschlossen'
  | 'storniert'

export type LaufTyp =
  | 'erstabrechnung' | 'korrekturabrechnung' | 'nachberechnung'
  | 'storno' | 'wiederholungslauf' | 'sammelabrechnung'

export interface PreFlightPruefpunkt {
  id: string
  label: string
  bestanden: boolean
  pflicht: boolean
  details?: string
}

export interface PreFlightErgebnis {
  bestanden: boolean
  fehler: PreFlightPruefpunkt[]
  warnungen: PreFlightPruefpunkt[]
  alle: PreFlightPruefpunkt[]
  dauer_ms: number
}

export interface LaufErstellungParams {
  organizationId: string
  abrechnungsmonat: string
  bundesland: string
  kostentraegerIk?: string
  laufTyp?: LaufTyp
  korrekturVon?: string
  actorId: string
}

export interface LaufErstellungErgebnis {
  laufId: string
  status: LaufStatus
  rechnungenAnzahl: number
  gesamtbetragCent: number
  validierung: PreFlightErgebnis
}

export interface ExportErgebnis {
  laufId: string
  dateien: EdifactDatei[]
  dakotaAuftraege: string[]
  status: LaufStatus
}

/**
 * Abrechnungsmonat → Kalendergrenzen des Monats.
 *
 * public.invoices hat KEINE Spalte `period_month` — der Zeitraum steht in
 * `period_start` / `period_end`. Ein Filter auf period_month brach zur
 * Laufzeit mit Postgres 42703 ("column invoices.period_month does not
 * exist") ab und legte damit den gesamten DTA-Pfad still: Pre-Flight,
 * Lauf-Erstellung und Export liefen alle über denselben Filter.
 *
 * Akzeptiert '2026-07' wie auch '2026-07-01'.
 */
export function monatsGrenzen(abrechnungsmonat: string): { von: string; bis: string } {
  const ym = abrechnungsmonat.slice(0, 7)
  const jahr = Number(ym.slice(0, 4))
  const monat = Number(ym.slice(5, 7))
  const letzterTag = new Date(jahr, monat, 0).getDate()
  return { von: `${ym}-01`, bis: `${ym}-${String(letzterTag).padStart(2, '0')}` }
}

/**
 * Euro-Betrag (numeric) → Cent (integer).
 *
 * public.invoices.total_amount und public.service_records.amount stehen in
 * EURO (43.50), waehrend jede *_cent-Spalte und der EDIFACT-Generator CENT
 * erwarten (4350). Beleg aus der Live-DB: dieselbe Rechnung fuehrt
 * total_amount=43.50 und soll_betrag_cent=4350.
 *
 * Ohne diese Umrechnung landeten alle Betraege um Faktor 100 zu niedrig in
 * abrechnungslaeufe.gesamtbetrag_cent, dta_lauf_rechnungen.betrag_cent, im
 * Audit-Trail und in der an die Kasse uebermittelten EDIFACT-Datei.
 *
 * Die Rundung liegt in lib/geld.ts — `Math.round(betrag * 100)` verfehlte
 * den exakten Halb-Cent (1,005 € ergab 100 statt 101 Cent).
 */
export { euroZuCent }

// ── Pre-Flight-Validierung ──────────────────────────────────────

export async function preFlightValidierung(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    abrechnungsmonat: string
    bundesland: string
    kostentraegerIk?: string
    invoiceIds?: string[]
  },
): Promise<PreFlightErgebnis> {
  const start = Date.now()
  const pruefpunkte: PreFlightPruefpunkt[] = []

  // 1. Anerkennungsstatus prüfen
  const { data: stateSettings } = await supabase
    .from('state_settings')
    .select('status, insurance_enabled, kassenrechnung_enabled, dakota_export_enabled, approval_document')
    .eq('organization_id', params.organizationId)
    .eq('bundesland', params.bundesland)
    .single()

  pruefpunkte.push({
    id: 'anerkennung',
    label: 'Anerkennungsstatus',
    bestanden: stateSettings?.status === 'ANERKANNT',
    pflicht: true,
    details: stateSettings?.status === 'ANERKANNT'
      ? 'Anerkennung vorhanden'
      : `Status: ${stateSettings?.status ?? 'nicht gefunden'} — ANERKANNT erforderlich`,
  })

  // 2. Kassenabrechnung freigeschaltet
  pruefpunkte.push({
    id: 'kassenrechnung',
    label: 'Kassenabrechnung freigeschaltet',
    bestanden: !!stateSettings?.kassenrechnung_enabled,
    pflicht: true,
    details: stateSettings?.kassenrechnung_enabled
      ? 'Kassenabrechnung aktiv'
      : 'Kassenabrechnung für dieses Bundesland nicht freigeschaltet',
  })

  // 3. Anerkennungsbescheid vorhanden
  pruefpunkte.push({
    id: 'bescheid',
    label: 'Anerkennungsbescheid hinterlegt',
    bestanden: !!stateSettings?.approval_document,
    pflicht: true,
    details: stateSettings?.approval_document
      ? 'Bescheid vorhanden'
      : 'Kein Anerkennungsbescheid hinterlegt',
  })

  // 4. Gültige, verifizierte Tarife vorhanden (fail-closed: tarif_status muss 'verified' sein)
  const { count: tarifCount } = await supabase
    .from('billing_tariffs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', params.organizationId)
    .eq('bundesland', params.bundesland)
    .eq('ist_aktiv', true)
    .eq('tarif_status', 'verified')
    .lte('gueltig_ab', params.abrechnungsmonat.slice(0, 7) + '-01')
    .or(`gueltig_bis.is.null,gueltig_bis.gte.${params.abrechnungsmonat.slice(0, 7)}-01`)

  pruefpunkte.push({
    id: 'tarife',
    label: 'Gültige Kassentarife',
    bestanden: (tarifCount ?? 0) > 0,
    pflicht: true,
    details: `${tarifCount ?? 0} verifizierte Tarife für ${params.bundesland}`,
  })

  // 5. Kostenträger konfiguriert (wenn spezifisch angegeben)
  if (params.kostentraegerIk) {
    const ikValid = validateIK(params.kostentraegerIk)
    pruefpunkte.push({
      id: 'kostentraeger_ik',
      label: 'Kostenträger-IK gültig',
      bestanden: ikValid,
      pflicht: true,
      details: ikValid
        ? `IK ${params.kostentraegerIk} — Prüfziffer korrekt`
        : `IK ${params.kostentraegerIk} — Prüfziffer ungültig`,
    })
  }

  // 6. Rechnungen vorhanden und freigegeben
  let invoiceQuery = supabase
    .from('invoices')
    .select('id, status, client_id, total_amount, invoice_number_formatted, frozen_at', { count: 'exact' })
    .eq('organization_id', params.organizationId)
    .gte('period_start', monatsGrenzen(params.abrechnungsmonat).von)
    .lte('period_start', monatsGrenzen(params.abrechnungsmonat).bis)
    .in('status', ['freigegeben', 'uebermittelt', 'erneut_eingereicht'])
    .is('deleted_at', null)

  if (params.invoiceIds?.length) {
    invoiceQuery = invoiceQuery.in('id', params.invoiceIds)
  }
  if (params.kostentraegerIk) {
    invoiceQuery = invoiceQuery.eq('billing_type', 'kasse')
  }

  const { data: rechnungen, count: rechnungCount } = await invoiceQuery

  pruefpunkte.push({
    id: 'rechnungen',
    label: 'Freigegebene Rechnungen',
    bestanden: (rechnungCount ?? 0) > 0,
    pflicht: true,
    details: `${rechnungCount ?? 0} Rechnungen im Status "freigegeben"`,
  })

  // 7. Alle Rechnungen festgeschrieben (frozen_at)
  const nichtFestgeschrieben = rechnungen?.filter(r => !r.frozen_at) ?? []
  pruefpunkte.push({
    id: 'festschreibung',
    label: 'Alle Rechnungen festgeschrieben',
    bestanden: nichtFestgeschrieben.length === 0,
    pflicht: true,
    details: nichtFestgeschrieben.length === 0
      ? 'Alle Rechnungen festgeschrieben'
      : `${nichtFestgeschrieben.length} Rechnungen noch nicht festgeschrieben`,
  })

  // 8. Kunden-Versicherungsdaten vollständig
  if (rechnungen?.length) {
    const clientIds = [...new Set(rechnungen.map(r => r.client_id))]
    const { data: clients } = await supabase
      .from('clients')
      .select('id, versichertennummer, geburtsdatum, first_name, last_name, care_level, pflegegrad')
      .in('id', clientIds)

    const unvollstaendig = clients?.filter(c =>
      !c.versichertennummer || !c.geburtsdatum || !c.last_name || !c.first_name,
    ) ?? []

    pruefpunkte.push({
      id: 'kundendaten',
      label: 'Versicherungsdaten vollständig',
      bestanden: unvollstaendig.length === 0,
      pflicht: true,
      details: unvollstaendig.length === 0
        ? `${clientIds.length} Kunden geprüft — alle vollständig`
        : `${unvollstaendig.length} Kunden mit fehlenden Daten: ${unvollstaendig.map(c => c.last_name || c.id).join(', ')}`,
    })

    // care_level ist die führende Spalte — siehe lib/clients/pflegegrad.ts.
    const ohnePflegegrad = clients?.filter(c => pflegegradVon(c) === null) ?? []
    pruefpunkte.push({
      id: 'pflegegrad',
      label: 'Pflegegrad vorhanden',
      bestanden: ohnePflegegrad.length === 0,
      pflicht: false,
      details: ohnePflegegrad.length === 0
        ? 'Alle Kunden haben einen Pflegegrad'
        : `${ohnePflegegrad.length} Kunden ohne Pflegegrad`,
    })
  }

  // 9. Leistungsnachweise signiert
  if (rechnungen?.length) {
    const periodMonth = params.abrechnungsmonat.slice(0, 7)
    const pfStart = `${periodMonth}-01`
    const pfLastDay = new Date(Number(periodMonth.slice(0, 4)), Number(periodMonth.slice(5, 7)), 0).getDate()
    const pfEnd = `${periodMonth}-${String(pfLastDay).padStart(2, '0')}`
    const { count: unsignedCount } = await supabase
      .from('service_records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', params.organizationId)
      .gte('date', pfStart)
      .lte('date', pfEnd)
      .in('proof_status', ['ENTWURF', 'ABGESCHLOSSEN'])

    pruefpunkte.push({
      id: 'signaturen',
      label: 'Leistungsnachweise signiert',
      bestanden: (unsignedCount ?? 0) === 0,
      pflicht: true,
      details: (unsignedCount ?? 0) === 0
        ? 'Alle Leistungsnachweise signiert'
        : `${unsignedCount} Leistungsnachweise ohne Signatur`,
    })
  }

  // 10. Keine Doppelabrechnung
  const { data: bestehendelaeufe } = await supabase
    .from('abrechnungslaeufe')
    .select('id, status, kostentraeger_ik')
    .eq('organization_id', params.organizationId)
    .eq('abrechnungsmonat', params.abrechnungsmonat)
    .eq('lauf_typ', 'erstabrechnung')
    .not('status', 'in', '("storniert","abgelehnt")')
    .is('deleted_at', null)

  const doppelt = params.kostentraegerIk
    ? bestehendelaeufe?.filter(l => l.kostentraeger_ik === params.kostentraegerIk) ?? []
    : bestehendelaeufe ?? []

  pruefpunkte.push({
    id: 'doppelabrechnung',
    label: 'Keine Doppelabrechnung',
    bestanden: doppelt.length === 0,
    pflicht: true,
    details: doppelt.length === 0
      ? 'Kein aktiver Erstlauf für diesen Zeitraum'
      : `${doppelt.length} bestehende(r) Lauf/Läufe gefunden — Erstabrechnung bereits vorhanden`,
  })

  // 11. DAKOTA-Export freigeschaltet (Warnung, nicht Pflicht)
  pruefpunkte.push({
    id: 'dakota',
    label: 'DAKOTA-Export freigeschaltet',
    bestanden: !!stateSettings?.dakota_export_enabled,
    pflicht: false,
    details: stateSettings?.dakota_export_enabled
      ? 'DAKOTA-Export aktiv'
      : 'DAKOTA-Export nicht freigeschaltet — Export möglich, Übermittlung gesperrt',
  })

  // 12. SECON-Zertifikat gültig (Absender)
  // organization_id ist zwingend: ohne den Filter bestand dieser Pruefpunkt,
  // sobald IRGENDEINE Organisation ein gueltiges Absenderzertifikat hatte.
  // Eine Org ohne eigenes Zertifikat waere damit in den Versand gelaufen.
  const { data: absenderZert } = await supabase
    .from('abrechnung_zertifikate')
    .select('gueltig_bis')
    .eq('organization_id', params.organizationId)
    .eq('typ', 'absender')
    .order('gueltig_bis', { ascending: false })
    .limit(1)
    .maybeSingle()

  const absenderGueltig = absenderZert?.gueltig_bis
    ? new Date(absenderZert.gueltig_bis) > new Date()
    : false

  pruefpunkte.push({
    id: 'secon_absender',
    label: 'SECON-Absenderzertifikat gültig',
    bestanden: absenderGueltig,
    // Pflicht statt Warnung: ohne gueltiges Absenderzertifikat laesst sich
    // keine SECON-Lieferung erzeugen. Als blosse Warnung meldete der
    // Pre-Flight "bestanden" fuer einen Lauf, der niemals versendbar ist.
    pflicht: true,
    details: absenderZert?.gueltig_bis
      ? absenderGueltig
        ? `Gültig bis ${new Date(absenderZert.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`
        : `ABGELAUFEN am ${new Date(absenderZert.gueltig_bis).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} — beim ITSG Trust Center verlängern`
      : 'Kein Absenderzertifikat hinterlegt — EXTERNE KONFIGURATION ERFORDERLICH (ITSG Trust Center)',
  })

  // 13. SFTP-Konfiguration vorhanden (mindestens eine aktive Datenannahmestelle mit SFTP)
  // Ebenfalls org-gefiltert — sonst zaehlten fremde Annahmestellen als
  // eigene Transportkonfiguration. `organization_id.is.null` bleibt zulaessig:
  // so sind global gepflegte Annahmestellen (ITSCare, BITMARCK) fuer alle
  // Mandanten nutzbar, ohne dass Mandanten sich gegenseitig sehen.
  const { data: aktiveDas, count: dasCount } = await supabase
    .from('datenannahmestellen')
    .select('id, name, sftp_host, sftp_user, sftp_key_url, zustaendig_fuer', { count: 'exact' })
    .eq('aktiv', true)
    .or(`organization_id.eq.${params.organizationId},organization_id.is.null`)

  const konfiguriert = aktiveDas?.filter(d => d.sftp_host && d.sftp_user) ?? []
  const mitKey = konfiguriert.filter(d => d.sftp_key_url)

  pruefpunkte.push({
    id: 'sftp_config',
    label: 'SFTP-Transportkonfiguration',
    bestanden: konfiguriert.length > 0,
    // Pflicht: ohne Transportweg gibt es keinen Empfaenger.
    pflicht: true,
    details: konfiguriert.length > 0
      ? `${konfiguriert.length} Datenannahmestelle(n) mit SFTP konfiguriert (${mitKey.length} mit SSH-Key)`
      : (dasCount ?? 0) === 0
        ? 'Keine Datenannahmestellen angelegt — EXTERNE KONFIGURATION ERFORDERLICH'
        : 'Keine Datenannahmestelle hat vollständige SFTP-Daten (Host + User)',
  })

  // 14. Routing eindeutig (Kostenträger → Datenannahmestelle zugeordnet)
  if (params.kostentraegerIk && aktiveDas?.length) {
    const zustaendig = aktiveDas.filter(d =>
      Array.isArray(d.zustaendig_fuer) && d.zustaendig_fuer.includes(params.kostentraegerIk!)
    )
    pruefpunkte.push({
      id: 'routing',
      label: 'Kostenträger-Routing eindeutig',
      bestanden: zustaendig.length === 1,
      // Pflicht: ein mehrdeutiges oder fehlendes Routing bedeutet Lieferung
      // an die falsche oder an gar keine Annahmestelle.
      pflicht: true,
      details: zustaendig.length === 1
        ? `Kostenträger ${params.kostentraegerIk} → ${zustaendig[0].name}`
        : zustaendig.length === 0
          ? `Kein Routing für IK ${params.kostentraegerIk} — Datenannahmestelle in Einstellungen zuweisen`
          : `Mehrere Annahmestellen für IK ${params.kostentraegerIk}: ${zustaendig.map(d => d.name).join(', ')} — Zuordnung prüfen`,
    })
  }

  const fehler = pruefpunkte.filter(p => !p.bestanden && p.pflicht)
  const warnungen = pruefpunkte.filter(p => !p.bestanden && !p.pflicht)

  return {
    bestanden: fehler.length === 0,
    fehler,
    warnungen,
    alle: pruefpunkte,
    dauer_ms: Date.now() - start,
  }
}

// ── Lauf erstellen ──────────────────────────────────────────────

export async function erstelleAbrechnungslauf(
  supabase: SupabaseClient,
  params: LaufErstellungParams,
): Promise<LaufErstellungErgebnis> {
  const validierung = await preFlightValidierung(supabase, {
    organizationId: params.organizationId,
    abrechnungsmonat: params.abrechnungsmonat,
    bundesland: params.bundesland,
    kostentraegerIk: params.kostentraegerIk,
  })

  if (!validierung.bestanden) {
    const validierungId = crypto.randomUUID()
    await supabase.from('dta_validierungen').insert({
      id: validierungId,
      organization_id: params.organizationId,
      lauf_id: null as unknown as string,
      validiert_von: params.actorId,
      bestanden: false,
      fehler_anzahl: validierung.fehler.length,
      warnungen_anzahl: validierung.warnungen.length,
      ergebnis: validierung.alle,
      pruefpunkte: { fehler: validierung.fehler, warnungen: validierung.warnungen },
      dauer_ms: validierung.dauer_ms,
    })

    return {
      laufId: '',
      status: 'validierung_fehlgeschlagen' as LaufStatus,
      rechnungenAnzahl: 0,
      gesamtbetragCent: 0,
      validierung,
    }
  }

  // Rechnungen für den Lauf holen
  let rechnungenQuery = supabase
    .from('invoices')
    .select('id, client_id, total_amount, invoice_number_formatted, billing_type')
    .eq('organization_id', params.organizationId)
    .gte('period_start', monatsGrenzen(params.abrechnungsmonat).von)
    .lte('period_start', monatsGrenzen(params.abrechnungsmonat).bis)
    .in('status', ['freigegeben', 'erneut_eingereicht'])
    .is('deleted_at', null)

  if (params.kostentraegerIk) {
    rechnungenQuery = rechnungenQuery.eq('billing_type', 'kasse')
  }

  const { data: rechnungen } = await rechnungenQuery

  if (!rechnungen?.length) {
    return {
      laufId: '',
      status: 'validierung_fehlgeschlagen' as LaufStatus,
      rechnungenAnzahl: 0,
      gesamtbetragCent: 0,
      validierung: {
        ...validierung,
        bestanden: false,
        fehler: [{ id: 'keine_rechnungen', label: 'Keine Rechnungen', bestanden: false, pflicht: true, details: 'Keine freigegebenen Rechnungen gefunden' }],
      },
    }
  }

  const gesamtCent = rechnungen.reduce((s, r) => s + euroZuCent(r.total_amount), 0)

  // Idempotency key prevents duplicate runs from concurrent requests
  const idempotencyKey = `${params.organizationId}_${params.abrechnungsmonat}_${params.kostentraegerIk || 'SAMMEL'}_${params.laufTyp || 'erstabrechnung'}`

  // Lauf anlegen
  const { data: lauf, error: laufError } = await supabase
    .from('abrechnungslaeufe')
    .insert({
      organization_id: params.organizationId,
      abrechnungsmonat: params.abrechnungsmonat,
      kostentraeger_ik: params.kostentraegerIk || 'SAMMEL',
      kostentraeger_name: params.kostentraegerIk ? undefined : 'Sammelabrechnung',
      bundesland: params.bundesland,
      lauf_typ: params.laufTyp || 'erstabrechnung',
      korrektur_von: params.korrekturVon || null,
      status: 'erstellt',
      anzahl_faelle: rechnungen.length,
      anzahl_positionen: 0,
      gesamtbetrag_cent: gesamtCent,
      created_by: params.actorId,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  if (laufError || !lauf) {
    // Unique constraint violation → duplicate concurrent request
    if (laufError?.code === '23505') {
      throw new Error(
        `Abrechnungslauf fuer ${params.abrechnungsmonat} / ${params.kostentraegerIk || 'SAMMEL'} wird bereits erstellt — bitte warten.`
      )
    }
    throw new Error(`Lauf konnte nicht erstellt werden: ${laufError?.message}`)
  }

  // Post-insert race check: if pre-flight passed but a concurrent request
  // inserted between our check and our insert, detect the duplicate now
  const { count: concurrentCount } = await supabase
    .from('abrechnungslaeufe')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', params.organizationId)
    .eq('abrechnungsmonat', params.abrechnungsmonat)
    .eq('lauf_typ', params.laufTyp || 'erstabrechnung')
    .eq('kostentraeger_ik', params.kostentraegerIk || 'SAMMEL')
    .not('status', 'in', '("storniert","abgelehnt")')
    .is('deleted_at', null)

  if ((concurrentCount ?? 0) > 1) {
    await supabase
      .from('abrechnungslaeufe')
      .update({ status: 'storniert', storno_grund: 'Duplikat durch parallelen Request' })
      .eq('id', lauf.id)
    throw new Error(
      `Doppelter Abrechnungslauf erkannt — paralleler Request hat bereits einen Lauf erstellt. Dieser wurde storniert.`
    )
  }

  // Rechnungen verknüpfen
  const verknuepfungen = rechnungen.map((r, i) => ({
    organization_id: params.organizationId,
    lauf_id: lauf.id,
    invoice_id: r.id,
    position_im_lauf: i + 1,
    betrag_cent: euroZuCent(r.total_amount),
    status: 'inkludiert',
  }))

  await supabase.from('dta_lauf_rechnungen').insert(verknuepfungen)

  // Validierung speichern
  await supabase.from('dta_validierungen').insert({
    organization_id: params.organizationId,
    lauf_id: lauf.id,
    validiert_von: params.actorId,
    bestanden: true,
    fehler_anzahl: 0,
    warnungen_anzahl: validierung.warnungen.length,
    ergebnis: validierung.alle,
    pruefpunkte: { warnungen: validierung.warnungen },
    dauer_ms: validierung.dauer_ms,
  })

  // Status → geprueft
  await supabase
    .from('abrechnungslaeufe')
    .update({ status: 'validierung_laeuft' })
    .eq('id', lauf.id)

  await supabase
    .from('abrechnungslaeufe')
    .update({
      status: 'geprueft',
      validierung_bestanden: true,
      validierung_ergebnis: validierung.alle,
    })
    .eq('id', lauf.id)

  // Audit
  await logBillingAction(supabase, {
    entityType: 'dta_lauf',
    organizationId: params.organizationId,
    entityId: lauf.id,
    action: 'lauf_erstellt',
    newState: {
      abrechnungsmonat: params.abrechnungsmonat,
      bundesland: params.bundesland,
      lauf_typ: params.laufTyp || 'erstabrechnung',
      rechnungen: rechnungen.length,
      betrag_cent: gesamtCent,
    },
    actorId: params.actorId,
  })

  return {
    laufId: lauf.id,
    status: 'geprueft',
    rechnungenAnzahl: rechnungen.length,
    gesamtbetragCent: gesamtCent,
    validierung,
  }
}

// ── Lauf freigeben ──────────────────────────────────────────────

export async function gebeLaufFrei(
  supabase: SupabaseClient,
  laufId: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let query = supabase
    .from('abrechnungslaeufe')
    .update({
      status: 'freigegeben',
      freigegeben_von: actorId,
      freigegeben_am: new Date().toISOString(),
    })
    .eq('id', laufId)
  if (organizationId) query = query.eq('organization_id', organizationId)

  // `.select()` statt blindem Update: ohne Rueckgabe war ein Aufruf mit
  // fremder organizationId ein stiller No-Op mit trotzdem geschriebenem
  // Audit-Eintrag "freigegeben".
  const { data: freigegeben } = await query.select('id, organization_id').maybeSingle()
  if (!freigegeben) {
    throw new Error('Abrechnungslauf nicht gefunden oder gehört zu einer anderen Organisation')
  }

  await logBillingAction(supabase, {
    entityType: 'dta_lauf',
    organizationId: freigegeben.organization_id,
    entityId: laufId,
    action: 'lauf_freigegeben',
    actorId,
  })
}

// ── Export durchführen ───────────────────────────────────────────

export async function exportiereLauf(
  supabase: SupabaseClient,
  laufId: string,
  absenderIk: string,
  actorId: string,
  organizationId?: string,
): Promise<ExportErgebnis> {
  // Lauf laden
  let laufQuery = supabase
    .from('abrechnungslaeufe')
    .select('*')
    .eq('id', laufId)
  if (organizationId) laufQuery = laufQuery.eq('organization_id', organizationId)
  const { data: lauf } = await laufQuery.single()

  if (!lauf) throw new Error('Lauf nicht gefunden')
  if (lauf.status !== 'freigegeben') {
    throw new Error(`Lauf ist im Status "${lauf.status}" — Export nur aus "freigegeben" möglich`)
  }

  // Status → export_laeuft
  await supabase
    .from('abrechnungslaeufe')
    .update({ status: 'export_laeuft' })
    .eq('id', laufId)

  // Rechnungen + Kunden + Leistungen laden
  const { data: laufRechnungen } = await supabase
    .from('dta_lauf_rechnungen')
    .select('invoice_id, betrag_cent')
    .eq('lauf_id', laufId)
    .order('position_im_lauf')

  if (!laufRechnungen?.length) {
    throw new Error('Keine Rechnungen im Lauf')
  }

  const invoiceIds = laufRechnungen.map(lr => lr.invoice_id)

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, client_id, invoice_number_formatted, total_amount, period_start, period_end')
    .in('id', invoiceIds)

  if (!invoices?.length) throw new Error('Rechnungsdaten nicht gefunden')

  const clientIds = [...new Set(invoices.map(i => i.client_id))]
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, versichertennummer, geburtsdatum, care_level, pflegegrad, pflegekasse_ik, address, city, zip_code')
    .in('id', clientIds)

  const clientMap = new Map(clients?.map(c => [c.id, c]) ?? [])

  // Kostentraeger-Daten aus Verordnungen laden (clients hat kein kostentraeger_ik)
  const { data: verordnungen } = await supabase
    .from('verordnungen')
    .select('id, client_id, kostentraeger_ik_nummer, kostentraeger_name')
    .in('client_id', clientIds)
    .eq('genehmigung_status', 'genehmigt')

  const kostentraegerByClient = new Map<string, { ik: string; name: string }>()
  for (const v of verordnungen ?? []) {
    if (v.kostentraeger_ik_nummer && !kostentraegerByClient.has(v.client_id)) {
      kostentraegerByClient.set(v.client_id, {
        ik: v.kostentraeger_ik_nummer,
        name: v.kostentraeger_name || '',
      })
    }
  }

  // Kostentraeger-Daten auch aus Rechnungen als Fallback
  for (const inv of invoices) {
    if (!kostentraegerByClient.has(inv.client_id)) {
      const { data: invDetail } = await supabase
        .from('invoices')
        .select('kostentraeger_ik, kostentraeger_name')
        .eq('id', inv.id)
        .single()
      if (invDetail?.kostentraeger_ik) {
        kostentraegerByClient.set(inv.client_id, {
          ik: invDetail.kostentraeger_ik,
          name: invDetail.kostentraeger_name || '',
        })
      }
    }
  }

  // Service Records fuer den Monat laden
  const exportPeriodMonth = lauf.abrechnungsmonat.slice(0, 7)
  const expStart = `${exportPeriodMonth}-01`
  const expLastDay = new Date(
    Number(exportPeriodMonth.slice(0, 4)),
    Number(exportPeriodMonth.slice(5, 7)),
    0,
  ).getDate()
  const expEnd = `${exportPeriodMonth}-${String(expLastDay).padStart(2, '0')}`
  const { data: records } = await supabase
    .from('service_records')
    .select('id, client_id, date, service_type, duration_minutes, amount, caregiver_id, caregiver:caregivers(first_name, last_name)')
    .in('client_id', clientIds)
    .gte('date', expStart)
    .lte('date', expEnd)
    .in('status', ['complete', 'signed', 'invoiced'])

  // AbrechnungsFall-Objekte aufbauen
  const faelleMap = new Map<string, AbrechnungsFall>()
  for (const inv of invoices) {
    const client = clientMap.get(inv.client_id)
    if (!client) continue

    const kt = kostentraegerByClient.get(inv.client_id)
    const clientRecords = records?.filter((r: any) => r.client_id === inv.client_id) ?? []
    const leistungen = clientRecords.map((r: any) => {
      const menge = (r.duration_minutes ?? 60) / 60
      const gesamtCent = euroZuCent(r.amount)
      const einzelpreisCent = menge > 0 ? Math.round(gesamtCent / menge) : gesamtCent
      return {
        datum: r.date,
        leistungsart: r.service_type || 'alltagsbegleitung_45a',
        menge,
        einzelpreis_cent: einzelpreisCent,
        uhrzeit: undefined,
        dauer_minuten: r.duration_minutes ?? 60,
        pflegekraft_name: r.caregiver
          ? `${r.caregiver.first_name || ''} ${r.caregiver.last_name || ''}`.trim()
          : 'Alltagsengel',
      }
    })

    const kostentraegerIk = kt?.ik || client.pflegekasse_ik || ''
    const key = `${inv.client_id}_${kostentraegerIk || 'UNBEKANNT'}`
    if (!faelleMap.has(key)) {
      faelleMap.set(key, {
        verordnung_id: inv.id,
        client: {
          versichertennummer: client.versichertennummer || '',
          geburtsdatum: client.geburtsdatum || '',
          nachname: client.last_name || '',
          vorname: client.first_name || '',
          pflegegrad: pflegegradVon(client) ?? 0,
          strasse: client.address,
          plz: client.zip_code,
          ort: client.city,
        },
        kostentraeger: {
          ik_nummer: kostentraegerIk,
          pflegekasse_ik: client.pflegekasse_ik || kostentraegerIk,
          name: kt?.name || '',
        },
        leistungen: [],
        abrechnungsmonat: lauf.abrechnungsmonat.replace('-', ''),
      })
    }
    faelleMap.get(key)!.leistungen.push(...leistungen)
  }

  const faelle = [...faelleMap.values()]

  // Org-Name fuer EDIFACT NAM-Segment aus DB laden
  let absenderName = 'Alltagsengel UG'
  if (lauf.organization_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', lauf.organization_id)
      .single()
    if (org?.name) absenderName = org.name
  }

  // Dateiindikator: '0' = Testdatei, '2' = Echtdatei. Bis hierher stand '2'
  // hartkodiert — jede erzeugte Datei behauptete Echtabrechnung, auch vor der
  // ersten mit der Annahmestelle abgesprochenen Testübertragung. Der Wert
  // kommt jetzt aus dem Betriebsmodus des Kanals und ist ohne ausdrückliche,
  // belegte Umschaltung '0'.
  const dateiindikator = lauf.organization_id
    ? await dateiindikatorFuer(supabase, lauf.organization_id, 'sftp_105')
    : '0'

  // EDIFACT generieren
  const optionen: GeneratorOptionen = {
    bundesland: lauf.bundesland,
    absender_name: absenderName,
    dateiindikator,
  }

  let dateien: EdifactDatei[]
  try {
    dateien = generateAlleDateien(faelle, absenderIk, optionen)
  } catch (err) {
    // Status zurück auf Fehler
    await supabase
      .from('abrechnungslaeufe')
      .update({ status: 'validierung_fehlgeschlagen' })
      .eq('id', laufId)

    await supabase.from('dta_fehlerprotokoll').insert({
      organization_id: lauf.organization_id,
      lauf_id: laufId,
      fehler_quelle: 'export',
      fehler_kategorie: 'technisch',
      fehler_meldung: (err as Error).message,
      schweregrad: 'kritisch',
    })

    throw err
  }

  // EDIFACT validieren
  for (const datei of dateien) {
    const validierung = validateEDIFACT(datei.inhalt)
    if (!validierung.ok) {
      await supabase.from('dta_fehlerprotokoll').insert({
        organization_id: lauf.organization_id,
        lauf_id: laufId,
        fehler_quelle: 'validierung',
        fehler_kategorie: 'format',
        fehler_meldung: `EDIFACT-Validierung fehlgeschlagen: ${validierung.fehler.map(f => f.meldung).join('; ')}`,
        schweregrad: 'kritisch',
      })

      await supabase
        .from('abrechnungslaeufe')
        .update({ status: 'validierung_fehlgeschlagen' })
        .eq('id', laufId)

      throw new Error(`EDIFACT-Validierungsfehler: ${validierung.fehler[0]?.meldung}`)
    }
  }

  // Dateien in Storage speichern
  const dateiUrls: string[] = []
  for (const datei of dateien) {
    const path = `dta/${lauf.organization_id}/${laufId}/${datei.physikalischer_dateiname}`
    const { error: uploadErr } = await supabase.storage
      .from('abrechnung')
      .upload(path, new Blob([encodeToLatin1(datei.inhalt)], { type: 'application/octet-stream' }), { upsert: true })

    if (uploadErr) {
      dateiUrls.push(`UPLOAD_FEHLER:${path}`)
    } else {
      dateiUrls.push(path)
    }
  }

  // Hashes berechnen
  const contentHash = await computeContentHash({
    dateien: dateien.map(d => d.logischer_dateiname),
    betrag: dateien.reduce((s, d) => s + d.gesamtbetrag_cent, 0),
    nachrichten: dateien.reduce((s, d) => s + d.anzahl_nachrichten, 0),
  })

  // DAKOTA-Aufträge erstellen (Status: bereit_zur_uebermittlung oder externer_zugang_fehlt)
  const dakotaAuftraege: string[] = []
  for (let i = 0; i < dateien.length; i++) {
    const datei = dateien[i]

    // Auftragsdatei generieren.
    // `test` MUSS am Dateiindikator der Nutzdaten haengen: bis hierher stand
    // in der Auftragsdatei immer die Verfahrenskennung "EPFL0" (Echtlieferung),
    // waehrend die Nutzdatendatei bei Indikator '0' als "TPFL0nnn" erzeugt
    // wurde. Die Annahmestelle haette eine Testlieferung als Echtabrechnung
    // angekuendigt bekommen — und die Nutzdaten dazu passend nicht gefunden.
    const istTestlieferung = dateiindikator === '0'
    const auftragsdateiInhalt = generateAuftragsdatei({
      absender_ik: absenderIk,
      datenannahmestelle_ik: datei.datenannahmestelle.ik,
      dateiname: datei.logischer_dateiname,
      dateigroesse_nutzdaten: byteLaengeLatin1(datei.inhalt),
      test: istTestlieferung,
      transfer_nummer: i + 1,
      // Art der abgegebenen Leistung der ersten Rechnung dieser Datei — je
      // Nutzdatendatei ist laut TA1 nur eine Leistungsart zulaessig.
      leistungsart: datei.rechnungen[0]?.leistungsart,
      physikalischer_dateiname: datei.physikalischer_dateiname,
    })

    const auftragsPath = `dta/${lauf.organization_id}/${laufId}/${auftragsdateiName(datei.physikalischer_dateiname)}`
    await supabase.storage
      .from('abrechnung')
      .upload(auftragsPath, new Blob([encodeToLatin1(auftragsdateiInhalt)], { type: 'application/octet-stream' }), { upsert: true })

    // Prüfen ob DAKOTA-Zugang existiert (Datenannahmestelle mit SFTP-Config)
    const { data: annahmestelle } = await supabase
      .from('datenannahmestellen')
      .select('id, sftp_host, sftp_user')
      .eq('ik_nummer', datei.datenannahmestelle.ik)
      .eq('aktiv', true)
      .maybeSingle()

    const hatZugang = !!(annahmestelle?.sftp_host && annahmestelle?.sftp_user)

    const { data: auftrag } = await supabase
      .from('dta_dakota_auftraege')
      .insert({
        organization_id: lauf.organization_id,
        lauf_id: laufId,
        datenannahmestelle_id: annahmestelle?.id || null,
        empfaenger_ik: datei.datenannahmestelle.ik,
        absender_ik: absenderIk,
        logischer_dateiname: datei.logischer_dateiname,
        physikalischer_dateiname: datei.physikalischer_dateiname,
        nutzdaten_url: dateiUrls[i],
        auftragsdatei_url: auftragsPath,
        nutzdaten_groesse_bytes: byteLaengeLatin1(datei.inhalt),
        status: hatZugang ? 'bereit_zur_uebermittlung' : 'externer_zugang_fehlt',
      })
      .select('id')
      .single()

    if (auftrag) dakotaAuftraege.push(auftrag.id)
  }

  // Lauf aktualisieren
  const finalStatus: LaufStatus = dakotaAuftraege.length > 0
    ? 'exportiert'
    : 'validierung_fehlgeschlagen'

  await supabase
    .from('abrechnungslaeufe')
    .update({
      status: 'bereit_zum_export',
    })
    .eq('id', laufId)

  await supabase
    .from('abrechnungslaeufe')
    .update({
      status: finalStatus,
      edifact_datei_url: dateiUrls[0] || null,
      auftragsdatei_url: dakotaAuftraege.length > 0 ? `${dakotaAuftraege.length} Aufträge erstellt` : null,
      export_datei_hash: contentHash,
      pruefsumme: contentHash,
      anzahl_positionen: dateien.reduce((s, d) => s + d.rechnungen.reduce((rs, r) => rs + r.faelle.length, 0), 0),
      dakota_auftrag_id: dakotaAuftraege[0] || null,
    })
    .eq('id', laufId)

  // Audit
  await logBillingAction(supabase, {
    entityType: 'dta_lauf',
    organizationId: lauf.organization_id,
    entityId: laufId,
    action: 'lauf_exportiert',
    newState: {
      dateien: dateien.length,
      dakota_auftraege: dakotaAuftraege.length,
      gesamt_cent: dateien.reduce((s, d) => s + d.gesamtbetrag_cent, 0),
      hash: contentHash,
    },
    actorId,
  })

  return {
    laufId,
    dateien,
    dakotaAuftraege,
    status: finalStatus,
  }
}

// ── Lauf stornieren ─────────────────────────────────────────────

export async function storniereLauf(
  supabase: SupabaseClient,
  laufId: string,
  grund: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let stornoQuery = supabase
    .from('abrechnungslaeufe')
    .select('status, organization_id')
    .eq('id', laufId)
  if (organizationId) stornoQuery = stornoQuery.eq('organization_id', organizationId)
  const { data: lauf } = await stornoQuery.single()

  if (!lauf) throw new Error('Lauf nicht gefunden')

  const stornierbareStatus: LaufStatus[] = [
    'erstellt', 'validierung_fehlgeschlagen', 'geprueft',
    'freigegeben', 'bereit_zum_export', 'exportiert', 'bereit_zur_uebermittlung',
  ]

  if (!stornierbareStatus.includes(lauf.status as LaufStatus)) {
    throw new Error(`Lauf im Status "${lauf.status}" kann nicht storniert werden`)
  }

  let stornoUpdate = supabase
    .from('abrechnungslaeufe')
    .update({
      status: 'storniert',
      storniert_am: new Date().toISOString(),
      storniert_von: actorId,
      storno_grund: grund,
    })
    .eq('id', laufId)
  if (organizationId) stornoUpdate = stornoUpdate.eq('organization_id', organizationId)
  await stornoUpdate

  await logBillingAction(supabase, {
    entityType: 'dta_lauf',
    organizationId: lauf.organization_id,
    entityId: laufId,
    action: 'lauf_storniert',
    previousState: { status: lauf.status },
    newState: { status: 'storniert', grund },
    reason: grund,
    actorId,
  })
}

// ── Dashboard-Daten ─────────────────────────────────────────────

export interface DtaDashboardData {
  laeufe_gesamt: number
  laeufe_offen: number
  laeufe_bereit: number
  laeufe_in_uebermittlung: number
  laeufe_angenommen: number
  laeufe_probleme: number
  laeufe_abgeschlossen: number
  gesamt_cent: number
  angenommen_cent: number
  offene_fehler: number
  offene_ruecklaeufer: number
}

export async function holeDtaDashboard(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<DtaDashboardData> {
  const { data } = await supabase
    .from('dta_dashboard')
    .select('*')
    .eq('organization_id', organizationId)

  if (!data?.length) {
    return {
      laeufe_gesamt: 0, laeufe_offen: 0, laeufe_bereit: 0,
      laeufe_in_uebermittlung: 0, laeufe_angenommen: 0,
      laeufe_probleme: 0, laeufe_abgeschlossen: 0,
      gesamt_cent: 0, angenommen_cent: 0,
      offene_fehler: 0, offene_ruecklaeufer: 0,
    }
  }

  return data.reduce((sum, row) => ({
    laeufe_gesamt: sum.laeufe_gesamt + (row.laeufe_gesamt ?? 0),
    laeufe_offen: sum.laeufe_offen + (row.laeufe_offen ?? 0),
    laeufe_bereit: sum.laeufe_bereit + (row.laeufe_bereit ?? 0),
    laeufe_in_uebermittlung: sum.laeufe_in_uebermittlung + (row.laeufe_in_uebermittlung ?? 0),
    laeufe_angenommen: sum.laeufe_angenommen + (row.laeufe_angenommen ?? 0),
    laeufe_probleme: sum.laeufe_probleme + (row.laeufe_probleme ?? 0),
    laeufe_abgeschlossen: sum.laeufe_abgeschlossen + (row.laeufe_abgeschlossen ?? 0),
    gesamt_cent: sum.gesamt_cent + (row.gesamt_cent ?? 0),
    angenommen_cent: sum.angenommen_cent + (row.angenommen_cent ?? 0),
    offene_fehler: sum.offene_fehler + (row.offene_fehler ?? 0),
    offene_ruecklaeufer: sum.offene_ruecklaeufer + (row.offene_ruecklaeufer ?? 0),
  }), {
    laeufe_gesamt: 0, laeufe_offen: 0, laeufe_bereit: 0,
    laeufe_in_uebermittlung: 0, laeufe_angenommen: 0,
    laeufe_probleme: 0, laeufe_abgeschlossen: 0,
    gesamt_cent: 0, angenommen_cent: 0,
    offene_fehler: 0, offene_ruecklaeufer: 0,
  })
}
