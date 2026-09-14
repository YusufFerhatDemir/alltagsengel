// ═══════════════════════════════════════════════════════════════════════
// Block 38 — Schreibt der Code auf Spalten, die es nicht gibt?
// ═══════════════════════════════════════════════════════════════════════
//
// Die Schwester von lib/schema/vokabular.ts. Der prueft WERTE gegen
// CHECK-Listen, dieser prueft SPALTENNAMEN gegen das Schema.
//
// Warum beides noetig ist, zeigte die erste Messung: die
// Referral-Benachrichtigung schrieb `type: 'referral'` (verbotener Wert,
// Block 37) UND `message:` (Spalte heisst `body`). Nach der Behebung des
// Wertes meldete der Vokabular-Detektor die Stelle als sauber — die
// Benachrichtigung kam trotzdem nicht an. Zwei tote Gruende in einer
// Anweisung, und jede Achse sieht nur ihren eigenen.
//
// Eine unbekannte Spalte ist dabei der haertere Fall: Postgres weist
// nicht das Feld ab, sondern die GANZE Abfrage (42703).
//
// ── DIE SECHS BEFUNDE DES ERSTEN LAUFS ────────────────────────────────
//
//   mis_applicants.created_by        Bewerber anlegen scheiterte
//   mis_job_postings.created_by      Stellenausschreibung anlegen scheiterte
//   mis_privacy_records.created_by   Verarbeitungsverzeichnis (Art. 30)
//   mis_privacy_consents.created_by  Einwilligung erfassen scheiterte
//   mis_privacy_consents.updated_at  Einwilligung WIDERRUFEN scheiterte
//   mis_privacy_requests.created_by  Betroffenenanfrage (Art. 15–22)
//
// ── WAS BEIM BAU DREIMAL SCHIEFGING ───────────────────────────────────
//
// Jeder Fehlversuch meldete NULL Befunde — und ein Detektor, der nichts
// findet, sieht aus wie ein sauberes System:
//
//   1. Strings blieben stehen: ein deutscher Satz im Template-Literal
//      („Nachweis fehlt: …") lieferte `fehlt` als vermeintliche Spalte.
//   2. Die Klammer-Kuerzung fuer verschachtelte JSONB-Objekte traf das
//      aeussere Objekt selbst und loeschte den ganzen Inhalt.
//   3. Der Feld-Ausdruck erlaubte beliebigen Leerraum davor und fing
//      damit Ternaere (`bedingung ? wert : null` → `wert`).
//
// Deshalb: Strings zuerst neutralisieren, nur das INNERE der aeusseren
// Klammer kuerzen, und ein Feld muss direkt auf `{` oder `,` folgen.
import { objektAb, ohneKommentare } from './vokabular'

export interface Spaltenbefund {
  datei: string
  zeile: number
  tabelle: string
  spalte: string
}

/** Direkt verkettete Schreibvorgänge — dieselbe Regel wie beim Vokabular. */
const SCHREIBWEG = /\.from\(\s*'([a-z_]+)'\s*\)\s*\.(insert|update|upsert)\(\s*\{/g

/** `feld:` direkt nach `{` oder `,` — kein Ternär, kein Leerraum davor. */
const FELD = /(?:^|[{,])\s*([a-z_][a-z0-9_]*)\s*:/g

/**
 * Neutralisiert Strings und verschachtelte Objekte, damit nur die
 * Feldnamen der obersten Ebene uebrig bleiben.
 *
 * `obj` kommt mit den aeusseren Klammern; gearbeitet wird auf dem
 * Inneren — siehe Fehlversuch 2 im Dateikopf.
 */
export function obersteEbene(obj: string): string {
  let inneres = obj.slice(1, -1)
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  for (let runde = 0; runde < 6; runde++) {
    const kuerzer = inneres.replace(/\{[^{}]*\}/g, '""')
    if (kuerzer === inneres) break
    inneres = kuerzer
  }
  return inneres
}

/**
 * Prueft eine Quelldatei gegen die bekannten Spalten je Tabelle.
 *
 * Tabellen ohne Eintrag werden uebersprungen: sie stehen nicht in der
 * OpenAPI (Views, nicht exponierte Schemata), und eine Vermutung waere
 * schlechter als Schweigen.
 */
export function pruefeSpalten(
  datei: string,
  quelle: string,
  spalten: ReadonlyMap<string, ReadonlySet<string>>,
): Spaltenbefund[] {
  const q = ohneKommentare(quelle)
  const befunde: Spaltenbefund[] = []

  for (const treffer of q.matchAll(SCHREIBWEG)) {
    const tabelle = treffer[1]
    const bekannt = spalten.get(tabelle)
    if (!bekannt) continue

    const objekt = objektAb(q, treffer.index! + treffer[0].length - 1)
    if (!objekt) continue

    for (const feld of obersteEbene(objekt).matchAll(FELD)) {
      const spalte = feld[1]
      if (bekannt.has(spalte)) continue
      befunde.push({
        datei,
        zeile: q.slice(0, treffer.index!).split('\n').length,
        tabelle,
        spalte,
      })
    }
  }

  return befunde
}

/** Spalten je Tabelle aus der PostgREST-OpenAPI. */
export function spaltenAusOpenApi(spec: unknown): Map<string, Set<string>> {
  const karte = new Map<string, Set<string>>()
  const defs = (spec as { definitions?: Record<string, { properties?: Record<string, unknown> }> })?.definitions
  for (const [tabelle, def] of Object.entries(defs ?? {})) {
    karte.set(tabelle, new Set(Object.keys(def.properties ?? {})))
  }
  return karte
}
