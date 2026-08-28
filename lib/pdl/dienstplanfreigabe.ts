// ═══════════════════════════════════════════════════════════════
// Pflegedienstleitung — Wochenübersicht, ArbZG-Entscheidung, Freigabe
//
// Die COMPLETION-MATRIX führt die PDL als Modul 3 und vermerkt in der
// Spalte „Mock/Stub?": „**kein eigenes Modul** — nur Kennzahlen-Cockpit
// über fremde Tabellen." Genau das ändert diese Datei: aus einer Lesesicht
// wird eine Stelle, an der entschieden wird.
//
// ── DIE ENTSCHEIDUNG, DIE ES NICHT GAB ────────────────────────────────
// `20260920060000_arbeitszeit_verstoesse.sql` hält fest, der ArbZG-Trigger
// blockiere bewusst nicht: „Stattdessen wird der Verstoß protokolliert und
// im Fristen-Dashboard sichtbar gemacht — PDL entscheidet."
//
// Die zweite Hälfte des Satzes gab es nicht. Live liest genau eine Stelle
// die Tabelle (`lib/automation/fristen-sammler.ts`, Abschnitt 8), und die
// zeigt nur an. Es existierte kein Schreibweg auf `quittiert` — der
// Eintrag konnte die Liste nie verlassen, egal wie die PDL entschied.
// `quittiereVerstoss()` ist dieser Weg.
//
// ── WAS DIE FREIGABE BEDEUTET ─────────────────────────────────────────
// Bis zur Freigabe ist der Wochenplan ein Entwurf. Mit der Freigabe wird
// er verbindlich — und ab da braucht jede Änderung einen Grund. Das
// erzwingt der DB-Trigger `pruefe_dienstplan_freigabe`, nicht diese Datei;
// hier steht die lesbare Hälfte.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { heuteBerlin } from '@/lib/utils/timezone'

// ─────────────────────────────────────────────────────────────────
// Wochenrechnung
// ─────────────────────────────────────────────────────────────────

/**
 * Der Montag der Woche, in der `datum` liegt — als `YYYY-MM-DD`.
 *
 * Bewusst reine Zeichenketten-/UTC-Arithmetik auf einem Mittagswert:
 * `new Date('2026-09-07')` ist Mitternacht UTC, und jede lokale
 * Umrechnung kippt daran zwischen Ländern um einen Tag. Der Montag ist
 * derselbe, egal wo der Server steht — das ist der Punkt.
 *
 * Muss mit `date_trunc('week', …)` in Postgres übereinstimmen: auch dort
 * beginnt die Woche am Montag (ISO 8601). Der CHECK
 * `dienstplan_freigaben_montag` erzwingt es zusätzlich in der Datenbank.
 */
export function wochenStart(datum: string): string {
  const tag = new Date(`${datum}T12:00:00Z`)
  if (Number.isNaN(tag.getTime())) {
    throw new UserFacingError(`"${datum}" ist kein gültiges Datum (YYYY-MM-DD).`, 400)
  }
  // getUTCDay(): 0 = Sonntag … 6 = Samstag. Für ISO zählt Montag als 0.
  const versatz = (tag.getUTCDay() + 6) % 7
  tag.setUTCDate(tag.getUTCDate() - versatz)
  return tag.toISOString().slice(0, 10)
}

