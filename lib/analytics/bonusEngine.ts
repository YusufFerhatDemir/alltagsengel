import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Block 19 — Bonussystem: Regelwerk, Berechnungslauf, Freigabe
// Leistungsbezogene Boni auf Basis konfigurierbarer Kriterien.
// Keine hartcodierten Beträge/Prozentsätze — jede Regel kommt aus
// der Tabelle bonus_regeln (Kriterium, Schwellenwert, Punkte).
// Kriterien sind bewusst auf real vorhandene, caregiver-bezogene
// Datenquellen begrenzt (absences, service_records, review_errors).
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'
import { abwesenheitBlockiert } from '@/lib/touren/server'
import { ohneStornierte } from '@/lib/leistungsnachweis/status-sync'

export type BonusKriteriumTyp =
  | 'keine_ausfaelle'
  | 'vollstaendige_dokumentation'
  | 'keine_offenen_pruefungen'

export const BONUS_KRITERIUM_TYP_WERTE: BonusKriteriumTyp[] = [
  'keine_ausfaelle',
  'vollstaendige_dokumentation',
  'keine_offenen_pruefungen',
]

export const BONUS_KRITERIUM_LABEL: Record<BonusKriteriumTyp, string> = {
  keine_ausfaelle: 'Keine Ausfälle (max. Ausfalltage im Zeitraum)',
  vollstaendige_dokumentation: 'Vollständige Dokumentation (% signierte Leistungsnachweise)',
  keine_offenen_pruefungen: 'Keine offenen Prüfhinweise (% Leistungsnachweise ohne offene Fehler)',
}

export type BonusBerechnungStatus = 'berechnet' | 'freigegeben' | 'abgelehnt' | 'ausgezahlt'

export interface BonusRegel {
  id: string
  organizationId: string
  name: string
  kriteriumTyp: BonusKriteriumTyp
  schwellenwert: number
  punkte: number
  aktiv: boolean
  createdAt: string
}

export interface BonusMesswert {
  erfuellt: boolean
  messwert: number
  begruendung: string
}

export interface BonusBerechnungsErgebnis {
  caregiverId: string
  erfuellt: boolean
  messwert: number
  punkte: number
  begruendung: string
  /**
   * true, wenn fuer diese Kraft NICHTS geschrieben wurde, weil die
   * Berechnung im Zeitraum bereits entschieden ist (freigegeben,
   * abgelehnt oder ausgezahlt). Der Messwert wird trotzdem ausgewiesen,
   * damit sichtbar bleibt, was ein neuer Lauf ergeben HAETTE.
   */
  uebersprungen?: boolean
  /** Grund des Ueberspringens — gehoert in die Oberflaeche. */
  hinweis?: string
}

/**
 * Zustaende, in denen eine Berechnung nicht mehr angefasst werden darf.
 *
 * BEFUND (P0, 27.08.2026): `fuehreBerechnungslaufDurch` schrieb per
 * `upsert(..., { onConflict: 'regel_id,caregiver_id,zeitraum_von,zeitraum_bis' })`
 * unbedingt `status: 'berechnet'`. Der Unique-Index dahinter existiert live
 * (`bonus_berechnungen_unique`), der Konflikt trat also zuverlaessig ein —
 * und ein zweiter Lauf ueber denselben Zeitraum setzte eine bereits
 * FREIGEGEBENE oder sogar AUSGEZAHLTE Praemie zurueck auf 'berechnet',
 * ueberschrieb Punkte und Messwert und liess den zugehoerigen Eintrag in
 * `bonus_freigaben` verwaist stehen. Die Praemie liess sich danach ein
 * zweites Mal freigeben — mit einer zweiten Entscheidungszeile fuer
 * denselben Vorgang.
 *
 * Dieselbe Klasse wie der monthly_closings-Upsert (feddad9), der einen
 * bereits versendeten Monatsabschluss auf 'ready' zurueckstempelte.
 */
