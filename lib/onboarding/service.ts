/**
 * Onboarding — Lesen und Fortschreiben von onboarding_progress
 *
 * Die einzige Stelle dieses Moduls mit Datenbankzugriff. schritte.ts,
 * triggers.ts und notifications.ts rechnen ohne Datenbank und sind
 * dadurch vollstaendig ohne Fixtures testbar.
 *
 * ── FAIL-CLOSED ────────────────────────────────────────────────────────
 * Jeder Lesefehler wirft. Ein leeres Ergebnis nach einem Fehler saehe aus
 * wie „diese Person hat noch nicht angefangen" — und wuerde einen
 * laufenden Ablauf auf Schritt 1 zuruecksetzen, samt aller schon
 * gegebenen Antworten. Deshalb steht hier nirgends `data ?? null` hinter
 * einem unbehandelten `error`.
 *
 * ── DER FORTSCHRITT GEHT NUR VORWAERTS ─────────────────────────────────
 * Alle Schreibwege lesen den Bestand ZUERST und schreiben nur, was ihn
 * hebt:
 *
 *   * ein abgeschlossener Ablauf nimmt keine Schrittdaten mehr an
 *   * aktueller_schritt wird nie gesenkt
 *   * ein bereits fertiger Schritt wird nicht auf „offen" zurueckgesetzt
 *
 * Das ist kein Luxus, sondern eine wiederkehrende Falle dieses Bestands:
 * ein spaet eintreffender Aufruf (zweiter Browsertab, Zurueck-Taste,
 * wiederholter Request) hat andernorts schon Endzustaende zurueckgestempelt.
 * Wer einen Ablauf wirklich neu starten will, nutzt starteNeu().
 *
 * ── organization_id kommt IMMER vom Aufrufer ───────────────────────────
 * profiles traegt keine organization_id, sie laesst sich hier also nicht
 * ableiten. Aufrufer holen sie ueber getActiveOrgId(). Ohne sie bricht
 * der Insert an NOT NULL — bewusst, statt still in den falschen Mandanten
 * zu schreiben.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  erwarteteAngabenFuer,
  gesamtSchritte,
  istSchrittStatus,
  schrittNummer,
  schrittfolge,
  type OnboardingTyp,
  type SchrittStatus,
} from './schritte'

const TABELLE = 'onboarding_progress'

const SPALTEN =
  'id, user_id, organization_id, typ, aktueller_schritt, gesamt_schritte, '
  + 'schritte_daten, fehlende_angaben, dokument_status, letzte_auto_nachricht, '
  + 'abbruchstelle, abgeschlossen_am, created_at, updated_at'

export class OnboardingNichtLesbarError extends Error {
  constructor(grund: string) {
    super(
      `Onboarding-Fortschritt nicht lesbar: ${grund}. `
      + `Es wurde NICHTS geschrieben — ein Ablauf auf geratenem Stand verliert `
      + `bereits gegebene Antworten.`
    )
    this.name = 'OnboardingNichtLesbarError'
  }
}

export class OnboardingAbgeschlossenError extends Error {
  constructor(typ: string) {
    super(
      `Der Ablauf "${typ}" ist bereits abgeschlossen und nimmt keine Aenderungen mehr an. `
      + `Ein erneuter Durchlauf wird ueber starteNeu() ausdruecklich angefordert.`
    )
    this.name = 'OnboardingAbgeschlossenError'
  }
}

/** Ein Schritt, so wie er in schritte_daten liegt. */
export interface SchrittEintrag {
  status: SchrittStatus
  daten: Record<string, unknown>
  zeitpunkt: string
}

