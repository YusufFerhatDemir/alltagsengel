/**
 * Stammdatenpflege für die Kassenabrechnung.
 *
 * Deckt die drei Tabellen ab, ohne die kein Echtbetrieb möglich ist:
 *   - `dta_kostentraeger`      — Kassen mit IK, Kassenart, Abrechnungsweg
 *   - `datenannahmestellen`    — Empfänger der DTA-Dateien (SFTP/KIM)
 *   - Routing                  — welche Kasse geht an welche Annahmestelle
 *
 * Alle Schreibpfade validieren VOR dem Schreiben. Eine IK mit falscher
 * Prüfziffer oder eine Annahmestelle ohne Transportweg darf gar nicht erst
 * in die Tabelle gelangen — ein Preflight, der solche Daten erst beim
 * Versand bemängelt, ist zu spät.
 *
 * Es werden hier bewusst KEINE Kassendaten als Seed mitgeliefert. Echte
 * IK-Nummern, SFTP-Hosts und Zugangsdaten sind externe Stammdaten; erfundene
 * Werte wären schlimmer als leere Tabellen, weil sie eine Bereitschaft
 * vortäuschen, die nicht existiert.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateIK } from './edifact-validator'
import type { Kassenart } from './schluesselverzeichnis'
import { KASSENART_LABEL } from './schluesselverzeichnis'

// ── Validierung ─────────────────────────────────────────────────

export interface ValidierungsFehler {
  feld: string
  meldung: string
}

export interface ValidierungsErgebnis {
  ok: boolean
  fehler: ValidierungsFehler[]
  warnungen: ValidierungsFehler[]
}

export const KASSENARTEN: Kassenart[] = ['AO', 'BK', 'BN', 'EK', 'IK', 'LK', 'SE']

export const ABRECHNUNGSWEGE = ['dta', 'papier', 'kim', 'sonstige'] as const
export type Abrechnungsweg = (typeof ABRECHNUNGSWEGE)[number]

export interface KostentraegerEingabe {
  ik_nummer: string
  name: string
  kassenart: string
  bundesland?: string | null
  abrechnungsweg?: string | null
  datenannahmestelle_id?: string | null
  leistungsarten?: string[] | null
  email?: string | null
  telefon?: string | null
  gueltig_ab?: string | null
  gueltig_bis?: string | null
  ist_aktiv?: boolean
  notizen?: string | null
}

export interface DatenannahmestelleEingabe {
  ik_nummer: string
  name: string
  kassenart: string
  bundesland?: string | null
  sftp_host?: string | null
  sftp_port?: number | null
  sftp_user?: string | null
  sftp_verzeichnis?: string | null
  antwort_verzeichnis?: string | null
  kim_adresse?: string | null
  zustaendig_fuer?: string[] | null
  leistungsarten?: string[] | null
  dateiformat?: string | null
  aktiv?: boolean
  gueltig_ab?: string | null
  gueltig_bis?: string | null
}

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function pruefeIk(feld: string, wert: string | null | undefined, fehler: ValidierungsFehler[]): void {
  const ik = (wert ?? '').replace(/\D/g, '')
  if (!ik) {
    fehler.push({ feld, meldung: 'IK-Nummer ist Pflicht' })
    return
  }
  if (!/^\d{9}$/.test(ik)) {
    fehler.push({ feld, meldung: `IK-Nummer muss genau 9 Ziffern haben (erhalten: ${ik.length})` })
    return
  }
  if (!validateIK(ik)) {
    fehler.push({ feld, meldung: `IK-Nummer ${ik} hat eine ungueltige Pruefziffer (§ 293 SGB V)` })
  }
}

function pruefeZeitraum(
  gueltigAb: string | null | undefined,
  gueltigBis: string | null | undefined,
  fehler: ValidierungsFehler[],
): void {
  if (gueltigAb && !ISO_DATUM.test(gueltigAb)) {
    fehler.push({ feld: 'gueltig_ab', meldung: 'Datum muss im Format YYYY-MM-DD vorliegen' })
  }
  if (gueltigBis && !ISO_DATUM.test(gueltigBis)) {
    fehler.push({ feld: 'gueltig_bis', meldung: 'Datum muss im Format YYYY-MM-DD vorliegen' })
  }
  if (gueltigAb && gueltigBis && ISO_DATUM.test(gueltigAb) && ISO_DATUM.test(gueltigBis) && gueltigBis < gueltigAb) {
    fehler.push({ feld: 'gueltig_bis', meldung: 'Gueltigkeitsende liegt vor dem Beginn' })
  }
}

export function validiereKostentraeger(eingabe: KostentraegerEingabe): ValidierungsErgebnis {
  const fehler: ValidierungsFehler[] = []
  const warnungen: ValidierungsFehler[] = []

  pruefeIk('ik_nummer', eingabe.ik_nummer, fehler)

  if (!eingabe.name?.trim()) {
    fehler.push({ feld: 'name', meldung: 'Name des Kostentraegers ist Pflicht' })
  }

  if (!eingabe.kassenart) {
    fehler.push({ feld: 'kassenart', meldung: 'Kassenart ist Pflicht' })
  } else if (!KASSENARTEN.includes(eingabe.kassenart as Kassenart)) {
    fehler.push({
      feld: 'kassenart',
      meldung: `Unbekannte Kassenart "${eingabe.kassenart}". Zulaessig: ${KASSENARTEN.map(k => `${k} (${KASSENART_LABEL[k]})`).join(', ')}`,
    })
  }

  if (eingabe.abrechnungsweg && !ABRECHNUNGSWEGE.includes(eingabe.abrechnungsweg as Abrechnungsweg)) {
    fehler.push({
      feld: 'abrechnungsweg',
      meldung: `Unbekannter Abrechnungsweg "${eingabe.abrechnungsweg}". Zulaessig: ${ABRECHNUNGSWEGE.join(', ')}`,
    })
  }

  pruefeZeitraum(eingabe.gueltig_ab, eingabe.gueltig_bis, fehler)

  if (eingabe.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eingabe.email)) {
    fehler.push({ feld: 'email', meldung: 'E-Mail-Adresse ist ungueltig' })
  }

  // Warnung, kein Fehler: ein Kostentraeger ohne zugeordnete Annahmestelle
  // laesst sich anlegen, faellt aber im Preflight durch.
  if (!eingabe.datenannahmestelle_id) {
    warnungen.push({
      feld: 'datenannahmestelle_id',
      meldung: 'Keine Datenannahmestelle zugeordnet — der DTA-Versand ist fuer diesen Kostentraeger blockiert',
    })
  }

  if (eingabe.abrechnungsweg === 'dta' && !eingabe.datenannahmestelle_id) {
    warnungen.push({
      feld: 'abrechnungsweg',
      meldung: 'Abrechnungsweg DTA ohne Datenannahmestelle — Routing bleibt unvollstaendig',
    })
  }

  return { ok: fehler.length === 0, fehler, warnungen }
}

export function validiereDatenannahmestelle(eingabe: DatenannahmestelleEingabe): ValidierungsErgebnis {
  const fehler: ValidierungsFehler[] = []
  const warnungen: ValidierungsFehler[] = []

  pruefeIk('ik_nummer', eingabe.ik_nummer, fehler)

  if (!eingabe.name?.trim()) {
    fehler.push({ feld: 'name', meldung: 'Name der Datenannahmestelle ist Pflicht' })
  }

  if (!eingabe.kassenart) {
    fehler.push({ feld: 'kassenart', meldung: 'Kassenart ist Pflicht — sie bestimmt das Routing' })
  } else if (!KASSENARTEN.includes(eingabe.kassenart as Kassenart)) {
    fehler.push({
      feld: 'kassenart',
      meldung: `Unbekannte Kassenart "${eingabe.kassenart}". Zulaessig: ${KASSENARTEN.join(', ')}`,
    })
  }

  if (eingabe.sftp_port != null && (!Number.isInteger(eingabe.sftp_port) || eingabe.sftp_port < 1 || eingabe.sftp_port > 65535)) {
    fehler.push({ feld: 'sftp_port', meldung: 'SFTP-Port muss zwischen 1 und 65535 liegen' })
  }

  if (eingabe.sftp_host && !/^[a-zA-Z0-9.-]+$/.test(eingabe.sftp_host)) {
    fehler.push({ feld: 'sftp_host', meldung: 'SFTP-Host enthaelt unzulaessige Zeichen' })
  }

  // Ein Transportweg muss vollstaendig sein — halb konfigurierte Zugaenge
  // sind der haeufigste Grund fuer stille Versandfehler.
  const sftpTeile = [eingabe.sftp_host, eingabe.sftp_user].filter(Boolean).length
  if (sftpTeile === 1) {
    fehler.push({
      feld: 'sftp_host',
      meldung: 'SFTP unvollstaendig — Host UND Benutzer sind gemeinsam erforderlich',
    })
  }

  if (eingabe.kim_adresse && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eingabe.kim_adresse)) {
    fehler.push({ feld: 'kim_adresse', meldung: 'KIM-Adresse ist keine gueltige Adresse' })
  }

  pruefeZeitraum(eingabe.gueltig_ab, eingabe.gueltig_bis, fehler)

  for (const ik of eingabe.zustaendig_fuer ?? []) {
    if (!validateIK(String(ik).replace(/\D/g, ''))) {
      fehler.push({ feld: 'zustaendig_fuer', meldung: `Zustaendigkeits-IK ${ik} hat eine ungueltige Pruefziffer` })
    }
  }

  if (!eingabe.sftp_host && !eingabe.kim_adresse) {
    warnungen.push({
      feld: 'sftp_host',
      meldung: 'Kein Transportweg hinterlegt (weder SFTP noch KIM) — Dateien koennen erzeugt, aber nicht uebermittelt werden',
    })
  }

  return { ok: fehler.length === 0, fehler, warnungen }
}

// ── Schreiben ───────────────────────────────────────────────────

export interface SpeicherErgebnis {
  id: string | null
  ok: boolean
  fehler: ValidierungsFehler[]
  warnungen: ValidierungsFehler[]
}

/**
 * Legt einen Kostenträger an oder aktualisiert ihn.
 *
 * Schlüssel ist `(organization_id, ik_nummer)` — dieselbe Kasse darf pro
 * Mandant nur einmal existieren, aber zwei Mandanten dürfen dieselbe Kasse
 * unabhängig voneinander pflegen. Bewusst select-then-write statt `upsert`:
 * auf der Produktionsdatenbank existiert kein passender Unique-Constraint,
 * ein `onConflict` darauf würde zur Laufzeit mit 42P10 scheitern.
 */
