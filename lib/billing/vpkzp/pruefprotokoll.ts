/**
 * VP/KZP — Pruefprotokoll
 *
 * Das Tor vor jeder Buchung von Verhinderungs- oder Kurzzeitpflege.
 * Geprueft wird in dieser Reihenfolge:
 *
 *   1. Mandant/Klient vorhanden        → sonst MANDANT_FEHLT
 *   2. Zeitraum plausibel              → sonst ZEITRAUM_UNGUELTIG
 *   3. Rechtsstand fuer das Jahr da    → sonst BUDGETJAHR_UNBEKANNT
 *   4. Anspruchsvoraussetzung          → sonst PFLEGEGRAD_ZU_NIEDRIG
 *   5. Tarif verifiziert               → sonst TARIF_NICHT_VERIFIZIERT
 *   6. Tageskontingent je Jahr         → sonst TAGE_KONTINGENT_ERSCHOEPFT
 *   7. Gemeinsamer Jahresbetrag        → sonst BUDGET_ERSCHOEPFT
 *   8. Ueberschneidung mit Bestand     → Hinweis bzw. ZEITRAUM_UEBERSCHNEIDUNG
 *
 * ── Fail-Closed ─────────────────────────────────────────────────────────
 * Die Voreinstellung ist ABLEHNUNG. Eine Freigabe entsteht nur, wenn jede
 * Pruefung ausdruecklich bestanden ist. Fehlt eine Angabe, die zur
 * Entscheidung noetig waere, ist das Ergebnis nicht "wahrscheinlich in
 * Ordnung", sondern FACHAUSKUNFT_ERFORDERLICH — eine Buchung auf geratener
 * Grundlage ist schlimmer als eine ausbleibende Buchung.
 *
 * Kein Aufrufer kann das uebersteuern: es gibt bewusst keinen
 * `force`-Schalter. Wer eine Ablehnung fuer falsch haelt, aendert die
 * Grundlage (Bewilligung, Tarifstatus, Rechtsstand) — nicht das Ergebnis.
 *
 * ── Was hier NICHT entschieden wird ─────────────────────────────────────
 * Preise. Dieses Modul nimmt einen Betrag entgegen und prueft ihn gegen
 * das Budget; ermittelt wird er in lib/billing/core/price-resolver.ts.
 * Ein Tarif, der dort nicht verifiziert ist, kommt hier gar nicht erst an
 * — und wenn doch, faellt er in Schritt 5.
 */

import {
  bewerteAbrechenbarkeit,
  normalisiereStatus,
  type QuellTabelle,
} from '@/lib/billing/core/tarif-verifizierung'
import {
  ART_BEZEICHNUNG,
  OFFENE_FACHFRAGEN,
  istVpKzpArt,
  zeitVersionFuerJahrOderNull,
  type VpKzpArt,
} from './konstanten'
import {
  ZeitraumUngueltigError,
  findeUeberschneidungen,
  pruefeZeitraum,
  teileNachKalenderjahr,
  type JahresSegment,
  type Zeitraum,
} from './zeitraum'
import {
  aufCent,
  berechneBuchung,
  berechneJahresLage,
  leererStand,
  type BuchungsErgebnis,
  type JahresLage,
  type JahresStand,
} from './berechnung'

// ---------------------------------------------------------------------------
// Vokabular
// ---------------------------------------------------------------------------

/**
 * Befundcodes. Jeder steht fuer eine bewusst gesetzte Sperre bzw. einen
 * bewusst nicht getroffenen Schluss — keiner ist ein "wegkonfigurierbarer
 * Fehler".
 */
