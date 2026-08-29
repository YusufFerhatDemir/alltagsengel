import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt, assertPlausibleZeiten,
  ARBEITSZEIT_QUELLE_WERTE, ARBEITSZEIT_STATUS_WERTE,
  type PersonalArbeitszeit, type ArbeitszeitKonto,
  type ArbeitszeitQuelle, type ArbeitszeitStatus,
} from './types'
import { assertCaregiverInOrg } from './organization-guard'
import { nettoMinuten } from './arbzg'

/**
 * Die Netto-Arbeitszeit wird SERVERSEITIG hergeleitet, nicht geglaubt.
 *
 * BEFUND GAP-13 (29.08.2026): `istMinuten` kam bisher unveraendert aus dem
 * Request-Body in die Spalte `ist_minuten`. Die Oberflaeche rechnet zwar
 * `(Ende − Start) − Pause`, aber die Route rechnete nichts nach. Ein
 * Aufruf mit `startZeit 08:00, endZeit 20:00, pauseMinuten 0,
 * istMinuten 60` legte damit eine Zwoelfstundenschicht an, die als eine
 * Stunde in der Datenbank steht.
 *
 * Das ist nicht nur eine Zahl: `ist_minuten` traegt das Arbeitszeitkonto,
 * die Lohnabrechnung und — seit GAP-13 — die ArbZG-Pruefung. Eine
 * Pruefung auf einen frei waehlbaren Wert prueft nichts.
 *
 * Abgewiesen statt still ueberschrieben: ein stilles Korrigieren wuerde
 * einen kaputten Client auf Dauer verdecken, und der Nutzer bekaeme ein
 * gruenes „Gespeichert" fuer etwas anderes als das, was er eingegeben hat.
 */
function assertIstMinutenStimmig(
  startZeit: string | null | undefined,
  endZeit: string | null | undefined,
  pauseMinuten: number | null | undefined,
  uebergeben: number | null | undefined,
): number {
  const abgeleitet = nettoMinuten(startZeit, endZeit, pauseMinuten)
  if (abgeleitet == null) {
    throw new UserFacingError('Start- und Endzeit müssen im Format HH:MM angegeben werden.')
  }
  if (uebergeben == null) return abgeleitet
  if (Number(uebergeben) !== abgeleitet) {
    throw new UserFacingError(
      `Die Ist-Minuten (${uebergeben}) passen nicht zu Beginn, Ende und Pause `
      + `(daraus ergeben sich ${abgeleitet} Minuten). Bitte Zeiten korrigieren.`,
    )
  }
  return abgeleitet
}

/**
 * Wer handelt gerade? Die Zeiterfassung faehrt durchgehend mit
 * `createAdminClient()` (Dienstschluessel) — `auth.uid()` ist dort live
 * NULL, die JWT-Claims tragen nur `{"role":"service_role"}` und kein `sub`
 * (am 29.08.2026 gegen Produktion gemessen).
 *
 * Der DB-Trigger `log_arbeitszeit_korrektur` schreibt aber `auth.uid()` in
 * `personal_zeitkorrekturen.korrigiert_von`, und die Spalte ist NOT NULL.
 * Folge: JEDE Zeitkorrektur scheiterte mit 23502 und einer rohen
 * Datenbankmeldung. Aufgefallen ist das erst im Lauf gegen echtes Postgres
 * (__tests__/e2e/zeiterfassung-kette-pglite.test.ts); live nicht, weil
 * `personal_arbeitszeiten` 0 Zeilen traegt — niemand hat je korrigiert.
 *
 * Migration 20260829005500 zieht deshalb `geaendert_von` nach und laesst
 * den Trigger `COALESCE(auth.uid(), NEW.geaendert_von)` nehmen. Solange sie
 * nicht angewendet ist, kennt die Datenbank die Spalte nicht — ein 42703
 * ("column does not exist") fuehrt deshalb zu einem zweiten Versuch ohne
 * sie. Die Kette laeuft damit in beiden Schemafassungen; ohne die Migration
 * meldet sie die fehlende Urheberschaft lesbar, statt die rohe
 * Datenbankmeldung durchzureichen.
 */
export interface AkteurParams {
  /** Handelnder Benutzer (Routen: `admin.ctx.userId` bzw. `user.userId`). */
  benutzerId?: string | null
}

