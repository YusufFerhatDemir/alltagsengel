// ═══════════════════════════════════════════════════════════════
// Geldrundung — deterministisch, ohne IEEE-754-Artefakte
// ═══════════════════════════════════════════════════════════════
//
// WARUM existiert dieses Modul?
//
// Ueberall im Projekt stand dieselbe Zeile: `Math.round(betrag * 100)`.
// Sie ist an genau den Stellen falsch, an denen es weh tut — beim
// exakten Halb-Cent:
//
//   1.005 * 100  ist in IEEE-754  100.49999999999999  → Math.round → 100
//   2.675 * 100  ist in IEEE-754  267.49999999999994  → Math.round → 267
//
// Erwartet waere 101 bzw. 268 (kaufmaennische Rundung, DIN 1333).
// Die Abweichung betrifft jede Kette, die EURO-Spalten (invoices.
// total_amount, service_records.amount) in *_cent-Spalten, EDIFACT,
// XRechnung oder das DATEV-Format ueberfuehrt.
//
// WARUM NICHT `+ Number.EPSILON`?
//
// Number.EPSILON ist 2.22e-16 — der Abstand zweier Doubles *bei 1.0*.
// Bei 100.5 betraegt der Abstand bereits ~1.42e-14, also das 64-fache.
// `Math.round(1.005 * 100 + Number.EPSILON)` ergibt weiterhin 100: der
// Summand ist zu klein, um die Zahl auch nur auf den naechsten
// darstellbaren Double zu heben. Der Trick sieht richtig aus und ist es
// nicht — deshalb steht er hier ausdruecklich als verworfene Variante.
//
// WIE ES STATTDESSEN GEHT
//
// String(x) liefert per Spezifikation die *kuerzeste* Dezimaldarstellung,
// die wieder exakt auf denselben Double zurueckfaellt — fuer den Double
// hinter dem Literal 1.005 ist das die Zeichenkette "1.005". Verschiebt
// man das Komma auf der Zeichenkette statt per Multiplikation
// ("1.005" + "e2"), parst die Laufzeit den Dezimalwert 100.5 und trifft
// den exakt darstellbaren Double 100.5. Erst darauf wird gerundet.
//
// Das ist reine Standard-Bibliothek: KEINE neue Abhaengigkeit (kein
// decimal.js, kein big.js) — die Vorgabe war ausdruecklich, ohne
// zusaetzliches Paket auszukommen.
//
// KAUFMAENNISCH heisst symmetrisch
//
// Math.round rundet .5 immer Richtung +unendlich: Math.round(-100.5) ist
// -100. Fuer Geld ist das falsch — eine Gutschrift ueber -1,005 € muss
// betragsgleich zur Rechnung ueber 1,005 € sein. Deshalb wird der Betrag
// hier ueber seinen Absolutwert gerundet und das Vorzeichen danach
// wieder angesetzt (DIN 1333: „round half away from zero").
// ═══════════════════════════════════════════════════════════════

/**
 * Verschiebt das Dezimalkomma einer Zahl um `stellen` Positionen —
 * auf der Dezimal-Zeichenkette, nicht per Multiplikation.
 *
 * `dezimalVerschieben(1.005, 2)` ergibt exakt 100.5 (statt der
 * 100.49999999999999, die `1.005 * 100` liefert).
 */
export function dezimalVerschieben(wert: number, stellen: number): number {
  // String(1e21) ist "1e+21" — der vorhandene Exponent muss uebernommen
  // und nicht angehaengt werden, sonst entsteht "1e+21e2" → NaN.
  const [mantisse, exponent] = String(wert).split(/[eE]/)
  const neuerExponent = (exponent ? Number(exponent) : 0) + stellen
  return Number(`${mantisse}e${neuerExponent}`)
}

/** Kaufmaennisch runden: .5 geht immer vom Nullpunkt weg (DIN 1333). */
function rundeSymmetrisch(wert: number): number {
  const gerundet = wert < 0 ? -Math.round(-wert) : Math.round(wert)
  // -0 normalisieren: assert.equal(-0, 0) schlaegt in node:test fehl und
  // -0 in einer Cent-Spalte ist ohnehin kein sinnvoller Wert.
  return gerundet === 0 ? 0 : gerundet
}