/** Der Sonntag derselben Woche. */
export function wochenEnde(datum: string): string {
  const montag = new Date(`${wochenStart(datum)}T12:00:00Z`)
  montag.setUTCDate(montag.getUTCDate() + 6)
  return montag.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────────
// Typen
// ─────────────────────────────────────────────────────────────────

export interface DienstplanFreigabe {
  id: string
  organization_id: string
  woche_start: string
  status: 'freigegeben' | 'zurueckgezogen'
  freigegeben_von: string
  freigegeben_am: string
  dienste_gesamt: number
  dienste_unbesetzt: number
  verstoesse_quittiert: number
  hinweis: string | null
  zurueckgezogen_von: string | null
  zurueckgezogen_am: string | null
  zurueckziehungsgrund: string | null
}

export interface AuslastungZeile {
  caregiverId: string
  name: string
  dienste: number
  geplanteMinuten: number
  /** Vertraglich vereinbarte Wochenstunden × 60, soweit hinterlegt. */
  sollMinuten: number | null
  /** geplant − soll; null, solange kein Soll hinterlegt ist. */
  abweichungMinuten: number | null
}

export interface WochenUebersicht {
  wocheStart: string
  wocheEnde: string
  diensteGesamt: number
  /** Dienste ohne zugewiesene Kraft — die Lücken im Plan. */
  diensteUnbesetzt: number
  geplanteMinuten: number
  auslastung: AuslastungZeile[]
  /** Abwesenheiten, die in diese Woche hineinragen. */
  abwesenheiten: number
  offeneVerstoesse: Array<{
    id: string
    caregiverId: string
    art: 'max_tagesarbeitszeit' | 'mindestruhezeit'
    datum: string
    gemessen: number
    grenzwert: number
  }>
  freigabe: DienstplanFreigabe | null
}

// ─────────────────────────────────────────────────────────────────
// Wochenübersicht — die Auslastung
// ─────────────────────────────────────────────────────────────────

/**
 * Alles, was die PDL vor einer Freigabe wissen muss, in einer Abfragefolge:
 * wie voll die Woche ist, wo Lücken sind, wer wie ausgelastet ist, und was
 * das Arbeitszeitgesetz dazu sagt.
 *
 * Die Dienste werden mit `status <> 'ausgefallen'` gezählt: ein abgesagter
 * Dienst ist keine geplante Arbeit und würde die Auslastung nach oben
 * verfälschen.
 */
export async function ladeWochenUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
  datumInDerWoche: string,
): Promise<WochenUebersicht> {
  const von = wochenStart(datumInDerWoche)
  const bis = wochenEnde(datumInDerWoche)

  const [diensteRes, kraefteRes, abwesenheitenRes, verstoesseRes, freigabe] = await Promise.all([
    supabase
      .from('dienstplan_eintraege')
      .select('id, caregiver_id, datum, start_zeit, end_zeit, pause_minuten, status')
      .eq('organization_id', organizationId)
      .gte('datum', von)
      .lte('datum', bis),
    supabase
      .from('caregivers')
      .select('id, first_name, last_name, wochenstunden_soll')
      .eq('organization_id', organizationId),
    supabase
      .from('absences')
      .select('id')
      .eq('organization_id', organizationId)
      .in('status', ['beantragt', 'genehmigt'])
      .lte('start_date', bis)
      .gte('end_date', von),
    supabase
      .from('arbeitszeit_verstoesse')
      .select('id, caregiver_id, verstoss_art, datum, gemessener_wert_minuten, grenzwert_minuten')
      .eq('organization_id', organizationId)
      .eq('quittiert', false)
      .gte('datum', von)
      .lte('datum', bis),
    getFreigabe(supabase, organizationId, von),
  ])

  if (diensteRes.error) throw new Error(`Dienstplan konnte nicht geladen werden: ${diensteRes.error.message}`)
  if (kraefteRes.error) throw new Error(`Mitarbeitende konnten nicht geladen werden: ${kraefteRes.error.message}`)
  if (abwesenheitenRes.error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${abwesenheitenRes.error.message}`)
  if (verstoesseRes.error) throw new Error(`ArbZG-Verstöße konnten nicht geladen werden: ${verstoesseRes.error.message}`)

  type Dienst = {
    id: string; caregiver_id: string | null; datum: string
    start_zeit: string; end_zeit: string; pause_minuten: number | null; status: string
  }
  const dienste = ((diensteRes.data ?? []) as Dienst[]).filter(d => d.status !== 'ausgefallen')

  const namen = new Map<string, { name: string; sollMinuten: number | null }>()
  for (const k of (kraefteRes.data ?? []) as Array<{
    id: string; first_name: string | null; last_name: string | null; wochenstunden_soll: number | null
  }>) {
    namen.set(k.id, {
      name: `${k.first_name ?? ''} ${k.last_name ?? ''}`.trim() || k.id,
      sollMinuten: k.wochenstunden_soll != null ? Math.round(Number(k.wochenstunden_soll) * 60) : null,
    })
  }

  const jeKraft = new Map<string, { dienste: number; minuten: number }>()
  let geplanteMinuten = 0
  let unbesetzt = 0

  for (const d of dienste) {
    const dauer = dienstDauer(d.start_zeit, d.end_zeit, d.pause_minuten ?? 0)
    geplanteMinuten += dauer
    if (!d.caregiver_id) { unbesetzt++; continue }
    const stand = jeKraft.get(d.caregiver_id) ?? { dienste: 0, minuten: 0 }
    stand.dienste++
    stand.minuten += dauer
    jeKraft.set(d.caregiver_id, stand)
  }

  const auslastung: AuslastungZeile[] = [...jeKraft.entries()]
    .map(([caregiverId, stand]) => {
      const kraft = namen.get(caregiverId)
      const sollMinuten = kraft?.sollMinuten ?? null
      return {
        caregiverId,
        name: kraft?.name ?? caregiverId,
        dienste: stand.dienste,
        geplanteMinuten: stand.minuten,
        sollMinuten,
        abweichungMinuten: sollMinuten == null ? null : stand.minuten - sollMinuten,
      }
    })
    .sort((a, b) => b.geplanteMinuten - a.geplanteMinuten)

  return {
    wocheStart: von,
    wocheEnde: bis,
    diensteGesamt: dienste.length,
    diensteUnbesetzt: unbesetzt,
    geplanteMinuten,
    auslastung,
    abwesenheiten: (abwesenheitenRes.data ?? []).length,
    offeneVerstoesse: ((verstoesseRes.data ?? []) as Array<{
      id: string; caregiver_id: string; verstoss_art: string; datum: string
      gemessener_wert_minuten: number; grenzwert_minuten: number
    }>).map(v => ({
      id: v.id,
      caregiverId: v.caregiver_id,
      art: v.verstoss_art as 'max_tagesarbeitszeit' | 'mindestruhezeit',
      datum: v.datum,
      gemessen: Number(v.gemessener_wert_minuten),
      grenzwert: Number(v.grenzwert_minuten),
    })),
    freigabe,
  }
}

/**
 * Dauer eines Dienstes in Minuten, abzüglich Pause.
 *
 * Ein Ende vor dem Beginn ist KEIN Fehler, sondern ein Nachtdienst über
 * Mitternacht — dieselbe Rechnung wie `arbzg_pruefung()` in der Datenbank.
 * Wer hier naiv subtrahiert, bekommt für 22:00–06:00 minus 16 Stunden und
 * eine Auslastung, die nach unten lügt.
 */
function dienstDauer(start: string, ende: string, pauseMinuten: number): number {
  const min = (t: string) => {
    const [h, m] = t.split(':')
    return Number(h) * 60 + Number(m)
  }
  const a = min(start)
  const b = min(ende)
  const roh = b > a ? b - a : (24 * 60 - a) + b
  return Math.max(0, roh - (pauseMinuten || 0))
}

// ─────────────────────────────────────────────────────────────────
// Die ArbZG-Entscheidung
// ─────────────────────────────────────────────────────────────────

/**
 * Die PDL nimmt einen ArbZG-Verstoß zur Kenntnis und entscheidet.
 *
 * FAIL-CLOSED gegen eine Quittierung ohne Begründung: der Trigger
 * protokolliert bewusst, statt zu blockieren, damit ein Notfall die
 * Einsatzplanung nicht lahmlegt. Genau deshalb muss die Entscheidung
 * begründet sein — sonst ist die Nachgiebigkeit des Triggers eine
 * Hintertür statt eines Ermessens.
 */
export async function quittiereVerstoss(
  supabase: SupabaseClient,
  verstossId: string,
  organizationId: string,
  benutzerId: string,
  bemerkung: string,
): Promise<void> {
  if (!bemerkung?.trim()) {
    throw new UserFacingError(
      'Ein ArbZG-Verstoß wird nur mit Begründung quittiert. '
      + 'Warum war die Überschreitung in diesem Fall vertretbar?',
      400,
    )
  }

  const { data, error } = await supabase
    .from('arbeitszeit_verstoesse')
    .update({
      quittiert: true,
      quittiert_von: benutzerId,
      quittiert_am: new Date().toISOString(),
      bemerkung: bemerkung.trim(),
    })
    .eq('id', verstossId)
    .eq('organization_id', organizationId)
    .eq('quittiert', false)      // CAS: eine bereits quittierte Zeile nicht überschreiben
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Verstoß konnte nicht quittiert werden: ${error.message}`)
  if (!data) {
    throw new UserFacingError('Verstoß nicht gefunden oder bereits quittiert.', 404)
  }
}

