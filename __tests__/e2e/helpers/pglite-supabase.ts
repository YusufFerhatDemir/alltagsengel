/**
 * PostgREST-Schicht ueber PGlite
 * ═════════════════════════════════════════════════════════════════════
 *
 * Uebersetzt den Query-Builder von @supabase/supabase-js in echtes SQL und
 * laesst es von einer echten PostgreSQL-Instanz (PGlite/WASM, in-process)
 * ausfuehren.
 *
 * Unterschied zu __tests__/e2e/helpers/fake-billing-db.ts: dort haelt ein
 * JavaScript-Objekt den Zustand, hier ist es Postgres. Damit laufen
 * CHECK-Constraints, NOT-NULL, Fremdschluessel, UNIQUE-Indizes, Trigger,
 * die echten RPCs und RLS-Policies WIRKLICH mit. Genau diese Klasse von
 * Fehlern uebersieht eine Fake-DB systematisch (siehe den Kopfkommentar
 * dort: „RLS, echte SQL-Trigger … bewusst NICHT nachgebaut").
 *
 * Bewusste Grenzen — hier benannt statt stillschweigend gefuellt:
 *   • Eingebettete Ressourcen (`client:clients(...)`) werden als zweite
 *     Abfrage aufgeloest, nicht als JOIN. Verschachtelung und die
 *     eins-zu-viele-Richtung sind abgebildet (die Richtung wird am echten
 *     Schema bestimmt, siehe `ergaenzeEingebettet`); Reihenfolge und
 *     Filter AUF der eingebetteten Tabelle unterstuetzt der Shim nicht.
 *   • `.select()` nach insert/update liefert immer die vollstaendige Zeile
 *     (RETURNING *), nicht die angeforderte Spaltenliste.
 *   • Ohne `alsNutzer` laeuft alles als Superuser — das entspricht dem
 *     service-role-Client der Anwendung (BYPASSRLS). Fuer RLS-Beweise
 *     muss `alsNutzer` gesetzt sein.
 *   • `numeric` kommt als Zeichenkette zurueck (so liefert es der
 *     PGlite-Treiber). PostgREST liefert dort eine JSON-Zahl. Der
 *     Anwendungscode faehrt jede Betragsspalte ohnehin durch `Number()`,
 *     deshalb bleibt das hier stehen — mit dieser Zeile als Hinweis.
 *
 * DATUMSWERTE: date/timestamp/time kommen aus dem Treiber als
 * `Date`-Objekte, aus PostgREST dagegen als Zeichenketten. Der
 * Unterschied ist NICHT harmlos — `zeile.due_date + 'T00:00:00+01:00'`
 * ergibt mit einem Date-Objekt „Thu Aug 06 2026 …T00:00:00+01:00" und
 * damit ein Invalid Date, das sich als NaN durch die Rechnung zieht und
 * als fehlgeschlagenes UPDATE endet. Genau daran ist advanceDunning()
 * im Mahnketten-Test still gescheitert. `alsPostgrestWert` zieht die
 * Werte deshalb auf das Format, das die Anwendung live sieht.
 */

import type { PGlite } from '@electric-sql/pglite'

type Zeile = Record<string, unknown>

export interface PgFehler {
  message: string
  code?: string
  details?: string | null
  hint?: string | null
}

export interface Antwort<T> {
  data: T
  error: PgFehler | null
  count?: number | null
}

type Vergleich = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
type Filter =
  | { art: Vergleich; spalte: string; wert: unknown }
  | { art: 'is'; spalte: string; wert: null | boolean }
  | { art: 'in' | 'notIn'; spalte: string; werte: unknown[] }
  | { art: 'notNull'; spalte: string }
  /** `.or('a.eq.1,b.is.null')` — ODER-Verknuepfung auf oberster Ebene. */
  | { art: 'oder'; teile: Filter[] }
  /** `.not(spalte, op, wert)` mit einem Vergleichsoperator. */
  | { art: 'nicht'; innen: Filter }

