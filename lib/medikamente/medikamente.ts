import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { heuteBerlin } from '@/lib/utils/timezone'
import type {
  Medikament,
  MedikamentEingabe,
  MedikamentFilter,
  MedikamentKategorie,
  MedikamentStatus,
  EingabeFilter,
} from './types'

const GUELTIGE_KATEGORIEN: MedikamentKategorie[] = [
  'herz_kreislauf', 'schmerz', 'psychopharmaka', 'antibiotika', 'diabetes',
  'atemwege', 'magen_darm', 'hormone', 'blutgerinnung', 'sonstige',
]

const GUELTIGE_STATUS: MedikamentStatus[] = ['aktiv', 'pausiert', 'abgesetzt']

const GUELTIGE_EINNAHME_ZEITEN = ['morgens', 'mittags', 'abends', 'nachts'] as const
const GUELTIGE_EINGABE_STATUS = ['geplant', 'gegeben', 'verweigert', 'ausgelassen'] as const

/**
 * Eingabe-Status, die eine Gabe als ENTSCHIEDEN dokumentieren.
 * 'geplant' ist nur eine Vormerkung und darf ueberschrieben werden.
 */
export const DOKUMENTIERTE_EINGABE_STATUS = ['gegeben', 'verweigert', 'ausgelassen'] as const

export function validiereKategorie(k: string): asserts k is MedikamentKategorie {
  if (!GUELTIGE_KATEGORIEN.includes(k as MedikamentKategorie)) {
    throw new UserFacingError(`Ungültige Kategorie: ${k}`)
  }
}

export function validiereStatus(s: string): asserts s is MedikamentStatus {
  if (!GUELTIGE_STATUS.includes(s as MedikamentStatus)) {
    throw new UserFacingError(`Ungültiger Status: ${s}`)
  }
}

export function validiereMedikament(data: Record<string, unknown>): void {
  if (!data.medikament_name || typeof data.medikament_name !== 'string' || data.medikament_name.trim().length === 0) {
    throw new UserFacingError('Medikamentenname ist ein Pflichtfeld.')
  }
  if (!data.dosierung || typeof data.dosierung !== 'string' || data.dosierung.trim().length === 0) {
    throw new UserFacingError('Dosierung ist ein Pflichtfeld.')
  }
  if (!data.client_id || typeof data.client_id !== 'string') {
    throw new UserFacingError('Klient muss zugeordnet sein.')
  }
  if (data.kategorie) validiereKategorie(data.kategorie as string)

  if (data.pzn && typeof data.pzn === 'string') {
    if (!/^\d{7,8}$/.test(data.pzn)) {
      throw new UserFacingError('PZN muss 7 oder 8 Ziffern haben.')
    }
  }

  const morgens = !!data.einnahme_morgens
  const mittags = !!data.einnahme_mittags
  const abends = !!data.einnahme_abends
  const nachts = !!data.einnahme_nachts
  if (!morgens && !mittags && !abends && !nachts) {
    throw new UserFacingError('Mindestens eine Einnahmezeit muss ausgewählt sein.')
  }

  if (data.beginn_datum !== undefined && data.beginn_datum !== null && data.beginn_datum !== '') {
    assertIsoDatum(data.beginn_datum, 'Beginndatum')
  }
  if (data.end_datum !== undefined && data.end_datum !== null && data.end_datum !== '') {
    assertIsoDatum(data.end_datum, 'Enddatum')
  }
  if (data.beginn_datum && data.end_datum) {
    // Zeichenkettenvergleich statt new Date(): ein unlesbares Datum ergab
    // dort NaN, und `NaN > NaN` ist false — die Pruefung ging still durch.
    // Das Format ist durch assertIsoDatum oben gesichert.
    if (String(data.beginn_datum) > String(data.end_datum)) {
      throw new UserFacingError('Enddatum darf nicht vor dem Beginndatum liegen.')
    }
  }
}

