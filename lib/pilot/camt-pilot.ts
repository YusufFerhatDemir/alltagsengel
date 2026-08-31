// ═══════════════════════════════════════════════════════════════════════════
// CAMT-PILOT — der begleitete erste Kontoauszug, fest im Trockenlauf
//
// PROBLEM, DAS DIESE DATEI LÖST
// `camtPreflight()` (Phase 7, Track 2) liest eine Bankdatei und ordnet jede
// Buchung ein, ohne zu buchen. Seine Betriebsart kommt aber aus der
// UMGEBUNG: steht `CAMT_IMPORT_MODE=LIVE`, meldet der Preflight-Bericht
// „buchend: true" — und wer ihn im Rahmen eines Pilotlaufs liest, sieht
// einen Bericht, dessen erste Zeile behauptet, hier werde gebucht.
//
// Für den Pilotlauf ist das die falsche Kopplung. Der Pilot ist genau der
// Vorgang, bei dem der Schalter noch nicht gefallen sein darf — und er darf
// sein eigenes Verhalten nicht von einer Variablen abhängig machen, die
// jemand anders für den Regelbetrieb setzt.
//
// ── DIE EINE REGEL DIESER DATEI ────────────────────────────────────────────
// ‼️ Der Pilotlauf ist FEST auf DRY_RUN. ‼️
//
// Nicht „Standard DRY_RUN", nicht „DRY_RUN, solange nichts anderes
// gesetzt ist" — fest. `PILOT_QUELLE` ist eingefroren und wird als
// Umgebungsquelle in den Preflight gereicht. Ein `CAMT_IMPORT_MODE=LIVE`
// in der echten Umgebung ändert am Lauf nichts; er wird lediglich als
// Umgebungsbefund BERICHTET, damit niemand glaubt, der Schalter stünde noch
// auf sicher.
//
// Dieses Modul exportiert keine Funktion, die schreibt. Es ruft
// `camtPreflight()`, und das ist nachweislich schreibfrei (Phase 7:
// Zeilenzahlen von sechs Tabellen vor/nach dem Aufruf identisch, inklusive
// Gegenprobe, dass LIVE sehr wohl anlegt).
//
// ── WAS DER PILOT ZUSÄTZLICH LEISTET ───────────────────────────────────────
// Er ist kein zweiter Bewerter. Die Einordnung je Buchung kommt unverändert
// aus dem Preflight, der sie wiederum aus `bewerteBuchung()` der
// Matching-Engine bezieht — demselben Code, den der scharfe Lauf benutzt.
// Der Pilot legt drei Dinge obendrauf, die der Preflight nicht hat:
//
//   1. DUBLETTE INNERHALB DERSELBEN DATEI. Der Preflight vergleicht
//      Buchungshashes gegen die Datenbank. Zwei identische Zeilen IN EINER
//      Datei sieht er nicht — er entdoppelt die Hashliste vor der Abfrage.
//      Der scharfe Import entdoppelt ebenfalls nur gegen die Datenbank
//      (`neueBuchungen = zuVerarbeiten.filter(…)`), legt die erste Zeile an
//      und läuft bei der zweiten in den UNIQUE-Index aus Migration
//      20261003000000 — Fehlercode 23505, Import im Status 'fehler', und im
//      Protokoll steht „duplicate key" statt „diese Buchung steht zweimal in
//      Ihrem Auszug". Der Pilot benennt sie vorher.
//
//   2. RECHNUNGSREFERENZ ALS EIGENES FELD. Welche Rechnungsnummer im
//      Verwendungszweck steht und ob es sie in diesem Mandanten gibt, ist die
//      Frage, die beim Gegenlesen einer Bankzeile als erste gestellt wird.
//      Der Preflight trägt sie nur indirekt in den Kandidaten.
//
//   3. EIN ABSCHLUSSURTEIL FÜR DEN PILOTEN. `pilotFreigabe` beantwortet
//      nicht „ist die Datei technisch importierbar" (das tut
//      `freigabefaehig`), sondern „taugt dieser Auszug als ERSTER
//      begleiteter Import" — dafür gelten strengere Maßstäbe, siehe
//      `beurteilePilot()`.
//
// ── IBAN ───────────────────────────────────────────────────────────────────
// Die Zahler-IBAN erscheint VERKÜRZT (DE12…3456), wie im Preflight-Bericht.
// Das ist eine bewusste Abweichung von der wörtlichen Forderung „IBAN im
// Report": ein Pilotbericht wird ausgedruckt, per Mail weitergereicht und
// abgeheftet. Die vollständige Bankverbindung eines Zahlers steht in
// `zahlungseingaenge` und ist dort für den zugriffsberechtigten Admin
// einsehbar — sie gehört nicht in ein Dokument, das das Haus verlässt.
// Was der Bericht stattdessen trägt: die verkürzte IBAN (zum
// Wiedererkennen) und das Ergebnis der Prüfsummenprüfung (zum Beurteilen).
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  camtPreflight,
  
  type BuchungEinordnung,
  type CamtPreflightErgebnis,
  type Feldpruefung,
  type PreflightKandidat,
} from '@/lib/billing/camt/camt-preflight'
import { camtImportModus, type CamtImportModus } from '@/lib/billing/camt/camt-modus'
import { extrahiereRechnungsnummern } from '@/lib/billing/matching/matching-engine'
import { centZuEuro } from '@/lib/geld'