/**
 * Zerlegt eine PostgREST-`or`-Liste in Einzelfilter.
 *
 * Format: `spalte.operator.wert`, mehrere durch Komma getrennt, Klammern
 * (`in.(a,b)`) zaehlen als Tiefe. Genau so schickt `@supabase/supabase-js`
 * den Ausdruck an PostgREST:
 *
 *   .or('correction_type.is.null,correction_type.eq.rechnung')
 *   .or('organization_id.eq.<uuid>,organization_id.is.null')
 *
 * Beide Formen kommen im Anwendungscode vor (DATEV-Buchungssatzgenerator
 * bzw. Tarif-Verifizierung) und waren bis hierher gar nicht abbildbar —
 * `.or()` existierte im Shim nicht, ein Test darauf waere an einer
 * fehlenden Methode gescheitert statt an der Abfrage.
 */
function parseOderAusdruck(ausdruck: string): Filter[] {
  const teile: string[] = []
  let tiefe = 0
  let puffer = ''
  for (const z of ausdruck) {
    if (z === '(') tiefe++
    if (z === ')') tiefe--
    if (z === ',' && tiefe === 0) { teile.push(puffer); puffer = ''; continue }
    puffer += z
  }
  if (puffer.trim()) teile.push(puffer)

  return teile.map(roh => {
    const teil = roh.trim()
    const ersterPunkt = teil.indexOf('.')
    const zweiterPunkt = teil.indexOf('.', ersterPunkt + 1)
    if (ersterPunkt < 0 || zweiterPunkt < 0) {
      throw new Error(`PGlite-Shim: "${teil}" ist kein PostgREST-Filter (spalte.operator.wert)`)
    }
    const spalte = teil.slice(0, ersterPunkt)
    const op = teil.slice(ersterPunkt + 1, zweiterPunkt)
    const roherWert = teil.slice(zweiterPunkt + 1)

    switch (op) {
      case 'is': {
        if (roherWert === 'null') return { art: 'is', spalte, wert: null } as Filter
        if (roherWert === 'true' || roherWert === 'false') {
          return { art: 'is', spalte, wert: roherWert === 'true' } as Filter
        }
        throw new Error(`PGlite-Shim: is.${roherWert} wird nicht unterstuetzt`)
      }
      case 'in':
        return { art: 'in', spalte, werte: parsePgListe(roherWert) } as Filter
      case 'eq': case 'neq': case 'lt': case 'lte': case 'gt': case 'gte':
        return { art: op, spalte, wert: roherWert } as Filter
      default:
        throw new Error(`PGlite-Shim: or(…) kennt den Operator "${op}" nicht`)
    }
  })
}

/**
 * Fremdschluessel fuer eingebettete Ressourcen.
 *
 * Standardregel: `clients` → `client_id` (Tabellenname ohne Plural-s plus
 * `_id`). Faelle, die davon abweichen, gehoeren hier hinein.
 */
const FK_AUSNAHMEN: Record<string, string> = {}

function fkSpalte(tabelle: string): string {
  if (FK_AUSNAHMEN[tabelle]) return FK_AUSNAHMEN[tabelle]
  return `${tabelle.replace(/ies$/, 'y').replace(/s$/, '')}_id`
}

/** `("a","b")` → `['a', 'b']` — das Listenformat von PostgREST `not.in`. */
function parsePgListe(literal: unknown): string[] {
  const s = String(literal ?? '')
  const innen = s.replace(/^\(/, '').replace(/\)$/, '')
  if (!innen) return []
  return innen.split(',').map(t => t.trim().replace(/^"(.*)"$/, '$1'))
}

interface EingebettetSpec {
  alias: string
  tabelle: string
  spalten: string
}

/**
 * Zerlegt eine PostgREST-Spaltenliste in flache Spalten und eingebettete
 * Ressourcen: `id, client:clients(first_name, email)` →
 * `{ flach: 'id', eingebettet: [{ alias: 'client', tabelle: 'clients', … }] }`
 */
function zerlegeSelect(select: string): { flach: string[]; eingebettet: EingebettetSpec[] } {
  const flach: string[] = []
  const eingebettet: EingebettetSpec[] = []

  let tiefe = 0
  let puffer = ''
  const teile: string[] = []
  for (const z of select) {
    if (z === '(') tiefe++
    if (z === ')') tiefe--
    if (z === ',' && tiefe === 0) { teile.push(puffer); puffer = ''; continue }
    puffer += z
  }
  if (puffer.trim()) teile.push(puffer)

  for (const roh of teile) {
    const teil = roh.trim()
    if (!teil) continue
    const treffer = teil.match(/^(?:([\w]+):)?([\w]+)\(([^]*)\)$/)
    if (treffer) {
      const [, alias, tabelle, spalten] = treffer
      eingebettet.push({ alias: alias || tabelle, tabelle, spalten })
    } else {
      flach.push(teil)
    }
  }
  return { flach, eingebettet }
}

