import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertErlaubt, VERTRAGSSTATUS_WERTE, type CaregiverStammdaten, type Vertragsstatus } from './types'

const STAMMDATEN_SELECT = `id, first_name, last_name, email, phone,
  notfallkontakt_name, notfallkontakt_telefon, notfallkontakt_beziehung,
  vertragsstatus, einsatzgebiet_plz, einsatzgebiet_radius_km,
  wochenstunden_soll, urlaubstage_jahresanspruch, probezeitende,
  fahrzeug_kennzeichen, fuehrerschein_klassen, einsatzfreigabe, qualification_level,
  has_vehicle, has_drivers_license,
  fuehrungszeugnis_datum, fuehrungszeugnis_gueltig_bis,
  erste_hilfe_datum, erste_hilfe_gueltig_bis`

export interface ListStammdatenFilter {
  organizationId: string
  vertragsstatus?: Vertragsstatus
  search?: string
}

export async function listStammdaten(supabase: SupabaseClient, filter: ListStammdatenFilter): Promise<CaregiverStammdaten[]> {
  let query = supabase
    .from('caregivers')
    .select(STAMMDATEN_SELECT)
    .eq('organization_id', filter.organizationId)
    .order('last_name', { ascending: true })

  if (filter.vertragsstatus) query = query.eq('vertragsstatus', filter.vertragsstatus)

  const { data, error } = await query
  if (error) throw new Error(`Stammdaten konnten nicht geladen werden: ${error.message}`)

  // `search` war bisher nur DEKLARIERT: die Route reichte den Parameter
  // durch, ausgewertet wurde er nie. Wer `?search=…` anfragte, bekam die
  // vollstaendige Liste zurueck — ein Filter, der schweigend nichts filtert.
  // Bewusst in JavaScript und nicht als PostgREST-`.or(...)`: der Suchtext
  // kommt aus der Adresszeile und muesste dort maskiert werden, sonst
  // veraendert ein Komma oder eine Klammer den Ausdruck selbst
  // (docs/, org_fence-Namenskonventionen).
  const zeilen = (data ?? []) as CaregiverStammdaten[]
  const suche = filter.search?.trim().toLowerCase()
  if (!suche) return zeilen
  return zeilen.filter(z =>
    [z.first_name, z.last_name, z.email, z.phone]
      .some(w => typeof w === 'string' && w.toLowerCase().includes(suche))
  )
}

export async function getStammdaten(supabase: SupabaseClient, caregiverId: string, organizationId: string): Promise<CaregiverStammdaten | null> {
  const { data, error } = await supabase
    .from('caregivers')
    .select(STAMMDATEN_SELECT)
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Stammdaten konnten nicht geladen werden: ${error.message}`)
  return data as CaregiverStammdaten | null
}

/** Qualifikationsstufen, die caregivers.qualification_level akzeptiert. */
export const QUALIFIKATIONSSTUFE_WERTE = [
  'betreuungskraft_45a',
  'pflegehelferin',
  'pflegefachkraft',
  'hauswirtschafterin',
  'alltagsbegleiterin',
] as const
export type Qualifikationsstufe = (typeof QUALIFIKATIONSSTUFE_WERTE)[number]

export interface ErstelleStammdatenParams {
  vorname: string
  nachname: string
  email?: string | null
  telefon?: string | null
  qualifikationsstufe?: Qualifikationsstufe | null
  vertragsstatus?: Vertragsstatus | null
  eintrittsdatum?: string | null
  einsatzgebietPlz?: string[]
  wochenstundenSoll?: number | null
}

/**
 * Legt einen neuen Mitarbeiter an.
 *
 * Bewusst OHNE Einsatzfreigabe: die wird erst nach Prüfung von
 * Führungszeugnis, Erste-Hilfe und Qualifikation über
 * /admin/einsatzfreigabe erteilt (lib/personal/einsatzfreigabe.ts).
 * Ein frisch angelegter Mitarbeiter darf noch zu keinem Einsatz.
 */
export async function erstelleStammdaten(
  supabase: SupabaseClient,
  organizationId: string,
  params: ErstelleStammdatenParams,
): Promise<CaregiverStammdaten> {
  const vorname = params.vorname?.trim()
  const nachname = params.nachname?.trim()
  if (!vorname || !nachname) throw new UserFacingError('Vor- und Nachname sind Pflichtfelder.')

  assertErlaubt(params.vertragsstatus, VERTRAGSSTATUS_WERTE, 'vertragsstatus')
  assertErlaubt(params.qualifikationsstufe, QUALIFIKATIONSSTUFE_WERTE, 'qualifikationsstufe')
  if (params.eintrittsdatum != null && params.eintrittsdatum !== '' && !DATUM_RE.test(String(params.eintrittsdatum))) {
    throw new UserFacingError('Eintrittsdatum muss im Format JJJJ-MM-TT sein.', 400)
  }
  if (params.wochenstundenSoll != null) {
    assertZahl(params.wochenstundenSoll, 'Wochenstunden-Soll', 0, 168)
  }
  const einsatzgebietPlz = params.einsatzgebietPlz === undefined
    ? []
    : pruefeEinsatzgebietPlz(params.einsatzgebietPlz)

  const email = params.email?.trim() || null
  if (email) {
    const { data: doppelt, error: doppeltErr } = await supabase
      .from('caregivers')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('email', email)
      .maybeSingle()
    // FAIL-CLOSED: lässt sich die Dublettenprüfung nicht durchführen,
    // wird nicht angelegt — sonst entstehen zwei Personalakten.
    if (doppeltErr) throw new Error(`Dublettenprüfung fehlgeschlagen: ${doppeltErr.message}`)
    if (doppelt) throw new UserFacingError('Zu dieser E-Mail existiert bereits ein Mitarbeiter.')
  }

  const insert: Record<string, unknown> = {
    organization_id: organizationId,
    first_name: vorname,
    last_name: nachname,
    initials: `${vorname[0]}.${nachname[0]}.`.toUpperCase(),
    email,
    phone: params.telefon?.trim() || null,
    status: 'active',
    vertragsstatus: params.vertragsstatus ?? 'aktiv',
    qualification_level: params.qualifikationsstufe ?? 'betreuungskraft_45a',
    einsatzfreigabe: false,
    einsatzgebiet_plz: einsatzgebietPlz,
  }
  if (params.eintrittsdatum) insert.eintrittsdatum = params.eintrittsdatum
  if (params.wochenstundenSoll != null) insert.wochenstunden_soll = params.wochenstundenSoll

  const { data, error } = await supabase
    .from('caregivers')
    .insert(insert)
    .select(STAMMDATEN_SELECT)
    .single()

  if (error || !data) {
    throw new Error(`Mitarbeiter konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as CaregiverStammdaten
}

