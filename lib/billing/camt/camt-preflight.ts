// ═══════════════════════════════════════════════════════════════════════════
// CAMT-PREFLIGHT — eine echte Bankdatei lesen, ohne sie zu buchen
//
// PROBLEM, DAS DIESE DATEI LÖST
// Der Kontoauszugsimport war ein Alles-oder-nichts-Vorgang: hochladen heißt
// buchen. Wer wissen wollte, was eine echte camt.053 anrichten würde — welche
// Zahlung auf welche Rechnung ginge, welche im Klärfall landete, welche schon
// verbucht ist — musste sie importieren. Beim ersten produktiven Import ist
// genau das die Frage, die vorher beantwortet sein muss: `camt_imports` steht
// live auf 0, und die erste Datei entscheidet über echte Forderungsstände.
//
// Der Preflight liest die Datei vollständig, prüft jede Buchung gegen die
// Stammdaten und ordnet sie ein — und schreibt dabei NICHTS.
//
// ── EINORDNUNG JE BUCHUNG ──────────────────────────────────────────────────
//   INVALID               Die Zeile ist nicht buchbar (Währung, Betrag,
//                         Vorzeichen, nicht endgültig gebucht).
//   CROSS_TENANT_BLOCKED  Die Zeile verweist auf einen fremden Mandanten.
//   DUPLICATE             Diese Buchung ist bereits verbucht.
//   AMBIGUOUS             Mehr als eine Rechnung kommt ernsthaft in Frage.
//   MATCHED               Genau eine Rechnung, über dem Schwellwert.
//   UNMATCHED             Keine ausreichende Übereinstimmung.
//
// Die Reihenfolge ist die Rangfolge: eine Zeile, die zugleich Dublette und
// mehrdeutig ist, gilt als Dublette — der ernstere Befund gewinnt, weil er
// derjenige ist, der eine Buchung verhindern muss.
//
// ── KEINE AUTOMATISCHE BUCHUNG BEI AMBIGUOUS ODER UNMATCHED ────────────────
// `wuerdeBuchen` ist nur bei MATCHED wahr. Das ist keine eigene Regel, sondern
// dieselbe, die der echte Import anwendet — die Bewertung kommt aus
// bewerteBuchung() in der Matching-Engine, nicht aus einer zweiten Rechnung.
// Ein Trockenlauf, der anders bewertet als der scharfe Lauf, wäre schlimmer
// als keiner: er verspräche Sicherheit, die er nicht hat.
//
// ── MANDANTENGRENZE ────────────────────────────────────────────────────────
// Drei Abfragen dieser Datei suchen ABSICHTLICH ohne organization_id-Filter:
// nur so lässt sich feststellen, dass eine Referenz zu einem fremden
// Mandanten gehört. Sie lesen deshalb ausschließlich `organization_id` —
// keinen Namen, keinen Betrag, keine Rechnungsnummer. Der Bericht sagt „gehört
// zu einem anderen Mandanten" und nie, zu welchem.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CamtBuchung, CamtParseResult } from './camt-parser'
import { parseCamtXml, computeCamtFileHash } from './camt-parser'
import { bewerteBuchung, extrahiereRechnungsnummern, type MatchCandidate } from '../matching/matching-engine'
import { validateIban } from '../sepa/pain008'
import { pruefeGlaeubigerId, normalisiereGlaeubigerId } from '../sepa/glaeubiger-id'
import { camtImportModus, type CamtImportModus } from './camt-modus'
import { centZuEuro } from '@/lib/geld'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type BuchungEinordnung =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'UNMATCHED'
  | 'DUPLICATE'
  | 'INVALID'
  | 'CROSS_TENANT_BLOCKED'

/** Rangfolge: je weiter vorn, desto ernster. */
const RANGFOLGE: BuchungEinordnung[] = [
  'INVALID', 'CROSS_TENANT_BLOCKED', 'DUPLICATE', 'AMBIGUOUS', 'UNMATCHED', 'MATCHED',
]

export type Pruefstand = 'ok' | 'hinweis' | 'fehler' | 'nicht_anwendbar'

