/**
 * Quelltext-Zerlegung von Next-Route-Dateien — an EINER Stelle
 * ═══════════════════════════════════════════════════════════════════
 *
 * Eine Reihe von Invarianten-Tests liest `app/api/**\/route.ts` als Text
 * und prueft, was im Rumpf eines Handlers steht: eine Zugangsschranke,
 * ein Konflikt-Check, ein Auth-Guard vor dem ersten Datenbankzugriff.
 *
 * Diese Zerlegung war sechsmal einzeln nachgebaut, jedes Mal als
 * `indexOf('export async function POST(')`. Als die Routen auf
 * `export const POST = withTracking(async function POST(...))`
 * umgestellt wurden, gingen alle sechs gleichzeitig kaputt — und zwar
 * teils rot (gut), teils still gruen (schlecht): ein Scanner, der den
 * Handler nicht mehr findet, prueft einen leeren String und bestaetigt
 * alles.
 *
 * Deshalb hier einmal, benannt und mit Gegenproben in den nutzenden
 * Suiten. Aendert sich die Export-Form erneut, ist genau eine Datei
 * anzufassen.
 */

/** Die Handler, die Next in einer route.ts erkennt. */
export const HANDLER_NAMEN = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

export type HandlerName = (typeof HANDLER_NAMEN)[number]

/**
 * Kopf eines exportierten Handlers — beide Schreibweisen.
 *
 * 1. `export async function GET(`            — roh
 * 2. `export const GET = withTracking(async function GET(`  — gemessen
 *
 * Beide Muster enden auf der oeffnenden Klammer der Parameterliste.
 * Darauf verlaesst sich `handlerRumpf`.
 */
export function handlerKopfMuster(name: string, flags = ''): RegExp {
  return new RegExp(
    `(?:export\\s+(?:async\\s+)?`
    + `|export\\s+const\\s+${name}\\s*=\\s*withTracking\\(\\s*(?:async\\s+)?)`
    + `function\\s+${name}\\s*\\(`,
    flags,
  )
}

/** Exportiert die Datei diesen Handler — in welcher Form auch immer? */
export function exportiertHandler(src: string, name: string): boolean {
  return handlerKopfMuster(name).test(src)
}

/** Roher, ungemessener Export (die Form VOR dem Request-Tracking). */
export function istRoherHandler(src: string, name: string): boolean {
  return new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm').test(src)
}

/** Export durch `withTracking` gemessen. */
export function istGemessenerHandler(src: string, name: string): boolean {
  return new RegExp(
    `^export\\s+const\\s+${name}\\s*=\\s*withTracking\\(\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`,
    'm',
  ).test(src)
}

/**
 * Schneidet den Rumpf eines exportierten Handlers heraus — inklusive der
 * umschliessenden geschweiften Klammern, ohne die schliessende Klammer
 * eines etwaigen `withTracking(`-Aufrufs.
 *
 * Ohne Parser, aber in drei Schritten statt einem: erst die
 * Parameterliste ueberspringen, dann eine etwaige Rueckgabetyp-Angabe,
 * dann den Rumpf klammerweise abzaehlen. Der naive Weg (erste `{` nach
 * dem Funktionsnamen) greift bei Next-Handlern daneben — deren Signatur
 * lautet `(req, { params }: { params: Promise<{ id: string }> })` und
 * beginnt mit gleich drei geschweiften Klammern, die nicht der Rumpf
 * sind.
 *
 * Gibt `null` zurueck, wenn der Handler nicht existiert oder der Rumpf
 * nicht lesbar ist. Aufrufer muessen das pruefen — `null` still als
 * „nichts gefunden, also in Ordnung" zu behandeln ist genau der Fehler,
 * den dieses Modul verhindern soll.
 */
export function handlerRumpf(src: string, name: string): string | null {
  const kopf = handlerKopfMuster(name).exec(src)
  if (!kopf) return null

  // 1. Parameterliste: von der oeffnenden Klammer bis zur passenden schliessenden.
  let i = kopf.index + kopf[0].length - 1
  let klammern = 0
  for (; i < src.length; i++) {
    if (src[i] === '(') klammern++
    else if (src[i] === ')') {
      klammern--
      if (klammern === 0) { i++; break }
    }
  }

  // 2. Rueckgabetyp: `): Promise<{ ... }> {` — die geschweiften Klammern
  //    darin gehoeren zum Typ, nicht zum Rumpf. Deshalb nur eine `{`
  //    akzeptieren, die auf Winkelklammer-Tiefe 0 steht.
  let winkel = 0
  let start = -1
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '<') winkel++
    else if (c === '>') winkel = Math.max(0, winkel - 1)
    else if (c === '{' && winkel === 0) { start = i; break }
  }
  if (start === -1) return null

  // 3. Rumpf abzaehlen.
  let tiefe = 0
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') tiefe++
    else if (src[j] === '}') {
      tiefe--
      if (tiefe === 0) return src.slice(start, j + 1)
    }
  }
  return null
}

/**
 * Wie `handlerRumpf`, wirft aber statt `null` zurueckzugeben.
 *
 * Fuer Suiten, die den Handler zwingend brauchen: ein fehlender Rumpf
 * ist dort ein Testfehler, kein leeres Ergebnis.
 */
export function handlerRumpfOderFehler(src: string, name: string, datei = 'route.ts'): string {
  const rumpf = handlerRumpf(src, name)
  if (rumpf === null) {
    throw new Error(
      `${datei}: Rumpf von ${name} nicht lesbar. Existiert der Handler noch, `
      + 'und wird er in einer bekannten Form exportiert? '
      + 'Bekannte Formen stehen in __tests__/helpers/route-quelle.ts.',
    )
  }
  return rumpf
}
