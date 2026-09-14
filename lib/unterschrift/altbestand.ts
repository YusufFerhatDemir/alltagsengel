// ═══════════════════════════════════════════════════════════════════════
// Altbestand ohne Unterschriftsbeleg — Grundlinie statt Dauerrot
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 49, 14.09.2026)
//
// `npm run verify:unterschrift` endete mit exit 1 — und zwar seit Wochen
// und aus EINEM Grund: Station U10 meldet eine Bestandszeile, die
// `status='invoiced'` traegt, ohne einen Unterschriftsbeleg zu haben.
//
// Das ist richtig gemessen und bleibt richtig. Es ist aber kein Befund,
// den noch jemand beheben wird: den Hash nachzutragen waere eine
// Faelschung (der Zeitpunkt der Unterschrift ist unbekannt, und der Hash
// bildet ihn mit ab), und die Zeile zu loeschen oder umzuschreiben ist
// eine Geschaeftsentscheidung. Sie ist in
// docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md festgehalten.
//
// Die Folge war schlimmer als der Befund: ein Prueflauf, der IMMER rot
// ist, wird nicht mehr gelesen. Eine NEUE abgerechnete Zeile ohne Beleg —
// also genau das, was U10 eigentlich bewachen soll — waere in derselben
// roten Meldung untergegangen. Dasselbe Muster wie bei den wartenden
// Migrationen (Block 46/47): bekannt und akzeptiert faerbt nicht rot,
// NEU faerbt sofort rot.
//
// DIE GRUNDLINIE IST KEINE ENTSCHULDIGUNG
// Sie nennt die Zeile namentlich, mit Datum und Grund. Kommt eine zweite
// dazu, ist der Lauf rot. Verschwindet die bekannte, meldet der Lauf,
// dass die Grundlinie nachzuziehen ist — eine Liste, die niemand leert,
// wird sonst zur Legende.
// ═══════════════════════════════════════════════════════════════════════

export interface AltbestandsZeile {
  id: string
  /** Leistungsdatum — macht die Zeile ohne Datenbankzugriff wiedererkennbar. */
  datum: string
  grund: string
}

/**
 * Am 14.09.2026 gegen die Produktion gezaehlt: 30 Nachweise, davon 30
 * ohne Hash, 15 mit `status='invoiced'` — und GENAU EINER davon ohne
 * jeden Unterschriftsbeleg.
 *
 * Die uebrigen 14 abgerechneten Zeilen tragen ein Unterschriftsbild und
 * gelten damit nach `unterschriftBelegt()` als belegt; sie stehen hier
 * deshalb nicht.
 */
export const ALTBESTAND_OHNE_BELEG: readonly AltbestandsZeile[] = [
  {
    id: '2821966f-5251-482b-992a-c84dda0ad0c3',
    datum: '2026-06-24',
    grund:
      'Angelegt vor der Sperre (Migration 20261017000000). Kein Bild, kein Hash, '
      + 'keine Zeile in service_signatures. Ein Nachtragen waere eine Faelschung — '
      + 'siehe docs/UNTERSCHRIFT_ALTBESTAND_2026-08-31.md.',
  },
]

export interface AltbestandsBefund {
  /** Zeilen aus der Grundlinie, die weiterhin so vorliegen. */
  bekannt: string[]
  /** NEUE Zeilen — der einzige Ausgang, der den Lauf rot faerbt. */
  neu: string[]
  /** Grundlinien-Eintraege, die live nicht mehr vorkommen. */
  verschwunden: string[]
}

/**
 * Vergleicht die live gefundenen Zeilen gegen die Grundlinie.
 *
 * Fail-closed bei allem Unbekannten: was nicht namentlich in der
 * Grundlinie steht, ist neu — auch wenn es aussieht wie die anderen.
 */
export function bewerteAltbestand(gefundeneIds: readonly string[]): AltbestandsBefund {
  const grundlinie = new Set(ALTBESTAND_OHNE_BELEG.map(z => z.id))
  const gefunden = new Set(gefundeneIds)
  return {
    bekannt: [...gefunden].filter(id => grundlinie.has(id)).sort(),
    neu: [...gefunden].filter(id => !grundlinie.has(id)).sort(),
    verschwunden: [...grundlinie].filter(id => !gefunden.has(id)).sort(),
  }
}

/** Rot nur bei einer NEUEN Zeile. */
export function istBefund(b: AltbestandsBefund): boolean {
  return b.neu.length > 0
}

/** Die Meldung fuer den Prueflauf — nennt die bekannte Zeile beim Namen. */
export function altbestandsMeldung(b: AltbestandsBefund): string {
  const z: string[] = []
  if (b.neu.length > 0) {
    z.push(`${b.neu.length} NEUE abgerechnete Zeile(n) ohne Unterschriftsbeleg: ${b.neu.join(', ')}.`)
    z.push('Das ist kein Altbestand — hier ist nach der Sperre etwas durchgekommen.')
  }
  for (const id of b.bekannt) {
    const zeile = ALTBESTAND_OHNE_BELEG.find(x => x.id === id)
    z.push(`bekannt: ${id} vom ${zeile?.datum ?? '?'} — ${zeile?.grund ?? ''}`)
  }
  for (const id of b.verschwunden) {
    z.push(`${id} steht nicht mehr so in der Datenbank — Grundlinie in lib/unterschrift/altbestand.ts nachziehen.`)
  }
  if (z.length === 0) z.push('Keine abgerechnete Zeile ohne Unterschriftsbeleg.')
  return z.join('\n')
}