export interface ClientOptionen {
  /**
   * JWT-`sub`, unter dem alle Abfragen laufen. Gesetzt → Rolle
   * `authenticated` + RLS. Nicht gesetzt → Superuser (= service_role).
   */
  alsNutzer?: string
  /** Jede ausgefuehrte Anweisung mitschreiben (Diagnose). */
  protokoll?: string[]
}

export interface PgliteSupabaseClient {
  from(tabelle: string): QueryBuilder
  rpc(name: string, params?: Record<string, unknown>): Promise<Antwort<unknown>>
}

interface QueryBuilder extends PromiseLike<Antwort<Zeile[]>> {
  select(spalten?: string, opts?: { count?: 'exact'; head?: boolean }): QueryBuilder
  insert(zeilen: Zeile | Zeile[]): QueryBuilder
  update(werte: Zeile): QueryBuilder
  delete(): QueryBuilder
  upsert(zeilen: Zeile | Zeile[], opts?: { onConflict?: string }): QueryBuilder
  eq(spalte: string, wert: unknown): QueryBuilder
  neq(spalte: string, wert: unknown): QueryBuilder
  gt(spalte: string, wert: unknown): QueryBuilder
  gte(spalte: string, wert: unknown): QueryBuilder
  lt(spalte: string, wert: unknown): QueryBuilder
  lte(spalte: string, wert: unknown): QueryBuilder
  is(spalte: string, wert: null | boolean): QueryBuilder
  in(spalte: string, werte: unknown[]): QueryBuilder
  not(spalte: string, op: string, wert: unknown): QueryBuilder
  or(ausdruck: string): QueryBuilder
  order(spalte: string, opts?: { ascending?: boolean }): QueryBuilder
  limit(n: number): QueryBuilder
  returns<T>(): QueryBuilder & PromiseLike<Antwort<T>>
  single(): Promise<Antwort<Zeile | null>>
  maybeSingle(): Promise<Antwort<Zeile | null>>
}

/**
 * Postgres-OIDs der Zeittypen. PGlite liefert sie als `Date`, PostgREST
 * als Zeichenkette — hier wird auf PostgREST vereinheitlicht.
 */
const OID_DATE = 1082
const OID_TIME = 1083
const OID_TIMESTAMP = 1114
const OID_TIMESTAMPTZ = 1184
const OID_TIMETZ = 1266
const ZEIT_OIDS = new Set([OID_DATE, OID_TIME, OID_TIMESTAMP, OID_TIMESTAMPTZ, OID_TIMETZ])

function alsPostgrestWert(wert: unknown, oid: number): unknown {
  if (!(wert instanceof Date)) return wert
  // `date` ohne Uhrzeit — PostgREST liefert YYYY-MM-DD.
  if (oid === OID_DATE) return wert.toISOString().slice(0, 10)
  return wert.toISOString()
}

function alsPgFehler(e: unknown): PgFehler {
  const f = e as { message?: string; code?: string; detail?: string; hint?: string }
  return {
    message: f?.message ?? String(e),
    code: f?.code,
    details: f?.detail ?? null,
    hint: f?.hint ?? null,
  }
}

