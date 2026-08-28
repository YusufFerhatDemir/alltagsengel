import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  DIENSTPLAN_STATUS_WERTE, DIENSTPLAN_TYP_WERTE,
  type DienstplanSchicht, type DienstplanEintrag, type DienstplanTagesansicht,
  type DienstplanStatus, type DienstplanTyp,
} from './types'

// ── Zeitfenster einer Schicht / eines Dienstes ──────────────────
//
// Weder `dienstplan_schichten` noch `dienstplan_eintraege` tragen einen
// CHECK auf die Zeiten (20260811010000_personalmanagement.sql). Bis hierher
// gab es damit UEBERHAUPT keine Pruefung: eine Schicht "10:00–10:00" (Dauer
// null) oder eine Pause von 480 Minuten in einem 4-Stunden-Dienst liessen
// sich anlegen, und ein Tippfehler im Zeitformat schlug erst als roher
// Postgres-Fehler durch (HTTP 500 statt einer lesbaren Meldung).
//
// Ende VOR Beginn wird bewusst NICHT abgelehnt: Nachtdienste ueber
// Mitternacht sind in der ambulanten Pflege der Normalfall und in
// `lib/personal/types.ts` ausdruecklich als zulaessig festgehalten. Ihre
// Ueberlappung rechnet seit 20261011000000 der DB-Trigger korrekt ueber den
// Tageswechsel. Abgelehnt wird nur der Null-Dienst (Ende = Beginn), der
// weder ein Tagdienst noch ein Nachtdienst sein kann.

/** 'HH:MM' oder 'HH:MM:SS' — Postgres liefert die zweite Form. */
const ZEIT_MUSTER = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

/** Minuten seit Mitternacht, oder null bei unlesbarer Zeit. */
export function schichtZeitZuMinuten(zeit: string | null | undefined): number | null {
  if (typeof zeit !== 'string') return null
  const treffer = ZEIT_MUSTER.exec(zeit.trim())
  if (!treffer) return null
  return Number(treffer[1]) * 60 + Number(treffer[2])
}

/**
 * Dienstdauer in Minuten. Ende <= Beginn gilt als Nachtdienst und laeuft
 * ueber Mitternacht; Ende = Beginn ergibt 0 und wird vom Aufrufer abgelehnt.
 */
export function dienstDauerMinuten(startZeit: string, endZeit: string): number | null {
  const start = schichtZeitZuMinuten(startZeit)
  const ende = schichtZeitZuMinuten(endZeit)
  if (start === null || ende === null) return null
  if (ende === start) return 0
  return ende > start ? ende - start : ende - start + 1440
}

/** `YYYY-MM-DD` — sonst schlaegt erst Postgres zu, mit unlesbarer Meldung. */
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

export function assertDatum(datum: string | null | undefined): void {
  if (typeof datum !== 'string' || !ISO_DATUM.test(datum.trim())) {
    throw new UserFacingError(`Datum "${datum ?? ''}" ist kein gültiges Datum (JJJJ-MM-TT).`)
  }
}

/**
 * Prueft Zeitformat, Null-Dienst und Pausenlaenge zusammen.
 * `feld` benennt in der Meldung, worum es geht (Schicht bzw. Dienst).
 */
