// ═══════════════════════════════════════════════════════════════════════
// Block 37 — Schreibt der Code Werte, die der CHECK gar nicht zulaesst?
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND-GESCHICHTE
//
// Dasselbe Muster hat in dieser Sitzung dreimal zugeschlagen:
//
//   Block 28  `invoices.status` fuehrt ZWEI Vokabulare (deutsch/englisch);
//             vier Stellen kannten je nur die halbe Liste — eine
//             stornierte Rechnung blieb in den offenen Posten stehen.
//   Block 33  `service_type` (Klartext) gegen `leistungsart` (Schluessel)
//             — die Leistung lief aus dem falschen Budgettopf.
//   Block 36  `client_signer_role: 'client'` gegen den CHECK
//             (KUNDE/ANGEHOERIGER/VERTRETER) — haette die
//             Unterschriftskette zerrissen.
//
// Zweimal ging es um Geld, einmal um einen Beleg. Einzeln gefunden, jedes
// Mal durch Zufall. Dieses Modul macht daraus eine Pruefung.
//
// ── WARUM DIE ZUORDNUNG DAS SCHWERE IST ───────────────────────────────
//
// Ein erster Entwurf verglich Spaltennamen gegen die VEREINIGUNG aller
// erlaubten Werte im Schema. Ergebnis: 1142 Treffer, fast alle falsch —
// `category: 'HARM_CATEGORY_HARASSMENT'` ist ein Gemini-Feld,
// `role: 'user'` eine LLM-Rolle, `type: 'text/plain;…'` ein MIME-Typ.
// Nichts davon geht in eine Datenbank.
//
// Der zweite Entwurf suchte `.from('X')` und danach im Umkreis von 400
// Zeichen ein `.insert({`. Damit ueberbrueckte er zwei getrennte
// Anweisungen: 2 von 12 Treffern ordneten das Objektliteral der falschen
// Tabelle zu.
//
// Es zaehlt deshalb nur, was DIREKT verkettet ist: zwischen `.from('X')`
// und `.insert({` darf nur Leerraum stehen. Das findet weniger — aber was
// es findet, stimmt.
import type { SupabaseClient } from '@supabase/supabase-js'

/** Eine Werteliste aus einem CHECK-Constraint. */
export interface Werteliste {
  tabelle: string
  spalte: string
  werte: string[]
}

export interface Vokabelbefund {
  datei: string
  zeile: number
  tabelle: string
  spalte: string
  wert: string
  erlaubt: string[]
}

/**
 * Liest Tabelle, Spalte und erlaubte Werte aus einer
 * `pg_get_constraintdef`-Zeile.
 *
 * Postgres schreibt den Spaltenbezug in zwei Formen, je nach Typ und
 * Alter des Constraints:
 *
 *     CHECK ((kanal = ANY (ARRAY['sftp_105'::text, …])))
 *     CHECK (((client_signer_role)::text = ANY (ARRAY['KUNDE'::text, …])))
 *
 * Der erste Entwurf verlangte `::text` hinter dem Spaltennamen und fand
 * deshalb NULL Constraints — bei 421 vorhandenen. Ein Detektor, der
 * nichts findet, sieht aus wie ein sauberes System.
 */
export function werteliste(tabelle: string, definition: string): Werteliste | null {
  const m = definition.match(/\(?\(?([a-z_]+)\)?(?:::text)? = ANY \(ARRAY\[(.*?)\]\)/)
  if (!m) return null
  const werte = [...m[2].matchAll(/'((?:[^']|'')*)'(?:::text)?/g)].map(x => x[1].replace(/''/g, "'"))
  if (werte.length === 0) return null
  return { tabelle, spalte: m[1], werte }
}

/** Schluessel der Nachschlagetabelle. */
export function schluessel(tabelle: string, spalte: string): string {
  return `${tabelle}.${spalte}`
}

