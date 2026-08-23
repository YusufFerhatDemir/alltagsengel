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
 *     Abfrage aufgeloest, nicht als JOIN. Reihenfolge und Filter auf der
 *     eingebetteten Tabelle unterstuetzt der Shim nicht.
 *   • `.select()` nach insert/update liefert immer die vollstaendige Zeile
 *     (RETURNING *), nicht die angeforderte Spaltenliste.
 *   • Ohne `alsNutzer` laeuft alles als Superuser — das entspricht dem
 *     service-role-Client der Anwendung (BYPASSRLS). Fuer RLS-Beweise
 *     muss `alsNutzer` gesetzt sein.
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
  order(spalte: string, opts?: { ascending?: boolean }): QueryBuilder
  limit(n: number): QueryBuilder
  returns<T>(): QueryBuilder & PromiseLike<Antwort<T>>
  single(): Promise<Antwort<Zeile | null>>
  maybeSingle(): Promise<Antwort<Zeile | null>>
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
      return r.rows
    }
    const claims = JSON.stringify({ sub: optionen.alsNutzer, role: 'authenticated' })
    return db.transaction(async tx => {
      await tx.exec(
        `SET LOCAL ROLE authenticated;` +
        `SET LOCAL request.jwt.claims = '${claims.replace(/'/g, "''")}';`
      )
      const r = await tx.query<T>(sql, params as never[])
      return r.rows
    }) as Promise<T[]>
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
    let sortierung: { spalte: string; auf: boolean } | null = null
    let grenze: number | null = null

    function whereKlausel(params: unknown[]): string {
      const bedingungen: string[] = []
      for (const f of filter) {
        const q = `"${f.spalte}"`
        switch (f.art) {
          case 'eq': case 'neq': case 'lt': case 'lte': case 'gt': case 'gte': {
            const op = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' }[f.art]
            if (f.wert === null) {
              bedingungen.push(f.art === 'eq' ? `${q} IS NULL` : `${q} IS NOT NULL`)
            } else {
              params.push(f.wert)
              bedingungen.push(`${q} ${op} $${params.length}`)
            }
            break
          }
          case 'is':
            bedingungen.push(f.wert === null ? `${q} IS NULL` : `${q} IS ${f.wert ? 'TRUE' : 'FALSE'}`)
            break
          case 'notNull':
            bedingungen.push(`${q} IS NOT NULL`)
            break
          case 'in': case 'notIn': {
            if (f.werte.length === 0) {
              bedingungen.push(f.art === 'in' ? 'FALSE' : 'TRUE')
              break
            }
            const platz = f.werte.map(w => { params.push(w); return `$${params.length}` })
            bedingungen.push(`${q} ${f.art === 'notIn' ? 'NOT ' : ''}IN (${platz.join(', ')})`)
            break
          }
        }
      }
      return bedingungen.length ? ` WHERE ${bedingungen.join(' AND ')}` : ''
    }

    /** Loest `client:clients(...)` durch eine zweite Abfrage je Zeile auf. */
    async function ergaenzeEingebettet(zeilen: Zeile[], specs: EingebettetSpec[]): Promise<void> {
      for (const spec of specs) {
        const fk = fkSpalte(spec.tabelle)
        const ids = [...new Set(zeilen.map(z => z[fk]).filter(v => v != null))]
        const treffer = new Map<string, Zeile>()
        if (ids.length > 0) {
          const platz = ids.map((_, i) => `$${i + 1}`).join(', ')
          const rows = await fuehreAus<Zeile>(
            `SELECT * FROM public."${spec.tabelle}" WHERE "id" IN (${platz})`, ids
          )
          for (const r of rows) treffer.set(String(r.id), r)
        }
        const gewuenscht = spec.spalten.split(',').map(s => s.trim()).filter(Boolean)
        for (const z of zeilen) {
          const voll = treffer.get(String(z[fk]))
          if (!voll) { z[spec.alias] = null; continue }
          const schmal: Zeile = {}
          for (const s of gewuenscht) schmal[s] = voll[s]
          z[spec.alias] = schmal
        }
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
        const { eingebettet } = zerlegeSelect(spaltenAuswahl)

        if (zaehlen) {
          const zSql = `SELECT count(*)::int AS anzahl FROM public."${tabelle}"${whereKlausel(params)}`
          const rows = await fuehreAus<{ anzahl: number }>(zSql, params)
          const anzahl = rows[0]?.anzahl ?? 0
          if (nurKopf) return { data: [], error: null, count: anzahl }
          const p2: unknown[] = []
          const daten = await fuehreAus<Zeile>(
            `SELECT * FROM public."${tabelle}"${whereKlausel(p2)}`, p2
          )
          await ergaenzeEingebettet(daten, eingebettet)
          return { data: daten, error: null, count: anzahl }
        }

        let sql = `SELECT * FROM public."${tabelle}"${whereKlausel(params)}`
        if (sortierung) sql += ` ORDER BY "${sortierung.spalte}" ${sortierung.auf ? 'ASC' : 'DESC'}`
        if (grenze != null) sql += ` LIMIT ${Number(grenze)}`
        const daten = await fuehreAus<Zeile>(sql, params)
        await ergaenzeEingebettet(daten, eingebettet)
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
        else throw new Error(`PGlite-Shim: not(…, '${op}', …) wird nicht unterstuetzt`)
        return b
      },
      order(spalte: string, opts?: { ascending?: boolean }) {
        sortierung = { spalte, auf: opts?.ascending !== false }; return b
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