export function assertZeitfenster(
  startZeit: string | null | undefined,
  endZeit: string | null | undefined,
  pauseMinuten: number | null | undefined,
  was: string,
): void {
  if (schichtZeitZuMinuten(startZeit) === null) {
    throw new UserFacingError(`${was}: Beginn "${startZeit ?? ''}" ist keine gültige Uhrzeit (HH:MM).`)
  }
  if (schichtZeitZuMinuten(endZeit) === null) {
    throw new UserFacingError(`${was}: Ende "${endZeit ?? ''}" ist keine gültige Uhrzeit (HH:MM).`)
  }

  const dauer = dienstDauerMinuten(startZeit as string, endZeit as string)
  if (dauer === 0) {
    throw new UserFacingError(`${was}: Beginn und Ende sind identisch (${String(startZeit).slice(0, 5)}) — das ergibt keine Arbeitszeit.`)
  }

  if (pauseMinuten === null || pauseMinuten === undefined) return
  if (!Number.isInteger(pauseMinuten) || pauseMinuten < 0) {
    throw new UserFacingError(`${was}: Pause muss eine ganze Zahl von Minuten ab 0 sein (übergeben: ${pauseMinuten}).`)
  }
  if (dauer !== null && pauseMinuten >= dauer) {
    throw new UserFacingError(
      `${was}: Pause (${pauseMinuten} Min) ist nicht kürzer als die Dienstdauer (${dauer} Min) — es bliebe keine Arbeitszeit übrig.`,
    )
  }
}

// ── Schichten (Vorlagen) ────────────────────────────────────────

export interface CreateSchichtParams {
  organizationId: string
  bezeichnung: string
  kuerzel?: string | null
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  farbe?: string
}