export const PRUEF_CODES = [
  /** Alles geprueft, nichts einzuwenden. */
  'OK',
  /** Mandant oder Klient nicht bestimmbar — ohne sie gibt es keine Grenze. */
  'MANDANT_FEHLT',
  /** Zeitraum fehlt, ist verdreht, kein Kalendertag oder unplausibel lang. */
  'ZEITRAUM_UNGUELTIG',
  /** Fuer das Kalenderjahr sind keine gesetzlichen Werte hinterlegt. */
  'BUDGETJAHR_UNBEKANNT',
  /** Pflegegrad unter der Anspruchsschwelle (§ 39/§ 42 verlangen PG 2). */
  'PFLEGEGRAD_ZU_NIEDRIG',
  /** Kein Tarif, gesperrter Tarif oder Kassentarif ohne Verifizierung. */
  'TARIF_NICHT_VERIFIZIERT',
  /** Tageskontingent (§ 39: 42 / § 42: 56) im Kalenderjahr ausgeschoepft. */
  'TAGE_KONTINGENT_ERSCHOEPFT',
  /** Gemeinsamer Jahresbetrag § 42a ausgeschoepft. */
  'BUDGET_ERSCHOEPFT',
  /** Zeitraum ueberschneidet eine bestehende Buchung derselben Art. */
  'ZEITRAUM_UEBERSCHNEIDUNG',
  /** Angabe fehlt oder Rechtsfrage ist in diesem Repo nicht belegt. */
  'FACHAUSKUNFT_ERFORDERLICH',
] as const

export type PruefCode = (typeof PRUEF_CODES)[number]

/** Klartext je Code — identisch in Protokoll, API-Antwort und Oberflaeche. */
export const PRUEF_CODE_TEXT: Record<PruefCode, string> = {
  OK: 'Geprueft und freigegeben',
  MANDANT_FEHLT: 'Mandant oder Klient fehlt',
  ZEITRAUM_UNGUELTIG: 'Zeitraum unzulaessig',
  BUDGETJAHR_UNBEKANNT: 'Kalenderjahr ohne hinterlegte gesetzliche Werte',
  PFLEGEGRAD_ZU_NIEDRIG: 'Pflegegrad unter der Anspruchsschwelle',
  TARIF_NICHT_VERIFIZIERT: 'Tarif nicht verifiziert oder gesperrt',
  TAGE_KONTINGENT_ERSCHOEPFT: 'Tageskontingent ausgeschoepft',
  BUDGET_ERSCHOEPFT: 'Gemeinsamer Jahresbetrag ausgeschoepft',
  ZEITRAUM_UEBERSCHNEIDUNG: 'Zeitraum ueberschneidet eine bestehende Buchung',
  FACHAUSKUNFT_ERFORDERLICH: 'Fachauskunft erforderlich',
}

export type Schwere = 'sperrend' | 'hinweis'

export interface Befund {
  code: PruefCode
  schwere: Schwere
  /** Ein Satz, der in der Oberflaeche genau so stehen kann. */
  text: string
  /** Betroffenes Kalenderjahr, sofern der Befund jahresbezogen ist. */
  jahr?: number
  details?: Record<string, unknown>
}

export type Entscheidung =
  /** Vollstaendig zulasten der Pflegekasse buchbar. */
  | 'freigegeben'
  /** Teilweise buchbar — der Rest ist privat zu tragen bzw. entfaellt. */
  | 'teilweise'
  /** Nicht buchbar. */
  | 'abgelehnt'

// ---------------------------------------------------------------------------
// Ein- und Ausgabe
// ---------------------------------------------------------------------------

/** Ein bestehender Beleg, gegen den auf Ueberschneidung geprueft wird. */
export interface BestandsBuchung extends Zeitraum {
  id?: string
  art: VpKzpArt
  status?: string
}

/** Tarifangaben — Form wie in lib/billing/core/tarif-verifizierung.ts. */
export interface TarifAngabe {
  quellTabelle: QuellTabelle
  tarifStatus: unknown
  rechtsgrundlage?: string | null
  id?: string
}

