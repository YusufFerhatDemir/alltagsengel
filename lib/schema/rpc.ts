// ═══════════════════════════════════════════════════════════════════════
// Block 40 — Ruft der Code Funktionen und Argumente auf, die es gibt?
// ═══════════════════════════════════════════════════════════════════════
//
// Die vierte Achse neben Werten (Block 37), Schreibspalten (38) und
// Lesespalten (39). Sie ist die tueckischste, weil der Fehler hier NICHT
// wirft:
//
//     const { error } = await supabase.rpc('gibtesnicht', { a: 1 })
//
// `rpc()` liefert ein Fehlerobjekt und keine Ausnahme. Ein `try/catch`
// darum herum ist toter Code, und wer `error` nicht ansieht, merkt
// nichts. Genau so wurde in diesem Projekt einmal ein Referral-Bonus nie
// gebucht.
//
// ── ERGEBNIS DES ERSTEN LAUFS ─────────────────────────────────────────
//
// 387 Funktionen in `public`. Ein einziger Treffer: `rpc('version')` im
// Health-Check — `version()` liegt in `pg_catalog`, und PostgREST
// exponiert ausschliesslich `public`. Der Aufruf beantwortete JEDEN
// Health-Check mit PGRST202 (live geprueft). Das Ergebnis war trotzdem
// richtig, weil ein Select als Rueckfall danebenstand; gekostet hat es
// einen Rundlauf je Lauf und einen Fehler im Protokoll. Behoben.
//
// Null Abweichungen bei den Argumentnamen.
import { objektAb, ohneKommentare } from './vokabular'

export interface RpcBefund {
  datei: string
  zeile: number
  funktion: string
  /** Fehlt die Funktion selbst, steht hier null. */
  argument: string | null
  erlaubt: string[]
}

/** `.rpc('name'` — mit oder ohne folgendes Argumentobjekt. */
const RPC_AUFRUF = /\.rpc\(\s*'([a-z_0-9]+)'\s*(,\s*\{)?/g

/** `feld:` direkt nach `{` oder `,` — kein Ternär. */
const FELD = /(?:^|[{,])\s*([a-z_][a-z0-9_]*)\s*:/g

/** Strings und verschachtelte Objekte neutralisieren (wie in spalten.ts). */
function obersteEbene(obj: string): string {
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
 * Prueft die RPC-Aufrufe einer Quelldatei.
 *
 * `funktionen` bildet den Namen auf die Vereinigung aller Argumentnamen
 * ueber alle Ueberladungen ab. Die Vereinigung ist Absicht: mehrere
 * Signaturen derselben Funktion sind zulaessig, und welche der Aufruf
 * trifft, entscheidet PostgREST — hier zu raten hiesse Falschalarm.
 */
export function pruefeRpc(
  datei: string,
  quelle: string,
  funktionen: ReadonlyMap<string, ReadonlySet<string>>,
): RpcBefund[] {
  const q = ohneKommentare(quelle)
  const befunde: RpcBefund[] = []

  for (const treffer of q.matchAll(RPC_AUFRUF)) {
    const funktion = treffer[1]
    const bekannt = funktionen.get(funktion)

    if (!bekannt) {
      befunde.push({
        datei,
        zeile: q.slice(0, treffer.index!).split('\n').length,
        funktion,
        argument: null,
        erlaubt: [],
      })
      continue
    }

    if (!treffer[2]) continue
    const start = q.indexOf('{', treffer.index! + treffer[0].length - 1)
    const objekt = objektAb(q, start, 3000)
    if (!objekt) continue

    for (const feld of obersteEbene(objekt).matchAll(FELD)) {
      if (bekannt.has(feld[1])) continue
      befunde.push({
        datei,
        zeile: q.slice(0, treffer.index!).split('\n').length,
        funktion,
        argument: feld[1],
        erlaubt: [...bekannt],
      })
    }
  }

  return befunde
}

/** Funktionsnamen und Argumentnamen, live aus `pg_proc`. */
export async function ladeFunktionen(
  leseSql: (sql: string) => Promise<string>,
): Promise<Map<string, Set<string>>> {
  const sql = `DO $$ DECLARE t text; BEGIN
    SELECT COALESCE(string_agg(z, '~'), '') INTO t FROM (
      SELECT p.proname||'|'||COALESCE(array_to_string(p.proargnames, ','), '') AS z
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public') s;
    RAISE EXCEPTION 'KETTE:%', t;
  END $$;`

  const roh = await leseSql(sql)
  const karte = new Map<string, Set<string>>()
  for (const zeile of roh.split('~').filter(Boolean)) {
    const [name, args] = zeile.split('|')
    if (!karte.has(name)) karte.set(name, new Set())
    for (const a of (args ?? '').split(',').map(x => x.trim()).filter(Boolean)) {
      karte.get(name)!.add(a)
    }
  }
  return karte
}
