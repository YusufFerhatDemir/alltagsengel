import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  ABWESENHEIT_STATUS_WERTE, ABWESENHEIT_TYP_WERTE,
  type Abwesenheit, type AbwesenheitStatus, type AbwesenheitTyp,
} from './types'
import { assertCaregiverInOrg } from './organization-guard'

export interface CreateAbwesenheitParams {
  organizationId: string
  caregiverId: string
  absenceType: AbwesenheitTyp
  startDate: string
  endDate: string
  reason?: string | null
  halberTag?: boolean
  tageBerechnet?: number | null
  dokumentId?: string | null
  erstelltVon: string
  status?: AbwesenheitStatus
}

/**
 * Zeitraum-Regeln, ohne Datenbank testbar.
 *
 * Ungeprueft rutschten hier bisher `end_date` VOR `start_date` und beliebige
 * Datumsformate durch. Beides faellt erst spaeter auf: `genehmigenAbwesenheit`
 * rechnet aus genau diesen Feldern die Urlaubstage aus, die dem Konto
 * belastet werden — ein verdrehter Zeitraum ergibt dort einen negativen
 * Rohwert, der ueber `Math.max(1, …)` still zu einem Tag wird.
 */
export function assertZeitraum(startDate: string, endDate: string): void {
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  if (!ISO.test(startDate ?? '')) throw new UserFacingError('Startdatum muss im Format YYYY-MM-DD vorliegen.')
  if (!ISO.test(endDate ?? '')) throw new UserFacingError('Enddatum muss im Format YYYY-MM-DD vorliegen.')
  // Kalendarisch echtes Datum — '2026-02-31' passt auf das Muster, existiert aber nicht.
  for (const [feld, wert] of [['Startdatum', startDate], ['Enddatum', endDate]] as const) {
    const d = new Date(`${wert}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== wert) {
      throw new UserFacingError(`${feld} ist kein gültiges Kalenderdatum.`)
    }
  }
  // Lexikografischer Vergleich ist bei ISO-Daten identisch zum zeitlichen.
  if (endDate < startDate) {
    throw new UserFacingError('Das Enddatum darf nicht vor dem Startdatum liegen.')
  }
}

export async function createAbwesenheit(supabase: SupabaseClient, params: CreateAbwesenheitParams): Promise<Abwesenheit> {
  assertErlaubt(params.absenceType, ABWESENHEIT_TYP_WERTE, 'absence_type')
  assertErlaubt(params.status, ABWESENHEIT_STATUS_WERTE, 'status')
  assertZeitraum(params.startDate, params.endDate)

  // Ein Antrag entsteht IMMER als 'beantragt'. Waere 'genehmigt' direkt
  // setzbar, liefe die Genehmigung an genehmigenAbwesenheit vorbei — und
  // damit an der Vier-Augen-Pruefung, der Restanspruchspruefung und der
  // Buchung auf das Urlaubskonto.
  if (params.status && params.status !== 'beantragt') {
    throw new UserFacingError(
      'Eine Abwesenheit wird immer als Antrag angelegt. Genehmigung und Ablehnung laufen über den jeweiligen Vorgang.',
      409,
    )
  }

  // Halbe Tage gibt es nur an einem einzelnen Tag.
  if (params.halberTag && params.startDate !== params.endDate) {
    throw new UserFacingError('Ein halber Tag ist nur für einen einzelnen Tag möglich.')
  }

  // Mandanten-Fence VOR dem Schreiben (lib/personal/organization-guard.ts).
  await assertCaregiverInOrg(supabase, params.caregiverId, params.organizationId)

  const { data, error } = await supabase
    .from('absences')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      absence_type: params.absenceType,
      start_date: params.startDate,
      end_date: params.endDate,
      reason: params.reason ?? null,
      status: params.status ?? 'beantragt',
      halber_tag: params.halberTag ?? false,
      tage_berechnet: params.tageBerechnet ?? null,
      dokument_id: params.dokumentId ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as Abwesenheit
}

export interface ListAbwesenheitenFilter {
  organizationId: string
  caregiverId?: string
  status?: AbwesenheitStatus
  absenceType?: AbwesenheitTyp
  datumVon?: string
  datumBis?: string
}

export async function listAbwesenheiten(supabase: SupabaseClient, filter: ListAbwesenheitenFilter): Promise<Abwesenheit[]> {
  let query = supabase
    .from('absences')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('start_date', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.absenceType) query = query.eq('absence_type', filter.absenceType)
  if (filter.datumVon) query = query.gte('start_date', filter.datumVon)
  if (filter.datumBis) query = query.lte('end_date', filter.datumBis)

  const { data, error } = await query
  if (error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as Abwesenheit[]
}

export interface UpdateAbwesenheitParams {
  absenceType?: AbwesenheitTyp
  startDate?: string
  endDate?: string
  reason?: string | null
  halberTag?: boolean
  tageBerechnet?: number | null
  dokumentId?: string | null
}

export async function updateAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateAbwesenheitParams,
): Promise<Abwesenheit> {
  assertErlaubt(patch.absenceType, ABWESENHEIT_TYP_WERTE, 'absence_type')
  // Nur pruefbar, wenn BEIDE Enden im Patch stehen — ein einseitig
  // verschobenes Ende wird unten gegen den Bestand geprueft.
  if (patch.startDate !== undefined && patch.endDate !== undefined) {
    assertZeitraum(patch.startDate, patch.endDate)
  }

  const update: Record<string, unknown> = {}
  if (patch.absenceType !== undefined) update.absence_type = patch.absenceType
  if (patch.startDate !== undefined) update.start_date = patch.startDate
  if (patch.endDate !== undefined) update.end_date = patch.endDate
  if (patch.reason !== undefined) update.reason = patch.reason
  if (patch.halberTag !== undefined) update.halber_tag = patch.halberTag
  if (patch.tageBerechnet !== undefined) update.tage_berechnet = patch.tageBerechnet
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  // Genehmigte/abgelehnte Abwesenheiten sind entschieden — insbesondere darf
  // eine bereits genehmigte Urlaubsabwesenheit nicht mehr im Zeitraum
  // verändert werden, ohne dass genehmigenAbwesenheit erneut über das
  // Urlaubskonto läuft. Sonst weichen die genommenen Tage von den
  // tatsächlich freigegebenen Daten ab (zu viel oder zu wenig gebucht).
  const { data: bestand, error: ladeFehler } = await supabase
    .from('absences')
    .select('status, start_date, end_date')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  if (ladeFehler || !bestand) throw new UserFacingError('Abwesenheit nicht gefunden.', 404)
  if (bestand.status !== 'beantragt') {
    throw new UserFacingError('Nur beantragte Abwesenheiten können bearbeitet werden. Bereits entschiedene Anträge sind unveränderlich.', 409)
  }

  // Einseitige Verschiebung: das nicht mitgeschickte Ende kommt aus dem
  // Bestand, sonst liesse sich der Zeitraum ueber zwei Aufrufe verdrehen.
  if (patch.startDate !== undefined || patch.endDate !== undefined) {
    assertZeitraum(
      patch.startDate ?? bestand.start_date,
      patch.endDate ?? bestand.end_date,
    )
  }

  const { data, error } = await supabase
    .from('absences')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'beantragt')
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as Abwesenheit
}

/**
 * Urlaubstage und Kontojahr eines Antrags — dieselbe Rechnung, die auf das
 * Konto gebucht wird, ohne Datenbank testbar.
 */
export function urlaubsBuchung(
  abwesenheit: Pick<Abwesenheit, 'start_date' | 'end_date' | 'halber_tag'>,
): { dauer: number; jahr: number } {
  const start = new Date(`${abwesenheit.start_date}T00:00:00Z`)
  const end = new Date(`${abwesenheit.end_date}T00:00:00Z`)
  const diffMs = end.getTime() - start.getTime()
  const tage = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)
  return {
    dauer: abwesenheit.halber_tag ? 0.5 : tage,
    jahr: start.getUTCFullYear(),
  }
}

export async function genehmigenAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  genehmigenVon: string,
): Promise<Abwesenheit> {
  const { data: existing, error: loadErr } = await supabase
    .from('absences')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  if (loadErr || !existing) throw new UserFacingError('Abwesenheit nicht gefunden.')
  if (existing.status !== 'beantragt') throw new UserFacingError('Nur beantragte Abwesenheiten können genehmigt werden.')
  if (existing.erstellt_von === genehmigenVon) {
    throw new UserFacingError('Eigene Abwesenheiten koennen nicht selbst genehmigt werden.')
  }

  // ── Kontodeckung VOR dem Statuswechsel ───────────────────────────────
  // Vorher lief die Buchung erst NACH dem Update. Scheiterte sie — kein
  // Urlaubskonto fuer das Jahr, zu wenig Restanspruch, CAS erschoepft —,
  // meldete die Route zwar einen Fehler, der Antrag stand aber bereits auf
  // 'genehmigt'. Die Betreuungskraft war damit im genehmigten Urlaub, das
  // Konto zeigte keinen Verbrauch, und nachbuchen liess sich das nie mehr:
  // genehmigen verlangt den Status 'beantragt', auf den der Antrag nicht
  // zurueckkonnte. Die Pruefung liegt deshalb jetzt davor.
  const istUrlaub = existing.absence_type === 'vacation'
  const buchung = istUrlaub
    ? urlaubsBuchung(existing as Abwesenheit)
    : null
  if (buchung) {
    await pruefeKontodeckung(supabase, organizationId, existing.caregiver_id, buchung.jahr, buchung.dauer)
  }

  const { data, error } = await supabase
    .from('absences')
    .update({
      status: 'genehmigt',
      genehmigt_von: genehmigenVon,
      genehmigt_am: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'beantragt')
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht genehmigt werden: ${error?.message ?? 'unbekannt'}`)

  const abwesenheit = data as Abwesenheit

  // P1-35: Urlaubskonto synchronisieren bei genehmigtem Urlaub
  if (buchung) {
    try {
      await bucheGenommeneTage(supabase, organizationId, abwesenheit.caregiver_id, buchung.jahr, buchung.dauer)
    } catch (fehler) {
      // Zwischen Vorpruefung und Buchung kann eine zweite Genehmigung den
      // Restanspruch aufgebraucht haben. Dann darf die Genehmigung NICHT
      // stehenbleiben — der Antrag geht zurueck auf 'beantragt' und kann
      // erneut entschieden werden.
      await supabase
        .from('absences')
        .update({ status: 'beantragt', genehmigt_von: null, genehmigt_am: null })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .eq('status', 'genehmigt')
      throw fehler
    }
  }

  return abwesenheit
}

/**
 * Liest das Urlaubskonto und prueft, ob `dauer` Tage noch gedeckt sind —
 * ohne zu schreiben. Fail-closed: ein Lesefehler oder ein fehlendes Konto
 * ist keine Deckung.
 */
async function pruefeKontodeckung(
  supabase: SupabaseClient,
  organizationId: string,
  caregiverId: string,
  jahr: number,
  dauer: number,
): Promise<void> {
  const { data: konto, error } = await supabase
    .from('personal_urlaubskonto')
    .select('anspruch_tage, uebertrag_vorjahr, genommen_tage, geplant_tage')
    .eq('organization_id', organizationId)
    .eq('caregiver_id', caregiverId)
    .eq('jahr', jahr)
    .maybeSingle()
  if (error) throw new Error(`Urlaubskonto konnte nicht geprüft werden: ${error.message}`)
  if (!konto) {
    throw new UserFacingError(
      `Für ${jahr} existiert kein Urlaubskonto für diese Betreuungskraft — Genehmigung ohne Kontobuchung nicht möglich.`
    )
  }
  const resturlaub = (konto.anspruch_tage ?? 0) + (konto.uebertrag_vorjahr ?? 0)
    - (konto.genommen_tage ?? 0) - (konto.geplant_tage ?? 0)
  if (dauer > resturlaub) {
    throw new UserFacingError(
      `Nicht genug Resturlaub: verfügbar ${resturlaub} Tage, beantragt ${dauer} Tage.`
    )
  }
}

/**
 * Bucht genommene Urlaubstage auf das Konto — mit Restanspruch-Prüfung und
 * optimistischer Nebenläufigkeitskontrolle (compare-and-swap auf
 * genommen_tage). Ohne die CAS-Bedingung könnten zwei nahezu gleichzeitige
 * Genehmigungen (verschiedene Anträge desselben Jahres) denselben gelesenen
 * Stand fortschreiben und sich gegenseitig überschreiben ("lost update").
 * `resturlaub` ist eine generierte Spalte ohne CHECK — ohne diese Prüfung
 * hier könnte ein Konto beliebig weit ins Minus genehmigt werden.
 */
async function bucheGenommeneTage(
  supabase: SupabaseClient,
  organizationId: string,
  caregiverId: string,
  jahr: number,
  dauer: number,
  versuche = 3,
): Promise<void> {
  for (let versuch = 0; versuch < versuche; versuch++) {
    const { data: konto, error: ladeFehler } = await supabase
      .from('personal_urlaubskonto')
      .select('id, anspruch_tage, uebertrag_vorjahr, genommen_tage, geplant_tage')
      .eq('organization_id', organizationId)
      .eq('caregiver_id', caregiverId)
      .eq('jahr', jahr)
      .maybeSingle()
    if (ladeFehler) throw new Error(`Urlaubskonto konnte nicht geprüft werden: ${ladeFehler.message}`)
    if (!konto) {
      throw new UserFacingError(
        `Für ${jahr} existiert kein Urlaubskonto für diese Betreuungskraft — Genehmigung ohne Kontobuchung nicht möglich.`
      )
    }

    const bisherGenommen = konto.genommen_tage ?? 0
    const resturlaub = (konto.anspruch_tage ?? 0) + (konto.uebertrag_vorjahr ?? 0) - bisherGenommen - (konto.geplant_tage ?? 0)
    if (dauer > resturlaub) {
      throw new UserFacingError(
        `Nicht genug Resturlaub: verfügbar ${resturlaub} Tage, beantragt ${dauer} Tage.`
      )
    }

    const { data: aktualisiert, error: schreibFehler } = await supabase
      .from('personal_urlaubskonto')
      .update({ genommen_tage: bisherGenommen + dauer })
      .eq('id', konto.id)
      .eq('organization_id', organizationId)
      .eq('genommen_tage', bisherGenommen) // CAS: nur wenn seit dem Lesen unverändert
      .select('id')
      .maybeSingle()
    if (schreibFehler) throw new Error(`Urlaubskonto konnte nicht aktualisiert werden: ${schreibFehler.message}`)
    if (aktualisiert) return // Erfolg

    // Zwischenzeitlich anderweitig geändert — mit frischem Stand erneut versuchen.
  }
  throw new UserFacingError('Urlaubskonto wird gerade von einer anderen Genehmigung verändert — bitte erneut versuchen.')
}

export async function ablehnenAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  abgelehntVon: string,
  ablehnungsgrund: string,
): Promise<Abwesenheit> {
  if (!ablehnungsgrund?.trim()) throw new UserFacingError('Ablehnungsgrund ist ein Pflichtfeld.')

  const { data, error } = await supabase
    .from('absences')
    .update({
      status: 'abgelehnt',
      genehmigt_von: abgelehntVon,
      genehmigt_am: new Date().toISOString(),
      ablehnungsgrund: ablehnungsgrund.trim(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'beantragt')
    .select('*')
    .single()
  // Kein Treffer heisst hier: der Antrag existiert nicht (mehr) im Status
  // 'beantragt' — `.single()` meldet das als PGRST116. Das ist eine
  // Fachmeldung, kein Infrastrukturfehler; als nackter Error verwischte der
  // Sanitizer sie zu einem 500er.
  if ((error && error.code === 'PGRST116') || (!error && !data)) {
    throw new UserFacingError('Nur beantragte Abwesenheiten können abgelehnt werden.', 409)
  }
  if (error || !data) throw new Error(`Abwesenheit konnte nicht abgelehnt werden: ${error?.message ?? 'unbekannt'}`)
  return data as Abwesenheit
}