export const ENTSCHIEDENE_BONUS_STATUS: readonly BonusBerechnungStatus[] = [
  'freigegeben',
  'abgelehnt',
  'ausgezahlt',
]

export function istEntschieden(status: string | null | undefined): boolean {
  return (ENTSCHIEDENE_BONUS_STATUS as readonly string[]).includes(String(status ?? '').trim())
}

export interface BonusBerechnung {
  id: string
  organizationId: string
  regelId: string
  caregiverId: string
  zeitraumVon: string
  zeitraumBis: string
  erfuellt: boolean
  messwert: number | null
  punkte: number
  status: BonusBerechnungStatus
  berechnetAm: string
  details: Record<string, unknown> | null
}

// ── Pure Kriterien-Bewertung ─────────────────────────────────────

export function bewerteKeineAusfaelle(ausfallTage: number, schwellenwertMaxTage: number): BonusMesswert {
  const erfuellt = ausfallTage <= schwellenwertMaxTage
  return { erfuellt, messwert: ausfallTage, begruendung: `${ausfallTage} Ausfalltag(e) im Zeitraum (Grenze: ${schwellenwertMaxTage}).` }
}

export function bewerteVollstaendigeDokumentation(gesamt: number, signiert: number, schwellenwertProzent: number): BonusMesswert {
  if (gesamt === 0) return { erfuellt: false, messwert: 0, begruendung: 'Keine Leistungsnachweise im Zeitraum — Kriterium nicht bewertbar.' }
  const quote = Math.round((signiert / gesamt) * 1000) / 10
  return { erfuellt: quote >= schwellenwertProzent, messwert: quote, begruendung: `${quote}% signierte Leistungsnachweise (Ziel: ${schwellenwertProzent}%).` }
}

export function bewerteKeineOffenenPruefungen(gesamt: number, mitOffenenFehlern: number, schwellenwertProzent: number): BonusMesswert {
  if (gesamt === 0) return { erfuellt: false, messwert: 0, begruendung: 'Keine Leistungsnachweise im Zeitraum — Kriterium nicht bewertbar.' }
  // `mitOffenenFehlern` ist eine Zahl von NACHWEISEN und kann `gesamt` nicht
  // uebersteigen. Die Klammer ist die zweite Linie hinter dem Zaehlfehler,
  // der genau das tat (Fehlerzeilen statt Nachweise) und -50 % lieferte:
  // eine negative Quote ist keine Quote, und sie stand als `messwert` in der
  // Datenbank und im Bericht.
  const ohneFehler = Math.min(Math.max(mitOffenenFehlern, 0), gesamt)
  const quoteOhneFehler = Math.round(((gesamt - ohneFehler) / gesamt) * 1000) / 10
  return { erfuellt: quoteOhneFehler >= schwellenwertProzent, messwert: quoteOhneFehler, begruendung: `${quoteOhneFehler}% ohne offene Prüfhinweise (Ziel: ${schwellenwertProzent}%).` }
}

export function berechnePunkteFuerMesswert(punkteRegel: number, messwert: BonusMesswert): number {
  return messwert.erfuellt ? punkteRegel : 0
}

// ── Zeitraum ──────────────────────────────────────────────────────

/** `YYYY-MM-DD` — alles andere darf weder in einen PostgREST-Filter noch in eine date-Spalte. */
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

/**
 * Prueft den Berechnungszeitraum, BEVOR er in Filter und Schreibvorgang geht.
 *
 * Ohne diese Pruefung:
 *   - `zeitraum_bis >= zeitraum_von` ist live ein CHECK auf
 *     `bonus_berechnungen`; eine verdrehte Eingabe kam als 23514 und damit
 *     als 'Interner Serverfehler' zurueck statt als lesbarer Hinweis.
 *   - Ein nicht lesbares Datum machte in `bewerteKeineAusfaelle` aus
 *     `new Date(von).getTime()` NaN. `Math.max(1, NaN)` ist NaN, die
 *     Summe wird NaN, `NaN <= schwellenwert` ist FALSE — die Praemie fiel
 *     also still aus, ohne dass irgendwo ein Fehler sichtbar wurde, und
 *     `messwert: NaN` ging in eine numeric-Spalte.
 */