// ---------------------------------------------------------------------------
// Die feste Betriebsart
// ---------------------------------------------------------------------------

/** Die einzige Betriebsart, in der ein Pilotlauf stattfindet. */
export const PILOT_MODUS: CamtImportModus = 'DRY_RUN'

/**
 * Umgebungsquelle des Pilotlaufs — eingefroren.
 *
 * Wird `camtPreflight()` anstelle von `process.env` übergeben. Dass sie
 * eingefroren ist, ist kein Zierrat: ein Aufrufer, der versucht, hier LIVE
 * hineinzuschreiben, scheitert im strict mode mit einem TypeError, statt
 * still einen buchenden Lauf zu erzeugen.
 */
export const PILOT_QUELLE: Readonly<Record<string, string>> = Object.freeze({
  CAMT_IMPORT_MODE: PILOT_MODUS,
})

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Soll oder Haben — die Sprache des Kontoauszugs, nicht die des Parsers. */
export type SollHaben = 'Haben' | 'Soll'

export interface PilotRechnungsreferenz {
  /** Rechnungsnummer, wie sie im Verwendungszweck steht. */
  nummer: string
  /** Existiert sie bei DIESEM Mandanten? */
  eigenerMandant: boolean
  /** Kandidatenbewertung dazu, falls die Matching-Engine sie aufgegriffen hat. */
  confidence: number | null
}

export interface PilotDublettenschutz {
  /** Buchungshash steht bereits in `zahlungseingaenge` dieses Mandanten. */
  bereitsVerbucht: boolean
  /** Dieselbe Datei wurde schon einmal importiert (Dateihash). */
  dateiBereitsImportiert: boolean
  /**
   * Derselbe Buchungshash kommt in DIESER Datei mehrfach vor.
   * `null` bei der ersten Fundstelle, sonst die Nummer der ersten.
   */
  dublettVonZeile: number | null
  /** Der Buchungshash selbst — für die Nachvollziehbarkeit im Protokoll. */
  buchungsHash: string
}

export interface PilotPosten {
  /** 1-basiert, in der Reihenfolge der Datei. */
  nummer: number
  einordnung: BuchungEinordnung
  begruendung: string

  /**
   * Würde der SCHARFE Lauf diese Zeile automatisch zuordnen?
   *
   * Eine Aussage über einen hypothetischen anderen Lauf — nicht über
   * diesen. Siehe `gebucht`.
   */
  wuerdeBuchen: boolean
  /**
   * Immer `false`. Steht als Feld im Bericht, damit „würde buchen" beim
   * Überfliegen nicht als „hat gebucht" gelesen wird.
   */
  gebucht: false

  // ── Geld ──
  /** Vorzeichenbehaftet, centgenau, ohne Rundung. */
  betragCent: number
  /** Betrag ohne Vorzeichen — das trägt `sollHaben`. */
  betragAbsolutCent: number
  /** Nur für die Anzeige, z. B. "1.234,56 €". */
  betragText: string
  waehrung: string
  sollHaben: SollHaben
  richtung: 'CRDT' | 'DBIT'

  // ── Zeit ──
  zahlungsdatum: string
  valutadatum: string | null
  istGebuchtEndgueltig: boolean

  // ── Zahler ──
  debitorName: string | null
  /** Verkürzt (DE12…3456) — siehe Modulkopf. */
  debitorIbanKurz: string | null
  ibanPruefsummeGueltig: boolean | null
  endToEndId: string | null
  mandatsreferenz: string | null
  verwendungszweck: string | null