/**
 * Das Objektliteral ab `start` (zeigt auf `{`) als Text.
 *
 * Zaehlt Klammern statt einen Parser zu bemuehen — fuer ein
 * Supabase-Insert reicht das, und die Obergrenze verhindert, dass eine
 * unbalancierte Datei den Lauf haengen laesst.
 */
export function objektAb(quelle: string, start: number, maxLaenge = 4000): string | null {
  let tiefe = 0
  for (let i = start; i < quelle.length && i < start + maxLaenge; i++) {
    if (quelle[i] === '{') tiefe++
    else if (quelle[i] === '}') {
      tiefe--
      if (tiefe === 0) return quelle.slice(start, i + 1)
    }
  }
  return null
}

/** Kommentare raus — sie zitieren die Befunde, die sie erklaeren. */
export function ohneKommentare(quelle: string): string {
  return quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * DIREKT verkettete Schreibvorgänge: `.from('X').insert({ … })`.
 *
 * Zwischen `.from()` und der Schreibmethode darf nur Leerraum stehen —
 * siehe die Begruendung im Dateikopf.
 */
const SCHREIBWEG = /\.from\(\s*'([a-z_]+)'\s*\)\s*\.(insert|update|upsert)\(\s*\{/g

/** `feld: 'wert'` innerhalb eines Objektliterals. */
const FELD_LITERAL = /(?:^|[{,\s])([a-z_]{2,})\s*:\s*'([^']{1,60})'/g

/**
 * Prueft eine Quelldatei gegen die Wertelisten.
 *
 * `erlaubt` ist nach `schluessel(tabelle, spalte)` aufgebaut. Eine Spalte
 * ohne Eintrag wird uebersprungen: sie traegt keinen CHECK, und dann ist
 * jeder Wert zulaessig.
 */
export function pruefeQuelle(
  datei: string,
  quelle: string,
  erlaubt: ReadonlyMap<string, ReadonlySet<string>>,
): Vokabelbefund[] {
  const q = ohneKommentare(quelle)
  const befunde: Vokabelbefund[] = []

  for (const treffer of q.matchAll(SCHREIBWEG)) {
    const tabelle = treffer[1]
    const start = treffer.index! + treffer[0].length - 1
    const objekt = objektAb(q, start)
    if (!objekt) continue

    for (const feld of objekt.matchAll(FELD_LITERAL)) {
      const [, spalte, wert] = feld
      const menge = erlaubt.get(schluessel(tabelle, spalte))
      if (!menge || menge.has(wert)) continue
      befunde.push({
        datei,
        zeile: q.slice(0, treffer.index!).split('\n').length,
        tabelle,
        spalte,
        wert,
        erlaubt: [...menge],
      })
    }
  }

  return befunde
}

/** Alle Wertelisten des Schemas, live aus `pg_constraint`. */
export async function ladeWertelisten(
  leseSql: (sql: string) => Promise<string>,
): Promise<Map<string, Set<string>>> {
  const sql = `DO $$ DECLARE t text; BEGIN
    SELECT COALESCE(string_agg(z, '~'), '') INTO t FROM (
      SELECT c.relname||'|'||replace(replace(pg_get_constraintdef(con.oid), E'\n', ' '), '|', '/') AS z
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%= ANY (ARRAY[%') s;
    RAISE EXCEPTION 'KETTE:%', t;
  END $$;`

  const roh = await leseSql(sql)
  const karte = new Map<string, Set<string>>()
  for (const zeile of roh.split('~').filter(Boolean)) {
    const teile = zeile.split('|')
    const liste = werteliste(teile[0], teile.slice(1).join('|'))
    if (!liste) continue
    const key = schluessel(liste.tabelle, liste.spalte)
    if (!karte.has(key)) karte.set(key, new Set())
    for (const w of liste.werte) karte.get(key)!.add(w)
  }
  return karte
}

/** Nur damit der Typ-Import nicht ungenutzt ist. */
export type SqlLeser = (client: SupabaseClient, sql: string) => Promise<string>
