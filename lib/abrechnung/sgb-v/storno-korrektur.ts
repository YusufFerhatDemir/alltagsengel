/**
 * § 302 SGB V — Storno & Korrekturläufe
 *
 * Zwei-Schritt-Muster analog zu lib/abrechnung/korrekturlaeufe.ts (§105):
 * zuerst ein Korrektur-Vorgang mit Prüfung/Begründung ("angelegt"), erst bei
 * Ausführung entsteht ein neuer `sgb_v_laeufe`-Datensatz. Getrennt, damit ein
 * Storno nicht versehentlich per einzelnem DB-Write passiert, sondern
 * nachvollziehbar mit Begründung angelegt UND separat freigegeben wird.
 *
 * Die Trennung ist der Grund, warum die Ausführung eigene Prüfungen braucht:
 * zwischen Anlage und Freigabe können Minuten oder Tage liegen, und in dieser
 * Zeit kann der Original-Lauf weitergezogen sein. `fuehreSgbVKorrekturAus`
 * prüft den Original-Status deshalb NOCH EINMAL und setzt den Vorgang per
 * Compare-and-Swap auf `ausgefuehrt`, BEVOR der Korrekturlauf entsteht —
 * sonst erzeugen zwei gleichzeitige Freigaben zwei Korrekturläufe für
 * denselben Vorgang, und welcher davon gilt, entscheidet der Zufall.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '../../api/user-facing-error'
import { logBillingAction } from '../../billing/core/audit'

export type SgbVKorrekturTyp = 'storno' | 'teilstorno' | 'korrekturabrechnung'
export type SgbVKorrekturStatus = 'angelegt' | 'in_bearbeitung' | 'ausgefuehrt' | 'abgebrochen'

/** Welche Lauf-Stati je Korrekturtyp einen Korrekturvorgang zulassen. */
const KORRIGIERBARE_STATI: Record<SgbVKorrekturTyp, string[]> = {
  storno: ['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'],
  teilstorno: ['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'],
  korrekturabrechnung: ['teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich'],
}

/** Vorgangs-Stati, aus denen heraus eine Ausführung noch zulässig ist. */
const AUSFUEHRBARE_VORGANG_STATI = ['angelegt', 'in_bearbeitung']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ohne diese Prüfung landet ein Pfadsegment ungeprüft in einem PostgREST-
 * `or=(...)`-Ausdruck (siehe ladeSgbVKorrekturHistorie). Kommas und Klammern
 * darin sind Syntax, keine Daten — ein präparierter Wert hängt dort eigene
 * Filterglieder an. Die Lauf-IDs sind ausnahmslos UUIDs, deshalb ist die
 * strikte Prüfung hier kostenlos.
 */
function pruefeUuid(wert: string, feld: string): string {
  if (typeof wert !== 'string' || !UUID_RE.test(wert)) {
    throw new UserFacingError(`${feld} ist keine gültige ID.`, 400)
  }
  return wert
}

export interface SgbVKorrekturErstellenParams {
  organizationId: string
  originalLaufId: string
  ruecklaeuferId?: string
  korrekturTyp: SgbVKorrekturTyp
  korrekturGrund: string
  differenzCent?: number
  actorId: string
}

export interface SgbVKorrekturErgebnis {
  korrekturId: string
  status: SgbVKorrekturStatus
}