export interface OnboardingFortschritt {
  id: string
  userId: string
  organizationId: string
  typ: OnboardingTyp
  aktuellerSchritt: number
  gesamtSchritte: number
  schritteDaten: Record<string, SchrittEintrag>
  fehlendeAngaben: string[]
  dokumentStatus: Record<string, unknown>
  letzteAutoNachricht: string | null
  abbruchstelle: string | null
  abgeschlossenAm: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingSchluessel {
  userId: string
  organizationId: string
  typ: OnboardingTyp
}

function zuFortschritt(z: Record<string, unknown>): OnboardingFortschritt {
  return {
    id: String(z.id),
    userId: String(z.user_id),
    organizationId: String(z.organization_id),
    typ: z.typ as OnboardingTyp,
    aktuellerSchritt: Number(z.aktueller_schritt ?? 1),
    gesamtSchritte: Number(z.gesamt_schritte ?? 0),
    schritteDaten: (z.schritte_daten ?? {}) as Record<string, SchrittEintrag>,
    fehlendeAngaben: (z.fehlende_angaben ?? []) as string[],
    dokumentStatus: (z.dokument_status ?? {}) as Record<string, unknown>,
    letzteAutoNachricht: (z.letzte_auto_nachricht as string | null) ?? null,
    abbruchstelle: (z.abbruchstelle as string | null) ?? null,
    abgeschlossenAm: (z.abgeschlossen_am as string | null) ?? null,
    createdAt: String(z.created_at ?? ''),
    updatedAt: String(z.updated_at ?? ''),
  }
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

/** Der Fortschritt einer Person in einem Ablauf; null, wenn nie begonnen. */
export async function holeFortschritt(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
): Promise<OnboardingFortschritt | null> {
  const { userId, organizationId, typ } = schluessel
  if (!userId || !organizationId) {
    throw new OnboardingNichtLesbarError('Person oder Mandant fehlt')
  }

  const { data, error } = await supabase
    .from(TABELLE)
    .select(SPALTEN)
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .eq('typ', typ)
    .maybeSingle()

  if (error) throw new OnboardingNichtLesbarError(error.message)
  return data ? zuFortschritt(data as unknown as Record<string, unknown>) : null
}

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

/**
 * Legt einen Ablauf an, falls es ihn noch nicht gibt, und liefert ihn.
 *
 * Der Normalfall beim Betreten des Wizards. `gesamt_schritte` stammt aus
 * schritte.ts und wird NICHT vom Aufrufer uebergeben — sonst koennten
 * Oberflaeche und Fortschrittsbalken verschiedene Laengen behaupten.
 */
export async function holeOderStarte(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
): Promise<OnboardingFortschritt> {
  const vorhanden = await holeFortschritt(supabase, schluessel)
  if (vorhanden) return vorhanden

  const { data, error } = await supabase
    .from(TABELLE)
    .insert({
      user_id: schluessel.userId,
      organization_id: schluessel.organizationId,
      typ: schluessel.typ,
      aktueller_schritt: 1,
      gesamt_schritte: gesamtSchritte(schluessel.typ),
    })
    .select(SPALTEN)
    .maybeSingle()

  if (error) {
    // Zwei Aufrufe gleichzeitig (Doppelklick, zweiter Tab): der
    // UNIQUE-Index hat gegriffen. Dann gibt es den Ablauf jetzt — lesen
    // statt scheitern.
    const nochmal = await holeFortschritt(supabase, schluessel)
    if (nochmal) return nochmal
    throw new OnboardingNichtLesbarError(`Ablauf nicht anlegbar (${error.message})`)
  }
  if (!data) throw new OnboardingNichtLesbarError('Ablauf angelegt, aber nicht lesbar')

  return zuFortschritt(data as unknown as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Fortschreiben
// ---------------------------------------------------------------------------

export interface SchrittEingabe {
  /** 1-basierte Schrittnummer. */
  schritt: number
  daten?: Record<string, unknown>
  /** Standard 'fertig'. 'uebersprungen' nur fuer ueberspringbare Schritte. */
  status?: SchrittStatus
}

/**
 * Haelt einen Schritt fest und rueckt den Ablauf vor.
 *
 * Automatisches Speichern: der Wizard ruft das bei JEDEM Schritt auf,
 * auch wenn die Person danach abbricht. Genau deshalb darf dieser Aufruf
 * nichts zuruecksetzen — siehe Kopf.
 *
 * Fehlende erwartete Angaben werden nicht abgelehnt, sondern in
 * `fehlende_angaben` vermerkt. Ein Ablauf, der bei der ersten Luecke
 * stehenbleibt, wird nicht ausgefuellt, sondern verlassen; die Luecke
 * gehoert in die Erinnerung, nicht in eine Fehlermeldung.
 */
export async function speichereSchritt(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
  eingabe: SchrittEingabe,
): Promise<OnboardingFortschritt> {
  const bestand = await holeOderStarte(supabase, schluessel)

  if (bestand.abgeschlossenAm) throw new OnboardingAbgeschlossenError(schluessel.typ)

  // Wirft bei einer Nummer ausserhalb der Folge — besser als eine Zeile
  // unter einem Schluessel, den keine Maske kennt.
  const definition = schrittNummer(schluessel.typ, eingabe.schritt)

  const status: SchrittStatus = eingabe.status && istSchrittStatus(eingabe.status)
    ? eingabe.status
    : 'fertig'

  if (status === 'uebersprungen' && !definition.ueberspringbar) {
    throw new Error(
      `Schritt "${definition.schluessel}" ist nicht ueberspringbar — `
      + `ohne diese Angaben kann der Ablauf nicht fortgesetzt werden.`
    )
  }

  const daten = eingabe.daten ?? {}

  // Bereits fertige Schritte nicht zurueckstufen: ein spaeter
  // eintreffender Aufruf mit 'offen' wuerde sonst Erledigtes einkassieren.
  const bisher = bestand.schritteDaten[definition.schluessel]
  const neuerStatus: SchrittStatus =
    bisher?.status === 'fertig' && status !== 'fertig' ? 'fertig' : status

  const schritteDaten: Record<string, SchrittEintrag> = {
    ...bestand.schritteDaten,
    [definition.schluessel]: {
      status: neuerStatus,
      // Bestehende Antworten bleiben erhalten; neue ueberschreiben nur,
      // was sie tatsaechlich mitbringen.
      daten: { ...(bisher?.daten ?? {}), ...daten },
      zeitpunkt: new Date().toISOString(),
    },
  }

  const fehlendeAngaben = ermittleFehlendeAngaben(schluessel.typ, schritteDaten)

  // Nur vorwaerts: der naechste Schritt, aber nie hinter den Bestand
  // zurueck und nie ueber das Ende der Folge hinaus (DB-CHECK).
  const naechster = Math.min(eingabe.schritt + 1, bestand.gesamtSchritte)
  const aktuellerSchritt = Math.max(bestand.aktuellerSchritt, naechster)

  const { data, error } = await supabase
    .from(TABELLE)
    .update({
      schritte_daten: schritteDaten,
      fehlende_angaben: fehlendeAngaben,
      aktueller_schritt: aktuellerSchritt,
      // Wer weitermacht, hat nicht abgebrochen.
      abbruchstelle: null,
    })
    .eq('id', bestand.id)
    // Nur schreiben, solange der Ablauf offen ist. Schliesst ihn parallel
    // jemand ab, trifft dieses UPDATE null Zeilen statt den Abschluss zu
    // ueberschreiben.
    .is('abgeschlossen_am', null)
    .select(SPALTEN)
    .maybeSingle()

  if (error) throw new OnboardingNichtLesbarError(`Schritt nicht speicherbar (${error.message})`)
  if (!data) throw new OnboardingAbgeschlossenError(schluessel.typ)

  return zuFortschritt(data as unknown as Record<string, unknown>)
}

/**
 * Welche erwarteten Angaben fehlen noch — ueber alle Schritte hinweg.
 * Rein rechnend, damit die Erinnerung dieselbe Liste bilden kann wie die
 * Oberflaeche.
 */
export function ermittleFehlendeAngaben(
  typ: OnboardingTyp,
  schritteDaten: Record<string, SchrittEintrag>,
): string[] {
  const fehlend: string[] = []
  for (const schritt of schrittfolge(typ)) {
    const eintrag = schritteDaten[schritt.schluessel]
    // Dieselbe Aufloesung wie im Wizard — sonst haelt die Oberflaeche
    // jemanden auf, den der Fortschritt fuer vollstaendig haelt.
    for (const angabe of erwarteteAngabenFuer(schritt, eintrag?.daten)) {
      const wert = eintrag?.daten?.[angabe]
      const leer = wert === undefined || wert === null || wert === ''
        || (Array.isArray(wert) && wert.length === 0)
      if (leer) fehlend.push(angabe)
    }
  }
  return fehlend
}

/**
 * Vermerkt eine hochgeladene Unterlage.
 *
 * Nur der VERWEIS steht hier — die Datei selbst liegt im Storage. Der
 * Fortschritt ist ein Protokoll des Ablaufs, kein Dateispeicher; ein
 * Base64-Anhang in jsonb waere in jeder Abfrage mit dabei.
 */
export async function vermerkeDokument(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
  art: string,
  eintrag: { pfad: string; dateiname: string; groesse: number },
): Promise<void> {
  const bestand = await holeOderStarte(supabase, schluessel)
  if (bestand.abgeschlossenAm) throw new OnboardingAbgeschlossenError(schluessel.typ)

  const dokumentStatus = {
    ...bestand.dokumentStatus,
    [art]: { ...eintrag, status: 'hochgeladen', zeitpunkt: new Date().toISOString() },
  }

  const { error } = await supabase
    .from(TABELLE)
    .update({ dokument_status: dokumentStatus })
    .eq('id', bestand.id)
    .is('abgeschlossen_am', null)

  if (error) throw new OnboardingNichtLesbarError(`Unterlage nicht vermerkbar (${error.message})`)
}

/**
 * Haelt fest, wo jemand den Ablauf verlassen hat.
 *
 * Bewusst getrennt von aktueller_schritt: der sagt, wo die Person STEHT,
 * die Abbruchstelle, wo sie GEGANGEN ist. Nur Letzteres beantwortet die
 * Frage, welcher Schritt Menschen verliert.
 */
export async function merkeAbbruch(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
  abbruchstelle: string,
): Promise<void> {
  const bestand = await holeFortschritt(supabase, schluessel)
  if (!bestand || bestand.abgeschlossenAm) return   // nichts zu merken

  const { error } = await supabase
    .from(TABELLE)
    .update({ abbruchstelle })
    .eq('id', bestand.id)
    .is('abgeschlossen_am', null)

  if (error) throw new OnboardingNichtLesbarError(`Abbruchstelle nicht speicherbar (${error.message})`)
}

/**
 * Schliesst den Ablauf ab.
 *
 * Fail-closed: solange nicht ueberspringbare Schritte offen sind, wird
 * NICHT abgeschlossen. Ein Ablauf, der sich selbst fuer fertig erklaert,
 * obwohl Pflichtangaben fehlen, verschwindet aus jeder Erinnerungsliste —
 * und niemand fragt die Angaben je nach.
 */
export async function schliesseAb(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
): Promise<OnboardingFortschritt> {
  const bestand = await holeFortschritt(supabase, schluessel)
  if (!bestand) throw new OnboardingNichtLesbarError('Kein Ablauf zum Abschliessen')
  if (bestand.abgeschlossenAm) return bestand   // idempotent

  const offenePflicht = schrittfolge(schluessel.typ)
    .filter(s => !s.ueberspringbar)
    .filter(s => bestand.schritteDaten[s.schluessel]?.status !== 'fertig')
    .map(s => s.schluessel)

  if (offenePflicht.length > 0) {
    throw new Error(
      `Ablauf "${schluessel.typ}" nicht abschliessbar — offene Pflichtschritte: `
      + `${offenePflicht.join(', ')}.`
    )
  }

  const { data, error } = await supabase
    .from(TABELLE)
    .update({ abgeschlossen_am: new Date().toISOString(), abbruchstelle: null })
    .eq('id', bestand.id)
    .is('abgeschlossen_am', null)
    .select(SPALTEN)
    .maybeSingle()

  if (error) throw new OnboardingNichtLesbarError(`Abschluss nicht speicherbar (${error.message})`)
  // Null Zeilen: parallel bereits abgeschlossen. Das ist kein Fehler.
  if (!data) {
    const nachher = await holeFortschritt(supabase, schluessel)
    if (nachher) return nachher
    throw new OnboardingNichtLesbarError('Abschluss ohne Wirkung')
  }

  return zuFortschritt(data as unknown as Record<string, unknown>)
}

/**
 * Startet einen Ablauf ausdruecklich neu — der einzige Weg, einen
 * Fortschritt zurueckzusetzen. Bewusst eine eigene Funktion mit eigenem
 * Namen: „zuruecksetzen" darf nie ein Nebeneffekt von „speichern" sein.
 */
export async function starteNeu(
  supabase: SupabaseClient,
  schluessel: OnboardingSchluessel,
): Promise<OnboardingFortschritt> {
  const bestand = await holeFortschritt(supabase, schluessel)
  if (!bestand) return holeOderStarte(supabase, schluessel)

  const { data, error } = await supabase
    .from(TABELLE)
    .update({
      aktueller_schritt: 1,
      gesamt_schritte: gesamtSchritte(schluessel.typ),
      schritte_daten: {},
      fehlende_angaben: [],
      dokument_status: {},
      abbruchstelle: null,
      abgeschlossen_am: null,
      letzte_auto_nachricht: null,
    })
    .eq('id', bestand.id)
    .select(SPALTEN)
    .maybeSingle()

  if (error) throw new OnboardingNichtLesbarError(`Neustart nicht moeglich (${error.message})`)
  if (!data) throw new OnboardingNichtLesbarError('Neustart ohne Wirkung')
  return zuFortschritt(data as unknown as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Betriebssicht
// ---------------------------------------------------------------------------

/**
 * Offene Ablaeufe eines Mandanten — Grundlage des Erinnerungslaufs.
 *
 * Sortiert nach `letzte_auto_nachricht` mit NULL zuerst: wer noch nie
 * erinnert wurde, kommt vor dem, der schon einmal gehoert hat.
 */
export async function offeneAblaeufe(
  supabase: SupabaseClient,
  params: { organizationId: string; typ?: OnboardingTyp; limit?: number },
): Promise<OnboardingFortschritt[]> {
  if (!params.organizationId) {
    throw new OnboardingNichtLesbarError('Mandant fehlt')
  }

  let abfrage = supabase
    .from(TABELLE)
    .select(SPALTEN)
    .eq('organization_id', params.organizationId)
    .is('abgeschlossen_am', null)
    .order('letzte_auto_nachricht', { ascending: true, nullsFirst: true })
    .limit(params.limit ?? 200)

  if (params.typ) abfrage = abfrage.eq('typ', params.typ)

  const { data, error } = await abfrage
  if (error) throw new OnboardingNichtLesbarError(`Offene Ablaeufe nicht lesbar (${error.message})`)

  return ((data ?? []) as unknown as Record<string, unknown>[]).map(zuFortschritt)
}

/**
 * Vermerkt, dass eine automatische Nachricht rausgegangen ist.
 *
 * Wird NACH dem Versand aufgerufen, nie davor: schlaegt der Versand fehl,
 * soll der naechste Lauf es erneut versuchen. Andersherum verstummte man
 * nach einem einzigen Fehlversuch.
 */
export async function vermerkeAutoNachricht(
  supabase: SupabaseClient,
  fortschrittId: string,
  zeitpunkt: string = new Date().toISOString(),
): Promise<void> {
  const { error } = await supabase
    .from(TABELLE)
    .update({ letzte_auto_nachricht: zeitpunkt })
    .eq('id', fortschrittId)

  if (error) {
    throw new OnboardingNichtLesbarError(`Nachrichtenvermerk nicht speicherbar (${error.message})`)
  }
}
