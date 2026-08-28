import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt, assertPlausibleZeiten,
  ARBEITSZEIT_QUELLE_WERTE, ARBEITSZEIT_STATUS_WERTE,
  type PersonalArbeitszeit, type ArbeitszeitKonto,
  type ArbeitszeitQuelle, type ArbeitszeitStatus,
} from './types'
import { assertCaregiverInOrg } from './organization-guard'

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
 * Migration 20261018000000 zieht deshalb `geaendert_von` nach und laesst
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
  istMinuten: number
  sollMinuten?: number | null
  dienstplanEintragId?: string | null
  serviceRecordId?: string | null
  quelle?: ArbeitszeitQuelle
  bemerkung?: string | null
}

export async function createArbeitszeit(supabase: SupabaseClient, params: CreateArbeitszeitParams): Promise<PersonalArbeitszeit> {
  assertErlaubt(params.quelle, ARBEITSZEIT_QUELLE_WERTE, 'quelle')
  assertPlausibleZeiten({ istMinuten: params.istMinuten, pauseMinuten: params.pauseMinuten })

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
    ist_minuten: params.istMinuten,
    soll_minuten: params.sollMinuten ?? null,
    dienstplan_eintrag_id: params.dienstplanEintragId ?? null,
    service_record_id: params.serviceRecordId ?? null,
    quelle: params.quelle ?? 'manuell',
    bemerkung: params.bemerkung ?? null,
  }

  // `geaendert_von` wird IMMER mitgeschrieben, auch als `null` — siehe
  // AkteurParams. Kennt die Datenbank die Spalte noch nicht (Migration
  // 20261018000000 nicht angewendet), antwortet sie mit 42703 und der
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
  assertPlausibleZeiten({ istMinuten: patch.istMinuten, pauseMinuten: patch.pauseMinuten })

  // Sperr-Logik VOR dem Schreiben.
  //
  // Der DB-Trigger log_arbeitszeit_korrektur blockt live nur den Fall
  // `OLD.gesperrt = true AND NEW.gesperrt = true`. Wer im selben UPDATE
  // `gesperrt: false` mitschickt, faellt aus dieser Bedingung heraus — die
  // Sperre liess sich also durch das Anhaengen eines einzigen Feldes
  // umgehen und der abgerechnete Zeitnachweis im selben Zug veraendern.
  // Belegt in __tests__/e2e/zeiterfassung-kette-pglite.test.ts gegen echtes
  // Postgres; Migration 20261018000000 zieht den Trigger nach (Sperre an der
  // Absicht statt am Endzustand), ist aber noch nicht angewendet.
  //
  // Dieser Guard bleibt auch danach stehen: er liefert die lesbare 409,
  // waehrend der Trigger eine Datenbankausnahme wirft.
  // Hier wird deshalb der Bestand gelesen und entschieden.
  const { data: bestand, error: ladeFehler } = await supabase
    .from('personal_arbeitszeiten')
    .select('gesperrt')
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

  const update: Record<string, unknown> = {}
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.istMinuten !== undefined) update.ist_minuten = patch.istMinuten
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
    //   • 23502 auf korrigiert_von — Migration 20261018000000 ist NICHT
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