export async function speichereKostentraeger(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: KostentraegerEingabe,
): Promise<SpeicherErgebnis> {
  const validierung = validiereKostentraeger(eingabe)
  if (!validierung.ok) {
    return { id: null, ok: false, fehler: validierung.fehler, warnungen: validierung.warnungen }
  }

  const ik = eingabe.ik_nummer.replace(/\D/g, '')
  const zeile = {
    organization_id: organizationId,
    ik_nummer: ik,
    name: eingabe.name.trim(),
    kassenart: eingabe.kassenart,
    typ: 'pflegekasse',
    bundesland: eingabe.bundesland || null,
    abrechnungsweg: eingabe.abrechnungsweg || 'dta',
    datenannahmestelle_id: eingabe.datenannahmestelle_id || null,
    leistungsarten: eingabe.leistungsarten ?? [],
    email: eingabe.email || null,
    telefon: eingabe.telefon || null,
    gueltig_ab: eingabe.gueltig_ab || null,
    gueltig_bis: eingabe.gueltig_bis || null,
    ist_aktiv: eingabe.ist_aktiv ?? true,
    notizen: eingabe.notizen || null,
  }

  const { data: vorhanden, error: leseFehler } = await supabase
    .from('dta_kostentraeger')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('ik_nummer', ik)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (leseFehler) {
    return { id: null, ok: false, fehler: [{ feld: '_', meldung: leseFehler.message }], warnungen: validierung.warnungen }
  }

  if (vorhanden) {
    const { error } = await supabase
      .from('dta_kostentraeger')
      .update({ ...zeile, updated_at: new Date().toISOString() })
      .eq('id', vorhanden.id)
      .eq('organization_id', organizationId)
    if (error) {
      return { id: null, ok: false, fehler: [{ feld: '_', meldung: error.message }], warnungen: validierung.warnungen }
    }
    return { id: vorhanden.id, ok: true, fehler: [], warnungen: validierung.warnungen }
  }

  const { data, error } = await supabase
    .from('dta_kostentraeger')
    .insert(zeile)
    .select('id')
    .single()

  if (error || !data) {
    return { id: null, ok: false, fehler: [{ feld: '_', meldung: error?.message ?? 'unbekannt' }], warnungen: validierung.warnungen }
  }
  return { id: data.id, ok: true, fehler: [], warnungen: validierung.warnungen }
}