// ─────────────────────────────────────────────────────────────────
// Freigabe
// ─────────────────────────────────────────────────────────────────

export async function getFreigabe(
  supabase: SupabaseClient, organizationId: string, wocheStartDatum: string,
): Promise<DienstplanFreigabe | null> {
  const { data, error } = await supabase
    .from('dienstplan_freigaben')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('woche_start', wochenStart(wocheStartDatum))
    .maybeSingle()
  if (error?.code === '42P01') {
    throw new UserFacingError(
      'Die Dienstplanfreigabe ist in dieser Datenbank noch nicht eingerichtet. '
      + 'Migration 20261020000000 ist noch nicht angewendet.',
      503,
    )
  }
  if (error) throw new Error(`Freigabe konnte nicht geladen werden: ${error.message}`)
  return (data as DienstplanFreigabe) ?? null
}

export interface FreigabeOptionen {
  /**
   * Freigeben, obwohl noch Dienste unbesetzt sind. Bewusst eine
   * ausdrückliche Entscheidung mit eigenem Schalter statt einer stillen
   * Toleranz: eine Woche mit Lücken freizugeben kann richtig sein (die
   * Besetzung steht noch aus), aber niemand soll es versehentlich tun.
   */
  trotzLuecken?: boolean
  hinweis?: string | null
}