  // ── Zuordnung ──
  rechnungsreferenzen: PilotRechnungsreferenz[]
  confidence: number
  kandidaten: PreflightKandidat[]
  mehrdeutigkeiten: string[]

  // ── Sicherheit ──
  dublettenschutz: PilotDublettenschutz
  /** Mandant, gegen den geprüft wurde. Nie ein fremder. */
  organizationId: string
  istRuecklastschrift: boolean
  ruecklastschriftGrund: string | null
  pruefungen: Feldpruefung[]
}

export type CamtPilotUrteil =
  /** Der Auszug taugt als erster begleiteter Import. */
  | 'PILOT_TAUGLICH'
  /** Importierbar, aber als ERSTER Lauf ungeeignet — Begründung im Bericht. */
  | 'NICHT_ALS_ERSTLAUF'
  /** Auch der scharfe Import würde die Datei abweisen. */
  | 'UNTAUGLICH'

export interface PilotUmgebungsbefund {
  /** Was in der Umgebung wirklich steht. */
  umgebungModus: CamtImportModus
  /** Würde ein Import mit der ECHTEN Umgebung buchen? */
  umgebungBuchend: boolean
  /** Klartext dazu, aus `camtImportModus()`. */
  umgebungGrund: string
  /** Immer 'DRY_RUN' — die Betriebsart DIESES Laufs. */
  laufModus: CamtImportModus
  /** Immer false. */
  laufBuchend: false
}

export interface CamtPilotBericht {
  /** Immer 'DRY_RUN' — vorne im Bericht, damit es zuerst gelesen wird. */
  modus: CamtImportModus
  /** Immer false. */
  buchend: false
  umgebung: PilotUmgebungsbefund

  dateiname: string
  dateiHash: string
  format: CamtPreflightErgebnis['format']
  kontoIbanKurz: string | null
  auszugsDatum: string | null
  organizationId: string

  gesamt: number
  nachEinordnung: Record<BuchungEinordnung, number>
  summeEingangCent: number
  summeAusgangCent: number
  /** Summe, die ein scharfer Lauf automatisch zuordnen würde. */
  summeBuchbarCent: number
  /** Buchungen, die in dieser Datei doppelt stehen. */
  dublettenInDatei: number

  posten: PilotPosten[]

  urteil: CamtPilotUrteil
  /** Warum dieses Urteil — vollständig, in Reihenfolge der Schwere. */
  begruendung: string[]
  /** Was der scharfe Import abweisen würde. */
  blocker: string[]
  /** Was nicht blockiert, aber vor dem scharfen Lauf angesehen gehört. */
  warnungen: string[]
  parseFehler: string[]
}

