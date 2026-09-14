// ═══════════════════════════════════════════════════════════════════════
// Alle Zeilen — nicht die ersten tausend
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 101/102)
//
// PostgREST deckelt die zurueckgegebene Darstellung. LIVE GEMESSEN am
// 14.09.2026: ein `select` auf page_views (10 359 Zeilen) liefert ohne
// `limit` genau 1000 — HTTP 200, kein Fehler, keine Warnung. Die Wahrheit
// steht allein im Header:
//
//     Content-Range: 0-999/10359
//
// Wer darueber summiert, zaehlt oder eine Vollstaendigkeit behauptet,
// rechnet ab der tausendsten Zeile falsch, ohne dass irgendetwas rot
// wird. In Block 101 hat das den Loeschbericht der Aufbewahrung
// untertrieben; dort war `count: 'exact'` die Antwort, weil nur eine ZAHL
// gebraucht wurde.
//
// Hier geht es um den anderen Fall: die ZEILEN selbst werden gebraucht —
// Leistungsnachweise eines Abrechnungsmonats, Positionen einer Rechnung,
// Protokollzeilen eines Laufs. Eine Zahl hilft da nicht; es muessen alle
// sein. Dafuer gibt es diesen Seitenleser.
//
// WARUM NICHT EINFACH `.limit(10000)`: weil das nur die Grenze
// verschiebt und die stille Kappung an einer anderen Zahl wiederholt.
// Ein Aufrufer, der alle Zeilen braucht, soll alle bekommen — oder einen
// Fehler, wenn es zu viele werden.
// ═══════════════════════════════════════════════════════════════════════

/** Die PostgREST-Antwort, so weit dieser Helfer sie braucht. */
export interface SeitenAntwort<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Baut eine FRISCHE Abfragekette fuer den Bereich [von, bis].
 *
 * Bewusst eine Funktion und kein vorbereiteter Builder: eine
 * PostgREST-Kette ist nach dem `await` verbraucht, und ein
 * wiederverwendeter Builder liefert ab der zweiten Seite entweder
 * denselben Ausschnitt oder einen Fehler.
 */
export type Seitenbauer<T> = (von: number, bis: number) => PromiseLike<SeitenAntwort<T>>

export const SEITENGROESSE = 1000

/**
 * Obergrenze gegen ein Versehen: eine Abfrage ohne Filter wuerde sonst
 * die halbe Datenbank in den Speicher holen. Wer mehr braucht,
 * uebergibt `maxZeilen` ausdruecklich.
 */
export const MAX_ZEILEN = 50_000

export type AlleZeilenErgebnis<T> =
  | { ok: true; zeilen: T[]; seiten: number }
  | { ok: false; grund: string; gelesen: number }

/**
 * Liest ALLE Zeilen einer Abfrage, seitenweise.
 *
 * Abbruchbedingung ist eine unvollstaendige Seite: liefert PostgREST
 * weniger Zeilen als angefordert, war es die letzte. Genau eine volle
 * letzte Seite kostet einen zusaetzlichen Aufruf, der leer zurueckkommt
 * — das ist der Preis dafuer, sich nicht auf einen Zaehler zu verlassen,
 * der bei jedem Aufruf neu ermittelt werden muesste und zwischen den
 * Seiten ohnehin wandern kann.
 *
 * `maxZeilen` ist eine SPERRE, kein Deckel: wird sie erreicht, gibt es
 * einen Fehler und keine gekuerzte Liste. Eine gekuerzte Liste waere
 * genau der Befund, gegen den dieses Modul gebaut ist.
 */
export async function leseAlle<T>(
  baue: Seitenbauer<T>,
  optionen: { seitengroesse?: number; maxZeilen?: number } = {},
): Promise<AlleZeilenErgebnis<T>> {
  const seite = Math.max(1, optionen.seitengroesse ?? SEITENGROESSE)
  const grenze = optionen.maxZeilen ?? MAX_ZEILEN
  const zeilen: T[] = []
  let seiten = 0

  for (;;) {
    const von = zeilen.length
    const { data, error } = await baue(von, von + seite - 1)
    seiten++

    if (error) {
      return { ok: false, grund: error.message, gelesen: zeilen.length }
    }

    const teil = data ?? []
    zeilen.push(...teil)

    if (teil.length < seite) return { ok: true, zeilen, seiten }

    if (zeilen.length >= grenze) {
      return {
        ok: false,
        grund:
          `Mehr als ${grenze} Zeilen — der Lauf wurde abgebrochen, statt mit `
          + `einem unvollstaendigen Bestand weiterzurechnen.`,
        gelesen: zeilen.length,
      }
    }
  }
}
