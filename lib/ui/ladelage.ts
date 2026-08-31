/**
 * Ladelage — trennt „nichts da" von „Laden fehlgeschlagen".
 *
 * Ausgangslage: quer durch die App steht
 *
 *   const { data } = await supabase.from('assignments')...
 *   setAssignments(data || [])
 *
 * Der Fehler wird nicht destrukturiert, also verworfen. Schlaegt die Abfrage
 * fehl (RLS, Netz, Schema-Drift), ist `data` null, die Liste wird leer, und
 * das UI rendert seinen Leerzustand: „Keine Einsaetze". Ein Engel liest das
 * morgens als Aussage ueber seinen Tag und faehrt nicht los — obwohl die
 * Einsaetze in der Datenbank stehen. Der Leerzustand ist damit eine Aussage,
 * die die App gar nicht treffen kann.
 *
 * `ladeListe` macht diesen Fall unmoeglich: eine fehlgeschlagene Abfrage wird
 * zu `{ status: 'fehler' }` und kann nie als leere Liste durchrutschen.
 *
 * Die Meldung an den Nutzer ist bewusst fest verdrahtet und nennt NIE den
 * Datenbank- oder Supabase-Text (gleiche Linie wie `UserFacingError`) — der
 * technische Grund geht nur ins Log.
 */
import { logger } from '@/lib/logger'

const log = logger.child('ladelage')

/** Text, den Nutzer bei einem fehlgeschlagenen Ladevorgang sehen. */
export const LADEFEHLER_TEXT =
  'Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.'

export type Ladelage<T> =
  | { status: 'laedt' }
  | { status: 'fertig'; zeilen: T[] }
  | { status: 'fehler'; meldung: string }

/** Startwert fuer `useState` — jede Liste beginnt im Ladezustand. */
export const LAEDT = { status: 'laedt' } as const

/** Ergebnisform von PostgREST/Supabase, auf die `ladeListe` passt. */
export interface AbfrageErgebnis<T> {
  data: T[] | null
  error: { message?: string | null; code?: string | null } | null
}

/**
 * Fuehrt eine Listenabfrage aus und liefert eine Ladelage — wirft nie.
 *
 * `supabase.from(...).select(...)` ist ein Thenable, kein echtes Promise;
 * der Parameter ist deshalb `PromiseLike`, damit der Query-Builder direkt
 * uebergeben werden kann (`await ladeListe(supabase.from('x').select('*'))`).
 *
 * `kontext` landet ausschliesslich im Log und dient der Zuordnung.
 */
export async function ladeListe<T>(
  abfrage: PromiseLike<AbfrageErgebnis<T>>,
  kontext = 'liste',
): Promise<Ladelage<T>> {
  try {
    const { data, error } = await abfrage
    if (error) {
      log.error(`${kontext}: Abfrage fehlgeschlagen`, {
        code: error.code ?? undefined,
        msg: error.message ?? undefined,
      })
      return { status: 'fehler', meldung: LADEFEHLER_TEXT }
    }
    // data === null ohne error ist bei PostgREST kein Fehler, sondern das
    // legitime leere Ergebnis (204/keine Zeilen).
    return { status: 'fertig', zeilen: data ?? [] }
  } catch (e) {
    log.errorWithException(`${kontext}: Abfrage geworfen`, e)
    return { status: 'fehler', meldung: LADEFEHLER_TEXT }
  }
}

/**
 * Wie `ladeListe`, aber fuer eine einzelne Zeile (`.single()`/`.maybeSingle()`).
 *
 * PGRST116 ist „keine Zeile gefunden" und damit KEIN Ladefehler, sondern ein
 * leeres Ergebnis — sonst wuerde jedes legitime „noch kein Datensatz" als
 * Stoerung angezeigt.
 */
export async function ladeZeile<T>(
  abfrage: PromiseLike<{ data: T | null; error: { message?: string | null; code?: string | null } | null }>,
  kontext = 'zeile',
): Promise<Ladelage<T>> {
  try {
    const { data, error } = await abfrage
    if (error && error.code !== 'PGRST116') {
      log.error(`${kontext}: Abfrage fehlgeschlagen`, {
        code: error.code ?? undefined,
        msg: error.message ?? undefined,
      })
      return { status: 'fehler', meldung: LADEFEHLER_TEXT }
    }
    return { status: 'fertig', zeilen: data ? [data] : [] }
  } catch (e) {
    log.errorWithException(`${kontext}: Abfrage geworfen`, e)
    return { status: 'fehler', meldung: LADEFEHLER_TEXT }
  }
}

/** Zeilen einer Ladelage — im Lade- und Fehlerfall bewusst leer. */
export function zeilenVon<T>(lage: Ladelage<T>): T[] {
  return lage.status === 'fertig' ? lage.zeilen : []
}

/** Erste Zeile (fuer `ladeZeile`) oder null. */
export function zeileVon<T>(lage: Ladelage<T>): T | null {
  return lage.status === 'fertig' ? (lage.zeilen[0] ?? null) : null
}

export function laedt<T>(lage: Ladelage<T>): boolean {
  return lage.status === 'laedt'
}

export function istFehler<T>(lage: Ladelage<T>): boolean {
  return lage.status === 'fehler'
}

/**
 * Leer ist NUR ein erfolgreicher Ladevorgang ohne Zeilen.
 *
 * Der Fehlerfall ist ausdruecklich nicht leer — genau daran haengt, dass das
 * UI nicht „Keine Eintraege" ueber einen Ladefehler schreibt.
 */
export function istLeer<T>(lage: Ladelage<T>): boolean {
  return lage.status === 'fertig' && lage.zeilen.length === 0
}

/**
 * Fasst mehrere Ladelagen zu einer zusammen — fuer Seiten, die mehrere
 * Abfragen parallel laden. Fehler schlaegt Laden schlaegt Fertig: solange
 * eine Teilabfrage kaputt ist, ist die Seite nicht vollstaendig, und das darf
 * nicht hinter einem gefuellten Nebenbereich verschwinden.
 */
export function zusammenfassen(lagen: Ladelage<unknown>[]): 'laedt' | 'fertig' | 'fehler' {
  if (lagen.some(l => l.status === 'fehler')) return 'fehler'
  if (lagen.some(l => l.status === 'laedt')) return 'laedt'
  return 'fertig'
}