export interface PruefEingabe {
  organizationId: string | null | undefined
  clientId: string | null | undefined
  art: VpKzpArt | string
  zeitraum: Zeitraum
  /** Gesamtbetrag des Zeitraums in EURO. */
  betragEuro: number
  /**
   * Pflegegrad des Klienten. `null`/undefined ist KEIN "vermutlich ok" —
   * es fuehrt zu FACHAUSKUNFT_ERFORDERLICH.
   */
  pflegegrad?: number | null
  /**
   * Tarif, auf dem der Betrag beruht. `null` bedeutet: kein verifizierter
   * Tarif vorhanden → TARIF_NICHT_VERIFIZIERT.
   */
  tarif?: TarifAngabe | null
  /** Jahresstaende des Klienten, je Kalenderjahr des Zeitraums. */
  staende?: readonly JahresStand[]
  /** Bestehende Buchungen des Klienten zur Ueberschneidungspruefung. */
  bestand?: readonly BestandsBuchung[]
}

export interface JahresPruefung {
  jahr: number
  segment: JahresSegment
  lage: JahresLage | null
  buchung: BuchungsErgebnis | null
}

export interface PruefErgebnis {
  entscheidung: Entscheidung
  /** true nur bei entscheidung === 'freigegeben'. Bequemlichkeit fuer Aufrufer. */
  buchbar: boolean
  art: VpKzpArt | null
  zeitraum: Zeitraum
  /** Tage insgesamt ueber alle Kalenderjahre. */
  tageGesamt: number
  /** Tage, die tatsaechlich auf ein Kontingent gebucht werden koennen. */
  anrechenbareTageGesamt: number
  betragEuro: number
  /** Anteil zulasten des gemeinsamen Jahresbetrags (EUR). */
  budgetBetragEuro: number
  /** Anteil ueber dem Budget — privat zu tragen (EUR). */
  privatBetragEuro: number
  /** Aufschluesselung je Kalenderjahr; leer, wenn schon der Zeitraum fiel. */
  jahre: JahresPruefung[]
  befunde: Befund[]
  /** Kurzfassung fuer Protokollzeilen und Audit-Trail. */
  zusammenfassung: string
}

// ---------------------------------------------------------------------------
// Pruefung
// ---------------------------------------------------------------------------

function befund(
  code: PruefCode,
  text: string,
  schwere: Schwere = 'sperrend',
  extra?: { jahr?: number; details?: Record<string, unknown> },
): Befund {
  return { code, schwere, text, jahr: extra?.jahr, details: extra?.details }
}

function abgelehnt(
  eingabe: PruefEingabe,
  befunde: Befund[],
  art: VpKzpArt | null,
): PruefErgebnis {
  return {
    entscheidung: 'abgelehnt',
    buchbar: false,
    art,
    zeitraum: { von: String(eingabe.zeitraum?.von ?? ''), bis: String(eingabe.zeitraum?.bis ?? '') },
    tageGesamt: 0,
    anrechenbareTageGesamt: 0,
    betragEuro: aufCent(Number(eingabe.betragEuro) || 0),
    budgetBetragEuro: 0,
    privatBetragEuro: 0,
    jahre: [],
    befunde,
    zusammenfassung: befunde.map(b => b.text).join(' '),
  }
}

/**
 * Prueft eine geplante VP/KZP-Leistung.
 *
 * Rein rechnend — kein Datenbankzugriff. Alle Bestandsdaten (Jahresstaende,
 * bestehende Buchungen, Tarif, Pflegegrad) werden uebergeben; geladen
 * werden sie in laden.ts. Dadurch ist jede Regel ohne Datenbank testbar,
 * und der Ladeweg kann fuer sich fail-closed sein.
 */