/** `YYYY-MM-DD` — Medikationszeitraeume sind Datumsspalten, keine Zeitstempel. */
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

function assertIsoDatum(wert: unknown, feld: string): void {
  const text = typeof wert === 'string' ? wert.trim() : ''
  if (!ISO_DATUM.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new UserFacingError(`${feld} ist kein gültiges Datum (JJJJ-MM-TT).`)
  }
}

/** Felder, aus denen sich die Gueltigkeit einer Medikation ergibt. */
const VALIDIERTE_FELDER = [
  'medikament_name', 'dosierung', 'pzn', 'kategorie',
  'einnahme_morgens', 'einnahme_mittags', 'einnahme_abends', 'einnahme_nachts',
  'beginn_datum', 'end_datum',
] as const

export async function listeMedikamente(
  sb: SupabaseClient,
  orgId: string,
  filter: MedikamentFilter = {},
): Promise<Medikament[]> {
  let q = sb
    .from('medikamente')
    .select('*')
    .eq('organization_id', orgId)
    .order('medikament_name')

  if (filter.client_id) q = q.eq('client_id', filter.client_id)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.kategorie) q = q.eq('kategorie', filter.kategorie)
  if (filter.dauermedikation !== undefined) q = q.eq('dauermedikation', filter.dauermedikation)

  const { data, error } = await q
  if (error) throw new Error(`Medikamente laden: ${error.message}`)
  return (data ?? []) as Medikament[]
}

export async function holeMedikament(
  sb: SupabaseClient,
  orgId: string,
  id: string,
): Promise<Medikament | null> {
  const { data, error } = await sb
    .from('medikamente')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Medikament laden: ${error.message}`)
  return data as Medikament | null
}

export async function erstelleMedikament(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  data: Record<string, unknown>,
): Promise<Medikament> {
  validiereMedikament(data)

  const row = {
    client_id: data.client_id,
    organization_id: orgId,
    medikament_name: (data.medikament_name as string).trim(),
    wirkstoff: (data.wirkstoff as string)?.trim() || null,
    pzn: (data.pzn as string)?.trim() || null,
    kategorie: data.kategorie || 'sonstige',
    darreichungsform: (data.darreichungsform as string)?.trim() || null,
    dosierung: (data.dosierung as string).trim(),
    einheit: (data.einheit as string) || 'mg',
    einnahme_morgens: !!data.einnahme_morgens,
    einnahme_mittags: !!data.einnahme_mittags,
    einnahme_abends: !!data.einnahme_abends,
    einnahme_nachts: !!data.einnahme_nachts,
    einnahme_hinweis: (data.einnahme_hinweis as string)?.trim() || null,
    verordnet_von: (data.verordnet_von as string)?.trim() || null,
    beginn_datum: data.beginn_datum || null,
    end_datum: data.end_datum || null,
    dauermedikation: data.dauermedikation !== false,
    status: 'aktiv',
    notizen: (data.notizen as string)?.trim() || null,
    created_by: userId,
  }

  const { data: created, error } = await sb
    .from('medikamente')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Medikament erstellen: ${error.message}`)
  return created as Medikament
}