/** Legt eine Datenannahmestelle an oder aktualisiert sie. Schlüssel: `(organization_id, ik_nummer)`. */
export async function speichereDatenannahmestelle(
  supabase: SupabaseClient,
  organizationId: string,
  eingabe: DatenannahmestelleEingabe,
): Promise<SpeicherErgebnis> {
  const validierung = validiereDatenannahmestelle(eingabe)
  if (!validierung.ok) {
    return { id: null, ok: false, fehler: validierung.fehler, warnungen: validierung.warnungen }
  }

  const ik = eingabe.ik_nummer.replace(/\D/g, '')
  const zeile = {
    organization_id: organizationId,
    ik_nummer: ik,
    name: eingabe.name.trim(),
    kassenart: eingabe.kassenart,
    bundesland: eingabe.bundesland || null,
    sftp_host: eingabe.sftp_host || null,
    sftp_port: eingabe.sftp_port ?? 22,
    sftp_user: eingabe.sftp_user || null,
    sftp_verzeichnis: eingabe.sftp_verzeichnis || null,
    antwort_verzeichnis: eingabe.antwort_verzeichnis || null,
    kim_adresse: eingabe.kim_adresse || null,
    zustaendig_fuer: (eingabe.zustaendig_fuer ?? []).map(v => String(v).replace(/\D/g, '')),
    leistungsarten: eingabe.leistungsarten ?? [],
    dateiformat: eingabe.dateiformat || 'edifact',
    aktiv: eingabe.aktiv ?? true,
    gueltig_ab: eingabe.gueltig_ab || null,
    gueltig_bis: eingabe.gueltig_bis || null,
  }

  const { data: vorhanden, error: leseFehler } = await supabase
    .from('datenannahmestellen')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('ik_nummer', ik)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (leseFehler) {
    return { id: null, ok: false, fehler: [{ feld: '_', meldung: leseFehler.message }], warnungen: validierung.warnungen }
  }

  if (vorhanden) {
    const { error } = await supabase
      .from('datenannahmestellen')
      .update({ ...zeile, updated_at: new Date().toISOString() })
      .eq('id', vorhanden.id)
      .eq('organization_id', organizationId)
    if (error) {
      return { id: null, ok: false, fehler: [{ feld: '_', meldung: error.message }], warnungen: validierung.warnungen }
    }
    return { id: vorhanden.id, ok: true, fehler: [], warnungen: validierung.warnungen }
  }

  const { data, error } = await supabase
    .from('datenannahmestellen')
    .insert(zeile)
    .select('id')
    .single()

  if (error || !data) {
    return { id: null, ok: false, fehler: [{ feld: '_', meldung: error?.message ?? 'unbekannt' }], warnungen: validierung.warnungen }
  }
  return { id: data.id, ok: true, fehler: [], warnungen: validierung.warnungen }
}