export interface Feldpruefung {
  /** Welches Feld — stabiler Schlüssel, kein Anzeigetext. */
  feld:
    | 'iban' | 'betrag' | 'vorzeichen' | 'waehrung' | 'end_to_end_id'
    | 'mandatsreferenz' | 'glaeubiger_id' | 'verwendungszweck' | 'debitor_name'
    | 'dublette' | 'mandantengrenze' | 'buchungsstatus'
  stand: Pruefstand
  befund: string
}

export interface PreflightKandidat {
  invoiceNumber: string | null
  clientName: string
  confidence: number
  matchMethode: string
  offenCent: number
}

export interface BuchungPreflight {
  /** 1-basiert, wie in den Parserfehlern. */
  nummer: number
  einordnung: BuchungEinordnung
  /** Ein Satz: warum diese Einordnung. */
  begruendung: string
  /** Würde der scharfe Lauf diese Zeile automatisch zuordnen? */
  wuerdeBuchen: boolean

  betragCent: number
  waehrung: string
  richtung: 'CRDT' | 'DBIT'
  buchungsdatum: string
  valutadatum: string | null
  istGebucht: boolean
  istRuecklastschrift: boolean
  ruecklastschriftGrund: string | null

  debitorName: string | null
  /** Verkürzt — der Bericht wird gelesen und weitergereicht. */
  debitorIbanKurz: string | null
  verwendungszweck: string | null
  endToEndId: string | null
  mandateId: string | null

  confidence: number
  kandidaten: PreflightKandidat[]
  /** Was der Zuordnung im Weg steht, im Klartext. */
  mehrdeutigkeiten: string[]
  pruefungen: Feldpruefung[]
  buchungsHash: string
}

export interface CamtPreflightErgebnis {
  modus: CamtImportModus
  /** Würde ein Lauf mit diesem Modus schreiben? */
  buchend: boolean
  modusGrund: string

  dateiname: string
  dateiHash: string
  format: CamtParseResult['format']
  kontoIbanKurz: string | null
  auszugsDatum: string | null

  /** Dieselbe Datei wurde schon einmal importiert. */
  dateiBereitsImportiert: boolean
  /** Zeilen, die der Parser nicht lesen konnte. Blockieren den Import. */
  parseFehler: string[]

  gesamt: number
  nachEinordnung: Record<BuchungEinordnung, number>
  summeEingangCent: number
  summeAusgangCent: number
  /** Summe der Beträge, die automatisch zugeordnet würden. */
  summeBuchbarCent: number

  buchungen: BuchungPreflight[]