export interface CreateArbeitszeitParams extends AkteurParams {
  organizationId: string
  caregiverId: string
  datum: string
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  /**
   * Optional. Wird serverseitig aus Beginn, Ende und Pause hergeleitet;
   * ein mitgegebener abweichender Wert wird abgewiesen, nicht uebernommen
   * (siehe `assertIstMinutenStimmig`).
   */
  istMinuten?: number
  sollMinuten?: number | null
  dienstplanEintragId?: string | null
  serviceRecordId?: string | null
  quelle?: ArbeitszeitQuelle
  bemerkung?: string | null
}

export async function createArbeitszeit(supabase: SupabaseClient, params: CreateArbeitszeitParams): Promise<PersonalArbeitszeit> {
  assertErlaubt(params.quelle, ARBEITSZEIT_QUELLE_WERTE, 'quelle')
  const istMinuten = assertIstMinutenStimmig(
    params.startZeit, params.endZeit, params.pauseMinuten, params.istMinuten,
  )
  assertPlausibleZeiten({ istMinuten, pauseMinuten: params.pauseMinuten })

  // Mandanten-Fence VOR dem Schreiben (lib/personal/organization-guard.ts).
  // personal_arbeitszeitkonto joint `caregivers` ohne Mandanten-Bedingung —
  // eine Zeit auf einen fremden Mitarbeiter haette dessen Klarnamen in das
  // eigene Arbeitszeitkonto geholt.
  await assertCaregiverInOrg(supabase, params.caregiverId, params.organizationId)

  const zeile: Record<string, unknown> = {
    organization_id: params.organizationId,
    caregiver_id: params.caregiverId,
    datum: params.datum,
    start_zeit: params.startZeit,
    end_zeit: params.endZeit,
    pause_minuten: params.pauseMinuten ?? 0,
    ist_minuten: istMinuten,
    soll_minuten: params.sollMinuten ?? null,
    dienstplan_eintrag_id: params.dienstplanEintragId ?? null,
    service_record_id: params.serviceRecordId ?? null,
    quelle: params.quelle ?? 'manuell',
    bemerkung: params.bemerkung ?? null,
  }

  // `geaendert_von` wird IMMER mitgeschrieben, auch als `null` — siehe
  // AkteurParams. Kennt die Datenbank die Spalte noch nicht (Migration
  // 20260829005500 nicht angewendet), antwortet sie mit 42703 und der
  // zweite Versuch laeuft ohne sie.
  let antwort = await supabase
    .from('personal_arbeitszeiten')
    .insert({ ...zeile, geaendert_von: params.benutzerId ?? null })
    .select('*')
    .single()
  if (fehlerCode(antwort.error) === '42703') {
    antwort = await supabase.from('personal_arbeitszeiten').insert(zeile).select('*').single()
  }

  const { data, error } = antwort
  if (error || !data) throw new Error(`Arbeitszeit konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalArbeitszeit
}

/** Fehlercode einer PostgREST-Antwort, soweit vorhanden. */
function fehlerCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code
}

export interface ListArbeitszeitenFilter {
  organizationId: string
  caregiverId?: string
  datumVon?: string
  datumBis?: string
  status?: ArbeitszeitStatus
  nurGesperrt?: boolean
}

export async function listArbeitszeiten(supabase: SupabaseClient, filter: ListArbeitszeitenFilter): Promise<PersonalArbeitszeit[]> {
  let query = supabase
    .from('personal_arbeitszeiten')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('datum', { ascending: false })
    .order('start_zeit', { ascending: true })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.datumVon) query = query.gte('datum', filter.datumVon)
  if (filter.datumBis) query = query.lte('datum', filter.datumBis)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.nurGesperrt) query = query.eq('gesperrt', true)

  const { data, error } = await query
  if (error) throw new Error(`Arbeitszeiten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalArbeitszeit[]
}

export interface UpdateArbeitszeitParams extends AkteurParams {
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  istMinuten?: number
  sollMinuten?: number | null
  status?: ArbeitszeitStatus
  bestaetigtVon?: string | null
  bestaetigtAm?: string | null
  gesperrt?: boolean
  bemerkung?: string | null
}

/**
 * Felder, die den dokumentierten Zeitnachweis selbst veraendern. Genau diese
 * sind an einer gesperrten Arbeitszeit tabu; `gesperrt` und `bemerkung`
 * gehoeren nicht dazu, damit das Entsperren ueberhaupt moeglich bleibt.
 */
const NACHWEIS_FELDER: Array<keyof UpdateArbeitszeitParams> = [
  'startZeit', 'endZeit', 'pauseMinuten', 'istMinuten', 'sollMinuten',
  'status', 'bestaetigtVon', 'bestaetigtAm',
]

export async function updateArbeitszeit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateArbeitszeitParams,
): Promise<PersonalArbeitszeit> {
  assertErlaubt(patch.status, ARBEITSZEIT_STATUS_WERTE, 'status')

  // Sperr-Logik VOR dem Schreiben.
  //
  // Der DB-Trigger log_arbeitszeit_korrektur blockt live nur den Fall
  // `OLD.gesperrt = true AND NEW.gesperrt = true`. Wer im selben UPDATE
  // `gesperrt: false` mitschickt, faellt aus dieser Bedingung heraus — die
  // Sperre liess sich also durch das Anhaengen eines einzigen Feldes
  // umgehen und der abgerechnete Zeitnachweis im selben Zug veraendern.
  // Belegt in __tests__/e2e/zeiterfassung-kette-pglite.test.ts gegen echtes
  // Postgres; Migration 20260829005500 zieht den Trigger nach (Sperre an der
  // Absicht statt am Endzustand), ist aber noch nicht angewendet.
  //
  // Dieser Guard bleibt auch danach stehen: er liefert die lesbare 409,
  // waehrend der Trigger eine Datenbankausnahme wirft.
  // Hier wird deshalb der Bestand gelesen und entschieden.
  const { data: bestand, error: ladeFehler } = await supabase
    .from('personal_arbeitszeiten')
    .select('gesperrt, start_zeit, end_zeit, pause_minuten, ist_minuten')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ladeFehler) throw new Error(`Arbeitszeit konnte nicht geladen werden: ${ladeFehler.message}`)
  if (!bestand) throw new UserFacingError('Arbeitszeit nicht gefunden.', 404)

  if (bestand.gesperrt) {
    const beruehrteNachweisfelder = NACHWEIS_FELDER.filter(feld => patch[feld] !== undefined)
    if (beruehrteNachweisfelder.length > 0) {
      throw new UserFacingError(
        'Gesperrte Arbeitszeit kann nicht bearbeitet werden. Erst entsperren, dann korrigieren.',
        409,
      )
    }
    // Reines Entsperren (ggf. mit Bemerkung) bleibt erlaubt — sonst waere
    // eine einmal gesperrte Zeit fuer immer eingefroren.
    if (patch.gesperrt !== false) {
      throw new UserFacingError('Gesperrte Arbeitszeit kann nicht bearbeitet werden.', 409)
    }
  }

  // Die Netto-Arbeitszeit wird aus dem VERSCHMOLZENEN Stand hergeleitet,
  // nicht aus dem Patch allein: wer nur die Pause korrigiert, aendert damit
  // die Arbeitszeit — Beginn und Ende stehen dann weiter im Bestand. Ein
  // Patch, der nur `pauseMinuten` schickt und `ist_minuten` unangetastet
  // laesst, haette sonst eine Zeile hinterlassen, deren Ist-Minuten nicht
  // mehr zu ihren eigenen Zeiten passen — und jede spaetere ArbZG-Pruefung
  // haette den alten Wert gemessen.
  const beruehrtZeiten =
    patch.startZeit !== undefined || patch.endZeit !== undefined
    || patch.pauseMinuten !== undefined || patch.istMinuten !== undefined

  let istMinutenNeu: number | undefined
  if (beruehrtZeiten) {
    istMinutenNeu = assertIstMinutenStimmig(
      patch.startZeit ?? (bestand as { start_zeit?: string }).start_zeit,
      patch.endZeit ?? (bestand as { end_zeit?: string }).end_zeit,
      patch.pauseMinuten ?? (bestand as { pause_minuten?: number }).pause_minuten,
      patch.istMinuten,
    )
    assertPlausibleZeiten({
      istMinuten: istMinutenNeu,
      pauseMinuten: patch.pauseMinuten,
    })
  }

  const update: Record<string, unknown> = {}
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (istMinutenNeu !== undefined) update.ist_minuten = istMinutenNeu
  if (patch.sollMinuten !== undefined) update.soll_minuten = patch.sollMinuten
  if (patch.status !== undefined) update.status = patch.status
  if (patch.bestaetigtVon !== undefined) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.bestaetigtAm !== undefined) update.bestaetigt_am = patch.bestaetigtAm
  if (patch.gesperrt !== undefined) update.gesperrt = patch.gesperrt
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  // Siehe createArbeitszeit: die Spalte steht immer im UPDATE, und ein
  // 42703 fuehrt zu einem zweiten Versuch ohne sie.
  let antwort = await supabase
    .from('personal_arbeitszeiten')
    .update({ ...update, geaendert_von: patch.benutzerId ?? null })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (fehlerCode(antwort.error) === '42703') {
    antwort = await supabase
      .from('personal_arbeitszeiten')
      .update(update)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single()
  }

  const { data, error } = antwort
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Gesperrte Arbeitszeit')) throw new UserFacingError('Gesperrte Arbeitszeit kann nicht bearbeitet werden.')

    // Der Urheber fehlt. Zwei Auspraegungen, eine Ursache:
    //   • 23502 auf korrigiert_von — Migration 20260829005500 ist NICHT
    //     angewendet, der Trigger schreibt weiter blind auth.uid()
    //   • die Klartext-Ausnahme derselben Migration, wenn sie ANGEWENDET
    //     ist und die Anwendung trotzdem keinen Benutzer mitgibt
    // Beides ist derselbe Fehler und darf nicht als rohe Datenbankmeldung
    // nach aussen gehen — sie nennt Spalten- und Constraint-Namen.
    const ohneUrheber =
      msg.includes('Zeitkorrektur ohne Urheber') ||
      (fehlerCode(error) === '23502' && msg.includes('korrigiert_von'))
    if (ohneUrheber) {
      throw new UserFacingError(
        'Die Korrektur konnte nicht protokolliert werden, weil der bearbeitende Benutzer fehlt. '
        + 'Bitte neu anmelden und erneut versuchen.',
        409,
      )
    }

    throw new Error(`Arbeitszeit konnte nicht aktualisiert werden: ${msg}`)
  }
  return data as PersonalArbeitszeit
}