export async function erstelleSgbVKorrektur(
  supabase: SupabaseClient,
  params: SgbVKorrekturErstellenParams,
): Promise<SgbVKorrekturErgebnis> {
  if (!params.korrekturGrund?.trim()) {
    throw new UserFacingError('Korrekturgrund ist Pflicht — ein Storno ohne Begründung ist nicht nachvollziehbar.', 400)
  }
  if (!KORRIGIERBARE_STATI[params.korrekturTyp]) {
    throw new UserFacingError(`Unbekannter Korrekturtyp "${params.korrekturTyp}".`, 400)
  }
  pruefeUuid(params.originalLaufId, 'Lauf-ID')
  pruefeUuid(params.organizationId, 'Organisations-ID')

  const { data: original } = await supabase
    .from('sgb_v_laeufe')
    .select('id, status, gesamtbetrag_cent')
    .eq('id', params.originalLaufId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (!original) throw new UserFacingError('§ 302-Lauf nicht gefunden oder gehört zu einer anderen Organisation.', 404)

  const erlaubt = KORRIGIERBARE_STATI[params.korrekturTyp]
  if (!erlaubt.includes(original.status)) {
    throw new UserFacingError(
      `Lauf im Status "${original.status}" kann nicht als "${params.korrekturTyp}" korrigiert werden. `
      + `Erlaubt: ${erlaubt.join(', ')}.`,
      409,
    )
  }

  const differenzCent = pruefeDifferenz(params, original.gesamtbetrag_cent)

  const { data: row, error } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .insert({
      organization_id: params.organizationId,
      original_lauf_id: params.originalLaufId,
      ruecklaeufer_id: params.ruecklaeuferId ?? null,
      korrektur_typ: params.korrekturTyp,
      korrektur_grund: params.korrekturGrund,
      differenz_cent: differenzCent,
      status: 'angelegt',
      angelegt_von: params.actorId,
    })
    .select('id, status')
    .single()

  if (error || !row) {
    if (error?.code === '23505') {
      throw new UserFacingError('Für diesen Lauf existiert bereits ein offener Korrekturvorgang.', 409)
    }
    // Bewusst ohne error.message: die Meldung geht 1:1 an den Client, und
    // Postgres-Fehlertexte tragen Tabellen-, Spalten- und Constraint-Namen.
    throw new Error(`sgb_v_korrekturlaeufe insert fehlgeschlagen: ${error?.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'sgb_v_korrekturlauf',
    organizationId: params.organizationId,
    entityId: row.id,
    action: 'sgb_v_korrektur_angelegt',
    newState: {
      original_lauf_id: params.originalLaufId,
      typ: params.korrekturTyp,
      grund: params.korrekturGrund,
      differenz_cent: differenzCent,
    },
    actorId: params.actorId,
  })

  return { korrekturId: row.id, status: row.status }
}

/**
 * Der Differenzbetrag landet ungeprüft in der Abrechnung und bestimmt, was
 * die Kasse zurückfordert bzw. nachzahlt. Ohne Schranke war jeder Wert
 * zulässig — auch ein negativer (aus einer Rückforderung wird eine
 * Nachzahlung) oder einer über dem Laufbetrag.
 */
function pruefeDifferenz(params: SgbVKorrekturErstellenParams, gesamtbetragCent: number): number {
  if (params.differenzCent === undefined || params.differenzCent === null) {
    // Vollstorno der gesamten Summe ist der Normalfall; ein Teilstorno ohne
    // Betragsangabe wäre dagegen unbemerkt ein Vollstorno.
    if (params.korrekturTyp === 'teilstorno') {
      throw new UserFacingError('Ein Teilstorno braucht einen Differenzbetrag.', 400)
    }
    return gesamtbetragCent
  }

  const wert = params.differenzCent
  if (!Number.isInteger(wert)) {
    throw new UserFacingError('Der Differenzbetrag muss ein ganzzahliger Centbetrag sein.', 400)
  }
  if (wert < 0) {
    throw new UserFacingError('Der Differenzbetrag darf nicht negativ sein.', 400)
  }
  if (wert > gesamtbetragCent) {
    throw new UserFacingError(
      `Der Differenzbetrag (${wert} Cent) übersteigt den Laufbetrag (${gesamtbetragCent} Cent).`,
      400,
    )
  }
  return wert
}

export interface SgbVKorrekturAusfuehrenErgebnis {
  korrekturLaufId: string
}

export async function fuehreSgbVKorrekturAus(
  supabase: SupabaseClient,
  organizationId: string,
  korrekturId: string,
  actorId: string,
): Promise<SgbVKorrekturAusfuehrenErgebnis> {
  pruefeUuid(korrekturId, 'Korrektur-ID')
  pruefeUuid(organizationId, 'Organisations-ID')

  const { data: korrektur } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .select('id, status, korrektur_typ, korrektur_grund, original_lauf_id')
    .eq('id', korrekturId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!korrektur) throw new UserFacingError('Korrekturvorgang nicht gefunden oder gehört zu einer anderen Organisation.', 404)
  if (!AUSFUEHRBARE_VORGANG_STATI.includes(korrektur.status)) {
    throw new UserFacingError(`Korrekturvorgang im Status "${korrektur.status}" kann nicht ausgeführt werden.`, 409)
  }

  const { data: original } = await supabase
    .from('sgb_v_laeufe')
    .select('id, status, abrechnungsmonat, bundesland, kostentraeger_ik, kostentraeger_name')
    .eq('id', korrektur.original_lauf_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!original) throw new UserFacingError('Ursprünglicher Abrechnungslauf nicht gefunden.', 404)

  // Zweite Statusprüfung, nicht redundant: zwischen Anlage und Freigabe kann
  // der Lauf weitergezogen oder von einem anderen Weg storniert worden sein.
  // Ohne sie stempelt die Freigabe einen bereits abgeschlossenen Lauf
  // zurück auf "storniert".
  const erlaubt = KORRIGIERBARE_STATI[korrektur.korrektur_typ as SgbVKorrekturTyp] ?? []
  if (!erlaubt.includes(original.status)) {
    throw new UserFacingError(
      `Der Lauf steht inzwischen im Status "${original.status}" und kann nicht mehr `
      + `als "${korrektur.korrektur_typ}" korrigiert werden.`,
      409,
    )
  }

  // Compare-and-Swap VOR dem Insert: nur wer den Vorgang von einem
  // ausführbaren Status wegbewegt, darf den Korrekturlauf anlegen. Stünde
  // der Insert zuerst, erzeugten zwei gleichzeitige Freigaben zwei Läufe,
  // und der zweite bliebe als Karteileiche mit echtem Abrechnungsbetrag
  // stehen.
  const { data: beansprucht, error: casFehler } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .update({ status: 'ausgefuehrt', ausgefuehrt_am: new Date().toISOString(), ausgefuehrt_von: actorId })
    .eq('id', korrekturId)
    .eq('organization_id', organizationId)
    .in('status', AUSFUEHRBARE_VORGANG_STATI)
    .select('id')

  if (casFehler) throw new Error(`sgb_v_korrekturlaeufe CAS fehlgeschlagen: ${casFehler.message}`)
  if (!beansprucht || beansprucht.length === 0) {
    throw new UserFacingError('Der Korrekturvorgang wurde soeben von einer anderen Stelle ausgeführt.', 409)
  }

  const { data: neuerLauf, error: laufFehler } = await supabase
    .from('sgb_v_laeufe')
    .insert({
      organization_id: organizationId,
      abrechnungsmonat: original.abrechnungsmonat,
      bundesland: original.bundesland,
      kostentraeger_ik: original.kostentraeger_ik,
      kostentraeger_name: original.kostentraeger_name,
      status: 'erstellt',
      dateiindikator: '0',
      korrektur_von: korrektur.original_lauf_id,
      erstellt_von: actorId,
    })
    .select('id')
    .single()

  if (laufFehler || !neuerLauf) {
    // Den Anspruch zurückgeben, sonst bleibt der Vorgang auf "ausgefuehrt"
    // stehen, ohne dass je ein Korrekturlauf entstanden ist — und die
    // Teilsperre uq_sgb_v_korrektur_offen lässt dann auch keinen neuen
    // Versuch mehr zu.
    await supabase
      .from('sgb_v_korrekturlaeufe')
      .update({ status: korrektur.status, ausgefuehrt_am: null, ausgefuehrt_von: null })
      .eq('id', korrekturId)
      .eq('organization_id', organizationId)
    throw new Error(`sgb_v_laeufe insert (Korrekturlauf) fehlgeschlagen: ${laufFehler?.message}`)
  }

  await supabase
    .from('sgb_v_korrekturlaeufe')
    .update({ korrektur_lauf_id: neuerLauf.id })
    .eq('id', korrekturId)
    .eq('organization_id', organizationId)

  const neuerOriginalStatus = korrektur.korrektur_typ === 'korrekturabrechnung' ? 'korrigiert' : 'storniert'
  await supabase
    .from('sgb_v_laeufe')
    .update({ status: neuerOriginalStatus, storno_grund: korrektur.korrektur_grund })
    .eq('id', korrektur.original_lauf_id)
    .eq('organization_id', organizationId)

  await logBillingAction(supabase, {
    entityType: 'sgb_v_korrekturlauf',
    organizationId,
    entityId: korrekturId,
    action: 'sgb_v_korrektur_ausgefuehrt',
    newState: { korrektur_lauf_id: neuerLauf.id, original_lauf_status: neuerOriginalStatus },
    actorId,
  })

  return { korrekturLaufId: neuerLauf.id }
}

export async function ladeSgbVKorrekturHistorie(supabase: SupabaseClient, organizationId: string, laufId: string) {
  pruefeUuid(laufId, 'Lauf-ID')
  pruefeUuid(organizationId, 'Organisations-ID')

  const { data, error } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .select('id, original_lauf_id, korrektur_typ, korrektur_grund, status, korrektur_lauf_id, created_at')
    .eq('organization_id', organizationId)
    .or(`original_lauf_id.eq.${laufId},korrektur_lauf_id.eq.${laufId}`)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`sgb_v_korrekturlaeufe Historie fehlgeschlagen: ${error.message}`)
  return data || []
}