  /**
   * Darf diese Datei scharf importiert werden?
   *
   * Fail-closed: false, sobald irgendetwas dagegen spricht. Ein Preflight,
   * der bei Zweifeln „ja" sagt, ist ein Preflight zu viel.
   */
  freigabefaehig: boolean
  blocker: string[]
  warnungen: string[]
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/**
 * IBAN für Bericht und Antwort verkürzen.
 *
 * Erste vier und letzte vier Stellen genügen, um eine Buchung
 * wiederzuerkennen. Die vollständige Bankverbindung eines Zahlers gehört in
 * `zahlungseingaenge` — nicht in einen Bericht, der per Mail weitergereicht
 * wird.
 */
export function kuerzeIban(iban: string | null | undefined): string | null {
  const wert = (iban ?? '').replace(/\s+/g, '').toUpperCase()
  if (!wert) return null
  if (wert.length <= 8) return wert
  return `${wert.slice(0, 4)}…${wert.slice(-4)}`
}

/** Der ernstere von zwei Befunden. */
function ernster(a: BuchungEinordnung, b: BuchungEinordnung): BuchungEinordnung {
  return RANGFOLGE.indexOf(a) <= RANGFOLGE.indexOf(b) ? a : b
}

/** Ab welchem Abstand zwei Kandidaten als unterscheidbar gelten. */
export const MEHRDEUTIG_ABSTAND = 10

/** Ab diesem Score ordnet der scharfe Lauf automatisch zu. */
export const AUTO_SCHWELLE = 70

/**
 * Prüft die Felder EINER Buchung — ohne Datenbank.
 *
 * Bewusst herausgelöst und rein: das sind die Prüfungen, die auch ohne
 * Stammdaten gelten, und sie sind damit einzeln testbar. Die Prüfungen, die
 * eine Datenbank brauchen (Dublette, Mandantengrenze, Mandat), kommen in
 * pruefeBuchung() dazu.
 */
export function pruefeFelderRein(
  buchung: CamtBuchung,
  eigeneGlaeubigerId?: string | null,
): Feldpruefung[] {
  const p: Feldpruefung[] = []

  // ── Buchungsstatus ──
  // PDNG (vorgemerkt) und INFO können noch wegfallen. Als Zahlungseingang
  // verbucht gälte eine Rechnung als bezahlt, bevor das Geld da ist.
  p.push(buchung.istGebucht
    ? { feld: 'buchungsstatus', stand: 'ok', befund: `Endgültig gebucht (${buchung.status}).` }
    : { feld: 'buchungsstatus', stand: 'fehler', befund: `Status "${buchung.status}" — nicht endgültig gebucht, nicht buchbar. Die Buchung erscheint im nächsten Auszug erneut mit BOOK.` })

  // ── Währung ──
  // Das gesamte Rechnungswesen rechnet in Euro-Cent. Ein Fremdwährungsbetrag
  // würde als Cent gelesen und wäre eine Falschbuchung ohne Umrechnung.
  p.push(buchung.waehrung === 'EUR'
    ? { feld: 'waehrung', stand: 'ok', befund: 'EUR.' }
    : { feld: 'waehrung', stand: 'fehler', befund: `Währung "${buchung.waehrung}" — es wird ausschließlich EUR verarbeitet, eine Umrechnung findet nicht statt.` })

  // ── Betrag ──
  if (buchung.betragCent === 0) {
    p.push({ feld: 'betrag', stand: 'fehler', befund: 'Betrag 0,00 — keine Geldbewegung, nichts zuzuordnen.' })
  } else if (Math.abs(buchung.betragCent) >= 10_000_00) {
    // Kein Fehler, aber ein Betrag dieser Größe in der Pflege ist selten
    // genug, dass jemand hinsehen sollte.
    p.push({ feld: 'betrag', stand: 'hinweis', befund: `${centZuEuro(Math.abs(buchung.betragCent)).toFixed(2)} € — ungewöhnlich hoch, bitte gegenlesen.` })
  } else {
    p.push({ feld: 'betrag', stand: 'ok', befund: `${centZuEuro(Math.abs(buchung.betragCent)).toFixed(2)} €.` })
  }

  // ── Vorzeichen ──
  // Der Parser setzt das Vorzeichen aus CdtDbtInd. Diese Prüfung fängt eine
  // Regression genau dort: ein positiver DBIT-Betrag sähe wie ein
  // Zahlungseingang aus, obwohl Geld abgeflossen ist.
  const stimmig = buchung.richtung === 'CRDT' ? buchung.betragCent > 0 : buchung.betragCent < 0
  p.push(stimmig
    ? { feld: 'vorzeichen', stand: 'ok', befund: `${buchung.richtung} und Vorzeichen stimmen überein.` }
    : { feld: 'vorzeichen', stand: 'fehler', befund: `${buchung.richtung} passt nicht zum Vorzeichen des Betrags — die Richtung der Geldbewegung ist nicht eindeutig.` })

  // ── IBAN des Zahlers ──
  if (!buchung.debitorIban) {
    p.push({ feld: 'iban', stand: 'hinweis', befund: 'Keine Zahler-IBAN im Auszug — Zuordnung über die Bankverbindung nicht möglich.' })
  } else if (!validateIban(buchung.debitorIban)) {
    p.push({ feld: 'iban', stand: 'fehler', befund: `Zahler-IBAN ${kuerzeIban(buchung.debitorIban)} besteht die Prüfsumme (MOD 97) nicht.` })
  } else {
    p.push({ feld: 'iban', stand: 'ok', befund: `Zahler-IBAN ${kuerzeIban(buchung.debitorIban)} ist formal gültig.` })
  }

  // ── Referenzen ──
  p.push(buchung.endToEndId
    ? { feld: 'end_to_end_id', stand: 'ok', befund: `EndToEndId ${buchung.endToEndId}.` }
    : { feld: 'end_to_end_id', stand: 'hinweis', befund: 'Keine EndToEndId — der stärkste Zuordnungsweg (SEPA-Sammelauftrag) entfällt.' })

  p.push(buchung.verwendungszweck
    ? { feld: 'verwendungszweck', stand: 'ok', befund: buchung.verwendungszweck.slice(0, 140) }
    : { feld: 'verwendungszweck', stand: 'hinweis', befund: 'Kein Verwendungszweck — keine Rechnungsnummer ablesbar.' })

  p.push(buchung.debitorName
    ? { feld: 'debitor_name', stand: 'ok', befund: buchung.debitorName }
    : { feld: 'debitor_name', stand: 'hinweis', befund: 'Kein Zahlername im Auszug.' })

  // ── Gläubiger-ID ──
  // Nur bei Lastschriften vorhanden. Eine fremde Gläubiger-ID auf einer
  // Rücklastschrift heißt: dieser Einzug stammt nicht von uns — und ein
  // Buchungsvorschlag dafür wäre eine Falschbuchung.
  if (!buchung.glaeubigerId) {
    p.push({ feld: 'glaeubiger_id', stand: 'nicht_anwendbar', befund: 'Keine Gläubiger-ID im Auszug (bei Überweisungen normal).' })
  } else {
    const pruefung = pruefeGlaeubigerId(buchung.glaeubigerId)
    const eigen = normalisiereGlaeubigerId(eigeneGlaeubigerId)
    const gelesen = normalisiereGlaeubigerId(buchung.glaeubigerId)
    if (pruefung.befund === 'formatfehler') {
      p.push({ feld: 'glaeubiger_id', stand: 'fehler', befund: 'Die Gläubiger-ID im Auszug hat kein gültiges Format.' })
    } else if (eigen && gelesen !== eigen) {
      p.push({ feld: 'glaeubiger_id', stand: 'fehler', befund: 'Die Gläubiger-ID im Auszug ist nicht die des eigenen Hauses — der Einzug stammt von einem fremden Gläubiger.' })
    } else if (!eigen) {
      p.push({ feld: 'glaeubiger_id', stand: 'hinweis', befund: 'Im Auszug steht eine Gläubiger-ID, für die eigene Organisation ist keine hinterlegt — ein Abgleich ist nicht möglich.' })
    } else {
      p.push({ feld: 'glaeubiger_id', stand: 'ok', befund: 'Gläubiger-ID stimmt mit der eigenen überein.' })
    }
  }

  return p
}

// ---------------------------------------------------------------------------
// Datenbankgestützte Prüfungen
// ---------------------------------------------------------------------------

interface Stammdaten {
  /** buchungsHash-Werte, die für diesen Mandanten schon verbucht sind. */
  bekannteHashes: Set<string>
  /** Gläubiger-ID der eigenen Organisation. */
  eigeneGlaeubigerId: string | null
}

/**
 * Lädt, was für ALLE Buchungen gemeinsam gilt — einmal statt je Zeile.
 *
 * Fail-closed: ein Lesefehler bei den Dubletten wirft. Ein Preflight, der die
 * bereits verbuchten Zeilen nicht kennt, würde jede Dublette als buchbar
 * melden — die Freigabe, die daraus folgt, wäre falsch.
 */
async function ladeStammdaten(
  admin: SupabaseClient,
  organizationId: string,
  hashes: string[],
): Promise<Stammdaten> {
  const bekannteHashes = new Set<string>()

  if (hashes.length > 0) {
    const { data, error } = await admin
      .from('zahlungseingaenge')
      .select('quelldatei_hash')
      .eq('organization_id', organizationId)
      .in('quelldatei_hash', hashes)

    if (error) {
      throw new Error(`Dublettenprüfung nicht möglich: ${error.message}`)
    }
    for (const z of (data ?? []) as { quelldatei_hash: string | null }[]) {
      if (z.quelldatei_hash) bekannteHashes.add(z.quelldatei_hash)
    }
  }

  const { data: org } = await admin
    .from('organizations')
    .select('sepa_creditor_id')
    .eq('id', organizationId)
    .maybeSingle()

  return {
    bekannteHashes,
    eigeneGlaeubigerId: (org as { sepa_creditor_id?: string | null } | null)?.sepa_creditor_id ?? null,
  }
}

/**
 * Prüft, ob eine Referenz der Buchung auf einen FREMDEN Mandanten zeigt.
 *
 * Die drei Abfragen laufen absichtlich ohne organization_id-Filter — anders
 * ließe sich „gehört jemand anderem" gar nicht feststellen. Sie lesen deshalb
 * nur `organization_id` und geben nie preis, welcher Mandant gemeint ist.
 *
 * WICHTIG — kein Fehlalarm bei Nummernkollision: Rechnungsnummern sind je
 * Mandant fortlaufend, dieselbe Nummer kann in zwei Häusern existieren.
 * Blockiert wird deshalb nur, wenn die Referenz ausschließlich anderswo
 * existiert. Existiert sie hier auch, ist sie lediglich mehrdeutig.
 */
async function pruefeMandantengrenze(
  admin: SupabaseClient,
  buchung: CamtBuchung,
  organizationId: string,
): Promise<{ pruefung: Feldpruefung; blockiert: boolean; hinweise: string[] }> {
  const hinweise: string[] = []
  const fremd: string[] = []

  const auswerten = (
    zeilen: { organization_id: string | null }[] | null,
    bezeichnung: string,
  ) => {
    const orgs = new Set((zeilen ?? []).map(z => z.organization_id).filter(Boolean) as string[])
    if (orgs.size === 0) return
    const eigen = orgs.has(organizationId)
    const andere = [...orgs].some(o => o !== organizationId)
    if (andere && !eigen) fremd.push(bezeichnung)
    else if (andere && eigen) {
      hinweise.push(`${bezeichnung} kommt auch bei einem anderen Mandanten vor — die Nummernkreise sind je Mandant eigenständig.`)
    }
  }

  // 1. EndToEndId aus einem SEPA-Sammelauftrag
  if (buchung.endToEndId) {
    const { data } = await admin
      .from('sepa_batch_items')
      .select('organization_id')
      .eq('end_to_end_id', buchung.endToEndId)
    auswerten(data as { organization_id: string | null }[] | null, 'Die EndToEndId')
  }

  // 2. Mandatsreferenz
  if (buchung.mandateId) {
    const { data } = await admin
      .from('sepa_mandates')
      .select('organization_id')
      .eq('mandate_reference', buchung.mandateId)
    auswerten(data as { organization_id: string | null }[] | null, 'Die Mandatsreferenz')
  }

  // 3. Rechnungsnummern aus dem Verwendungszweck
  const nummern = extrahiereRechnungsnummern(buchung.verwendungszweck ?? '')
  if (nummern.length > 0) {
    const { data } = await admin
      .from('invoices')
      .select('organization_id')
      .in('invoice_number_formatted', nummern)
    auswerten(data as { organization_id: string | null }[] | null, 'Die Rechnungsnummer im Verwendungszweck')
  }

  if (fremd.length > 0) {
    return {
      pruefung: {
        feld: 'mandantengrenze',
        stand: 'fehler',
        befund: `${fremd.join(' und ')} gehört zu einem anderen Mandanten. Diese Buchung darf hier nicht zugeordnet werden.`,
      },
      blockiert: true,
      hinweise,
    }
  }

  return {
    pruefung: {
      feld: 'mandantengrenze',
      stand: hinweise.length > 0 ? 'hinweis' : 'ok',
      befund: hinweise.length > 0 ? hinweise.join(' ') : 'Keine Referenz zeigt auf einen fremden Mandanten.',
    },
    blockiert: false,
    hinweise,
  }
}

/** Aus den Kandidaten die Mehrdeutigkeiten ableiten. */
export function ermittleMehrdeutigkeiten(kandidaten: MatchCandidate[]): string[] {
  const m: string[] = []
  const ueberSchwelle = kandidaten.filter(k => k.confidence >= AUTO_SCHWELLE)

  if (ueberSchwelle.length > 1) {
    m.push(
      `${ueberSchwelle.length} Rechnungen erreichen den Schwellwert von ${AUTO_SCHWELLE} % ` +
      `(${ueberSchwelle.map(k => `${k.invoiceNumber ?? '?'}: ${k.confidence} %`).join(', ')}).`,
    )
  }

  // Auch ein einzelner Treffer über der Schwelle ist unsicher, wenn ihm ein
  // zweiter dicht auf den Fersen ist: der Abstand, nicht der Absolutwert,
  // entscheidet über die Verwechslungsgefahr.
  if (kandidaten.length >= 2) {
    const abstand = kandidaten[0].confidence - kandidaten[1].confidence
    if (abstand < MEHRDEUTIG_ABSTAND) {
      m.push(
        `Der beste und der zweitbeste Treffer liegen nur ${abstand} Prozentpunkte auseinander ` +
        `(${kandidaten[0].invoiceNumber ?? '?'} / ${kandidaten[1].invoiceNumber ?? '?'}).`,
      )
    }
  }

  return m
}

/**
 * Ordnet eine einzelne Buchung ein.
 *
 * Reihenfolge = Rangfolge: die ernsteste zutreffende Einordnung gewinnt.
 */
async function pruefeBuchung(
  admin: SupabaseClient,
  buchung: CamtBuchung,
  nummer: number,
  organizationId: string,
  stamm: Stammdaten,
): Promise<BuchungPreflight> {
  const pruefungen = pruefeFelderRein(buchung, stamm.eigeneGlaeubigerId)

  // ── Dublette ──
  const istDublette = stamm.bekannteHashes.has(buchung.buchungsHash)
  pruefungen.push(istDublette
    ? { feld: 'dublette', stand: 'fehler', befund: 'Diese Buchung ist bereits als Zahlungseingang verbucht — überlappende Auszüge sind der Regelfall, nicht die Ausnahme.' }
    : { feld: 'dublette', stand: 'ok', befund: 'Noch nicht verbucht.' })

  // ── Mandantengrenze ──
  const grenze = await pruefeMandantengrenze(admin, buchung, organizationId)
  pruefungen.push(grenze.pruefung)

  // ── Bewertung: dieselbe wie im scharfen Lauf ──
  const bewertung = await bewerteBuchung(admin, buchung, organizationId)
  const kandidaten = bewertung.kandidaten
  const confidence = kandidaten[0]?.confidence ?? 0
  const mehrdeutigkeiten = ermittleMehrdeutigkeiten(kandidaten)

  // ── Einordnung ──
  let einordnung: BuchungEinordnung
  let begruendung: string

  if (kandidaten.length === 0) {
    einordnung = 'UNMATCHED'
    begruendung = bewertung.klaerfallGrund ?? 'Keine Rechnung kommt in Frage.'
  } else if (confidence < AUTO_SCHWELLE) {
    einordnung = 'UNMATCHED'
    begruendung = `Bester Treffer ${confidence} % — unter dem Schwellwert von ${AUTO_SCHWELLE} %. Der scharfe Lauf legte hier einen Klärfall an.`
  } else if (mehrdeutigkeiten.length > 0) {
    einordnung = 'AMBIGUOUS'
    begruendung = mehrdeutigkeiten.join(' ')
  } else {
    einordnung = 'MATCHED'
    begruendung = `${kandidaten[0].invoiceNumber ?? 'Rechnung'} (${kandidaten[0].clientName}) mit ${confidence} % über ${kandidaten[0].matchMethode}.`
  }

  if (istDublette) {
    einordnung = ernster(einordnung, 'DUPLICATE')
    if (einordnung === 'DUPLICATE') begruendung = 'Bereits verbucht — der scharfe Lauf überspränge diese Zeile.'
  }
  if (grenze.blockiert) {
    einordnung = ernster(einordnung, 'CROSS_TENANT_BLOCKED')
    if (einordnung === 'CROSS_TENANT_BLOCKED') begruendung = grenze.pruefung.befund
  }

  const feldFehler = pruefungen.filter(p => p.stand === 'fehler' && p.feld !== 'dublette' && p.feld !== 'mandantengrenze')
  if (feldFehler.length > 0) {
    einordnung = ernster(einordnung, 'INVALID')
    if (einordnung === 'INVALID') begruendung = feldFehler.map(f => f.befund).join(' ')
  }

  // Eine ausgehende Zahlung, die keine Rücklastschrift ist, gehört gar nicht
  // in `zahlungseingaenge` — der scharfe Lauf überspringt sie. Sie ist deshalb
  // weder ungültig noch unzugeordnet, sondern schlicht nicht Gegenstand.
  const ausgehendOhneRueckgabe = buchung.richtung === 'DBIT' && !buchung.istRuecklastschrift
  if (ausgehendOhneRueckgabe && einordnung !== 'INVALID' && einordnung !== 'CROSS_TENANT_BLOCKED') {
    einordnung = 'UNMATCHED'
    begruendung = 'Ausgehende Zahlung ohne Rücklastschrift-Merkmal — der scharfe Lauf überspringt sie, sie wird nicht als Zahlungseingang verbucht.'
  }

  return {
    nummer,
    einordnung,
    begruendung,
    wuerdeBuchen: einordnung === 'MATCHED',
    betragCent: buchung.betragCent,
    waehrung: buchung.waehrung,
    richtung: buchung.richtung,
    buchungsdatum: buchung.buchungsdatum,
    valutadatum: buchung.valutadatum,
    istGebucht: buchung.istGebucht,
    istRuecklastschrift: buchung.istRuecklastschrift,
    ruecklastschriftGrund: buchung.ruecklastschriftGrund,
    debitorName: buchung.debitorName,
    debitorIbanKurz: kuerzeIban(buchung.debitorIban),
    verwendungszweck: buchung.verwendungszweck,
    endToEndId: buchung.endToEndId,
    mandateId: buchung.mandateId,
    confidence,
    kandidaten: kandidaten.slice(0, 5).map(k => ({
      invoiceNumber: k.invoiceNumber,
      clientName: k.clientName,
      confidence: k.confidence,
      matchMethode: k.matchMethode,
      offenCent: k.openCents,
    })),
    mehrdeutigkeiten,
    pruefungen,
    buchungsHash: buchung.buchungsHash,
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

export interface PreflightParams {
  organizationId: string
  dateiname: string
  xmlInhalt: string
  /** Für Tests: Umgebungsquelle überschreiben. */
  quelle?: Record<string, string | undefined>
}

/**
 * Führt den Trockenlauf über eine CAMT-Datei aus. Schreibt NICHTS.
 */
export async function camtPreflight(
  admin: SupabaseClient,
  params: PreflightParams,
): Promise<CamtPreflightErgebnis> {
  const modus = camtImportModus(params.quelle)
  const dateiHash = computeCamtFileHash(params.xmlInhalt)
  const parse = parseCamtXml(params.xmlInhalt)

  // Wurde diese Datei schon einmal importiert?
  const { data: bereits } = await admin
    .from('camt_imports')
    .select('id')
    .eq('organization_id', params.organizationId)
    .eq('quelldatei_hash', dateiHash)
    .maybeSingle()

  const stamm = await ladeStammdaten(
    admin,
    params.organizationId,
    [...new Set(parse.buchungen.map(b => b.buchungsHash))],
  )

  const buchungen: BuchungPreflight[] = []
  for (let i = 0; i < parse.buchungen.length; i++) {
    buchungen.push(await pruefeBuchung(admin, parse.buchungen[i], i + 1, params.organizationId, stamm))
  }

  const nachEinordnung: Record<BuchungEinordnung, number> = {
    MATCHED: 0, AMBIGUOUS: 0, UNMATCHED: 0, DUPLICATE: 0, INVALID: 0, CROSS_TENANT_BLOCKED: 0,
  }
  let summeEingangCent = 0
  let summeAusgangCent = 0
  let summeBuchbarCent = 0
  for (const b of buchungen) {
    nachEinordnung[b.einordnung]++
    if (b.betragCent >= 0) summeEingangCent += b.betragCent
    else summeAusgangCent += Math.abs(b.betragCent)
    if (b.wuerdeBuchen) summeBuchbarCent += Math.abs(b.betragCent)
  }

  // ── Freigabefähigkeit ──
  // Fail-closed: alles, was ein scharfer Lauf nicht sauber verarbeiten kann,
  // ist ein Blocker. Ein Klärfall (UNMATCHED) ist KEINER — er ist der
  // vorgesehene Weg für eine Zahlung ohne eindeutige Rechnung.
  const blocker: string[] = []
  const warnungen: string[] = []

  if (parse.fehler.length > 0) {
    blocker.push(
      `${parse.fehler.length} Buchung(en) sind nicht lesbar. Der scharfe Import weist die Datei ` +
      `vollständig ab („ganz oder gar nicht") — ein halb importierter Kontoauszug ist nicht reparierbar.`,
    )
  }
  if (parse.buchungen.length === 0) {
    blocker.push('Die Datei enthält keine Buchungen.')
  }
  if (bereits) {
    blocker.push('Diese Datei wurde bereits importiert — der scharfe Import antwortet mit 409.')
  }
  if (nachEinordnung.CROSS_TENANT_BLOCKED > 0) {
    blocker.push(
      `${nachEinordnung.CROSS_TENANT_BLOCKED} Buchung(en) verweisen auf einen fremden Mandanten. ` +
      `Vor dem Import klären — eine Zuordnung wäre eine Falschbuchung bei einem anderen Haus.`,
    )
  }
  if (nachEinordnung.INVALID > 0) {
    blocker.push(
      `${nachEinordnung.INVALID} Buchung(en) sind nicht buchbar (Währung, Betrag, Vorzeichen oder ` +
      `Buchungsstatus). Siehe die Einzelbefunde.`,
    )
  }

  if (nachEinordnung.DUPLICATE > 0) {
    warnungen.push(
      `${nachEinordnung.DUPLICATE} Buchung(en) sind bereits verbucht und würden übersprungen. ` +
      `Bei überlappenden Auszügen ist das normal.`,
    )
  }
  if (nachEinordnung.AMBIGUOUS > 0) {
    warnungen.push(
      `${nachEinordnung.AMBIGUOUS} Buchung(en) sind mehrdeutig. Sie werden NICHT automatisch ` +
      `gebucht, sondern landen als Klärfall zur Zuordnung von Hand.`,
    )
  }
  if (nachEinordnung.UNMATCHED > 0) {
    warnungen.push(
      `${nachEinordnung.UNMATCHED} Buchung(en) ohne ausreichende Zuordnung — ebenfalls Klärfall.`,
    )
  }
  if (!modus.wertGueltig) {
    warnungen.push(modus.grund)
  }

  return {
    modus: modus.modus,
    buchend: modus.buchend,
    modusGrund: modus.grund,
    dateiname: params.dateiname,
    dateiHash,
    format: parse.format,
    kontoIbanKurz: kuerzeIban(parse.kontoIban),
    auszugsDatum: parse.auszugsDatum,
    dateiBereitsImportiert: Boolean(bereits),
    parseFehler: parse.fehler,
    gesamt: parse.buchungen.length,
    nachEinordnung,
    summeEingangCent,
    summeAusgangCent,
    summeBuchbarCent,
    buchungen,
    freigabefaehig: blocker.length === 0,
    blocker,
    warnungen,
  }
}