/**
 * Gibt die Woche frei — FAIL-CLOSED gegen die zwei Dinge, die eine Woche
 * untauglich machen:
 *
 *   • unquittierte ArbZG-Verstöße. Sie sind der Grund, warum der Trigger
 *     bewusst nicht blockiert: „PDL entscheidet". Eine Freigabe, die an
 *     ihnen vorbeigeht, wäre keine Entscheidung, sondern ein Übersehen.
 *   • unbesetzte Dienste. Sie sind kein Fehler, aber eine Aussage — und
 *     brauchen deshalb den ausdrücklichen Schalter oben.
 *
 * Der Stand wird MITGESCHRIEBEN und nicht später nachgerechnet: die PDL
 * hat auf diese Zahlen hin freigegeben.
 */
export async function gibWocheFrei(
  supabase: SupabaseClient,
  organizationId: string,
  datumInDerWoche: string,
  freigegebenVon: string,
  optionen: FreigabeOptionen = {},
): Promise<DienstplanFreigabe> {
  const uebersicht = await ladeWochenUebersicht(supabase, organizationId, datumInDerWoche)

  if (uebersicht.freigabe?.status === 'freigegeben') {
    throw new UserFacingError(`Die Woche ab ${uebersicht.wocheStart} ist bereits freigegeben.`, 409)
  }
  if (uebersicht.diensteGesamt === 0) {
    throw new UserFacingError('Eine Woche ohne geplante Dienste kann nicht freigegeben werden.', 409)
  }
  if (uebersicht.offeneVerstoesse.length > 0) {
    throw new UserFacingError(
      `${uebersicht.offeneVerstoesse.length} offene(r) Verstoß gegen das Arbeitszeitgesetz in dieser Woche. `
      + 'Bitte jeden Verstoß mit Begründung quittieren oder den Dienst ändern.',
      409,
    )
  }
  if (uebersicht.diensteUnbesetzt > 0 && !optionen.trotzLuecken) {
    throw new UserFacingError(
      `${uebersicht.diensteUnbesetzt} Dienst(e) dieser Woche sind nicht besetzt. `
      + 'Besetzen — oder die Freigabe ausdrücklich trotz Lücken erteilen.',
      409,
    )
  }

  const quittierte = await zaehleQuittierte(supabase, organizationId, uebersicht.wocheStart, uebersicht.wocheEnde)

  const satz = {
    organization_id: organizationId,
    woche_start: uebersicht.wocheStart,
    status: 'freigegeben',
    freigegeben_von: freigegebenVon,
    freigegeben_am: new Date().toISOString(),
    dienste_gesamt: uebersicht.diensteGesamt,
    dienste_unbesetzt: uebersicht.diensteUnbesetzt,
    verstoesse_quittiert: quittierte,
    hinweis: optionen.hinweis?.trim() || null,
    zurueckgezogen_von: null,
    zurueckgezogen_am: null,
    zurueckziehungsgrund: null,
  }

  // Eine zurückgezogene Freigabe wird ERSETZT, nicht dupliziert — die
  // UNIQUE-Bedingung auf (organization_id, woche_start) lässt nur einen
  // Satz je Woche zu, und das ist richtig so: zwei Sätze wären zwei
  // Wahrheiten über dieselben Tage.
  const { data, error } = await supabase
    .from('dienstplan_freigaben')
    .upsert(satz, { onConflict: 'organization_id,woche_start' })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Freigabe konnte nicht erteilt werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as DienstplanFreigabe
}

