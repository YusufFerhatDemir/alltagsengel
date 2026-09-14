// ═══════════════════════════════════════════════════════════════════════
// Rechnung als Dokument — Pflichtangaben nach § 14 Abs. 4 UStG
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (Block 48, 14.09.2026)
//
// Das PDF, das der Kunde bekommt, trug drei der acht Pflichtangaben
// nicht:
//
//   Nr. 2  Steuernummer — live NICHT gepflegt. Die Fusszeile setzt die
//          Zeile nur, wenn ein Wert da ist, und laesst sie sonst
//          STILL weg. Eine fehlende Pflichtangabe sah aus wie eine
//          gestalterische Entscheidung.
//   Nr. 3  Ausstellungsdatum — die Abfrage in rechnung-paket.ts waehlte
//          gar keine Datumsspalte aus. Auf dem Beleg stand nur der
//          Leistungs-ZEITRAUM, und der ist eine andere Angabe (Nr. 6).
//   Nr. 8  Steuersatz und Steuerbetrag ODER ein Hinweis auf die
//          Steuerbefreiung — nirgends.
//
// Nr. 8 ist der bemerkenswerteste: DREI andere Ausgaenge derselben
// Rechnung sagen es laengst.
//
//     lib/billing/xrechnung/cii-generator.ts  ExemptionReason
//     lib/abrechnung/edifact-generator.ts     UST(true) — § 4 Nr. 16
//     lib/billing/datev/kontenrahmen.ts       Konto 8120, USt-Schluessel 0
//
// Ausgerechnet das Blatt, das beim Kunden ankommt, sagte nichts. Diese
// Datei haelt den Hinweis deshalb an EINER Stelle; der CII-Erzeuger holt
// ihn ab jetzt von hier.
//
// ── WAS HIER KEINE STEUERBERATUNG IST ─────────────────────────────────
// Ob § 4 Nr. 16 UStG greift, ist eine steuerliche Einordnung und nicht
// die Entscheidung dieses Moduls. Sie ist im Bestand bereits GETROFFEN —
// an den drei Stellen oben, seit Monaten, in DATEV-Konten und in der
// Kassen-Abrechnungsdatei. Was hier passiert, ist nicht eine neue
// Einordnung, sondern das Ende einer Ungleichheit: drei Ausgaenge sagten
// dasselbe, der vierte schwieg.
//
// OFFEN und fuer den Steuerberater: § 45a steht „im
// Anerkennungsverfahren", nicht „anerkannt". Ob die Befreiung damit schon
// tragfaehig ist, gehoert dorthin und nicht in den Code. Eine
// Abweichung aendert dann DREI Stellen plus diese — genau deshalb gibt
// es die Konstante nur einmal.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Der Hinweis nach § 14 Abs. 4 Nr. 8 UStG, zweite Alternative.
 *
 * Wortgleich zu dem, was die XRechnung als `ExemptionReason` ausgibt —
 * ein Kunde, der beide Ausgaenge derselben Rechnung nebeneinanderlegt,
 * soll nicht zwei Formulierungen lesen.
 */
export const STEUERBEFREIUNG_HINWEIS = 'Steuerbefreit nach § 4 Nr. 16 UStG'

/**
 * Die Zeile, die auf dem Beleg unter der Gesamtsumme steht.
 *
 * Ausdruecklich mit dem Zusatz, warum kein Steuerbetrag ausgewiesen ist:
 * „kein Steuerausweis" allein liest sich wie ein Versehen.
 */
export const STEUERZEILE = `${STEUERBEFREIUNG_HINWEIS} — kein gesonderter Steuerausweis.`

export interface Pflichtangabe {
  /** Nummer in § 14 Abs. 4 UStG. */
  nr: number
  bezeichnung: string
  /** Woher der Wert auf dem Beleg kommt. */
  quelle: string
}