export async function aktualisiereMedikament(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  updates: Record<string, unknown>,
): Promise<Medikament> {
  const bestehend = await holeMedikament(sb, orgId, id)
  if (!bestehend) throw new UserFacingError('Medikament nicht gefunden.', 404)
  if (bestehend.status === 'abgesetzt') {
    throw new UserFacingError('Abgesetztes Medikament kann nicht mehr bearbeitet werden. Für eine Reaktivierung zuerst den Status ändern.', 409)
  }

  // ── Die Aenderung wird gegen den ZUSAMMENGEFUEHRTEN Stand geprueft ──
  //
  // Bisher lief hier nur `validiereKategorie`. Was das schliesst, ist
  // zweierlei — und die beiden Faelle wiegen unterschiedlich schwer:
  //
  //  · ECHTE LUECKE: `dosierung: ''` und `medikament_name: '  '` kommen
  //    durch. Beide Spalten sind NOT NULL, aber die leere Zeichenkette ist
  //    nicht NULL — die Datenbank nimmt sie an. Beim Anlegen war das
  //    verboten, per Update nicht. In der Akte steht danach ein Medikament
  //    ohne Dosierungsangabe.
  //
  //  · LESBARE MELDUNG: alles Uebrige (alle vier Einnahmezeiten abgewaehlt,
  //    PZN 'ABC', Ende vor Beginn) faengt die Datenbank ueber ihre
  //    CHECK-Constraints ab — aber als rohe Postgres-Meldung. Die Zeile
  //    unten wirft dafuer `Error` (kein UserFacingError), der Sanitizer
  //    macht daraus fail-closed einen 500er, und der Anwender sieht
  //    "Interner Serverfehler" statt der Ursache.
  //
  // Geprueft wird der Stand NACH der Aenderung, nicht der Patch: ein Update,
  // das nur `end_datum` verschiebt, muss gegen das bestehende `beginn_datum`
  // gehalten werden.
  const beruehrt = VALIDIERTE_FELDER.some(f => f in updates)
  if (beruehrt) {
    const zusammengefuehrt: Record<string, unknown> = {
      ...(bestehend as unknown as Record<string, unknown>),
      ...updates,
      // client_id wird von aktualisiereMedikament nie geaendert; fuer die
      // Pflichtfeldpruefung zaehlt der bestehende Wert.
      client_id: (bestehend as unknown as Record<string, unknown>).client_id ?? 'unveraendert',
    }
    validiereMedikament(zusammengefuehrt)
  } else if (updates.kategorie) {
    validiereKategorie(updates.kategorie as string)
  }

  const allowed = [
    'medikament_name', 'wirkstoff', 'pzn', 'kategorie', 'darreichungsform',
    'dosierung', 'einheit', 'einnahme_morgens', 'einnahme_mittags',
    'einnahme_abends', 'einnahme_nachts', 'einnahme_hinweis',
    'verordnet_von', 'beginn_datum', 'end_datum', 'dauermedikation',
    'notizen',
  ]
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) {
    if (k in updates) row[k] = updates[k]
  }

  const { data, error } = await sb
    .from('medikamente')
    .update(row)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single()
  if (error) throw new Error(`Medikament aktualisieren: ${error.message}`)
  return data as Medikament
}

export async function setzeMedikamentStatus(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  status: MedikamentStatus,
  grund?: string,
): Promise<Medikament> {
  validiereStatus(status)
  if (status === 'abgesetzt' && !grund?.trim()) {
    throw new UserFacingError('Absetzgrund ist ein Pflichtfeld.')
  }
  const row: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }
  if (status === 'abgesetzt') {
    row.abgesetzt_am = new Date().toISOString()
    row.abgesetzt_grund = grund!.trim()
  } else {
    // Reaktivierung/Pausierung muss die Absetz-Historie löschen — sonst zeigt
    // ein wieder aktives Medikament noch ein abgesetzt_am aus der Vergangenheit.
    row.abgesetzt_am = null
    row.abgesetzt_grund = null
  }
  const { data, error } = await sb
    .from('medikamente')
    .update(row)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single()
  if (error) throw new Error(`Status setzen: ${error.message}`)
  return data as Medikament
}

// ── Medikamenteneingabe (Verabreichungs-Log) ──────────────────────

export async function listeEingaben(
  sb: SupabaseClient,
  orgId: string,
  filter: EingabeFilter,
): Promise<MedikamentEingabe[]> {
  let q = sb
    .from('medikament_eingaben')
    .select('*')
    .eq('organization_id', orgId)
    .eq('client_id', filter.client_id)
    .order('geplant_um', { ascending: false })

  if (filter.medikament_id) q = q.eq('medikament_id', filter.medikament_id)
  if (filter.datum_von) q = q.gte('geplant_um', filter.datum_von)
  if (filter.datum_bis) q = q.lte('geplant_um', filter.datum_bis)
  if (filter.status) q = q.eq('status', filter.status)

  const { data, error } = await q
  if (error) throw new Error(`Eingaben laden: ${error.message}`)
  return (data ?? []) as MedikamentEingabe[]
}