// ── Massenimport ────────────────────────────────────────────────

export interface ImportZeilenErgebnis {
  zeile: number
  ik_nummer: string
  ok: boolean
  id: string | null
  fehler: ValidierungsFehler[]
  warnungen: ValidierungsFehler[]
}

export interface ImportErgebnis {
  gesamt: number
  erfolgreich: number
  fehlerhaft: number
  /** true, wenn nur validiert und nichts geschrieben wurde. */
  dryRun: boolean
  zeilen: ImportZeilenErgebnis[]
}

/**
 * Massenimport mit Vorschau.
 *
 * `dryRun` validiert jede Zeile, ohne zu schreiben — der Standardweg, bevor
 * jemand eine Kassenliste blind in die Produktion kippt. Zeilen werden
 * einzeln bewertet: eine fehlerhafte Zeile stoppt den Import nicht, sie wird
 * berichtet.
 */
export async function importiereKostentraeger(
  supabase: SupabaseClient,
  organizationId: string,
  zeilen: KostentraegerEingabe[],
  optionen?: { dryRun?: boolean },
): Promise<ImportErgebnis> {
  const dryRun = optionen?.dryRun ?? false
  const ergebnisse: ImportZeilenErgebnis[] = []

  for (let i = 0; i < zeilen.length; i++) {
    const eingabe = zeilen[i]
    const ikRoh = String(eingabe?.ik_nummer ?? '')

    if (dryRun) {
      const v = validiereKostentraeger(eingabe)
      ergebnisse.push({ zeile: i + 1, ik_nummer: ikRoh, ok: v.ok, id: null, fehler: v.fehler, warnungen: v.warnungen })
      continue
    }

    const r = await speichereKostentraeger(supabase, organizationId, eingabe)
    ergebnisse.push({ zeile: i + 1, ik_nummer: ikRoh, ok: r.ok, id: r.id, fehler: r.fehler, warnungen: r.warnungen })
  }

  return {
    gesamt: zeilen.length,
    erfolgreich: ergebnisse.filter(e => e.ok).length,
    fehlerhaft: ergebnisse.filter(e => !e.ok).length,
    dryRun,
    zeilen: ergebnisse,
  }
}