export interface CamtPilotParams {
  organizationId: string
  dateiname: string
  xmlInhalt: string
  /**
   * NUR für die Berichterstattung über die Umgebung. Sie beeinflusst den
   * Lauf nicht — der läuft gegen `PILOT_QUELLE`.
   */
  umgebung?: Record<string, string | undefined>
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** "1.234,56 €" — deutsche Schreibweise, aus Cent, ohne Rundungsverlust. */
export function centAlsText(cent: number): string {
  const negativ = cent < 0
  const euro = centZuEuro(Math.abs(cent))
  const text = euro.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativ ? '-' : ''}${text} €`
}

/**
 * Findet Buchungen, die INNERHALB der Datei doppelt vorkommen.
 *
 * Gibt je Posten-Nummer die Nummer der ersten Fundstelle zurück, oder
 * `null` für die erste Fundstelle selbst.
 */
export function dublettenInDatei(hashes: string[]): Map<number, number | null> {
  const ersteFundstelle = new Map<string, number>()
  const ergebnis = new Map<number, number | null>()

  for (let i = 0; i < hashes.length; i++) {
    const nummer = i + 1
    const hash = hashes[i]
    const vorher = ersteFundstelle.get(hash)
    if (vorher === undefined) {
      ersteFundstelle.set(hash, nummer)
      ergebnis.set(nummer, null)
    } else {
      ergebnis.set(nummer, vorher)
    }
  }
  return ergebnis
}

/**
 * Rechnungsnummern aus dem Verwendungszweck, angereichert um die Frage,
 * ob die Matching-Engine sie aufgegriffen hat.
 *
 * `eigenerMandant` kommt aus den Kandidaten des Preflights — und die
 * entstehen ausschließlich aus Rechnungen DIESES Mandanten. Eine Nummer,
 * die im Verwendungszweck steht, aber unter den Kandidaten fehlt, gibt es
 * hier nicht (oder sie ist bereits ausgeglichen).
 */
export function baueRechnungsreferenzen(
  verwendungszweck: string | null,
  kandidaten: PreflightKandidat[],
): PilotRechnungsreferenz[] {
  const nummern = extrahiereRechnungsnummern(verwendungszweck ?? '')
  return nummern.map(nummer => {
    const treffer = kandidaten.find(
      k => (k.invoiceNumber ?? '').toUpperCase() === nummer.toUpperCase(),
    )
    return {
      nummer,
      eigenerMandant: Boolean(treffer),
      confidence: treffer ? treffer.confidence : null,
    }
  })
}

/** Prüfsummenergebnis der Zahler-IBAN, oder `null` wenn keine im Auszug stand. */
function ibanPruefsumme(pruefungen: Feldpruefung[]): boolean | null {
  const p = pruefungen.find(x => x.feld === 'iban')
  if (!p || p.stand === 'hinweis') return null
  return p.stand === 'ok'
}

// ---------------------------------------------------------------------------
// Urteil
// ---------------------------------------------------------------------------

/**
 * Beurteilt den Auszug als ERSTEN begleiteten Import.
 *
 * Rein, damit die Schwellen einzeln prüfbar sind.
 *
 * Der Maßstab ist ausdrücklich strenger als `freigabefaehig`:
 *
 *   · `freigabefaehig` fragt „würde der scharfe Import diese Datei
 *     annehmen". Klärfälle sind dort kein Blocker — sie sind der
 *     vorgesehene Weg für eine Zahlung ohne eindeutige Rechnung.
 *
 *   · Das Piloturteil fragt „ist das der richtige Auszug, um den Pfad ZUM
 *     ERSTEN MAL scharf zu schalten". Dafür gilt: der Lauf muss beim
 *     Gegenlesen vollständig nachvollziehbar sein. Ein Auszug mit
 *     dreißig Buchungen, von denen zwanzig in den Klärfall gehen, ist
 *     importierbar und trotzdem der falsche erste.
 */
export function beurteilePilot(
  e: Pick<CamtPreflightErgebnis, 'freigabefaehig' | 'blocker' | 'gesamt' | 'nachEinordnung'>,
  dubletten: number,
): { urteil: CamtPilotUrteil; begruendung: string[] } {
  const begruendung: string[] = []

  if (!e.freigabefaehig) {
    return {
      urteil: 'UNTAUGLICH',
      begruendung: [
        'Der scharfe Import würde diese Datei abweisen.',
        ...e.blocker,
      ],
    }
  }

  if (dubletten > 0) {
    begruendung.push(
      `${dubletten} Buchung(en) stehen in dieser Datei MEHRFACH mit identischem Buchungshash. `
      + `Der scharfe Import legt die erste an und scheitert bei der zweiten am UNIQUE-Index `
      + `(23505, Migration 20261003000000). Der Auszug landete im Status 'fehler', obwohl die `
      + `Datei selbst in Ordnung ist — vor dem Erstlauf klären.`,
    )
  }

  const klaerfaelle = e.nachEinordnung.AMBIGUOUS + e.nachEinordnung.UNMATCHED
  if (e.gesamt > 0 && klaerfaelle * 2 > e.gesamt) {
    begruendung.push(
      `${klaerfaelle} von ${e.gesamt} Buchung(en) gingen in den Klärfall — mehr als die Hälfte. `
      + `Das ist kein Fehler, aber ein schlechter Auszug für den ERSTEN begleiteten Lauf: `
      + `was danach in der Klärliste liegt, lässt sich nicht mehr gegen den Erwartungswert prüfen.`,
    )
  }

  if (e.gesamt === 0) {
    begruendung.push('Die Datei enthält keine Buchung — es gäbe nichts gegenzulesen.')
  }

  if (begruendung.length > 0) {
    return { urteil: 'NICHT_ALS_ERSTLAUF', begruendung }
  }

  return {
    urteil: 'PILOT_TAUGLICH',
    begruendung: [
      `${e.gesamt} Buchung(en) vollständig eingeordnet, `
      + `${e.nachEinordnung.MATCHED} davon eindeutig zuzuordnen. `
      + `Keine Dublette in der Datei, kein Blocker.`,
    ],
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Führt den Pilotlauf über eine CAMT-Datei aus.
 *
 * SCHREIBT NICHTS. Die Betriebsart ist fest DRY_RUN (`PILOT_QUELLE`) und
 * hängt nicht an `CAMT_IMPORT_MODE`.
 */
export async function camtPilotLauf(
  admin: SupabaseClient,
  params: CamtPilotParams,
): Promise<CamtPilotBericht> {
  const preflight = await camtPreflight(admin, {
    organizationId: params.organizationId,
    dateiname: params.dateiname,
    xmlInhalt: params.xmlInhalt,
    // ‼️ Die feste Quelle. NICHT durch params.umgebung ersetzen.
    quelle: { ...PILOT_QUELLE },
  })

  // Der Preflight bekam PILOT_QUELLE — wenn er trotzdem 'buchend' meldet,
  // ist eine Annahme dieses Moduls gebrochen. Fail-closed abbrechen statt
  // einen Bericht ausliefern, dessen Kopfzeile nicht mehr stimmt.
  if (preflight.buchend || preflight.modus !== PILOT_MODUS) {
    throw new Error(
      `Pilotlauf abgebrochen: der Preflight meldet Modus "${preflight.modus}" `
      + `(buchend: ${preflight.buchend}), obwohl er mit der festen Pilotquelle `
      + `aufgerufen wurde. Der Lauf wird nicht ausgeliefert.`,
    )
  }

  const umgebungsstand = camtImportModus(params.umgebung ?? process.env)

  const dubletten = dublettenInDatei(preflight.buchungen.map(b => b.buchungsHash))
  let dublettenInDateiAnzahl = 0

  const posten: PilotPosten[] = preflight.buchungen.map(b => {
    const dublettVonZeile = dubletten.get(b.nummer) ?? null
    if (dublettVonZeile !== null) dublettenInDateiAnzahl++

    // Rangfolge wie im Preflight: DUPLICATE schlägt AMBIGUOUS/UNMATCHED/
    // MATCHED, aber nicht INVALID und nicht CROSS_TENANT_BLOCKED. Eine
    // Zeile, die schon an der Währung scheitert, bleibt ungültig — der
    // ernstere Befund gewinnt.
    let einordnung = b.einordnung
    let begruendung = b.begruendung
    if (
      dublettVonZeile !== null
      && einordnung !== 'INVALID'
      && einordnung !== 'CROSS_TENANT_BLOCKED'
      && einordnung !== 'DUPLICATE'
    ) {
      einordnung = 'DUPLICATE'
      begruendung =
        `Identisch mit Buchung ${dublettVonZeile} DERSELBEN Datei (gleicher Buchungshash). `
        + `Der scharfe Import legt Buchung ${dublettVonZeile} an und scheitert hier am `
        + `UNIQUE-Index — der ganze Auszug landet dann im Status 'fehler'.`
    }

    return {
      nummer: b.nummer,
      einordnung,
      begruendung,
      wuerdeBuchen: einordnung === 'MATCHED',
      gebucht: false as const,

      betragCent: b.betragCent,
      betragAbsolutCent: Math.abs(b.betragCent),
      betragText: centAlsText(b.betragCent),
      waehrung: b.waehrung,
      sollHaben: b.richtung === 'CRDT' ? 'Haben' : 'Soll',
      richtung: b.richtung,

      zahlungsdatum: b.buchungsdatum,
      valutadatum: b.valutadatum,
      istGebuchtEndgueltig: b.istGebucht,

      debitorName: b.debitorName,
      debitorIbanKurz: b.debitorIbanKurz,
      ibanPruefsummeGueltig: ibanPruefsumme(b.pruefungen),
      endToEndId: b.endToEndId,
      mandatsreferenz: b.mandateId,
      verwendungszweck: b.verwendungszweck,

      rechnungsreferenzen: baueRechnungsreferenzen(b.verwendungszweck, b.kandidaten),
      confidence: b.confidence,
      kandidaten: b.kandidaten,
      mehrdeutigkeiten: b.mehrdeutigkeiten,

      dublettenschutz: {
        bereitsVerbucht: b.pruefungen.some(p => p.feld === 'dublette' && p.stand === 'fehler'),
        dateiBereitsImportiert: preflight.dateiBereitsImportiert,
        dublettVonZeile,
        buchungsHash: b.buchungsHash,
      },
      organizationId: params.organizationId,
      istRuecklastschrift: b.istRuecklastschrift,
      ruecklastschriftGrund: b.ruecklastschriftGrund,
      pruefungen: b.pruefungen,
    }
  })

  // Die Zählung nach Einordnung neu aufbauen — die Dublettenerkennung in
  // der Datei hat einzelne Zeilen umgestuft.
  const nachEinordnung: Record<BuchungEinordnung, number> = {
    MATCHED: 0, AMBIGUOUS: 0, UNMATCHED: 0, DUPLICATE: 0, INVALID: 0, CROSS_TENANT_BLOCKED: 0,
  }
  let summeBuchbarCent = 0
  for (const p of posten) {
    nachEinordnung[p.einordnung]++
    if (p.wuerdeBuchen) summeBuchbarCent += p.betragAbsolutCent
  }

  const { urteil, begruendung } = beurteilePilot(
    {
      freigabefaehig: preflight.freigabefaehig,
      blocker: preflight.blocker,
      gesamt: preflight.gesamt,
      nachEinordnung,
    },
    dublettenInDateiAnzahl,
  )

  const warnungen = [...preflight.warnungen]
  if (umgebungsstand.buchend) {
    warnungen.push(
      `Achtung: CAMT_IMPORT_MODE steht in der Umgebung auf LIVE. Dieser Pilotlauf hat `
      + `trotzdem nichts gebucht (feste Betriebsart), aber ein Import über `
      + `POST /api/billing/camt/import würde es tun.`,
    )
  }

  return {
    modus: PILOT_MODUS,
    buchend: false,
    umgebung: {
      umgebungModus: umgebungsstand.modus,
      umgebungBuchend: umgebungsstand.buchend,
      umgebungGrund: umgebungsstand.grund,
      laufModus: PILOT_MODUS,
      laufBuchend: false,
    },

    dateiname: preflight.dateiname,
    dateiHash: preflight.dateiHash,
    format: preflight.format,
    kontoIbanKurz: preflight.kontoIbanKurz,
    auszugsDatum: preflight.auszugsDatum,
    organizationId: params.organizationId,

    gesamt: preflight.gesamt,
    nachEinordnung,
    summeEingangCent: preflight.summeEingangCent,
    summeAusgangCent: preflight.summeAusgangCent,
    summeBuchbarCent,
    dublettenInDatei: dublettenInDateiAnzahl,

    posten,

    urteil,
    begruendung,
    blocker: preflight.blocker,
    warnungen,
    parseFehler: preflight.parseFehler,
  }
}

// ---------------------------------------------------------------------------
// Menschenlesbarer Bericht
// ---------------------------------------------------------------------------

const URTEIL_KOPF: Record<CamtPilotUrteil, string> = {
  PILOT_TAUGLICH: 'GEEIGNET als erster begleiteter Import',
  NICHT_ALS_ERSTLAUF: 'IMPORTIERBAR, aber als ERSTER Lauf ungeeignet',
  UNTAUGLICH: 'ABWEISUNG — auch der scharfe Import nähme diese Datei nicht an',
}

/**
 * Der Bericht zum Ausdrucken und Gegenlesen.
 *
 * Enthält keine vollständige IBAN und keine fremde Mandantenkennung
 * (siehe Modulkopf). Die erste Zeile sagt, dass nichts gebucht wurde —
 * das ist die einzige Information, die niemand überlesen darf.
 */
export function pilotBerichtText(b: CamtPilotBericht): string {
  const z: string[] = []
  const trennlinie = '═'.repeat(74)

  z.push(trennlinie)
  z.push('CAMT-PILOTLAUF — TROCKENLAUF, ES WURDE NICHTS GEBUCHT')
  z.push(trennlinie)
  z.push(`Betriebsart dieses Laufs : ${b.modus} (fest, unabhängig von CAMT_IMPORT_MODE)`)
  z.push(`Umgebung meldet          : ${b.umgebung.umgebungModus}`
    + `${b.umgebung.umgebungBuchend ? '  ← ein echter Import WÜRDE buchen' : ''}`)
  z.push('')
  z.push(`Datei     : ${b.dateiname}  (${b.format})`)
  z.push(`Dateihash : ${b.dateiHash.slice(0, 16)}…`)
  z.push(`Konto     : ${b.kontoIbanKurz ?? '—'}   Auszug vom ${b.auszugsDatum ?? '—'}`)
  z.push('')
  z.push(`URTEIL: ${URTEIL_KOPF[b.urteil]}`)
  for (const g of b.begruendung) z.push(`  · ${g}`)
  z.push('')
  z.push(`Buchungen gesamt : ${b.gesamt}`)
  z.push(`  eindeutig      : ${b.nachEinordnung.MATCHED}`)
  z.push(`  mehrdeutig     : ${b.nachEinordnung.AMBIGUOUS}`)
  z.push(`  ohne Zuordnung : ${b.nachEinordnung.UNMATCHED}`)
  z.push(`  Dublette       : ${b.nachEinordnung.DUPLICATE}  (davon ${b.dublettenInDatei} innerhalb dieser Datei)`)
  z.push(`  ungültig       : ${b.nachEinordnung.INVALID}`)
  z.push(`  fremder Mandant: ${b.nachEinordnung.CROSS_TENANT_BLOCKED}`)
  z.push('')
  z.push(`Summe Eingang  : ${centAlsText(b.summeEingangCent)}`)
  z.push(`Summe Ausgang  : ${centAlsText(b.summeAusgangCent)}`)
  z.push(`davon buchbar  : ${centAlsText(b.summeBuchbarCent)}  (ein scharfer Lauf ordnete diesen Betrag automatisch zu)`)

  if (b.blocker.length > 0) {
    z.push('')
    z.push('BLOCKER:')
    for (const x of b.blocker) z.push(`  ✖ ${x}`)
  }
  if (b.warnungen.length > 0) {
    z.push('')
    z.push('WARNUNGEN:')
    for (const x of b.warnungen) z.push(`  ! ${x}`)
  }
  if (b.parseFehler.length > 0) {
    z.push('')
    z.push('NICHT LESBARE ZEILEN:')
    for (const x of b.parseFehler) z.push(`  ✖ ${x}`)
  }

  z.push('')
  z.push(trennlinie)
  z.push('EINZELBUCHUNGEN')
  z.push(trennlinie)

  for (const p of b.posten) {
    z.push('')
    z.push(`[${p.nummer}] ${p.einordnung}   ${p.betragText}  (${p.sollHaben})`)
    z.push(`     ${p.begruendung}`)
    z.push(`     Zahlung ${p.zahlungsdatum}   Valuta ${p.valutadatum ?? '—'}   `
      + `${p.istGebuchtEndgueltig ? 'endgültig gebucht' : 'NICHT endgültig gebucht'}`)
    z.push(`     Zahler   : ${p.debitorName ?? '—'}   IBAN ${p.debitorIbanKurz ?? '—'}`
      + `${p.ibanPruefsummeGueltig === false ? '  ← Prüfsumme FALSCH' : ''}`)
    z.push(`     Zweck    : ${p.verwendungszweck ?? '—'}`)
    z.push(`     E2E-ID   : ${p.endToEndId ?? '—'}   Mandat ${p.mandatsreferenz ?? '—'}`)
    z.push(`     Referenz : ${p.rechnungsreferenzen.length === 0
      ? 'keine Rechnungsnummer im Zweck'
      : p.rechnungsreferenzen.map(r =>
          `${r.nummer} (${r.eigenerMandant ? `eigener Mandant, ${r.confidence} %` : 'hier nicht gefunden'})`,
        ).join(', ')}`)
    z.push(`     Confidence: ${p.confidence} %`)
    z.push(`     Dublette : ${p.dublettenschutz.bereitsVerbucht ? 'bereits verbucht' : 'nicht verbucht'}`
      + `${p.dublettenschutz.dublettVonZeile !== null ? `, identisch mit Zeile ${p.dublettenschutz.dublettVonZeile}` : ''}`
      + `${p.dublettenschutz.dateiBereitsImportiert ? ', Datei bereits importiert' : ''}`)
    if (p.istRuecklastschrift) {
      z.push(`     RÜCKLASTSCHRIFT: ${p.ruecklastschriftGrund ?? 'ohne Grundangabe'}`)
    }
    if (p.mehrdeutigkeiten.length > 0) {
      for (const m of p.mehrdeutigkeiten) z.push(`     ? ${m}`)
    }
    z.push(`     GEBUCHT  : nein (Trockenlauf)`)
  }

  z.push('')
  z.push(trennlinie)
  z.push('ENDE — dieser Lauf hat keine Zeile in der Datenbank verändert.')
  z.push(trennlinie)
  return z.join('\n')
}