export function pruefeBuchung(eingabe: PruefEingabe): PruefErgebnis {
  const befunde: Befund[] = []

  // ── 1. Mandant und Klient ─────────────────────────────────────────
  const organizationId = String(eingabe.organizationId ?? '').trim()
  const clientId = String(eingabe.clientId ?? '').trim()
  if (!organizationId || !clientId) {
    befunde.push(befund(
      'MANDANT_FEHLT',
      'Buchung ohne Mandant oder Klient — ohne beide laesst sich weder ein Kontingent '
      + 'noch ein Budget zuordnen.',
    ))
    return abgelehnt(eingabe, befunde, null)
  }

  const art = istVpKzpArt(eingabe.art) ? eingabe.art : null
  if (!art) {
    befunde.push(befund(
      'FACHAUSKUNFT_ERFORDERLICH',
      `Leistungsart "${String(eingabe.art)}" ist weder Verhinderungs- noch Kurzzeitpflege. `
      + 'Es wird keine Zuordnung geraten.',
    ))
    return abgelehnt(eingabe, befunde, null)
  }

  // ── 2. Zeitraum ───────────────────────────────────────────────────
  let zeitraum: Zeitraum
  let segmente: JahresSegment[]
  try {
    zeitraum = pruefeZeitraum(eingabe.zeitraum)
    segmente = teileNachKalenderjahr(zeitraum)
  } catch (err) {
    befunde.push(befund(
      'ZEITRAUM_UNGUELTIG',
      err instanceof ZeitraumUngueltigError || err instanceof Error
        ? err.message
        : String(err),
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  const tageGesamt = segmente.reduce((s, seg) => s + seg.tage, 0)

  // ── 3. Rechtsstand je betroffenem Kalenderjahr ────────────────────
  const fehlendeJahre = segmente
    .map(s => s.jahr)
    .filter(j => zeitVersionFuerJahrOderNull(j) === null)
  if (fehlendeJahre.length > 0) {
    befunde.push(befund(
      'BUDGETJAHR_UNBEKANNT',
      `Fuer ${fehlendeJahre.join(', ')} sind keine VP/KZP-Kontingente hinterlegt. `
      + 'Die Buchung wird nicht durchgelassen — ein geratenes Kontingent saehe geprueft aus.',
      'sperrend',
      { details: { jahre: fehlendeJahre } },
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  // ── 4. Anspruchsvoraussetzung Pflegegrad ──────────────────────────
  const pflegegrad = eingabe.pflegegrad
  if (pflegegrad === null || pflegegrad === undefined || !Number.isFinite(Number(pflegegrad))) {
    befunde.push(befund(
      'FACHAUSKUNFT_ERFORDERLICH',
      'Pflegegrad nicht hinterlegt. Ohne ihn ist der Anspruch nach § 39/§ 42 SGB XI '
      + 'nicht feststellbar; es wird kein Anspruch unterstellt.',
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  const minPflegegrad = zeitVersionFuerJahrOderNull(segmente[0].jahr)?.minPflegegrad ?? 2
  if (Number(pflegegrad) < minPflegegrad) {
    befunde.push(befund(
      'PFLEGEGRAD_ZU_NIEDRIG',
      `Pflegegrad ${pflegegrad} — ${ART_BEZEICHNUNG[art]} setzt mindestens Pflegegrad `
      + `${minPflegegrad} voraus. ${OFFENE_FACHFRAGEN.kzp_pflegegrad_1}`,
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  // ── 5. Tarif ──────────────────────────────────────────────────────
  const tarif = eingabe.tarif
  if (!tarif) {
    befunde.push(befund(
      'TARIF_NICHT_VERIFIZIERT',
      'Kein Tarif hinterlegt. Ohne verifizierte Preisgrundlage wird nicht gebucht — '
      + 'ein geschaetzter Satz erzeugt eine unbelegte Kassenforderung.',
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  const abrechenbarkeit = bewerteAbrechenbarkeit({
    quellTabelle: tarif.quellTabelle,
    tarifStatus: tarif.tarifStatus,
    rechtsgrundlage: tarif.rechtsgrundlage,
  })
  if (!abrechenbarkeit.abrechenbar) {
    befunde.push(befund(
      'TARIF_NICHT_VERIFIZIERT',
      abrechenbarkeit.begruendung,
      'sperrend',
      { details: { tarifId: tarif.id, tarifStatus: normalisiereStatus(tarif.tarifStatus) } },
    ))
    return abgelehnt(eingabe, befunde, art)
  }

  // ── 6. Ueberschneidung mit bestehenden Buchungen ──────────────────
  // Buchungen derselben Art bestimmen, wie viele Tage nicht erneut zaehlen.
  // Buchungen der ANDEREN Art sind kein Fehler — VP und KZP koennen sich
  // im selben Jahr abwechseln —, aber ein Hinweis wert, weil derselbe Tag
  // nicht zweimal mit voller Betreuung belegt sein kann.
  const bestandAktiv = (eingabe.bestand ?? []).filter(b => b.status !== 'storniert')
  const gleicheArt = bestandAktiv.filter(b => b.art === art)
  const andereArt = bestandAktiv.filter(b => b.art !== art)

  const ueberschneidungenGleich = findeUeberschneidungen(zeitraum, gleicheArt)
  const ueberschneidungenAnders = findeUeberschneidungen(zeitraum, andereArt)

  if (ueberschneidungenGleich.length > 0) {
    const tage = ueberschneidungenGleich.reduce((s, u) => s + u.tage, 0)
    befunde.push(befund(
      'ZEITRAUM_UEBERSCHNEIDUNG',
      `${tage} Tag(e) sind bereits als ${ART_BEZEICHNUNG[art]} erfasst und zaehlen `
      + 'nicht erneut auf das Kontingent. Der Betrag wird trotzdem gegen das Budget geprueft.',
      'hinweis',
      { details: { tage, buchungen: ueberschneidungenGleich.map(u => u.bestand.id ?? null) } },
    ))
  }
  if (ueberschneidungenAnders.length > 0) {
    const tage = ueberschneidungenAnders.reduce((s, u) => s + u.tage, 0)
    befunde.push(befund(
      'ZEITRAUM_UEBERSCHNEIDUNG',
      `${tage} Tag(e) ueberschneiden sich mit einer Buchung der jeweils anderen `
      + 'Leistungsart. Fachlich zu pruefen, ob beide Leistungen am selben Tag erbracht wurden.',
      'hinweis',
      { details: { tage } },
    ))
  }

  // ── 7./8. Tage und Budget je Kalenderjahr ─────────────────────────
  const standNachJahr = new Map<number, JahresStand>(
    (eingabe.staende ?? []).map(s => [s.jahr, s]),
  )

  // Der Betrag wird tageproportional auf die Jahressegmente verteilt. Bei
  // einem einzigen Segment ist das der volle Betrag; bei einem Zeitraum
  // ueber den Jahreswechsel traegt jedes Jahr seinen Anteil. Rundungsreste
  // landen im letzten Segment, damit die Summe exakt bleibt.
  const betragGesamt = aufCent(Number(eingabe.betragEuro) || 0)
  const jahre: JahresPruefung[] = []
  let verteilt = 0
  let budgetBetragEuro = 0
  let privatBetragEuro = 0
  let anrechenbareTageGesamt = 0

  segmente.forEach((segment, index) => {
    const istLetztes = index === segmente.length - 1
    const anteil = istLetztes
      ? aufCent(betragGesamt - verteilt)
      : aufCent(tageGesamt > 0 ? (betragGesamt * segment.tage) / tageGesamt : 0)
    verteilt = aufCent(verteilt + anteil)

    const stand = standNachJahr.get(segment.jahr) ?? leererStand(segment.jahr)

    let lage: JahresLage
    try {
      lage = berechneJahresLage(stand)
    } catch (err) {
      befunde.push(befund(
        'BUDGETJAHR_UNBEKANNT',
        err instanceof Error ? err.message : String(err),
        'sperrend',
        { jahr: segment.jahr },
      ))
      jahre.push({ jahr: segment.jahr, segment, lage: null, buchung: null })
      return
    }

    // Tage, die im selben Jahr schon fuer dieselbe Art erfasst sind.
    const doppelt = findeUeberschneidungen(segment, gleicheArt)
      .reduce((s, u) => s + u.tage, 0)

    const buchung = berechneBuchung(lage, {
      art,
      tage: segment.tage,
      betragEuro: anteil,
      bereitsGezaehlteTage: doppelt,
    })

    anrechenbareTageGesamt += buchung.anrechenbareTage
    budgetBetragEuro = aufCent(budgetBetragEuro + buchung.budgetBetragEuro)
    privatBetragEuro = aufCent(privatBetragEuro + buchung.privatBetragEuro)

    if (!buchung.tageReichen) {
      befunde.push(befund(
        'TAGE_KONTINGENT_ERSCHOEPFT',
        `${ART_BEZEICHNUNG[art]}: im Jahr ${segment.jahr} sind noch `
        + `${art === 'verhinderungspflege' ? lage.vpTageRest : lage.kzpTageRest} von `
        + `${art === 'verhinderungspflege' ? lage.vpMaxTage : lage.kzpMaxTage} Tagen frei; `
        + `${buchung.tageUeberschuss} Tag(e) des Zeitraums sind nicht mehr gedeckt.`,
        'sperrend',
        { jahr: segment.jahr, details: { ueberschuss: buchung.tageUeberschuss } },
      ))
    }

    if (!buchung.budgetReicht) {
      befunde.push(befund(
        'BUDGET_ERSCHOEPFT',
        `Gemeinsamer Jahresbetrag § 42a SGB XI im Jahr ${segment.jahr}: noch `
        + `${lage.kombiniertRestEuro.toFixed(2)} EUR von ${lage.kombiniertesBudgetEuro.toFixed(2)} EUR. `
        + `${buchung.privatBetragEuro.toFixed(2)} EUR sind nicht zulasten der Pflegekasse abrechenbar.`,
        'sperrend',
        { jahr: segment.jahr, details: { privatBetragEuro: buchung.privatBetragEuro } },
      ))
    }

    jahre.push({ jahr: segment.jahr, segment, lage, buchung })
  })

  const sperrend = befunde.filter(b => b.schwere === 'sperrend')
  const alleGerechnet = jahre.every(j => j.buchung !== null)

  let entscheidung: Entscheidung
  if (!alleGerechnet) {
    entscheidung = 'abgelehnt'
  } else if (sperrend.length === 0) {
    entscheidung = 'freigegeben'
  } else if (anrechenbareTageGesamt > 0 && budgetBetragEuro > 0) {
    // Ein Teil ist gedeckt: die Oberflaeche kann anbieten, den Zeitraum zu
    // kuerzen oder den Rest privat abzurechnen. Gebucht wird deshalb noch
    // nichts — 'teilweise' ist keine Freigabe.
    entscheidung = 'teilweise'
  } else {
    entscheidung = 'abgelehnt'
  }

  if (befunde.length === 0) {
    befunde.push(befund(
      'OK',
      `${ART_BEZEICHNUNG[art]}: ${tageGesamt} Tag(e), `
      + `${budgetBetragEuro.toFixed(2)} EUR zulasten des gemeinsamen Jahresbetrags.`,
      'hinweis',
    ))
  }

  return {
    entscheidung,
    buchbar: entscheidung === 'freigegeben',
    art,
    zeitraum,
    tageGesamt,
    anrechenbareTageGesamt,
    betragEuro: betragGesamt,
    budgetBetragEuro,
    privatBetragEuro,
    jahre,
    befunde,
    zusammenfassung: fasseZusammen(entscheidung, befunde),
  }
}

function fasseZusammen(entscheidung: Entscheidung, befunde: Befund[]): string {
  const sperrend = befunde.filter(b => b.schwere === 'sperrend')
  if (entscheidung === 'freigegeben') {
    return befunde.map(b => b.text).join(' ') || 'Geprueft und freigegeben.'
  }
  const kopf = entscheidung === 'teilweise'
    ? 'Nur teilweise gedeckt — keine Freigabe:'
    : 'Nicht buchbar:'
  return `${kopf} ${sperrend.map(b => b.text).join(' ')}`.trim()
}

/**
 * Die offenen Fachfragen dieses Moduls als Befunde — fuer Oberflaechen,
 * die sie neben dem Ergebnis anzeigen sollen. Sie sind KEINE Sperre der
 * einzelnen Buchung, sondern der ausgeschriebene Vorbehalt, unter dem
 * dieses Modul insgesamt arbeitet.
 */
export function offeneFachfragenAlsBefunde(): Befund[] {
  return Object.entries(OFFENE_FACHFRAGEN).map(([schluessel, text]) =>
    befund('FACHAUSKUNFT_ERFORDERLICH', text, 'hinweis', { details: { schluessel } }),
  )
}
