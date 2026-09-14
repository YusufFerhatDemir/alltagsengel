#!/usr/bin/env tsx
/**
 * lint-schreibrecht.ts
 * --------------------
 * Prevention-Control: ein Schreib-Handler darf nicht auf Leserecht
 * autorisieren.
 *
 * DER BEFUND (Block 43, 14.09.2026)
 * Die Wächter-Helfer der Module nehmen die verlangte Berechtigung als
 * Parameter — MIT Vorgabewert, und der ist bei acht von ihnen ein
 * `.lesen`-Recht:
 *
 *   requirePflegeAdmin(berechtigung: Berechtigung = 'pflege.lesen')
 *   requireQmAdmin(berechtigung: Berechtigung = 'qm.lesen')
 *   requireAdmin(berechtigung: Berechtigung = 'abrechnung.lesen')
 *   …
 *
 * Ein POST, der `requirePflegeAdmin()` ohne Argument ruft, sieht im
 * Quelltext bewacht aus und prüft doch nur Leserecht. Genau diese Form
 * hatte das Bonusmodul (Seite/API/RLS gaben drei verschiedene Antworten)
 * und der Einsatzplanungs-PATCH (Budgetdeckel ohne `abrechnung.schreiben`).
 *
 * Die bestehenden Prüfungen sehen das NICHT:
 *   - `lint:route-auth` fragt nach der Rollen-QUELLE, nicht nach dem Recht.
 *   - `lint:org-id` deckt Insert/Upsert ab, nicht die Berechtigung.
 *   - Eine Suche nach Berechtigungs-Literalen findet nichts, weil das
 *     Literal im Helfer steht und nicht am Aufrufort.
 *
 * ZWEI REGELN
 *
 *   R1 „Schreiben auf Lese-Vorgabewert"
 *      Ein POST/PATCH/PUT/DELETE ruft einen importierten Wächter-Helfer
 *      ohne Argument, dessen Vorgabewert ein `.lesen`-Recht ist — oder
 *      übergibt ausdrücklich ein `.lesen`-Recht.
 *
 *   R2 „Leserecht als einzige Schreibautorisierung"
 *      Ein Schreib-Handler autorisiert über ein `.lesen`-Recht, das NICHT
 *      in NUR_ADMINISTRATION steht. Dann dürfte jede Rolle, die das
 *      Leserecht hält, auch schreiben.
 *
 *      Der Vorbehalt ist der Grund, warum die Watchlist (POST unter
 *      `sicherheit.lesen`) heute KEIN Fund ist: das Recht haben nur admin
 *      und superadmin. Nimmt jemand es später in die Rollenmatrix einer
 *      Fachrolle auf — etwa damit das Qualitätsmanagement die
 *      Sicherheitsspur lesen kann —, schlägt diese Regel an. Genau dann
 *      bekäme diese Rolle nämlich stillschweigend das Recht, die
 *      Kontoüberwachung abzuschalten.
 *
 * BEWUSSTE GRENZE — hier benannt statt stillschweigend:
 * Ein Handler, der die enge Berechtigung erst in einem Zweig darunter
 * prüft (app/api/qm/befunde/route.ts PATCH: `qm.lesen` als Tür, dann je
 * Aktion `qm.schreiben` oder `pflege.schreiben`), ist RICHTIG und wird
 * deshalb nicht gemeldet, sobald im selben Handler ein Schreibrecht
 * vorkommt. Die Regel fragt: „kommt hier überhaupt ein Schreibrecht vor?"
 * — nicht: „deckt es jeden Pfad ab?". Sie ist ein Türsteher, kein Beweis.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { NUR_ADMINISTRATION, type Berechtigung } from '../lib/auth/rollen'

const SCHREIB_VERBEN = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/** Schreibende Aufrufe — dieselbe Liste fuer Handler und Ausnahmepruefung. */
const SCHREIB_AUFRUF = /\.(insert|update|upsert|delete)\s*\(/

/**
 * POST mit LESE-Bedeutung. Ein Trockenlauf nimmt eine CAMT-Datei
 * entgegen — die passt nicht in eine GET-Adresse — und schreibt nichts.
 * `abrechnung.lesen` ist dort das RICHTIGE Recht, nicht das zu schwache.
 *
 * Die Ausnahme ist KEIN Freibrief: `ausnahmeGiltNoch()` prueft sie bei
 * jedem Lauf nach, im Handler UND eine Ebene tief in der aufgerufenen
 * Modulfunktion. Faengt der Trockenlauf an zu schreiben, meldet die
 * Regel ihn wieder — dann stimmt die Begruendung nicht mehr.
 */
const LESE_POSTS: Readonly<Record<string, string>> = {
  'app/api/pilot/camt-dry-run/route.ts':
    'Trockenlauf: camtPilotLauf() liest und berichtet, schreibt nicht.',
  'app/api/billing/camt/preflight/route.ts':
    'Trockenlauf: camtPreflight() liest und berichtet, schreibt nicht.',
}

/** Helfer mit Lese-Vorgabewert — aus dem Quelltext gelesen, nicht verdrahtet. */
export function helferMitLeseVorgabe(dateien: readonly string[]): Map<string, string> {
  const gefunden = new Map<string, string>()
  for (const datei of dateien) {
    const src = readFileSync(datei, 'utf8')
    const muster =
      /export\s+(?:async\s+)?function\s+(require[A-Z]\w*)\s*\(\s*(?:\w+)\s*:\s*(?:Berechtigung|Zugriffsart)\s*=\s*['"]([\w.]+)['"]/g
    for (const m of src.matchAll(muster)) {
      if (m[2].endsWith('.lesen') || m[2] === 'lesen') gefunden.set(m[1], m[2])
    }
  }
  return gefunden
}

/** Zerlegt eine Datei an ihren Top-Level-Exporten in Handler-Abschnitte. */
export function handlerAbschnitte(src: string): { name: string; text: string }[] {
  const grenze = /^export\s+(?:const\s+(\w+)\s*=|async\s+function\s+(\w+)|function\s+(\w+))/gm
  const marken: { name: string; von: number }[] = []
  let m: RegExpExecArray | null
  while ((m = grenze.exec(src))) marken.push({ name: m[1] || m[2] || m[3], von: m.index })
  return marken.map((mk, i) => ({
    name: mk.name,
    text: src.slice(mk.von, i + 1 < marken.length ? marken[i + 1].von : src.length),
  }))
}

/** Bezeichner, die diese Datei tatsächlich importiert. */
export function importierteNamen(src: string): Set<string> {
  const namen = new Set<string>()
  for (const im of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const teil of im[1].split(',')) {
      const n = teil.trim().split(/\s+as\s+/)[0].trim()
      if (n) namen.add(n)
    }
  }
  return namen
}

/**
 * Gilt die Lese-POST-Ausnahme noch? Prueft den Handler selbst und die
 * Funktionen, die er aus `@/lib/...` holt — eine Ebene tief. Tiefer
 * greift sie nicht, und das ist hier ausdruecklich gesagt statt
 * stillschweigend vorausgesetzt.
 */
export function ausnahmeGiltNoch(
  handlerText: string,
  src: string,
  lies: (pfad: string) => string | null,
): boolean {
  if (SCHREIB_AUFRUF.test(handlerText)) return false

  const importe = new Map<string, string[]>()
  for (const im of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@\/([^'"]+)['"]/g)) {
    const namen = im[1].split(',').map(t => t.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    importe.set(im[2], namen)
  }
  for (const [pfad, namen] of importe) {
    const gerufen = namen.filter(n => new RegExp(`\\b${n}\\s*\\(`).test(handlerText))
    if (gerufen.length === 0) continue
    const modulSrc = lies(pfad)
    if (modulSrc === null) return false          // nicht nachsehen koennen ist kein Beleg
    for (const ab of handlerAbschnitte(modulSrc)) {
      if (!gerufen.includes(ab.name)) continue
      if (SCHREIB_AUFRUF.test(ab.text)) return false
    }
  }
  return true
}

export interface Verstoss {
  datei: string
  handler: string
  regel: 'R1' | 'R2'
  text: string
}

export function pruefeDatei(
  datei: string,
  src: string,
  leseHelfer: ReadonlyMap<string, string>,
  lies: (pfad: string) => string | null = () => null,
): Verstoss[] {
  const verstoesse: Verstoss[] = []
  const importiert = importierteNamen(src)
  const relevant = [...leseHelfer.keys()].filter(h => importiert.has(h))

  for (const ab of handlerAbschnitte(src)) {
    if (!SCHREIB_VERBEN.has(ab.name)) continue

    // Kommt im Handler IRGENDWO ein Schreib-/Verwaltungsrecht vor, hat er
    // sich bewusst um die Berechtigung gekümmert (Tür-und-Zweig-Muster).
    const hatSchreibrecht = /['"][\w.]*\.(schreiben|verwalten)['"]/.test(ab.text)

    for (const helfer of relevant) {
      const ohneArgument = new RegExp(`\\b${helfer}\\s*\\(\\s*\\)`).test(ab.text)
      const mitLeserecht = new RegExp(
        `\\b${helfer}\\s*\\(\\s*['"](?:[\\w.]*\\.)?lesen['"]`,
      ).test(ab.text)
      if (!ohneArgument && !mitLeserecht) continue
      if (hatSchreibrecht) continue
      verstoesse.push({
        datei,
        handler: ab.name,
        regel: 'R1',
        text: `${helfer}(${ohneArgument ? '' : "'…lesen'"}) prüft nur ${leseHelfer.get(helfer)}`,
      })
    }

    // R2 — Leserecht als einzige Autorisierung eines Schreib-Handlers.
    if (hatSchreibrecht) continue
    if (datei in LESE_POSTS) {
      if (ausnahmeGiltNoch(ab.text, src, lies)) continue
      verstoesse.push({
        datei,
        handler: ab.name,
        regel: 'R2',
        text: `Die Ausnahme „${LESE_POSTS[datei]}" gilt nicht mehr — hier wird geschrieben.`,
      })
      continue
    }
    for (const lit of ab.text.matchAll(/['"]([\w.]+\.lesen)['"]/g)) {
      const recht = lit[1] as Berechtigung
      if (NUR_ADMINISTRATION.includes(recht)) continue
      verstoesse.push({
        datei,
        handler: ab.name,
        regel: 'R2',
        text: `autorisiert über '${recht}' — das Recht steht NICHT unter Vorbehalt der Administration`,
      })
    }
  }
  return verstoesse
}

function main(): void {
  const routen = execSync('find app -name route.ts', { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean)
  const waechterQuellen = execSync(
    "find lib -name 'api-auth.ts' -o -name 'require-admin.ts' -o -name 'guard.ts' -o -name 'bonus-auth.ts'",
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean)

  const leseHelfer = helferMitLeseVorgabe(waechterQuellen)
  const modulLeser = (pfad: string): string | null => {
    for (const endung of ['.ts', '.tsx', '/index.ts']) {
      try { return readFileSync(pfad + endung, 'utf8') } catch { /* naechste Endung */ }
    }
    return null
  }
  const alle: Verstoss[] = []
  for (const datei of routen) {
    alle.push(...pruefeDatei(datei, readFileSync(datei, 'utf8'), leseHelfer, modulLeser))
  }

  console.log(
    `lint:schreibrecht — ${routen.length} Routen, `
    + `${leseHelfer.size} Wächter mit Lese-Vorgabewert (${[...leseHelfer.keys()].join(', ')})`,
  )
  if (alle.length === 0) {
    console.log('✓ Kein Schreib-Handler autorisiert auf Leserecht.')
    return
  }
  for (const v of alle) {
    console.error(`✗ ${v.regel}  ${v.datei}  ${v.handler}\n    ${v.text}`)
  }
  console.error(`\n${alle.length} Verstoss/Verstoesse.`)
  process.exit(1)
}

if (process.argv[1] && process.argv[1].endsWith('lint-schreibrecht.ts')) main()