/**
 * Normalisiert eine Betragseingabe auf eine endliche Zahl.
 *
 * null/undefined/'' zaehlen als 0 — eine fehlende Rechnung ist ein
 * Nullbetrag, kein Fehler. Alles andere Nicht-Numerische wirft:
 * ein stilles NaN wandert sonst in eine *_cent-Spalte oder in die
 * Kassendatei und faellt erst beim Kostentraeger auf.
 */
function alsZahl(betrag: number | string | null | undefined, feld: string): number {
  if (betrag === null || betrag === undefined || betrag === '') return 0
  const zahl = typeof betrag === 'number' ? betrag : Number(String(betrag).trim())
  if (!Number.isFinite(zahl)) {
    throw new TypeError(`${feld}: „${String(betrag)}" ist kein gueltiger Geldbetrag.`)
  }
  return zahl
}

/**
 * Euro-Betrag → Cent (ganzzahlig).
 *
 * public.invoices.total_amount und public.service_records.amount stehen in
 * EURO (43.50), waehrend jede *_cent-Spalte und der EDIFACT-Generator CENT
 * erwarten (4350). Beleg aus der Live-DB: dieselbe Rechnung fuehrt
 * total_amount=43.50 und soll_betrag_cent=4350.
 *
 * PostgREST liefert NUMERIC je nach Groesse als Zahl oder als Zeichenkette
 * — beides wird akzeptiert.
 */
export function euroZuCent(betragEuro: number | string | null | undefined): number {
  return rundeSymmetrisch(dezimalVerschieben(alsZahl(betragEuro, 'Euro-Betrag'), 2))
}

/**
 * Cent → Euro-Betrag mit zwei Nachkommastellen.
 *
 * Auch hier nicht `cent / 100`: 4335 / 100 ergibt 43.35 als Double
 * 43.349999999999994, was sich beim naechsten Rechenschritt fortpflanzt.
 */
export function centZuEuro(cent: number | string | null | undefined): number {
  return aufCent(dezimalVerschieben(alsZahl(cent, 'Cent-Betrag'), -2))
}

/**
 * Rundet einen EURO-Betrag kaufmaennisch auf volle Cent.
 * Fuer Zwischenergebnisse (Zuschlaege, Steueranteile), die in Euro
 * weitergerechnet werden.
 */
export function aufCent(betragEuro: number | string | null | undefined): number {
  return dezimalVerschieben(euroZuCent(betragEuro), -2)
}

/**
 * Rundet ein Zwischenergebnis, das bereits in CENT gerechnet wurde, auf
 * eine ganze Cent-Zahl.
 *
 * Hier hilft die Zeichenketten-Verschiebung von `euroZuCent` nicht — der
 * Wert ist schon Cent, es gibt keine Kommaverschiebung mehr. Was bleibt,
 * ist der zweite Fehler von `Math.round`: die Asymmetrie beim exakten
 * Halben. `Math.round(-100.5)` ist -100, `Math.round(100.5)` ist 101.
 * Auf einer Gutschrift oder einer Ruecklastschrift steht damit ein Cent
 * weniger als auf der Rechnung, die sie ausgleichen soll — die Position
 * gleicht sich nicht mehr auf null aus.
 *
 * Deshalb: kaufmaennisch symmetrisch (DIN 1333), wie ueberall sonst in
 * diesem Modul.
 */
export function centRunden(cent: number | string | null | undefined): number {
  return rundeSymmetrisch(alsZahl(cent, 'Cent-Betrag'))
}

/**
 * Rundet kaufmaennisch auf eine beliebige Zahl von Nachkommastellen.
 * Fuer Prozent- und Quotenwerte, die keine Geldbetraege sind.
 */
export function rundeAufStellen(wert: number | string | null | undefined, stellen: number): number {
  const zahl = alsZahl(wert, 'Zahl')
  return dezimalVerschieben(rundeSymmetrisch(dezimalVerschieben(zahl, stellen)), -stellen)
}

/** Cent-Betrag als deutsche Waehrungsangabe, z. B. 10500 → „105,00 €". */
export function formatCentDe(cent: number | string | null | undefined): string {
  return centZuEuro(cent).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}