export function assertZeitraum(von: unknown, bis: unknown): { von: string; bis: string } {
  const v = String(von ?? '').trim()
  const b = String(bis ?? '').trim()
  if (!ISO_DATUM.test(v)) throw new UserFacingError(`„von" muss ein Datum im Format JJJJ-MM-TT sein (erhalten: „${v || '(leer)'}").`)
  if (!ISO_DATUM.test(b)) throw new UserFacingError(`„bis" muss ein Datum im Format JJJJ-MM-TT sein (erhalten: „${b || '(leer)'}").`)
  if (!istKalendertag(v)) throw new UserFacingError(`„von" ist kein gültiges Datum: „${v}".`)
  if (!istKalendertag(b)) throw new UserFacingError(`„bis" ist kein gültiges Datum: „${b}".`)
  if (b < v) throw new UserFacingError(`„bis" (${b}) liegt vor „von" (${v}).`)
  return { von: v, bis: b }
}

/**
 * Existiert dieser Kalendertag wirklich?
 *
 * `Date.parse('2026-02-30')` ist NICHT verlaesslich NaN — Laufzeiten rollen
 * den ueberzaehligen Tag in den Folgemonat. Geprueft wird deshalb per
 * Rueckrechnung: was hineingegeben wurde, muss auch wieder herauskommen.
 * Postgres wuerde 2026-02-30 mit 22008 abweisen, was ohne diese Pruefung
 * als 'Interner Serverfehler' beim Nutzer ankaeme.
 */
function istKalendertag(iso: string): boolean {
  const [j, m, t] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(j, m - 1, t))
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t
}

// ── Row-Mapper ────────────────────────────────────────────────────

function mapRegel(row: any): BonusRegel {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    kriteriumTyp: row.kriterium_typ,
    schwellenwert: Number(row.schwellenwert),
    punkte: Number(row.punkte),
    aktiv: row.aktiv,
    createdAt: row.created_at,
  }
}

function mapBerechnung(row: any): BonusBerechnung {
  return {
    id: row.id,
    organizationId: row.organization_id,
    regelId: row.regel_id,
    caregiverId: row.caregiver_id,
    zeitraumVon: row.zeitraum_von,
    zeitraumBis: row.zeitraum_bis,
    erfuellt: row.erfuellt,
    messwert: row.messwert != null ? Number(row.messwert) : null,
    punkte: Number(row.punkte),
    status: row.status,
    berechnetAm: row.berechnet_am,
    details: row.details,
  }
}

// ── Regelwerk (CRUD) ───────────────────────────────────────────────