export interface UpdateStammdatenParams {
  notfallkontaktName?: string | null
  notfallkontaktTelefon?: string | null
  notfallkontaktBeziehung?: string | null
  vertragsstatus?: Vertragsstatus | null
  qualifikationsstufe?: Qualifikationsstufe | null
  einsatzgebietPlz?: string[]
  einsatzgebietRadiusKm?: number | null
  wochenstundenSoll?: number | null
  urlaubstageJahresanspruch?: number | null
  probezeitende?: string | null
  fahrzeugKennzeichen?: string | null
  fuehrerscheinKlassen?: string[]
  hatFahrzeug?: boolean | null
  hatFuehrerschein?: boolean | null
}

/**
 * Die vollstaendige Zuordnung „Feld im Patch" → „Spalte in caregivers".
 *
 * Bewusst als Liste und nicht als Kette von `if`-Zeilen: alles, was NICHT
 * hier steht, wird abgewiesen statt still verworfen. Genau dieses stille
 * Verwerfen war der Fehler — die Mitarbeiterakte
 * (app/admin/personal/[id]/page.tsx) schickte beim Speichern ihre eigenen
 * Feldnamen (`notfallkontakt_name`, `einsatzgebiet_plz`,
 * `wochenstunden_soll`, `urlaubstage_jahr`, `fahrzeug`, `fuehrerschein`,
 * `qualifikationsstufe`), waehrend diese Funktion camelCase liest. Von elf
 * bearbeitbaren Feldern kamen nur zwei an — `vertragsstatus` und
 * `probezeitende`. Der Rest fiel lautlos weg, und weil `vertragsstatus`
 * immer mitgeschickt wird, war die Antwort trotzdem 200 und die Seite
 * meldete „Gespeichert". Beim naechsten Aufruf stand wieder der alte Wert
 * da, unter anderem beim Notfallkontakt der Betreuungskraft.
 */
const STAMMDATEN_SPALTEN: Record<keyof UpdateStammdatenParams, string> = {
  notfallkontaktName: 'notfallkontakt_name',
  notfallkontaktTelefon: 'notfallkontakt_telefon',
  notfallkontaktBeziehung: 'notfallkontakt_beziehung',
  vertragsstatus: 'vertragsstatus',
  qualifikationsstufe: 'qualification_level',
  einsatzgebietPlz: 'einsatzgebiet_plz',
  einsatzgebietRadiusKm: 'einsatzgebiet_radius_km',
  wochenstundenSoll: 'wochenstunden_soll',
  urlaubstageJahresanspruch: 'urlaubstage_jahresanspruch',
  probezeitende: 'probezeitende',
  fahrzeugKennzeichen: 'fahrzeug_kennzeichen',
  fuehrerscheinKlassen: 'fuehrerschein_klassen',
  hatFahrzeug: 'has_vehicle',
  hatFuehrerschein: 'has_drivers_license',
}

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/
const PLZ_RE = /^\d{5}$/

function assertZahl(wert: unknown, feldname: string, min: number, max: number): void {
  if (wert === null) return
  if (typeof wert !== 'number' || !Number.isFinite(wert)) {
    throw new UserFacingError(`${feldname} muss eine Zahl sein.`, 400)
  }
  if (wert < min || wert > max) {
    throw new UserFacingError(`${feldname} muss zwischen ${min} und ${max} liegen.`, 400)
  }
}