/** § 14 Abs. 4 UStG, in der Reihenfolge des Gesetzes. */
export const PFLICHTANGABEN: readonly Pflichtangabe[] = [
  { nr: 1, bezeichnung: 'Name und Anschrift des leistenden Unternehmers', quelle: 'Briefkopf-Fußzeile' },
  { nr: 1, bezeichnung: 'Name und Anschrift des Leistungsempfängers', quelle: 'Klient + Adresse' },
  { nr: 2, bezeichnung: 'Steuernummer oder USt-IdNr.', quelle: 'organizations.settings.steuernummer' },
  { nr: 3, bezeichnung: 'Ausstellungsdatum', quelle: 'invoices.frozen_at, ersatzweise created_at' },
  { nr: 4, bezeichnung: 'Fortlaufende Rechnungsnummer', quelle: 'invoices.invoice_number_formatted' },
  { nr: 5, bezeichnung: 'Menge und Art der Leistung', quelle: 'invoice_items' },
  { nr: 6, bezeichnung: 'Zeitpunkt der Leistung', quelle: 'invoices.period_start/period_end' },
  { nr: 7, bezeichnung: 'Entgelt', quelle: 'invoices.total_amount' },
  { nr: 8, bezeichnung: 'Steuersatz und Steuerbetrag oder Hinweis auf die Steuerbefreiung', quelle: 'STEUERZEILE' },
]

export interface BelegFelder {
  unternehmerAnschrift?: string | null
  empfaengerName?: string | null
  empfaengerAnschrift?: string | null
  steuernummer?: string | null
  ausstellungsdatum?: string | null
  rechnungsnummer?: string | null
  positionen?: number
  leistungszeitraum?: string | null
  entgelt?: number | null
  steuerangabe?: string | null
}

const gesetzt = (w: unknown): boolean =>
  typeof w === 'string' ? w.trim() !== '' && w.trim() !== '—' : w != null

/**
 * Welche Pflichtangaben fehlen diesem Beleg?
 *
 * Fail-closed: ein leerer Wert und der Platzhalter „—" zaehlen als
 * fehlend. Ein Gedankenstrich, wo die Steuernummer stehen muesste, ist
 * keine Angabe.
 */
export function fehlendePflichtangaben(beleg: BelegFelder): Pflichtangabe[] {
  const vorhanden: Record<number | string, boolean> = {
    'unternehmer': gesetzt(beleg.unternehmerAnschrift),
    'empfaenger': gesetzt(beleg.empfaengerName) && gesetzt(beleg.empfaengerAnschrift),
    2: gesetzt(beleg.steuernummer),
    3: gesetzt(beleg.ausstellungsdatum),
    4: gesetzt(beleg.rechnungsnummer),
    // Ein Storno- oder Gutschriftsbeleg hat keine eigenen Positionen; er
    // bezieht sich als Ganzes auf die Originalrechnung. Die Art der
    // Leistung steht dann in der Bezugszeile.
    5: (beleg.positionen ?? 0) > 0 || gesetzt(beleg.leistungszeitraum),
    6: gesetzt(beleg.leistungszeitraum),
    7: beleg.entgelt != null,
    8: gesetzt(beleg.steuerangabe),
  }
  return PFLICHTANGABEN.filter((p, i) => {
    if (i === 0) return !vorhanden['unternehmer']
    if (i === 1) return !vorhanden['empfaenger']
    return !vorhanden[p.nr]
  })
}

/**
 * Das Ausstellungsdatum einer Rechnung.
 *
 * `frozen_at` ist der Zeitpunkt, zu dem die Rechnung festgeschrieben und
 * damit AUSGESTELLT wurde. `sent_at` waere falsch: es steht live auch auf
 * Zeilen, die nie festgeschrieben wurden, und ist damit kein Beleg fuer
 * eine Ausstellung. `created_at` ist der Rueckfall fuer Entwuerfe, die
 * noch nicht festgeschrieben sind.
 */
export function ausstellungsdatum(invoice: {
  frozen_at?: string | null
  created_at?: string | null
}): string | null {
  return invoice.frozen_at ?? invoice.created_at ?? null
}