export async function listRegeln(supabase: SupabaseClient, organizationId: string): Promise<BonusRegel[]> {
  const { data, error } = await supabase
    .from('bonus_regeln')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Regelwerk konnte nicht geladen werden: ${error.message}`)
  return (data || []).map(mapRegel)
}

export async function createRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; name: string; kriteriumTyp: BonusKriteriumTyp; schwellenwert: number; punkte: number; userId: string },
): Promise<BonusRegel> {
  // Erlaubnisliste statt Sperrliste, und als UserFacingError: der Wert kommt
  // aus einem Auswahlfeld, ein Treffer daneben ist ein Bedienfehler und
  // keine Stoerung — die Meldung nennt deshalb die zulaessigen Werte.
  if (!BONUS_KRITERIUM_TYP_WERTE.includes(params.kriteriumTyp)) {
    throw new UserFacingError(
      `Unbekanntes Kriterium „${params.kriteriumTyp}". Zulässig: ${BONUS_KRITERIUM_TYP_WERTE.join(', ')}.`,
    )
  }
  if (!String(params.name ?? '').trim()) throw new UserFacingError('Name der Regel ist Pflicht.')
  // `punkte > 0` ist live auch ein CHECK (bonus_regeln_punkte_check) — hier
  // nur, damit die Verletzung als Klartext und nicht als 23514 ankommt.
  if (!Number.isFinite(params.punkte) || !(params.punkte > 0)) {
    throw new UserFacingError('Punkte müssen eine Zahl größer als 0 sein.')
  }
  // Der Schwellenwert hat KEINEN CHECK. Ohne diese Pruefung liess sich eine
  // Regel mit NaN oder negativem Schwellenwert anlegen, die anschliessend
  // jeden Berechnungslauf still auf „nicht erfuellt" stellt.
  if (!Number.isFinite(params.schwellenwert) || params.schwellenwert < 0) {
    throw new UserFacingError('Schwellenwert muss eine Zahl ab 0 sein.')
  }
  const { data, error } = await supabase
    .from('bonus_regeln')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      kriterium_typ: params.kriteriumTyp,
      schwellenwert: params.schwellenwert,
      punkte: params.punkte,
      aktiv: true,
      created_by: params.userId,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return mapRegel(data)
}