/** Massenimport für Datenannahmestellen — gleiche Semantik wie `importiereKostentraeger`. */
export async function importiereDatenannahmestellen(
  supabase: SupabaseClient,
  organizationId: string,
  zeilen: DatenannahmestelleEingabe[],
  optionen?: { dryRun?: boolean },
): Promise<ImportErgebnis> {
  const dryRun = optionen?.dryRun ?? false
  const ergebnisse: ImportZeilenErgebnis[] = []

  for (let i = 0; i < zeilen.length; i++) {
    const eingabe = zeilen[i]
    const ikRoh = String(eingabe?.ik_nummer ?? '')

    if (dryRun) {
      const v = validiereDatenannahmestelle(eingabe)
      ergebnisse.push({ zeile: i + 1, ik_nummer: ikRoh, ok: v.ok, id: null, fehler: v.fehler, warnungen: v.warnungen })
      continue
    }

    const r = await speichereDatenannahmestelle(supabase, organizationId, eingabe)
    ergebnisse.push({ zeile: i + 1, ik_nummer: ikRoh, ok: r.ok, id: r.id, fehler: r.fehler, warnungen: r.warnungen })
  }

  return {
    gesamt: zeilen.length,
    erfolgreich: ergebnisse.filter(e => e.ok).length,
    fehlerhaft: ergebnisse.filter(e => !e.ok).length,
    dryRun,
    zeilen: ergebnisse,
  }
}

// ── Routing-Prüfung ─────────────────────────────────────────────

export interface RoutingLuecke {
  ik_nummer: string
  name: string
  grund: string
}

export interface RoutingPruefung {
  ok: boolean
  kostentraegerGesamt: number
  kostentraegerMitRouting: number
  luecken: RoutingLuecke[]
}

/**
 * Prüft, ob jeder aktive Kostenträger eine erreichbare Datenannahmestelle hat.
 *
 * Das ist die Frage, die der Preflight pro Lauf nur für EINEN Kostenträger
 * stellt — hier für alle auf einmal, damit Lücken vor dem Monatsende
 * auffallen und nicht mittendrin.
 */
export async function pruefeRouting(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<RoutingPruefung> {
  const { data: kostentraeger, error: ktErr } = await supabase
    .from('dta_kostentraeger')
    .select('id, ik_nummer, name, abrechnungsweg, datenannahmestelle_id')
    .eq('organization_id', organizationId)
    .eq('ist_aktiv', true)
    .is('deleted_at', null)

  if (ktErr) throw new Error(`Kostentraeger konnten nicht geladen werden: ${ktErr.message}`)

  const { data: annahmestellen, error: dasErr } = await supabase
    .from('datenannahmestellen')
    .select('id, ik_nummer, name, aktiv, sftp_host, sftp_user, kim_adresse, zustaendig_fuer')
    .or(`organization_id.eq.${organizationId},organization_id.is.null`)
    .is('deleted_at', null)

  if (dasErr) throw new Error(`Datenannahmestellen konnten nicht geladen werden: ${dasErr.message}`)

  const dasById = new Map((annahmestellen ?? []).map(d => [d.id, d]))
  const luecken: RoutingLuecke[] = []
  let mitRouting = 0

  for (const kt of kostentraeger ?? []) {
    if (kt.abrechnungsweg && kt.abrechnungsweg !== 'dta') continue

    const direkt = kt.datenannahmestelle_id ? dasById.get(kt.datenannahmestelle_id) : null
    const ueberZustaendigkeit = (annahmestellen ?? []).filter(
      d => Array.isArray(d.zustaendig_fuer) && d.zustaendig_fuer.includes(kt.ik_nummer),
    )

    const ziel = direkt ?? ueberZustaendigkeit[0] ?? null

    if (!ziel) {
      luecken.push({ ik_nummer: kt.ik_nummer, name: kt.name, grund: 'Keine Datenannahmestelle zugeordnet' })
      continue
    }
    if (!ziel.aktiv) {
      luecken.push({ ik_nummer: kt.ik_nummer, name: kt.name, grund: `Datenannahmestelle "${ziel.name}" ist inaktiv` })
      continue
    }
    if (!(ziel.sftp_host && ziel.sftp_user) && !ziel.kim_adresse) {
      luecken.push({ ik_nummer: kt.ik_nummer, name: kt.name, grund: `Datenannahmestelle "${ziel.name}" hat keinen vollstaendigen Transportweg` })
      continue
    }
    if (ueberZustaendigkeit.length > 1 && !direkt) {
      luecken.push({ ik_nummer: kt.ik_nummer, name: kt.name, grund: `Mehrdeutig: ${ueberZustaendigkeit.length} Annahmestellen beanspruchen diese IK` })
      continue
    }
    mitRouting++
  }

  return {
    ok: luecken.length === 0,
    kostentraegerGesamt: (kostentraeger ?? []).length,
    kostentraegerMitRouting: mitRouting,
    luecken,
  }
}