export function macheSupabaseClient(
  db: PGlite,
  optionen: ClientOptionen = {}
): PgliteSupabaseClient {
  /**
   * Fuehrt SQL aus — bei gesetztem `alsNutzer` in einer Transaktion mit
   * `SET LOCAL ROLE authenticated`, sodass RLS greift.
   */
  async function fuehreAus<T extends Zeile>(sql: string, params: unknown[]): Promise<T[]> {
    optionen.protokoll?.push(sql)
    if (!optionen.alsNutzer) {
      const r = await db.query<T>(sql, params as never[])
      return vereinheitliche(r)
    }
    const claims = JSON.stringify({ sub: optionen.alsNutzer, role: 'authenticated' })
    return db.transaction(async tx => {
      await tx.exec(
        `SET LOCAL ROLE authenticated;` +
        `SET LOCAL request.jwt.claims = '${claims.replace(/'/g, "''")}';`
      )
      const r = await tx.query<T>(sql, params as never[])
      return vereinheitliche(r)
    }) as Promise<T[]>
  }

  /** Zeitspalten auf das PostgREST-Format ziehen (siehe Kopfkommentar). */
  function vereinheitliche<T extends Zeile>(
    ergebnis: { rows: T[]; fields?: Array<{ name: string; dataTypeID: number }> }
  ): T[] {
    const zeitSpalten = (ergebnis.fields ?? []).filter(f => ZEIT_OIDS.has(f.dataTypeID))
    if (zeitSpalten.length === 0) return ergebnis.rows
    for (const zeile of ergebnis.rows) {
      for (const f of zeitSpalten) {
        const z = zeile as Zeile
        z[f.name] = alsPostgrestWert(z[f.name], f.dataTypeID)
      }
    }
    return ergebnis.rows
  }

  /**
   * Gibt diese Funktion eine Zeilenmenge zurueck (SETOF/RETURNS TABLE)?
   *
   * PostgREST antwortet dann mit einem JSON-Array; bei einem Skalar mit
   * dem Wert selbst. Das Ergebnis wird gemerkt — pg_proc aendert sich
   * waehrend eines Testlaufs nicht.
   */
  const zeilenFunktionen = new Map<string, boolean>()
  async function liefertZeilen(name: string): Promise<boolean> {
    const gemerkt = zeilenFunktionen.get(name)
    if (gemerkt !== undefined) return gemerkt
    const r = await db.query<{ mengenwertig: boolean }>(
      `SELECT bool_or(p.proretset OR t.typtype = 'c') AS mengenwertig
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_type t ON t.oid = p.prorettype
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name] as never[],
    )
    const wert = r.rows[0]?.mengenwertig === true
    zeilenFunktionen.set(name, wert)
    return wert
  }

  function builder(tabelle: string): QueryBuilder {
    const filter: Filter[] = []
    let modus: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    let einfuegen: Zeile[] = []
    let aendern: Zeile = {}
    let konflikt: string | null = null
    let spaltenAuswahl = '*'
    let zaehlen = false
    let nurKopf = false
    /**
     * Sortierung — eine LISTE, nicht ein einzelner Eintrag.
     *
     * PostgREST haengt jedes `.order()` an und wertet sie in der
     * Aufrufreihenfolge aus. Der Shim behielt bis hierher nur das LETZTE
     * und warf die vorherigen still weg. Das ist kein Randfall: mehrere
     * Listenfunktionen dieses Repos sortieren zweistufig
     * (`listMassnahmen` nach sortierung, dann created_at;
     * `listArbeitszeiten` nach datum, dann start_zeit;
     * `listPlaene` nach gueltig_von, dann version) — gegen den Shim kam
     * dort die Reihenfolge des ZWEITEN Kriteriums heraus, und ein Test,
     * der die Sortierung prueft, haette das Gegenteil dessen bestaetigt,
     * was live passiert.
     */
    const sortierung: Array<{ spalte: string; auf: boolean }> = []
    let grenze: number | null = null

    /** Ein einzelner Filter als SQL-Bedingung. Rekursiv fuer or/not. */
    function bedingung(f: Filter, params: unknown[]): string {
      if (f.art === 'oder') {
        if (f.teile.length === 0) return 'FALSE'
        return `(${f.teile.map(t => bedingung(t, params)).join(' OR ')})`
      }
      if (f.art === 'nicht') {
        // PostgREST uebersetzt `spalte=not.eq.wert` zu `NOT (spalte = wert)`.
        // Eine NULL-Spalte faellt damit HERAUS (NOT NULL ist NULL, nicht
        // TRUE) — das ist kein Versehen des Shims, sondern die Semantik,
        // gegen die der Anwendungscode live laeuft.
        return `NOT (${bedingung(f.innen, params)})`
      }

      const q = `"${f.spalte}"`
      switch (f.art) {
        case 'eq': case 'neq': case 'lt': case 'lte': case 'gt': case 'gte': {
          const op = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' }[f.art]
          if (f.wert === null) return f.art === 'eq' ? `${q} IS NULL` : `${q} IS NOT NULL`
          params.push(f.wert)
          return `${q} ${op} $${params.length}`
        }
        case 'is':
          return f.wert === null ? `${q} IS NULL` : `${q} IS ${f.wert ? 'TRUE' : 'FALSE'}`
        case 'notNull':
          return `${q} IS NOT NULL`
        case 'in': case 'notIn': {
          if (f.werte.length === 0) return f.art === 'in' ? 'FALSE' : 'TRUE'
          const platz = f.werte.map(w => { params.push(w); return `$${params.length}` })
          return `${q} ${f.art === 'notIn' ? 'NOT ' : ''}IN (${platz.join(', ')})`
        }
      }
    }

    function whereKlausel(params: unknown[]): string {
      const bedingungen = filter.map(f => bedingung(f, params))
      return bedingungen.length ? ` WHERE ${bedingungen.join(' AND ')}` : ''
    }

    /** Loest `client:clients(...)` durch eine zweite Abfrage je Zeile auf. */
    /**
     * Spaltennamen einer Tabelle — einmal geholt, danach gemerkt.
     * Das Schema aendert sich waehrend eines Testlaufs nicht.
     */
    const spaltenCache = new Map<string, Set<string>>()
    async function spaltenVon(tabelle: string): Promise<Set<string>> {
      const gemerkt = spaltenCache.get(tabelle)
      if (gemerkt) return gemerkt
      const rows = await fuehreAus<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tabelle]
      )
      const menge = new Set(rows.map(r => String(r.column_name)))
      spaltenCache.set(tabelle, menge)
      return menge
    }

    /**
     * Prueft eine angeforderte Spaltenliste gegen das echte Schema.
     *
     * ── WARUM DAS SEIN MUSS ────────────────────────────────────────────
     * Der Shim baut immer `SELECT *` und schneidet die gewuenschten
     * Spalten hinterher in JavaScript zu. Eine Spalte, die es gar nicht
     * gibt, kam damit als `undefined` zurueck — der Test blieb gruen.
     * PostgREST antwortet dagegen mit 42703 und die Abfrage ist LIVE tot.
     *
     * Genau diese Luecke hat `listMandates()` gedeckt: die Abfrage nannte
     * `clients(… client_number)`, live heisst die Spalte
     * `customer_number`, und GET /api/billing/sepa/mandates war wochenlang
     * kaputt, ohne dass ein Test es sehen konnte. Der Shim ahmt den
     * Fehler jetzt nach, statt ihn zu verschlucken.
     */
    async function pruefeSpalten(tabelle: string, spalten: string[]): Promise<void> {
      const vorhanden = await spaltenVon(tabelle)
      if (vorhanden.size === 0) return // Tabelle unbekannt — das meldet das SELECT selbst.
      for (const roh of spalten) {
        const teil = roh.trim()
        if (!teil || teil === '*' || teil.includes('(')) continue
        // `alias:spalte` — PostgREST-Umbenennung; geprueft wird die Quelle.
        const name = teil.includes(':') ? teil.split(':').pop()!.trim() : teil
        if (name === '*' || vorhanden.has(name)) continue
        throw Object.assign(
          new Error(`column ${tabelle}.${name} does not exist`),
          { code: '42703' }
        )
      }
    }

    /**
     * Loest eingebettete Ressourcen auf — REKURSIV und in beide Richtungen.
     *
     * ── ZWEI ERWEITERUNGEN GEGENUEBER DER ERSTFASSUNG ──────────────────
     *
     * 1. VERSCHACHTELUNG. `invoice:invoices(id, client:clients(last_name))`
     *    kommt im DATEV-Generator gleich viermal vor. Vorher wurde die
     *    innere Ebene als flacher Spaltenname behandelt: die naive
     *    Zerlegung an `,` zerschnitt `client:clients(last_name)` in zwei
     *    Bruchstuecke, und `schmal['client:clients(last_name']` war
     *    `undefined`. Der Generator hat daraus einen leeren Klientennamen
     *    gelesen — ein Test darauf waere gruen geblieben, obwohl live ein
     *    Name in der Buchung steht.
     *
     * 2. RICHTUNG. `payments(… allocations:payment_allocations(…))` zeigt
     *    NICHT auf `payments.payment_allocation_id`, sondern umgekehrt:
     *    `payment_allocations.payment_id`. PostgREST liefert dafuer ein
     *    ARRAY. Der Rücklastschrift-Zweig des Generators liest genau das
     *    (`allocs[0].invoice`). Die Richtung wird am echten Schema
     *    bestimmt, nicht geraten.
     */
    async function ergaenzeEingebettet(
      elternTabelle: string,
      zeilen: Zeile[],
      specs: EingebettetSpec[],
    ): Promise<void> {
      if (zeilen.length === 0) return

      for (const spec of specs) {
        const { flach, eingebettet: tiefer } = zerlegeSelect(spec.spalten)
        await pruefeSpalten(spec.tabelle, flach)

        const elternSpalten = await spaltenVon(elternTabelle)
        const kindSpalten = await spaltenVon(spec.tabelle)

        const fkAmEltern = fkSpalte(spec.tabelle)          // invoices → invoice_id
        const fkAmKind = fkSpalte(elternTabelle)           // payments → payment_id

        /** Die angeforderten Spalten aus einer vollen Zeile herausschneiden. */
        function projiziere(voll: Zeile): Zeile {
          const schmal: Zeile = {}
          for (const roh of flach) {
            const name = roh.includes(':') ? roh.split(':').pop()!.trim() : roh.trim()
            if (name === '*') Object.assign(schmal, voll)
            else schmal[name] = voll[name]
          }
          return schmal
        }

        /**
         * Tiefere Ebenen werden auf den VOLLEN Zeilen aufgeloest und erst
         * danach in die zugeschnittenen kopiert.
         *
         * Der Grund steht im DATEV-Generator:
         * `allocations:payment_allocations(invoice:invoices(…))` fordert von
         * payment_allocations KEINE einzige flache Spalte an — auch nicht
         * `invoice_id`. Wer die naechste Ebene auf der zugeschnittenen Zeile
         * aufloest, findet den Fremdschluessel dort nicht mehr und liefert
         * still `null`. PostgREST hat das Problem nicht, weil es serverseitig
         * joint.
         */
        async function loeseTieferAuf(paare: Array<{ voll: Zeile; schmal: Zeile }>): Promise<void> {
          if (tiefer.length === 0) return
          await ergaenzeEingebettet(spec.tabelle, paare.map(pp => pp.voll), tiefer)
          for (const pp of paare) {
            for (const t of tiefer) pp.schmal[t.alias] = pp.voll[t.alias]
          }
        }

        if (elternSpalten.has(fkAmEltern)) {
          // ── viele-zu-eins: Objekt oder null ──────────────────────────
          const ids = [...new Set(zeilen.map(z => z[fkAmEltern]).filter(v => v != null))]
          const treffer = new Map<string, Zeile>()
          if (ids.length > 0) {
            const platz = ids.map((_, i) => `$${i + 1}`).join(', ')
            const rows = await fuehreAus<Zeile>(
              `SELECT * FROM public."${spec.tabelle}" WHERE "id" IN (${platz})`, ids
            )
            for (const r of rows) treffer.set(String(r.id), r)
          }
          const paare: Array<{ voll: Zeile; schmal: Zeile }> = []
          for (const z of zeilen) {
            const voll = treffer.get(String(z[fkAmEltern]))
            if (!voll) { z[spec.alias] = null; continue }
            const schmal = projiziere(voll)
            paare.push({ voll, schmal })
            z[spec.alias] = schmal
          }
          await loeseTieferAuf(paare)
          continue
        }

        if (kindSpalten.has(fkAmKind)) {
          // ── eins-zu-viele: Array (moeglicherweise leer) ──────────────
          const ids = [...new Set(zeilen.map(z => z.id).filter(v => v != null))]
          const nachEltern = new Map<string, Zeile[]>()
          const paare: Array<{ voll: Zeile; schmal: Zeile }> = []
          if (ids.length > 0) {
            const platz = ids.map((_, i) => `$${i + 1}`).join(', ')
            const rows = await fuehreAus<Zeile>(
              `SELECT * FROM public."${spec.tabelle}" WHERE "${fkAmKind}" IN (${platz})`, ids
            )
            for (const r of rows) {
              const schmal = projiziere(r)
              paare.push({ voll: r, schmal })
              const schluessel = String(r[fkAmKind])
              const liste = nachEltern.get(schluessel) ?? []
              liste.push(schmal)
              nachEltern.set(schluessel, liste)
            }
          }
          for (const z of zeilen) z[spec.alias] = nachEltern.get(String(z.id)) ?? []
          await loeseTieferAuf(paare)
          continue
        }

        throw new Error(
          `PGlite-Shim: kein Fremdschluessel zwischen "${elternTabelle}" und ` +
          `"${spec.tabelle}" gefunden (weder ${elternTabelle}.${fkAmEltern} ` +
          `noch ${spec.tabelle}.${fkAmKind}). Ausnahme in FK_AUSNAHMEN eintragen.`
        )
      }
    }

    async function ausfuehren(): Promise<Antwort<Zeile[]>> {
      const params: unknown[] = []
      try {
        if (modus === 'insert' || modus === 'upsert') {
          if (einfuegen.length === 0) return { data: [], error: null }
          const spalten = [...new Set(einfuegen.flatMap(z =>
            Object.keys(z).filter(k => z[k] !== undefined)))]
          const tupel = einfuegen.map(z =>
            `(${spalten.map(s => { params.push(z[s] ?? null); return `$${params.length}` }).join(', ')})`
          )
          const konfliktKlausel = modus === 'upsert'
            ? ` ON CONFLICT (${(konflikt ?? 'id').split(',').map(s => `"${s.trim()}"`).join(', ')}) DO UPDATE SET ${
                spalten.filter(s => s !== 'id').map(s => `"${s}" = EXCLUDED."${s}"`).join(', ')}`
            : ''
          const sql = `INSERT INTO public."${tabelle}" (${spalten.map(s => `"${s}"`).join(', ')})`
            + ` VALUES ${tupel.join(', ')}${konfliktKlausel} RETURNING *`
          return { data: await fuehreAus(sql, params), error: null }
        }

        if (modus === 'update') {
          const spalten = Object.keys(aendern).filter(k => aendern[k] !== undefined)
          if (spalten.length === 0) return { data: [], error: null }
          const sets = spalten.map(s => { params.push(aendern[s] ?? null); return `"${s}" = $${params.length}` })
          const sql = `UPDATE public."${tabelle}" SET ${sets.join(', ')}${whereKlausel(params)} RETURNING *`
          return { data: await fuehreAus(sql, params), error: null }
        }

        if (modus === 'delete') {
          const sql = `DELETE FROM public."${tabelle}"${whereKlausel(params)} RETURNING *`
          return { data: await fuehreAus(sql, params), error: null }
        }

        // ── SELECT ────────────────────────────────────────────────────
        const { flach, eingebettet } = zerlegeSelect(spaltenAuswahl)
        // Erst die Spaltennamen, dann die Daten — wie PostgREST, das eine
        // unbekannte Spalte mit 42703 abweist statt sie zu ignorieren.
        await pruefeSpalten(tabelle, flach)

        if (zaehlen) {
          const zSql = `SELECT count(*)::int AS anzahl FROM public."${tabelle}"${whereKlausel(params)}`
          const rows = await fuehreAus<{ anzahl: number }>(zSql, params)
          const anzahl = rows[0]?.anzahl ?? 0
          if (nurKopf) return { data: [], error: null, count: anzahl }
          const p2: unknown[] = []
          const daten = await fuehreAus<Zeile>(
            `SELECT * FROM public."${tabelle}"${whereKlausel(p2)}`, p2
          )
          await ergaenzeEingebettet(tabelle, daten, eingebettet)
          return { data: daten, error: null, count: anzahl }
        }

        let sql = `SELECT * FROM public."${tabelle}"${whereKlausel(params)}`
        if (sortierung.length > 0) {
          sql += ' ORDER BY ' + sortierung
            .map(s => `"${s.spalte}" ${s.auf ? 'ASC' : 'DESC'}`)
            .join(', ')
        }
        if (grenze != null) sql += ` LIMIT ${Number(grenze)}`
        const daten = await fuehreAus<Zeile>(sql, params)
        await ergaenzeEingebettet(tabelle, daten, eingebettet)
        return { data: daten, error: null }
      } catch (e) {
        return { data: [], error: alsPgFehler(e) }
      }
    }

    const b = {
      select(spalten = '*', opts?: { count?: 'exact'; head?: boolean }) {
        if (modus === 'select') spaltenAuswahl = spalten
        if (opts?.count === 'exact') zaehlen = true
        if (opts?.head) nurKopf = true
        return b
      },
      insert(zeilen: Zeile | Zeile[]) {
        modus = 'insert'; einfuegen = Array.isArray(zeilen) ? zeilen : [zeilen]; return b
      },
      upsert(zeilen: Zeile | Zeile[], opts?: { onConflict?: string }) {
        modus = 'upsert'; einfuegen = Array.isArray(zeilen) ? zeilen : [zeilen]
        konflikt = opts?.onConflict ?? null; return b
      },
      update(werte: Zeile) { modus = 'update'; aendern = werte; return b },
      delete() { modus = 'delete'; return b },
      eq(spalte: string, wert: unknown) { filter.push({ art: 'eq', spalte, wert }); return b },
      neq(spalte: string, wert: unknown) { filter.push({ art: 'neq', spalte, wert }); return b },
      gt(spalte: string, wert: unknown) { filter.push({ art: 'gt', spalte, wert }); return b },
      gte(spalte: string, wert: unknown) { filter.push({ art: 'gte', spalte, wert }); return b },
      lt(spalte: string, wert: unknown) { filter.push({ art: 'lt', spalte, wert }); return b },
      lte(spalte: string, wert: unknown) { filter.push({ art: 'lte', spalte, wert }); return b },
      is(spalte: string, wert: null | boolean) { filter.push({ art: 'is', spalte, wert }); return b },
      in(spalte: string, werte: unknown[]) { filter.push({ art: 'in', spalte, werte }); return b },
      not(spalte: string, op: string, wert: unknown) {
        if (op === 'in') filter.push({ art: 'notIn', spalte, werte: parsePgListe(wert) })
        else if (op === 'is') filter.push({ art: 'notNull', spalte })
        else if (['eq', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(op)) {
          // `.not('status', 'eq', 'entwurf')` steht im DATEV-Generator und
          // liess den Shim vorher werfen — der Export war damit gar nicht
          // testbar.
          filter.push({ art: 'nicht', innen: { art: op as Vergleich, spalte, wert } })
        } else throw new Error(`PGlite-Shim: not(…, '${op}', …) wird nicht unterstuetzt`)
        return b
      },
      or(ausdruck: string) {
        filter.push({ art: 'oder', teile: parseOderAusdruck(ausdruck) })
        return b
      },
      order(spalte: string, opts?: { ascending?: boolean }) {
        sortierung.push({ spalte, auf: opts?.ascending !== false }); return b
      },
      limit(n: number) { grenze = n; return b },
      returns() { return b },
      async single() {
        const r = await ausfuehren()
        if (r.error) return { data: null, error: r.error }
        if (r.data.length !== 1) {
          return {
            data: null,
            error: {
              message: r.data.length === 0
                ? `Keine Zeile in ${tabelle} gefunden`
                : `${r.data.length} Zeilen in ${tabelle} — single() erwartet genau eine`,
              code: 'PGRST116',
            },
          }
        }
        return { data: r.data[0], error: null }
      },
      async maybeSingle() {
        const r = await ausfuehren()
        if (r.error) return { data: null, error: r.error }
        return { data: r.data[0] ?? null, error: null, count: r.count }
      },
      then(auf: (w: Antwort<Zeile[]>) => unknown, ab?: (e: unknown) => unknown) {
        return ausfuehren().then(auf, ab)
      },
    } as unknown as QueryBuilder

    return b
  }

  return {
    from: builder,
    async rpc(name: string, params: Record<string, unknown> = {}) {
      const schluessel = Object.keys(params)
      const werte = schluessel.map(k => params[k])
      const argumente = schluessel.map((k, i) => `${k} => $${i + 1}`).join(', ')
      try {
        // RETURNS TABLE / SETOF liefert PostgREST als Zeilenliste, ein
        // Skalar (auch jsonb) als Wert. Ein `SELECT fn() AS ergebnis`
        // ueber eine Tabellenfunktion ergaebe dagegen einen Verbundtyp,
        // aus dem der Aufrufer kein Feld lesen kann — genau der
        // Unterschied, an dem ein Test sonst gruen faellt.
        if (await liefertZeilen(name)) {
          const rows = await fuehreAus<Zeile>(`SELECT * FROM public.${name}(${argumente})`, werte)
          return { data: rows, error: null }
        }
        const rows = await fuehreAus<Zeile>(
          `SELECT public.${name}(${argumente}) AS ergebnis`, werte
        )
        return { data: rows[0]?.ergebnis ?? null, error: null }
      } catch (e) {
        return { data: null, error: alsPgFehler(e) }
      }
    },
  }
}