export async function createSchicht(supabase: SupabaseClient, params: CreateSchichtParams): Promise<DienstplanSchicht> {
  if (!params.bezeichnung?.trim()) throw new UserFacingError('Bezeichnung ist ein Pflichtfeld.')
  assertZeitfenster(params.startZeit, params.endZeit, params.pauseMinuten ?? 0, 'Schicht')

  const { data, error } = await supabase
    .from('dienstplan_schichten')
    .insert({
      organization_id: params.organizationId,
      bezeichnung: params.bezeichnung.trim(),
      kuerzel: params.kuerzel ?? null,
      start_zeit: params.startZeit,
      end_zeit: params.endZeit,
      pause_minuten: params.pauseMinuten ?? 0,
      farbe: params.farbe ?? '#C9963C',
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schicht konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as DienstplanSchicht
}

export async function listSchichten(supabase: SupabaseClient, organizationId: string, nurAktive = true): Promise<DienstplanSchicht[]> {
  let query = supabase
    .from('dienstplan_schichten')
    .select('*')
    .eq('organization_id', organizationId)
    .order('start_zeit', { ascending: true })

  if (nurAktive) query = query.eq('aktiv', true)

  const { data, error } = await query
  if (error) throw new Error(`Schichten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanSchicht[]
}

export interface UpdateSchichtParams {
  bezeichnung?: string
  kuerzel?: string | null
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  farbe?: string
  aktiv?: boolean
}

export async function updateSchicht(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateSchichtParams,
): Promise<DienstplanSchicht> {
  // Gegen den BESTAND pruefen, nicht nur gegen den Patch: wer allein
  // `startZeit` verschiebt, erzeugt sonst unbemerkt einen Null-Dienst oder
  // eine Pause, die laenger ist als die verbleibende Schicht.
  if (patch.startZeit !== undefined || patch.endZeit !== undefined || patch.pauseMinuten !== undefined) {
    const { data: bestand, error: ladeFehler } = await supabase
      .from('dienstplan_schichten')
      .select('start_zeit, end_zeit, pause_minuten')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (ladeFehler) throw new Error(`Schicht konnte nicht geladen werden: ${ladeFehler.message}`)
    if (!bestand) throw new UserFacingError('Schicht nicht gefunden.', 404)
    assertZeitfenster(
      patch.startZeit ?? (bestand.start_zeit as string),
      patch.endZeit ?? (bestand.end_zeit as string),
      patch.pauseMinuten ?? (bestand.pause_minuten as number | null) ?? 0,
      'Schicht',
    )
  }

  const update: Record<string, unknown> = {}
  if (patch.bezeichnung !== undefined) update.bezeichnung = patch.bezeichnung
  if (patch.kuerzel !== undefined) update.kuerzel = patch.kuerzel
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.farbe !== undefined) update.farbe = patch.farbe
  if (patch.aktiv !== undefined) update.aktiv = patch.aktiv

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('dienstplan_schichten')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schicht konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as DienstplanSchicht
}

// ── Einträge (tägliche Schichteinträge) ─────────────────────────

export interface CreateEintragParams {
  organizationId: string
  datum: string
  schichtId?: string | null
  caregiverId?: string | null
  clientId?: string | null
  assignmentId?: string | null
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  status?: DienstplanStatus
  typ?: DienstplanTyp
  notizen?: string | null
  erstelltVon: string
  /**
   * Grund der Aenderung. Pflicht, sobald die Woche freigegeben ist — der
   * DB-Trigger `pruefe_dienstplan_freigabe` (Migration 20260829005700)
   * weist einen Dienst in einer freigegebenen Woche sonst ab. Ausserhalb
   * einer Freigabe ohne Wirkung.
   */
  aenderungGrund?: string | null
}

export async function createEintrag(supabase: SupabaseClient, params: CreateEintragParams): Promise<DienstplanEintrag> {
  assertErlaubt(params.status, DIENSTPLAN_STATUS_WERTE, 'status')
  assertErlaubt(params.typ, DIENSTPLAN_TYP_WERTE, 'typ')
  assertDatum(params.datum)
  assertZeitfenster(params.startZeit, params.endZeit, params.pauseMinuten ?? 0, 'Dienst')

  const zeile: Record<string, unknown> = {
      organization_id: params.organizationId,
      datum: params.datum,
      schicht_id: params.schichtId ?? null,
      caregiver_id: params.caregiverId ?? null,
      client_id: params.clientId ?? null,
      assignment_id: params.assignmentId ?? null,
      start_zeit: params.startZeit,
      end_zeit: params.endZeit,
      pause_minuten: params.pauseMinuten ?? 0,
      status: params.status ?? 'geplant',
      typ: params.typ ?? 'regulaer',
      notizen: params.notizen ?? null,
      erstellt_von: params.erstelltVon,
  }

  // `aenderung_grund` kommt aus Migration 20260829005700 und ist noch
  // nicht angewendet. Ein 42703 fuehrt deshalb zu einem zweiten Versuch
  // ohne die Spalte — sonst faellt heute jede Dienstanlage aus (siehe
  // Projekt-Gedaechtnis „Schema-Drift 42703").
  let antwort = await supabase
    .from('dienstplan_eintraege')
    .insert({ ...zeile, aenderung_grund: params.aenderungGrund?.trim() || null })
    .select('*')
    .single()
  if (antwort.error?.code === '42703') {
    antwort = await supabase.from('dienstplan_eintraege').insert(zeile).select('*').single()
  }

  const { data, error } = antwort
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Doppelbelegung')) throw new UserFacingError('Doppelbelegung: Der Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
    if (msg.includes('Konflikt')) throw new UserFacingError('Konflikt: Der Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
    const freigabe = freigabeFehler(msg)
    if (freigabe) throw freigabe
    throw new Error(`Dienstplan-Eintrag konnte nicht angelegt werden: ${msg}`)
  }
  return data as DienstplanEintrag
}

/**
 * Uebersetzt die drei Meldungen des Freigabe-Riegels in lesbare Fehler.
 *
 * Der Riegel selbst sitzt in der Datenbank (`pruefe_dienstplan_freigabe`)
 * und ist damit auch fuer Schreibwege verbindlich, die an diesem Modul
 * vorbeigehen. Hier steht nur die lesbare Haelfte.
 */
function freigabeFehler(msg: string): UserFacingError | null {
  if (msg.includes('freigegebenen Woche kann nicht geloescht')) {
    return new UserFacingError(
      'Ein Dienst in einer freigegebenen Woche kann nicht gelöscht werden. '
      + 'Statt zu löschen: den Dienst auf „ausgefallen" setzen.',
      409,
    )
  }
  if (msg.includes('braucht einen Grund')) {
    return new UserFacingError(
      'Der Dienstplan dieser Woche ist freigegeben — jede Änderung braucht einen Grund.',
      409,
    )
  }
  if (msg.includes('gehoert zu dieser Aenderung')) {
    return new UserFacingError(
      'Bitte für diese Änderung einen eigenen Grund angeben — der bisherige gehört zur vorigen.',
      409,
    )
  }
  return null
}

export interface ListEintraegeFilter {
  organizationId: string
  datum?: string
  datumVon?: string
  datumBis?: string
  caregiverId?: string
  clientId?: string
  status?: DienstplanStatus
}

export async function listEintraege(supabase: SupabaseClient, filter: ListEintraegeFilter): Promise<DienstplanEintrag[]> {
  let query = supabase
    .from('dienstplan_eintraege')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('datum', { ascending: true })
    .order('start_zeit', { ascending: true })

  if (filter.datum) query = query.eq('datum', filter.datum)
  if (filter.datumVon) query = query.gte('datum', filter.datumVon)
  if (filter.datumBis) query = query.lte('datum', filter.datumBis)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`Dienstplan-Einträge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanEintrag[]
}

export interface UpdateEintragParams {
  schichtId?: string | null
  caregiverId?: string | null
  clientId?: string | null
  assignmentId?: string | null
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  status?: DienstplanStatus
  typ?: DienstplanTyp
  notizen?: string | null
  bestaetigtVon?: string | null
  bestaetigtAm?: string | null
  /** Siehe CreateEintragParams.aenderungGrund. */
  aenderungGrund?: string | null
}

/**
 * Ein abgeschlossener Dienst ist geleistete Arbeit — die Zeiten daran haengen
 * an Arbeitszeit-Erfassung und Abrechnung. Nachtraeglich verschieben,
 * umbesetzen oder auf einen anderen Klienten umbuchen darf man ihn deshalb
 * nicht mehr. `ausgefallen` zaehlt genauso: der Dienst ist entschieden und
 * die Absage dokumentiert. `vertretung` bleibt bewusst offen — dort laeuft
 * die Umbesetzung ja gerade erst.
 *
 * In der Datenbank gibt es dafuer keinen Riegel — dienstplan_eintraege hat
 * keinen Status-Guard-Trigger (20260811010000_personalmanagement.sql). Diese
 * Pruefung ist die einzige Stelle, an der die Regel gilt.
 */
const DIENSTPLAN_ENDZUSTAENDE: DienstplanStatus[] = ['abgeschlossen', 'ausgefallen']

/** Feld-Aenderungen, die an einem entschiedenen Dienst nichts mehr zu suchen haben. */
const DIENST_KERNFELDER: Array<keyof UpdateEintragParams> = [
  'schichtId', 'caregiverId', 'clientId', 'assignmentId',
  'startZeit', 'endZeit', 'pauseMinuten', 'typ',
]

export async function updateEintrag(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateEintragParams,
): Promise<DienstplanEintrag> {
  assertErlaubt(patch.status, DIENSTPLAN_STATUS_WERTE, 'status')
  assertErlaubt(patch.typ, DIENSTPLAN_TYP_WERTE, 'typ')

  const { data: bestand, error: ladeFehler } = await supabase
    .from('dienstplan_eintraege')
    .select('status, start_zeit, end_zeit, pause_minuten')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Dienstplan-Eintrag konnte nicht geladen werden: ${ladeFehler.message}`)
  if (!bestand) throw new UserFacingError('Dienstplan-Eintrag nicht gefunden.', 404)

  if (DIENSTPLAN_ENDZUSTAENDE.includes(bestand.status as DienstplanStatus)) {
    const beruehrt = DIENST_KERNFELDER.filter(feld => patch[feld] !== undefined)
    if (beruehrt.length > 0 || patch.status !== undefined) {
      throw new UserFacingError(
        `Ein Dienst im Status "${bestand.status}" ist abgeschlossen und kann nicht mehr geändert werden. Notizen bleiben ergänzbar.`,
        409,
      )
    }
  }
  // Gegen den Bestand pruefen — ein reines Verschieben des Beginns darf
  // weder einen Null-Dienst noch eine Pause laenger als der Dienst erzeugen.
  if (patch.startZeit !== undefined || patch.endZeit !== undefined || patch.pauseMinuten !== undefined) {
    assertZeitfenster(
      patch.startZeit ?? (bestand.start_zeit as string),
      patch.endZeit ?? (bestand.end_zeit as string),
      patch.pauseMinuten ?? (bestand.pause_minuten as number | null) ?? 0,
      'Dienst',
    )
  }


  const update: Record<string, unknown> = {}
  if (patch.schichtId !== undefined) update.schicht_id = patch.schichtId
  if (patch.caregiverId !== undefined) update.caregiver_id = patch.caregiverId
  if (patch.clientId !== undefined) update.client_id = patch.clientId
  if (patch.assignmentId !== undefined) update.assignment_id = patch.assignmentId
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.status !== undefined) update.status = patch.status
  if (patch.typ !== undefined) update.typ = patch.typ
  if (patch.notizen !== undefined) update.notizen = patch.notizen
  if (patch.bestaetigtVon !== undefined) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.bestaetigtAm !== undefined) update.bestaetigt_am = patch.bestaetigtAm

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  // Siehe createEintrag: die Spalte kommt aus 20260829005700 und ist noch
  // nicht angewendet; ein 42703 fuehrt zum zweiten Versuch ohne sie.
  let antwort = await supabase
    .from('dienstplan_eintraege')
    .update({ ...update, aenderung_grund: patch.aenderungGrund?.trim() || null })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (antwort.error?.code === '42703') {
    antwort = await supabase
      .from('dienstplan_eintraege')
      .update(update)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single()
  }

  const { data, error } = antwort
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Doppelbelegung')) throw new UserFacingError('Doppelbelegung: Der Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
    if (msg.includes('Konflikt')) throw new UserFacingError('Konflikt: Der Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
    const freigabe = freigabeFehler(msg)
    if (freigabe) throw freigabe
    throw new Error(`Dienstplan-Eintrag konnte nicht aktualisiert werden: ${msg}`)
  }
  return data as DienstplanEintrag
}

export async function deleteEintrag(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  // Ein geleisteter oder ausgefallener Dienst ist Teil der Dokumentation —
  // er wird nicht geloescht, sonst fehlt der Bezug zur erfassten Arbeitszeit.
  const { data: bestand, error: ladeFehler } = await supabase
    .from('dienstplan_eintraege')
    .select('status')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Dienstplan-Eintrag konnte nicht geladen werden: ${ladeFehler.message}`)
  if (!bestand) throw new UserFacingError('Dienstplan-Eintrag nicht gefunden.', 404)
  if (DIENSTPLAN_ENDZUSTAENDE.includes(bestand.status as DienstplanStatus)) {
    throw new UserFacingError(
      `Ein Dienst im Status "${bestand.status}" kann nicht gelöscht werden.`,
      409,
    )
  }

  const { error } = await supabase
    .from('dienstplan_eintraege')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) {
    const freigabe = freigabeFehler(error.message)
    if (freigabe) throw freigabe
    throw new Error(`Dienstplan-Eintrag konnte nicht gelöscht werden: ${error.message}`)
  }
}

export async function listTagesansicht(supabase: SupabaseClient, organizationId: string, datum: string): Promise<DienstplanTagesansicht[]> {
  const { data, error } = await supabase
    .from('dienstplan_tagesansicht')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('datum', datum)
    .order('start_zeit', { ascending: true })
  if (error) throw new Error(`Tagesansicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanTagesansicht[]
}