export async function setRegelAktiv(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; aktiv: boolean },
): Promise<BonusRegel> {
  const { data, error } = await supabase
    .from('bonus_regeln')
    .update({ aktiv: params.aktiv, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return mapRegel(data)
}

// ── Berechnungslauf ────────────────────────────────────────────────

export async function fuehreBerechnungslaufDurch(
  supabase: SupabaseClient,
  params: { organizationId: string; regelId: string; von: string; bis: string; userId: string },
): Promise<BonusBerechnungsErgebnis[]> {
  const { organizationId, regelId, userId } = params
  const { von, bis } = assertZeitraum(params.von, params.bis)

  const { data: regelRow, error: regelErr } = await supabase
    .from('bonus_regeln')
    .select('*')
    .eq('id', regelId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (regelErr) throw new Error(`Regel konnte nicht geladen werden: ${regelErr.message}`)
  if (!regelRow) throw new UserFacingError('Regel nicht gefunden.')
  const regel = mapRegel(regelRow)
  if (!regel.aktiv) throw new UserFacingError('Regel ist deaktiviert — kein Berechnungslauf möglich.')

  const { data: caregiverRows, error: caregiverErr } = await supabase
    .from('caregivers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  if (caregiverErr) throw new Error(`Kräfte konnten nicht geladen werden: ${caregiverErr.message}`)
  const caregiverIds = (caregiverRows || []).map((c: any) => c.id as string)
  if (caregiverIds.length === 0) return []

  const messwerte = await ermittleMesswerte(supabase, organizationId, regel.kriteriumTyp, caregiverIds, von, bis)

  // Bestand des Zeitraums VOR dem Schreiben lesen. FAIL-CLOSED: laesst sich
  // nicht feststellen, welche Berechnungen bereits entschieden sind, wird
  // gar nichts geschrieben — ein Lesefehler darf nicht dazu fuehren, dass
  // eine ausgezahlte Praemie ueberschrieben wird.
  const { data: bestandRows, error: bestandErr } = await supabase
    .from('bonus_berechnungen')
    .select('id, caregiver_id, status')
    .eq('organization_id', organizationId)
    .eq('regel_id', regelId)
    .eq('zeitraum_von', von)
    .eq('zeitraum_bis', bis)
  if (bestandErr) {
    throw new Error(
      `Vorhandene Berechnungen konnten nicht geprüft werden: ${bestandErr.message}. `
      + 'Es wurde NICHTS geschrieben — ein Lauf, der eine bereits freigegebene '
      + 'Prämie überschreibt, wäre schlimmer als ein ausbleibender Lauf.',
    )
  }
  const bestand = new Map<string, { id: string; status: string }>(
    (bestandRows || []).map((r: any) => [r.caregiver_id as string, { id: r.id as string, status: r.status as string }]),
  )

  const ergebnisse: BonusBerechnungsErgebnis[] = []
  for (const caregiverId of caregiverIds) {
    const messwert = messwerte(caregiverId, regel.schwellenwert)
    const punkte = berechnePunkteFuerMesswert(regel.punkte, messwert)
    const basis: BonusBerechnungsErgebnis = {
      caregiverId,
      erfuellt: messwert.erfuellt,
      messwert: messwert.messwert,
      punkte,
      begruendung: messwert.begruendung,
    }

    const vorhanden = bestand.get(caregiverId)
    if (vorhanden && istEntschieden(vorhanden.status)) {
      ergebnisse.push({
        ...basis,
        uebersprungen: true,
        hinweis:
          `Bereits entschieden (${vorhanden.status}) — nicht überschrieben. `
          + 'Für eine Neuberechnung muss die Entscheidung zuerst zurückgenommen werden.',
      })
      continue
    }

    const nutzlast = {
      organization_id: organizationId,
      regel_id: regelId,
      caregiver_id: caregiverId,
      zeitraum_von: von,
      zeitraum_bis: bis,
      erfuellt: messwert.erfuellt,
      messwert: messwert.messwert,
      punkte,
      status: 'berechnet' as const,
      berechnet_am: new Date().toISOString(),
      berechnet_von: userId,
      details: { begruendung: messwert.begruendung, kriteriumTyp: regel.kriteriumTyp },
    }

    if (vorhanden) {
      // Compare-and-Swap auf 'berechnet': entscheidet jemand zwischen dem
      // Bestands-Lesen oben und hier, trifft das UPDATE keine Zeile mehr
      // und die Entscheidung bleibt stehen.
      const { data: aktualisiert, error: updErr } = await supabase
        .from('bonus_berechnungen')
        .update(nutzlast)
        .eq('id', vorhanden.id)
        .eq('organization_id', organizationId)
        .eq('status', 'berechnet')
        .select('id')
        .maybeSingle()
      if (updErr) throw new Error(`Berechnung konnte nicht gespeichert werden: ${updErr.message}`)
      if (!aktualisiert) {
        ergebnisse.push({
          ...basis,
          uebersprungen: true,
          hinweis: 'Während des Laufs entschieden — nicht überschrieben.',
        })
        continue
      }
    } else {
      const { error: insErr } = await supabase.from('bonus_berechnungen').insert(nutzlast)
      if (insErr) {
        // 23505: eine parallele Berechnung hat die Zeile inzwischen angelegt.
        // Kein Fehler des Laufs — aber auch kein Grund, fremde Werte zu
        // ueberschreiben.
        if (insErr.code === '23505') {
          ergebnisse.push({
            ...basis,
            uebersprungen: true,
            hinweis: 'Parallel angelegt — nicht überschrieben.',
          })
          continue
        }
        throw new Error(`Berechnung konnte nicht gespeichert werden: ${insErr.message}`)
      }
    }

    ergebnisse.push(basis)
  }
  return ergebnisse
}

async function ermittleMesswerte(
  supabase: SupabaseClient,
  organizationId: string,
  kriteriumTyp: BonusKriteriumTyp,
  caregiverIds: string[],
  von: string,
  bis: string,
): Promise<(caregiverId: string, schwellenwert: number) => BonusMesswert> {
  if (kriteriumTyp === 'keine_ausfaelle') {
    const { data, error } = await supabase
      .from('absences')
      // `status` wurde bisher nicht einmal gelesen — siehe unten.
      .select('caregiver_id, status, start_date, end_date')
      .eq('organization_id', organizationId)
      .in('caregiver_id', caregiverIds)
      .lte('start_date', bis)
      .gte('end_date', von)
    if (error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${error.message}`)
    const tageProCaregiver = new Map<string, number>()
    for (const row of data || []) {
      // BEFUND (P1, 27.08.2026): hier wurde GAR NICHT nach Status gefiltert.
      // `absences.status` ist live CHECK-gebunden auf
      // 'beantragt' | 'genehmigt' | 'abgelehnt' | 'storniert' (nullable).
      // Ein ABGELEHNTER Urlaubsantrag zaehlte damit als Ausfalltag gegen die
      // Praemie: die Kraft hat an dem Tag gearbeitet, weil der Antrag
      // abgelehnt wurde — und verlor dafuer Geld. Fuer einen zurueckgezogenen
      // ('storniert') Antrag galt dasselbe.
      //
      // Massgeblich ist dieselbe Liste wie in der Einsatzplanung
      // (BLOCKIERENDE_ABWESENHEITS_STATUS, lib/touren/server.ts) und im
      // DB-Trigger check_doppelbelegung: 'beantragt', 'genehmigt' und NULL
      // (Altbestand) sind echte Abwesenheiten, 'abgelehnt' und 'storniert'
      // sind es nicht. Bewusst KEINE zweite Wortliste — zwei Vokabulare fuer
      // dieselbe Frage sind die Fehlerquelle, nicht die Loesung.
      if (!abwesenheitBlockiert(row.status)) continue

      const start = new Date(Math.max(new Date(row.start_date).getTime(), new Date(von).getTime()))
      const end = new Date(Math.min(new Date(row.end_date).getTime(), new Date(bis).getTime()))
      const tage = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      tageProCaregiver.set(row.caregiver_id, (tageProCaregiver.get(row.caregiver_id) || 0) + tage)
    }
    return (caregiverId, schwellenwert) => bewerteKeineAusfaelle(tageProCaregiver.get(caregiverId) || 0, schwellenwert)
  }

  // vollstaendige_dokumentation / keine_offenen_pruefungen — beide brauchen service_records
  const { data: records, error: recErr } = await supabase
    .from('service_records')
    // proof_status/billing_status gehoeren ins select, sonst sind sie in
    // ohneStornierte() undefined und es wird nichts entfernt.
    .select('id, caregiver_id, client_signature, proof_status, billing_status')
    .eq('organization_id', organizationId)
    .in('caregiver_id', caregiverIds)
    .gte('date', von)
    .lte('date', bis)
  if (recErr) throw new Error(`Leistungsnachweise konnten nicht geladen werden: ${recErr.message}`)

  // BEFUND (P1): stornierte Nachweise zaehlten mit. Ein Storno schreibt nur
  // proof_status/billing_status='STORNIERT'; `status` bleibt auf 'signed'
  // stehen (kein Storno-Wert im status-Werteset). Der widerrufene Nachweis
  // zaehlte damit in `gesamt` und — weil er in aller Regel nicht mehr
  // unterschrieben wird — als fehlende Dokumentation gegen die Kraft.
  // Dieselbe Quelle wie Rechnungslauf und Monatsabschluss:
  // lib/leistungsnachweis/status-sync.ts.
  const gueltige = ohneStornierte(records || [])

  // BEFUND (P1): gemessen wurde ausschliesslich `client_signature`. Eine in
  // der App geleistete Unterschrift liegt aber in `service_signatures`
  // (signer_role='client') — genau so rechnet der Monatsabschluss
  // (lib/abrechnung/monatsabschluss.ts: `!r.client_signature &&
  // !signedRecordIds.has(r.id)`). Eine Kraft, deren Kundschaft
  // ausschliesslich in der App unterschreibt, wurde mit 0 % Dokumentation
  // gemessen und verlor die Praemie.
  const recordIdsAlle = gueltige.map((r: any) => r.id as string)
  const appSigniert = new Set<string>()
  for (let i = 0; i < recordIdsAlle.length; i += 200) {
    const batch = recordIdsAlle.slice(i, i + 200)
    const { data: sigs, error: sigErr } = await supabase
      .from('service_signatures')
      .select('service_record_id')
      .eq('signer_role', 'client')
      .in('service_record_id', batch)
    if (sigErr) throw new Error(`Unterschriften konnten nicht geladen werden: ${sigErr.message}`)
    for (const s of sigs || []) appSigniert.add(s.service_record_id)
  }

  const gesamtProCaregiver = new Map<string, number>()
  const signiertProCaregiver = new Map<string, number>()
  const recordCaregiverMap = new Map<string, string>()
  for (const r of gueltige as any[]) {
    gesamtProCaregiver.set(r.caregiver_id, (gesamtProCaregiver.get(r.caregiver_id) || 0) + 1)
    if (r.client_signature || appSigniert.has(r.id)) {
      signiertProCaregiver.set(r.caregiver_id, (signiertProCaregiver.get(r.caregiver_id) || 0) + 1)
    }
    recordCaregiverMap.set(r.id, r.caregiver_id)
  }

  if (kriteriumTyp === 'vollstaendige_dokumentation') {
    return (caregiverId, schwellenwert) =>
      bewerteVollstaendigeDokumentation(gesamtProCaregiver.get(caregiverId) || 0, signiertProCaregiver.get(caregiverId) || 0, schwellenwert)
  }

  // keine_offenen_pruefungen
  const recordIds = recordIdsAlle
  // BEFUND (P1): hier wurden FEHLERZEILEN gezaehlt, nicht NACHWEISE.
  // `bewerteKeineOffenenPruefungen` rechnet (gesamt - mitOffenenFehlern) /
  // gesamt und setzt damit eine Zahl von NACHWEISEN voraus. `review_errors`
  // hat live keinen Unique-Index auf `service_record_id` (nur den einfachen
  // idx_review_errors_record), mehrere offene Hinweise am selben Nachweis
  // sind also vorgesehen. Zwei Nachweise, davon einer mit drei offenen
  // Hinweisen, ergaben (2-3)/2 = -50 % — eine negative Quote, die als
  // `messwert` in der numeric-Spalte landete und im Bericht stand.
  // Gezaehlt wird deshalb je Nachweis genau einmal.
  const nachweiseMitFehler = new Map<string, Set<string>>()
  if (recordIds.length > 0) {
    for (let i = 0; i < recordIds.length; i += 200) {
      const batch = recordIds.slice(i, i + 200)
      const { data: fehler, error: fehlerErr } = await supabase
        .from('review_errors')
        .select('service_record_id')
        .in('service_record_id', batch)
        .eq('resolved', false)
      if (fehlerErr) throw new Error(`Prüfhinweise konnten nicht geladen werden: ${fehlerErr.message}`)
      for (const f of fehler || []) {
        const caregiverId = recordCaregiverMap.get(f.service_record_id)
        if (!caregiverId) continue
        const menge = nachweiseMitFehler.get(caregiverId) ?? new Set<string>()
        menge.add(f.service_record_id)
        nachweiseMitFehler.set(caregiverId, menge)
      }
    }
  }
  return (caregiverId, schwellenwert) =>
    bewerteKeineOffenenPruefungen(
      gesamtProCaregiver.get(caregiverId) || 0,
      nachweiseMitFehler.get(caregiverId)?.size || 0,
      schwellenwert,
    )
}

// ── Freigabe-Workflow ────────────────────────────────────────────

export async function listBerechnungen(
  supabase: SupabaseClient,
  params: { organizationId: string; status?: BonusBerechnungStatus },
): Promise<BonusBerechnung[]> {
  let query = supabase.from('bonus_berechnungen').select('*').eq('organization_id', params.organizationId).order('berechnet_am', { ascending: false })
  if (params.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) throw new Error(`Berechnungen konnten nicht geladen werden: ${error.message}`)
  return (data || []).map(mapBerechnung)
}

export async function freigebenBerechnung(
  supabase: SupabaseClient,
  params: { organizationId: string; berechnungId: string; entscheidung: 'freigegeben' | 'abgelehnt'; kommentar?: string; userId: string },
): Promise<BonusBerechnung> {
  if (params.entscheidung !== 'freigegeben' && params.entscheidung !== 'abgelehnt') {
    throw new UserFacingError('Entscheidung muss „freigegeben" oder „abgelehnt" sein.')
  }

  // BEFUND (P0, 27.08.2026): der Vorgang lief in dieser Reihenfolge —
  // Status lesen, Entscheidungszeile in `bonus_freigaben` schreiben, DANN
  // den Status setzen. Ohne Compare-and-Swap. Zwei gleichzeitige
  // Entscheidungen kamen beide an der Statuspruefung vorbei, legten BEIDE
  // eine Entscheidungszeile an (moeglicherweise gegenlaeufig: einmal
  // 'freigegeben', einmal 'abgelehnt') und schrieben nacheinander den
  // Status — der letzte gewann. Im Nachweis standen danach zwei
  // Entscheidungen zu einem Vorgang, und welche gilt, war der Zeile nicht
  // anzusehen. Schlug ausserdem das Status-Update fehl, blieb die
  // Entscheidung geschrieben und der Vorgang auf 'berechnet' stehen: ein
  // zweiter Versuch legte eine ZWEITE Zeile an.
  //
  // Jetzt: Statuswechsel per CAS zuerst — er ist die Beanspruchung des
  // Vorgangs — und die Entscheidungszeile danach. Scheitert die, wird der
  // Status zurueckgerollt (gleiche Linie wie genehmigenAbwesenheit,
  // lib/personal/abwesenheiten.ts).
  const { data: beansprucht, error: casErr } = await supabase
    .from('bonus_berechnungen')
    .update({ status: params.entscheidung })
    .eq('id', params.berechnungId)
    .eq('organization_id', params.organizationId)
    .eq('status', 'berechnet')
    .select('*')
    .maybeSingle()
  if (casErr) throw new Error(`Status konnte nicht gesetzt werden: ${casErr.message}`)

  if (!beansprucht) {
    // Nichts beansprucht: entweder gibt es die Berechnung nicht (bzw. nicht
    // in diesem Mandanten), oder sie ist bereits entschieden. Der
    // Unterschied gehoert in die Meldung — sonst sucht die Verwaltung nach
    // einem Fehler, wo eine Kollegin schneller war.
    const { data: stand } = await supabase
      .from('bonus_berechnungen')
      .select('status')
      .eq('id', params.berechnungId)
      .eq('organization_id', params.organizationId)
      .maybeSingle()
    if (!stand) throw new UserFacingError('Berechnung nicht gefunden.')
    throw new UserFacingError(
      `Berechnung ist bereits entschieden (Status: ${stand.status}) — eine zweite Entscheidung ist nicht möglich.`,
    )
  }

  const { error: freigabeErr } = await supabase.from('bonus_freigaben').insert({
    organization_id: params.organizationId,
    berechnung_id: params.berechnungId,
    entscheidung: params.entscheidung,
    kommentar: params.kommentar ?? null,
    entschieden_von: params.userId,
  })
  if (freigabeErr) {
    // Rueckabwicklung: ohne Nachweiszeile darf der Vorgang nicht als
    // entschieden gelten — sonst waere er entschieden, ohne dass irgendwo
    // steht von wem.
    await supabase
      .from('bonus_berechnungen')
      .update({ status: 'berechnet' })
      .eq('id', params.berechnungId)
      .eq('organization_id', params.organizationId)
      .eq('status', params.entscheidung)
    throw new Error(
      `Freigabe konnte nicht gespeichert werden: ${freigabeErr.message}. `
      + 'Die Entscheidung wurde zurückgenommen.',
    )
  }

  return mapBerechnung(beansprucht)
}