/**
 * Zieht die Freigabe zurück — mit Grund.
 *
 * Die Zeile wird NICHT gelöscht. Sonst ließe sich später nicht mehr sagen,
 * ob eine Woche je verbindlich war, und der Rückzug wäre von „nie
 * freigegeben" nicht zu unterscheiden.
 */
export async function ziehefreigabeZurueck(
  supabase: SupabaseClient,
  organizationId: string,
  datumInDerWoche: string,
  benutzerId: string,
  grund: string,
): Promise<DienstplanFreigabe> {
  if (!grund?.trim()) {
    throw new UserFacingError('Ein Rückzug der Freigabe braucht einen Grund.', 400)
  }
  const woche = wochenStart(datumInDerWoche)
  const bestand = await getFreigabe(supabase, organizationId, woche)
  if (!bestand) throw new UserFacingError('Für diese Woche gibt es keine Freigabe.', 404)
  if (bestand.status === 'zurueckgezogen') {
    throw new UserFacingError('Die Freigabe ist bereits zurückgezogen.', 409)
  }

  const { data, error } = await supabase
    .from('dienstplan_freigaben')
    .update({
      status: 'zurueckgezogen',
      zurueckgezogen_von: benutzerId,
      zurueckgezogen_am: new Date().toISOString(),
      zurueckziehungsgrund: grund.trim(),
    })
    .eq('id', bestand.id)
    .eq('organization_id', organizationId)
    .eq('status', 'freigegeben')   // CAS gegen einen zweiten Rückzug
    .select('*')
    .maybeSingle()
  if (error) throw new Error(`Freigabe konnte nicht zurückgezogen werden: ${error.message}`)
  if (!data) throw new UserFacingError('Die Freigabe wurde zwischenzeitlich geändert. Bitte neu laden.', 409)
  return data as DienstplanFreigabe
}

export async function listFreigaben(
  supabase: SupabaseClient, organizationId: string, grenze = 26,
): Promise<DienstplanFreigabe[]> {
  const { data, error } = await supabase
    .from('dienstplan_freigaben')
    .select('*')
    .eq('organization_id', organizationId)
    .order('woche_start', { ascending: false })
    .limit(grenze)
  if (error?.code === '42P01') {
    throw new UserFacingError(
      'Die Dienstplanfreigabe ist in dieser Datenbank noch nicht eingerichtet. '
      + 'Migration 20261020000000 ist noch nicht angewendet.',
      503,
    )
  }
  if (error) throw new Error(`Freigaben konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanFreigabe[]
}

/** Wie viele Verstöße dieser Woche wurden quittiert — der Stand zur Freigabe. */
async function zaehleQuittierte(
  supabase: SupabaseClient, organizationId: string, von: string, bis: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('arbeitszeit_verstoesse')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('quittiert', true)
    .gte('datum', von)
    .lte('datum', bis)
  if (error) throw new Error(`Quittierte Verstöße konnten nicht gezählt werden: ${error.message}`)
  return (data ?? []).length
}

/** Ist die Woche dieses Datums freigegeben? Für Aufrufer, die nur das wissen wollen. */
export async function istWocheFreigegeben(
  supabase: SupabaseClient, organizationId: string, datum: string,
): Promise<boolean> {
  const freigabe = await getFreigabe(supabase, organizationId, datum)
  return freigabe?.status === 'freigegeben'
}

/** Der Montag der laufenden Woche — Startwert für die Oberfläche. */
export function aktuelleWoche(): string {
  return wochenStart(heuteBerlin())
}