/**
 * Prueft die Postleitzahlen des Einsatzgebiets.
 *
 * `einsatzgebiet_plz` ist eine text[]-Spalte und wurde ungeprueft
 * durchgereicht. Eine Zeichenkette statt einer Liste lief in einen rohen
 * Datenbankfehler, und eine Liste mit „60311 Frankfurt" oder „6031" wurde
 * anstandslos gespeichert — das Einzugsgebiets-Matching
 * (lib/einzugsgebiet-plz.ts) vergleicht danach auf Gleichheit und findet
 * die Kraft fuer diese Region nie mehr, ohne dass irgendwo ein Fehler
 * erscheint.
 */
export function pruefeEinsatzgebietPlz(wert: unknown): string[] {
  if (!Array.isArray(wert)) {
    throw new UserFacingError('Einsatzgebiet-PLZ muss eine Liste von Postleitzahlen sein.', 400)
  }
  const bereinigt: string[] = []
  for (const eintrag of wert) {
    const plz = typeof eintrag === 'string' ? eintrag.trim() : ''
    if (!plz) continue
    if (!PLZ_RE.test(plz)) {
      throw new UserFacingError(`"${plz}" ist keine gültige Postleitzahl (5 Ziffern).`, 400)
    }
    if (!bereinigt.includes(plz)) bereinigt.push(plz)
  }
  return bereinigt
}

export async function updateStammdaten(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
  patch: UpdateStammdatenParams,
): Promise<CaregiverStammdaten> {
  // FAIL-CLOSED gegen unbekannte Felder: ein Tippfehler oder eine
  // Oberflaeche mit abweichenden Feldnamen fuehrt jetzt zu einer Meldung
  // statt zu einer stillen Nichtspeicherung mit Erfolgsanzeige.
  const unbekannt = Object.keys(patch ?? {}).filter(
    k => !Object.prototype.hasOwnProperty.call(STAMMDATEN_SPALTEN, k)
  )
  if (unbekannt.length > 0) {
    throw new UserFacingError(
      `Unbekannte Felder können nicht gespeichert werden: ${unbekannt.join(', ')}.`,
      400,
    )
  }

  assertErlaubt(patch.vertragsstatus, VERTRAGSSTATUS_WERTE, 'vertragsstatus')
  assertErlaubt(patch.qualifikationsstufe, QUALIFIKATIONSSTUFE_WERTE, 'qualifikationsstufe')
  if (patch.einsatzgebietRadiusKm !== undefined) {
    assertZahl(patch.einsatzgebietRadiusKm, 'Radius', 0, 500)
  }
  if (patch.wochenstundenSoll !== undefined) {
    assertZahl(patch.wochenstundenSoll, 'Wochenstunden-Soll', 0, 168)
  }
  if (patch.urlaubstageJahresanspruch !== undefined) {
    assertZahl(patch.urlaubstageJahresanspruch, 'Urlaubstage pro Jahr', 0, 365)
  }
  if (patch.probezeitende != null && patch.probezeitende !== '' && !DATUM_RE.test(String(patch.probezeitende))) {
    throw new UserFacingError('Probezeitende muss im Format JJJJ-MM-TT sein.', 400)
  }

  const update: Record<string, unknown> = {}
  if (patch.notfallkontaktName !== undefined) update.notfallkontakt_name = patch.notfallkontaktName
  if (patch.notfallkontaktTelefon !== undefined) update.notfallkontakt_telefon = patch.notfallkontaktTelefon
  if (patch.notfallkontaktBeziehung !== undefined) update.notfallkontakt_beziehung = patch.notfallkontaktBeziehung
  if (patch.vertragsstatus !== undefined) update.vertragsstatus = patch.vertragsstatus
  if (patch.qualifikationsstufe !== undefined) update.qualification_level = patch.qualifikationsstufe
  if (patch.einsatzgebietPlz !== undefined) update.einsatzgebiet_plz = pruefeEinsatzgebietPlz(patch.einsatzgebietPlz)
  if (patch.einsatzgebietRadiusKm !== undefined) update.einsatzgebiet_radius_km = patch.einsatzgebietRadiusKm
  if (patch.wochenstundenSoll !== undefined) update.wochenstunden_soll = patch.wochenstundenSoll
  if (patch.urlaubstageJahresanspruch !== undefined) update.urlaubstage_jahresanspruch = patch.urlaubstageJahresanspruch
  if (patch.probezeitende !== undefined) update.probezeitende = patch.probezeitende || null
  if (patch.fahrzeugKennzeichen !== undefined) update.fahrzeug_kennzeichen = patch.fahrzeugKennzeichen
  if (patch.fuehrerscheinKlassen !== undefined) update.fuehrerschein_klassen = patch.fuehrerscheinKlassen
  if (patch.hatFahrzeug !== undefined) update.has_vehicle = !!patch.hatFahrzeug
  if (patch.hatFuehrerschein !== undefined) update.has_drivers_license = !!patch.hatFuehrerschein

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('caregivers')
    .update(update)
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .select(STAMMDATEN_SELECT)
    .single()
  if (error || !data) throw new Error(`Stammdaten konnten nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverStammdaten
}