export async function erfasseEingabe(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  eingabe: {
    medikament_id: string
    client_id: string
    einnahme_zeit: string
    geplant_um: string
    status: string
    verweigert_grund?: string
    notizen?: string
  },
): Promise<MedikamentEingabe> {
  if (!GUELTIGE_EINNAHME_ZEITEN.includes(eingabe.einnahme_zeit as typeof GUELTIGE_EINNAHME_ZEITEN[number])) {
    throw new UserFacingError(`Ungültige Einnahmezeit: ${eingabe.einnahme_zeit}`)
  }
  if (!GUELTIGE_EINGABE_STATUS.includes(eingabe.status as typeof GUELTIGE_EINGABE_STATUS[number])) {
    throw new UserFacingError(`Ungültiger Eingabestatus: ${eingabe.status}`)
  }
  if (eingabe.status === 'verweigert' && !eingabe.verweigert_grund?.trim()) {
    throw new UserFacingError('Verweigerungsgrund ist bei Status "verweigert" ein Pflichtfeld.')
  }

  const gabeTag = String(eingabe.geplant_um ?? '').slice(0, 10)
  if (!ISO_DATUM.test(gabeTag)) {
    throw new UserFacingError('geplant_um ist kein gültiger Zeitpunkt.')
  }

  const { data: medikament, error: medErr } = await sb
    .from('medikamente')
    .select('client_id, status, beginn_datum, end_datum, dauermedikation')
    .eq('id', eingabe.medikament_id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (medErr || !medikament) throw new UserFacingError('Medikament nicht gefunden.', 404)
  if (medikament.client_id !== eingabe.client_id) {
    throw new UserFacingError('Medikament gehört nicht zum angegebenen Klienten.')
  }
  if (medikament.status !== 'aktiv') {
    throw new UserFacingError(
      `Medikament ist nicht aktiv (Status: ${medikament.status}) — es kann keine neue Eingabe erfasst werden.`,
      409,
    )
  }

  // ── Gabe innerhalb des Verordnungszeitraums? ──────────────────────
  //
  // Geprueft wurde bisher nur der Status. Ein Medikament, dessen
  // `end_datum` vor Wochen lag, stand aber weiterhin auf 'aktiv' (den
  // Status setzt niemand automatisch um) — jede weitere Gabe liess sich
  // anstandslos dokumentieren, und `beginn_datum` band ueberhaupt nicht.
  // Dieselbe Regel wie `istAbgelaufen`/`istBegonnen`: `end_datum` bindet
  // nur bei einer befristeten Medikation, `beginn_datum` immer.
  const beginn = medikament.beginn_datum ? String(medikament.beginn_datum).slice(0, 10) : null
  const ende = medikament.end_datum ? String(medikament.end_datum).slice(0, 10) : null
  if (beginn && gabeTag < beginn) {
    throw new UserFacingError(
      `Die Medikation beginnt erst am ${beginn} — für den ${gabeTag} kann keine Gabe dokumentiert werden.`,
      409,
    )
  }
  if (ende && medikament.dauermedikation !== true && gabeTag > ende) {
    throw new UserFacingError(
      `Die Medikation endete am ${ende} — für den ${gabeTag} kann keine Gabe dokumentiert werden.`,
      409,
    )
  }

  // ── Dieselbe Gabe schon dokumentiert? ─────────────────────────────
  //
  // `medikament_eingaben` ist append-only und traegt KEINEN eindeutigen
  // Index (20260820010000). Ein erneuter Klick, ein Wiederholungslauf der
  // Offline-Synchronisation oder ein Netzabbruch nach dem Insert erzeugte
  // deshalb eine ZWEITE Zeile fuer dieselbe geplante Gabe — in der Akte
  // steht dann, das Medikament sei zweimal gegeben worden. Genau dieser
  // Fall ist im Offline-Pfad bereits einmal aufgetreten
  // (warBereitsErfolgreich, 20261009).
  //
  // Fail-closed: laesst sich der Bestand nicht lesen, wird NICHT
  // geschrieben. Eine fehlende Dokumentation faellt beim naechsten Blick
  // in die Akte auf, eine doppelte nicht.
  const { data: bestehende, error: bestandFehler } = await sb
    .from('medikament_eingaben')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('medikament_id', eingabe.medikament_id)
    .eq('geplant_um', eingabe.geplant_um)
    .eq('einnahme_zeit', eingabe.einnahme_zeit)
    .limit(5)

  if (bestandFehler) {
    throw new UserFacingError(
      'Bereits dokumentierte Gaben konnten nicht geprüft werden — es wurde nichts gespeichert. '
      + 'Bitte erneut versuchen.',
      503,
    )
  }

  const schonDokumentiert = (bestehende ?? []).find(
    z => DOKUMENTIERTE_EINGABE_STATUS.includes(String(z.status) as typeof DOKUMENTIERTE_EINGABE_STATUS[number]),
  )
  if (schonDokumentiert) {
    throw new UserFacingError(
      `Für diese Gabe (${eingabe.einnahme_zeit}, ${gabeTag}) ist bereits „${schonDokumentiert.status}" dokumentiert. `
      + 'Eine zweite Dokumentation derselben Gabe wird nicht angelegt — bei einer Korrektur den bestehenden Eintrag prüfen.',
      409,
    )
  }

  const row = {
    medikament_id: eingabe.medikament_id,
    client_id: eingabe.client_id,
    organization_id: orgId,
    einnahme_zeit: eingabe.einnahme_zeit,
    geplant_um: eingabe.geplant_um,
    gegeben_um: ['gegeben'].includes(eingabe.status) ? new Date().toISOString() : null,
    gegeben_von: userId,
    status: eingabe.status,
    verweigert_grund: eingabe.verweigert_grund || null,
    notizen: eingabe.notizen || null,
  }

  const { data, error } = await sb
    .from('medikament_eingaben')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Eingabe erfassen: ${error.message}`)
  return data as MedikamentEingabe
}

export function einnahmeZeiten(m: Medikament): string[] {
  const zeiten: string[] = []
  if (m.einnahme_morgens) zeiten.push('morgens')
  if (m.einnahme_mittags) zeiten.push('mittags')
  if (m.einnahme_abends) zeiten.push('abends')
  if (m.einnahme_nachts) zeiten.push('nachts')
  return zeiten
}

/**
 * Ist die Medikation abgelaufen?
 *
 * `end_datum` ist der LETZTE Tag, an dem gegeben wird — nicht der erste
 * danach. Der frühere Vergleich `new Date(m.end_datum) < new Date()` las das
 * Datum als UTC-Mitternacht und stellte es dem aktuellen Zeitstempel
 * gegenüber: schon um 00:01 des Endtages galt die Medikation als abgelaufen,
 * die Gaben dieses Tages sahen unzulässig aus.
 *
 * Verglichen wird deshalb Datum gegen Datum in Europe/Berlin — derselbe
 * Kalendertag, den die Pflegekraft vor sich sieht.
 */
export function istAbgelaufen(m: Medikament, heute: string = heuteBerlin()): boolean {
  if (m.dauermedikation) return false
  if (!m.end_datum) return false
  return String(m.end_datum).slice(0, 10) < heute
}

/** Hat die Medikation am Stichtag schon begonnen? */
export function istBegonnen(m: Pick<Medikament, 'beginn_datum'>, stichtag: string): boolean {
  if (!m.beginn_datum) return true
  return String(m.beginn_datum).slice(0, 10) <= stichtag
}