export async function listArbeitszeitKonto(
  supabase: SupabaseClient,
  organizationId: string,
  caregiverId?: string,
  jahr?: number,
  monat?: number,
): Promise<ArbeitszeitKonto[]> {
  let query = supabase
    .from('personal_arbeitszeitkonto')
    .select('*')
    .eq('organization_id', organizationId)
    .order('jahr', { ascending: false })
    .order('monat', { ascending: false })

  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (jahr) query = query.eq('jahr', jahr)
  if (monat) query = query.eq('monat', monat)

  const { data, error } = await query
  if (error) throw new Error(`Arbeitszeitkonto konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as ArbeitszeitKonto[]
}

// ═══════════════════════════════════════════════════════════════
// ArbZG-Verstöße am Arbeitszeitkonto
//
// BEFUND (29.08.2026): Seit Migration `20260829184500` legt der Trigger
// `arbzg_pruefung_ist()` beim Speichern einer erfassten Arbeitszeit
// Verstöße an — § 3 (Tageshöchstarbeitszeit), § 4 (Ruhepausen), § 5
// (Ruhezeit), gemessen an der GELEISTETEN Zeit, an die § 2 Abs. 1 ArbZG
// bindet. Gesehen hat sie danach nur das Fristen-Dashboard.
//
// Das Arbeitszeitkonto — die Ansicht, in der eine PDL über Arbeitszeit
// entscheidet — zeigte davon nichts. Wer dort Ist- und Sollstunden
// nebeneinander sieht, sieht damit die Zahl, aber nicht, dass sie unter
// Bruch einer Schutzvorschrift zustande kam. Genau deshalb steht die
// Zählung hier und nicht nur im Fristen-Dashboard: eine Überstunde ist
// eine Frage der Abrechnung, ein ArbZG-Verstoß eine der Zulässigkeit.
// ═══════════════════════════════════════════════════════════════

/** Offene (unquittierte) Verstöße eines Mitarbeiters, nach Herkunft getrennt. */
export interface VerstossZaehlung {
  caregiverId: string
  gesamt: number
  /** `basis = 'ist'` — aus der erfassten Arbeitszeit. */
  ausErfassung: number
  /** `basis = 'plan'` — aus dem Dienstplan. */
  ausDienstplan: number
}

/** Letzter Tag eines Monats als `YYYY-MM-DD`. */
function monatsEnde(jahr: number, monat: number): string {
  // Tag 0 des Folgemonats ist der letzte des gesuchten — in UTC gerechnet,
  // weil die lokale Zeitzone am Umstellungstag um einen Tag daneben liegen
  // kann und der letzte Monatstag dann fehlt.
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate()
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`
}

/**
 * Zählt offene ArbZG-Verstöße je Mitarbeiter.
 *
 * `jahr`/`monat` wirken nur GEMEINSAM: ein Jahr ohne Monat würde sonst
 * einen Zeitraum abgrenzen, den die aufrufende Ansicht gar nicht zeigt,
 * und die Zahl stünde neben einer Monatszeile, ohne zu ihr zu gehören.
 */
export async function zaehleOffeneArbzgVerstoesse(
  supabase: SupabaseClient,
  organizationId: string,
  jahr?: number,
  monat?: number,
  caregiverId?: string,
): Promise<VerstossZaehlung[]> {
  const abfrage = (auswahl: string) => {
    let q = supabase
      .from('arbeitszeit_verstoesse')
      .select(auswahl)
      .eq('organization_id', organizationId)
      .eq('quittiert', false)
    if (caregiverId) q = q.eq('caregiver_id', caregiverId)
    if (jahr && monat) {
      q = q.gte('datum', `${jahr}-${String(monat).padStart(2, '0')}-01`)
           .lte('datum', monatsEnde(jahr, monat))
    }
    return q
  }

  // Wie in lib/pdl/dienstplanfreigabe.ts und lib/automation/fristen-sammler.ts:
  // kennt das Schema `basis` noch nicht, antwortet PostgREST mit 42703.
  // Solche Zeilen sind ausnahmslos Plan-Verstöße — vor der Migration gab es
  // keine andere Herkunft.
  let antwort = await abfrage('caregiver_id, basis') as unknown as {
    data: Array<{ caregiver_id: string; basis?: string | null }> | null
    error: { message: string; code?: string } | null
  }
  if (antwort.error?.code === '42703') {
    antwort = await abfrage('caregiver_id') as unknown as typeof antwort
  }
  if (antwort.error) {
    throw new Error(`ArbZG-Verstöße konnten nicht gezählt werden: ${antwort.error.message}`)
  }

  const nach = new Map<string, VerstossZaehlung>()
  for (const zeile of antwort.data ?? []) {
    const eintrag = nach.get(zeile.caregiver_id)
      ?? { caregiverId: zeile.caregiver_id, gesamt: 0, ausErfassung: 0, ausDienstplan: 0 }
    eintrag.gesamt += 1
    // Nur der ausdrückliche Wert `ist` gilt als Erfassung; NULL und
    // Unbekanntes bleiben Plan — lieber die Herkunft zurückhaltend angeben
    // als eine behaupten, die nicht in der Zeile steht.
    if (zeile.basis === 'ist') eintrag.ausErfassung += 1
    else eintrag.ausDienstplan += 1
    nach.set(zeile.caregiver_id, eintrag)
  }
  return [...nach.values()]
}

export type KontoMitVerstoessen = ArbeitszeitKonto & {
  verstoesse_offen: number
  verstoesse_aus_erfassung: number
}

/**
 * Hängt die Zählung an die Kontozeilen.
 *
 * Getrennt von der Abfrage und ohne Datenbank, damit die Zuordnung selbst
 * prüfbar ist: der Fehler, den man hier macht, ist eine Zahl neben dem
 * falschen Namen — und der fällt in einem Lauf gegen echte Daten erst auf,
 * wenn ihn jemand nachrechnet.
 *
 * Ein Mitarbeiter ohne Verstöße bekommt ausdrücklich `0`, nicht `undefined`:
 * die Ansicht soll „keine" zeigen können und nicht „unbekannt" mit „keine"
 * verwechseln.
 */
export function verbindeKontoMitVerstoessen(
  konten: ArbeitszeitKonto[],
  zaehlungen: VerstossZaehlung[],
): KontoMitVerstoessen[] {
  const nach = new Map(zaehlungen.map(z => [z.caregiverId, z]))
  return konten.map(k => {
    const z = nach.get(k.caregiver_id)
    return {
      ...k,
      verstoesse_offen: z?.gesamt ?? 0,
      verstoesse_aus_erfassung: z?.ausErfassung ?? 0,
    }
  })
}
