// ═══════════════════════════════════════════════════════════════════════════
// MAHNWESEN-TROCKENLAUF — was der Mahnlauf HEUTE täte, ohne es zu tun
//
// PROBLEM, DAS DIESE DATEI LÖST
// `MAHNVERSAND_AUTOMATISCH` ist ungesetzt und soll als LETZTER Schalter
// fallen — nach einem belegten Rechnungsversand. Vor dem Umlegen ist eine
// Frage zu beantworten, die kein Testfall beantworten kann: was passierte
// mit dem ECHTEN Bestand, wenn der Mahnlauf jetzt liefe?
//
// Das Mahn-Safety-Gate (Phase 7, Track 4) beantwortet das für EINE Rechnung
// und mit einem anderen Blickwinkel: es fragt „darf ich eskalieren", und
// seine Antwort ist binär, weil sie das sein muss — sie steht unmittelbar vor
// einer Gebührenbuchung.
//
// Für den Erstbetrieb ist diese Antwort zu grob. Der Unterschied zwischen
// „diese Rechnung ist bezahlt, sie gehört gar nicht ins Mahnwesen" und
// „diese Rechnung wäre mahnbar, aber eine Gutschrift steht offen" ist der
// ganze Punkt: Ersteres ist der Normalfall und braucht niemanden, Letzteres
// ist ein Vorgang, der liegen geblieben ist.
//
// ── DIE VIER URTEILE ───────────────────────────────────────────────────────
//   NOT_ELIGIBLE  Gehört heute nicht ins Mahnwesen. Bezahlt, storniert,
//                 abgeschrieben, Entwurf, nichts offen — oder schlicht noch
//                 nicht fällig. Kein Handlungsbedarf.
//   ELIGIBLE      Würde heute gemahnt. Nichts spricht dagegen.
//   NEEDS_REVIEW  Technisch mahnbar, aber ein Umstand verlangt einen Blick,
//                 BEVOR ein Automat eine Gebühr bucht.
//   BLOCKED       Gehörte ins Mahnwesen, aber eine Sperre verbietet die
//                 Mahnung — und die ist erklärungsbedürftig.
//
// Rangfolge: BLOCKED › NOT_ELIGIBLE › NEEDS_REVIEW › ELIGIBLE.
// BLOCKED steht vorn, weil es der einzige Zustand ist, der jemanden
// beschäftigen muss. NOT_ELIGIBLE steht vor NEEDS_REVIEW, weil bei einer
// bezahlten Rechnung niemand mehr etwas sichten muss.
//
// ── DER UNTERSCHIED ZUM GATE ───────────────────────────────────────────────
// Dieses Modul BEWERTET nicht selbst, ob gemahnt werden darf. Es ruft
// `pruefeMahnbarkeit()` und übersetzt dessen zehn Punkte in die vier
// Urteile. Ein zweiter, eigener Regelsatz wäre der Fehler, den Phase 7 beim
// CAMT-Preflight ausdrücklich vermieden hat: ein Trockenlauf, der anders
// urteilt als der scharfe Lauf, verspricht Sicherheit, die er nicht hat.
//
// Was NEU hinzukommt, sind Beobachtungen, die das Gate nicht macht, weil sie
// nichts verbieten — allen voran die Rücklastschrift.
//
// ── RÜCKLASTSCHRIFT: DER FALL, DEN DAS GATE NICHT SIEHT ────────────────────
// `verarbeiteRuecklastschrift()` setzt die Mahnstufe unmittelbar hoch
// (mindestens auf `mahnung_1`) — ohne `advanceDunning()`, also ohne das
// Gate, und ohne `next_dunning_at` zu setzen. Eine Rechnung nach
// Rücklastschrift steht deshalb auf einer Stufe, die kein Mahnlauf erzeugt
// hat, und die nächste Eskalation kann ohne den üblichen Stufenabstand
// kommen. Das ist kein Fehler — bei einer geplatzten Lastschrift ist
// Eskalation gewollt — aber es ist genau der Vorgang, den ein Mensch beim
// ersten scharfen Mahnlauf gesehen haben sollte.
//
// ── ES SCHREIBT NICHTS ─────────────────────────────────────────────────────
// Keine Mahnstufe, keine Gebühr, keine Warteschlangenzeile, kein Versand.
// Dieses Modul exportiert keine Funktion, die schreibt.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { centZuEuro } from '@/lib/geld'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  pruefeMahnbarkeit,
  type MahnGateErgebnis,
  type MahnSperre,
} from '@/lib/billing/dunning/mahn-safety-gate'
import { DUNNING_FEES_CENTS, DUNNING_LABELS, type DunningLevel } from '@/lib/billing/core/dunning'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type MahnUrteil = 'NOT_ELIGIBLE' | 'ELIGIBLE' | 'NEEDS_REVIEW' | 'BLOCKED'

/** Rangfolge, vorne = gewinnt. */
export const URTEIL_RANG: MahnUrteil[] = ['BLOCKED', 'NOT_ELIGIBLE', 'NEEDS_REVIEW', 'ELIGIBLE']

/**
 * Zustände, die eine Rechnung im Mahnwesen haben kann.
 *
 * Mehrere treffen gleichzeitig zu — eine Rechnung kann überfällig UND
 * teilweise bezahlt UND von einer Rücklastschrift betroffen sein. Der
 * Bericht führt sie deshalb als Liste, nicht als einen Wert.
 */
export type Rechnungszustand =
  | 'bezahlt'
  | 'teilweise_bezahlt'
  | 'offen'
  | 'ueberfaellig'
  | 'storniert'
  | 'abgeschrieben'
  | 'entwurf'
  | 'gutschrift_offen'
  | 'bestritten'
  | 'ruecklastschrift'
  | 'manuell_gesperrt'
  | 'geloescht'

export const ZUSTAND_LABEL: Record<Rechnungszustand, string> = {
  bezahlt: 'bezahlt',
  teilweise_bezahlt: 'teilweise bezahlt',
  offen: 'offen',
  ueberfaellig: 'überfällig',
  storniert: 'storniert',
  abgeschrieben: 'abgeschrieben',
  entwurf: 'Entwurf',
  gutschrift_offen: 'offene Gutschrift/Korrektur',
  bestritten: 'bestritten',
  ruecklastschrift: 'Rücklastschrift',
  manuell_gesperrt: 'manuell gesperrt',
  geloescht: 'gelöscht',
}

/** Sperrgründe, die bedeuten „gehört nicht ins Mahnwesen" statt „ist blockiert". */
const AUSSERHALB_MAHNWESEN: ReadonlySet<MahnSperre> = new Set<MahnSperre>([
  'rechnung', 'geloescht', 'offener_betrag',
])

/** Rechnungsstatus, die schlicht nicht Gegenstand des Mahnwesens sind. */
const STATUS_AUSSERHALB: ReadonlySet<string> = new Set([
  'entwurf', 'geprueft', 'bezahlt', 'akzeptiert', 'storniert', 'abgeschrieben',
])

export interface MahnBeobachtung {
  /** Stabiler Schlüssel — Tests und Oberfläche prüfen darauf, nicht auf Text. */
  code:
    | 'ruecklastschrift'
    | 'teilzahlung'
    | 'gebuehr_ueber_forderung'
    | 'stufe_ohne_wiedervorlage'
    | 'kleinbetrag'
    | 'hoechste_stufe'
  meldung: string
}

export interface MahnDryRunPosten {
  invoiceId: string
  invoiceNumber: string | null
  organizationId: string
  urteil: MahnUrteil
  /** Ein Satz: warum dieses Urteil. */
  begruendung: string
  zustaende: Rechnungszustand[]

  aktuelleStufe: DunningLevel
  naechsteStufe: DunningLevel | null
  /** Gebühr, die die nächste Stufe kosten würde. 0, wenn keine folgt. */
  naechsteGebuehrCent: number

  gesamtCent: number
  bezahltCent: number
  offenCent: number
  tageUeberfaellig: number

  /** Was das Gate verbietet. Leer, wenn nichts. */
  sperren: string[]
  /** Was nichts verbietet, aber angesehen gehört. */
  beobachtungen: MahnBeobachtung[]
  /** Das vollständige Gate-Ergebnis — alle zehn Punkte. */
  gate: MahnGateErgebnis
}

export interface MahnDryRunBericht {
  stichtag: string
  organizationId: string
  /** Immer false. Steht im Datenmodell, nicht nur im Seitentext. */
  versendet: false
  geprueft: number
  nachUrteil: Record<MahnUrteil, number>
  /** Summe der Gebühren, die ein scharfer Lauf heute buchen würde. */
  summeGebuehrenCent: number
  /** Summe der offenen Forderungen der ELIGIBLE-Posten. */
  summeMahnbarCent: number
  posten: MahnDryRunPosten[]
  /** Rechnungen, die nicht geprüft werden konnten — je mit Grund. */
  nichtGeprueft: { invoiceId: string; grund: string }[]
}

export interface MahnDryRunParams {
  organizationId: string
  /**
   * Ausdrückliche Liste. Ohne sie werden die Rechnungen mit Mahneintrag
   * geladen (bis `limit`).
   */
  invoiceIds?: string[]
  /** Obergrenze, wenn die Liste selbst ermittelt wird. */
  limit?: number
}

/** Bagatellgrenze: darunter lohnt eine Mahnung wirtschaftlich nicht. */
export const KLEINBETRAG_CENT = 500

export const MAHN_STANDARD_LIMIT = 200

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function euro(cent: number): string {
  return `${centZuEuro(cent).toFixed(2).replace('.', ',')} €`
}

/** Der ernstere von zwei Urteilen. */
export function ernsteresUrteil(a: MahnUrteil, b: MahnUrteil): MahnUrteil {
  return URTEIL_RANG.indexOf(a) <= URTEIL_RANG.indexOf(b) ? a : b
}

// ---------------------------------------------------------------------------
// Zustände und Urteil
// ---------------------------------------------------------------------------

interface Umfeld {
  /** Rechnungsstatus, wie er in `invoices` steht. */
  status: string
  /** Eine Rücklastschrift betrifft diese Rechnung. */
  ruecklastschrift: boolean
}

/**
 * Leitet die Zustandsliste aus dem Gate-Ergebnis und dem Umfeld ab.
 *
 * Rein — damit einzeln prüfbar, ohne Datenbank.
 */
export function ermittleZustaende(gate: MahnGateErgebnis, umfeld: Umfeld): Rechnungszustand[] {
  const z = new Set<Rechnungszustand>()
  const punkt = (s: MahnSperre) => gate.punkte.find(p => p.sperre === s)

  if (umfeld.status === 'storniert') z.add('storniert')
  if (umfeld.status === 'abgeschrieben') z.add('abgeschrieben')
  if (['entwurf', 'geprueft'].includes(umfeld.status)) z.add('entwurf')

  if (gate.offenCent <= 0 && gate.gesamtCent > 0) z.add('bezahlt')
  else if (gate.bezahltCent > 0) z.add('teilweise_bezahlt')
  else z.add('offen')

  if (gate.tageUeberfaellig > 0) z.add('ueberfaellig')

  if (punkt('geloescht')?.stand === 'gesperrt') z.add('geloescht')
  if (punkt('gutschrift')?.stand === 'gesperrt') z.add('gutschrift_offen')
  if (punkt('beanstandung')?.stand === 'gesperrt') z.add('bestritten')
  if (punkt('manuelle_sperre')?.stand === 'gesperrt') z.add('manuell_gesperrt')

  if (umfeld.ruecklastschrift) z.add('ruecklastschrift')

  return [...z]
}

/**
 * Übersetzt das Gate-Ergebnis in eines der vier Urteile.
 *
 * Der Kern ist die Unterscheidung, die das Gate nicht macht: es meldet
 * „GESPERRT", ob die Rechnung bezahlt ist oder ob eine Gutschrift offen
 * steht. Für den Trockenlauf sind das zwei völlig verschiedene Aussagen —
 * die eine ist der Normalfall, die andere ein liegen gebliebener Vorgang.
 */
export function urteileUeberGate(
  gate: MahnGateErgebnis,
  umfeld: Umfeld,
  beobachtungen: MahnBeobachtung[],
): { urteil: MahnUrteil; begruendung: string } {
  const gesperrte = gate.punkte.filter(p => p.stand === 'gesperrt')

  if (gesperrte.length > 0) {
    // „Gehört nicht ins Mahnwesen" oder „ist blockiert"? Entschieden wird
    // an der Sperre selbst, nicht an ihrer Anzahl: eine bezahlte Rechnung
    // ist kein Vorgang, eine offene Gutschrift schon.
    const echteBlockade = gesperrte.filter(p => {
      if (AUSSERHALB_MAHNWESEN.has(p.sperre)) return false
      if (p.sperre === 'status') return !STATUS_AUSSERHALB.has(umfeld.status)
      // Die höchste automatisch erreichbare Stufe ist keine Blockade,
      // sondern das vorgesehene Ende der Leiter.
      if (p.sperre === 'stufenabstand' && gate.naechsteStufe === null) return false
      return true
    })

    if (echteBlockade.length > 0) {
      return {
        urteil: 'BLOCKED',
        begruendung: echteBlockade.map(p => p.befund).join(' '),
      }
    }
    return {
      urteil: 'NOT_ELIGIBLE',
      begruendung: gesperrte.map(p => p.befund).join(' '),
    }
  }

  if (gate.status === 'NOCH_NICHT_FAELLIG') {
    const nochNicht = gate.punkte.filter(p => p.stand === 'noch_nicht')
    return {
      urteil: 'NOT_ELIGIBLE',
      begruendung: nochNicht.map(p => p.befund).join(' ') || 'Die Mahnfrist ist noch nicht erreicht.',
    }
  }

  if (beobachtungen.length > 0) {
    return {
      urteil: 'NEEDS_REVIEW',
      begruendung: beobachtungen.map(b => b.meldung).join(' '),
    }
  }

  return {
    urteil: 'ELIGIBLE',
    begruendung:
      `${euro(gate.offenCent)} seit ${gate.tageUeberfaellig} Tagen offen. `
      + `Der Mahnlauf setzte die Stufe auf „${gate.naechsteStufe ? DUNNING_LABELS[gate.naechsteStufe] : '—'}".`,
  }
}

/**
 * Beobachtungen, die nichts verbieten, aber gesichtet gehören.
 *
 * Rein. Sie werden NUR ausgewertet, wenn das Gate sonst frei ist — ein
 * NEEDS_REVIEW auf einer bezahlten Rechnung wäre Lärm.
 */
export function ermittleBeobachtungen(
  gate: MahnGateErgebnis,
  umfeld: Umfeld,
): MahnBeobachtung[] {
  const b: MahnBeobachtung[] = []

  if (umfeld.ruecklastschrift) {
    b.push({
      code: 'ruecklastschrift',
      meldung:
        'Zu dieser Rechnung gibt es eine Rücklastschrift. Die Mahnstufe wurde dabei unmittelbar '
        + 'hochgesetzt — ohne Mahnlauf und ohne Wiedervorlagedatum. Vor einer weiteren Eskalation '
        + 'ansehen, ob die Lastschrift erneut eingezogen werden soll.',
    })
  }

  if (gate.bezahltCent > 0 && gate.offenCent > 0) {
    b.push({
      code: 'teilzahlung',
      meldung:
        `Teilzahlung: ${euro(gate.bezahltCent)} von ${euro(gate.gesamtCent)} sind eingegangen, `
        + `offen bleiben ${euro(gate.offenCent)}. Die Mahnung darf nur über den Rest lauten.`,
    })
  }

  const gebuehr = gate.naechsteStufe ? DUNNING_FEES_CENTS[gate.naechsteStufe] ?? 0 : 0
  if (gebuehr > 0 && gebuehr >= gate.offenCent) {
    b.push({
      code: 'gebuehr_ueber_forderung',
      meldung:
        `Die Mahngebühr der nächsten Stufe (${euro(gebuehr)}) erreicht oder übersteigt die offene `
        + `Forderung (${euro(gate.offenCent)}). Eine Mahnung, die mehr kostet als sie eintreibt, `
        + `gehört von Hand entschieden.`,
    })
  } else if (gate.offenCent > 0 && gate.offenCent < KLEINBETRAG_CENT) {
    b.push({
      code: 'kleinbetrag',
      meldung:
        `Offen sind nur ${euro(gate.offenCent)} — unter der Bagatellgrenze von `
        + `${euro(KLEINBETRAG_CENT)}.`,
    })
  }

  if (gate.naechsteStufe === null) {
    b.push({
      code: 'hoechste_stufe',
      meldung:
        `Stufe „${DUNNING_LABELS[gate.aktuelleStufe] ?? gate.aktuelleStufe}" ist die höchste `
        + `automatisch erreichbare. Weiter geht es nur von Hand.`,
    })
  }

  return b
}

// ---------------------------------------------------------------------------
// Rücklastschriften je Rechnung
// ---------------------------------------------------------------------------

/**
 * Ermittelt, zu welchen Rechnungen es eine Rücklastschrift gibt.
 *
 * Zwei Wege, beide nötig:
 *   · `sepa_batch_items.status = 'ruecklastschrift'` — der Weg, den
 *     `verarbeiteRuecklastschrift()` schreibt, wenn der Posten gefunden wurde.
 *   · `payment_differences.kuerzung_grund = 'Rücklastschriftgebühr'` — die
 *     Gebührenzeile. Sie entsteht auch dann, wenn der Sammelposten
 *     inzwischen einen anderen Status trägt.
 *
 * Fail-closed: schlägt eine der beiden Abfragen fehl, wirft die Funktion.
 * Eine Rücklastschrift, die im Trockenlauf nicht auftaucht, ist genau die
 * Beobachtung, deretwegen der Trockenlauf gemacht wird.
 */
async function ladeRuecklastschriften(
  admin: SupabaseClient,
  organizationId: string,
  invoiceIds: string[],
): Promise<Set<string>> {
  const treffer = new Set<string>()
  if (invoiceIds.length === 0) return treffer

  const { data: posten, error: postenErr } = await admin
    .from('sepa_batch_items')
    .select('invoice_id')
    .eq('organization_id', organizationId)
    .eq('status', 'ruecklastschrift')
    .in('invoice_id', invoiceIds)

  if (postenErr) {
    throw new Error(`Rücklastschriften (sepa_batch_items) nicht lesbar: ${postenErr.message}`)
  }
  for (const p of (posten ?? []) as { invoice_id: string | null }[]) {
    if (p.invoice_id) treffer.add(p.invoice_id)
  }

  const { data: gebuehren, error: gebuehrErr } = await admin
    .from('payment_differences')
    .select('invoice_id')
    .eq('organization_id', organizationId)
    .eq('kuerzung_grund', 'Rücklastschriftgebühr')
    .in('invoice_id', invoiceIds)

  if (gebuehrErr) {
    throw new Error(`Rücklastschriften (payment_differences) nicht lesbar: ${gebuehrErr.message}`)
  }
  for (const g of (gebuehren ?? []) as { invoice_id: string | null }[]) {
    if (g.invoice_id) treffer.add(g.invoice_id)
  }

  return treffer
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Führt den Mahnwesen-Trockenlauf aus. Schreibt NICHTS.
 */
export async function mahnwesenDryRun(
  admin: SupabaseClient,
  params: MahnDryRunParams,
): Promise<MahnDryRunBericht> {
  const { organizationId } = params
  const limit = params.limit ?? MAHN_STANDARD_LIMIT
  const nichtGeprueft: { invoiceId: string; grund: string }[] = []

  // ── Welche Rechnungen? ──
  let invoiceIds: string[]
  if (params.invoiceIds) {
    invoiceIds = [...new Set(params.invoiceIds)]
  } else {
    const { data, error } = await admin
      .from('invoices')
      .select('id')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .not('status', 'in', '(entwurf,geprueft)')
      .order('due_date', { ascending: true })
      .limit(limit)

    if (error) throw new Error(`Rechnungen für den Trockenlauf nicht lesbar: ${error.message}`)
    invoiceIds = ((data ?? []) as { id: string }[]).map(r => r.id)
  }

  // ── Status und Rücklastschriften in EINEM Zug ──
  const statusJeRechnung = new Map<string, string>()
  if (invoiceIds.length > 0) {
    const { data, error } = await admin
      .from('invoices')
      .select('id, status')
      .eq('organization_id', organizationId)
      .in('id', invoiceIds)
    if (error) throw new Error(`Rechnungsstatus nicht lesbar: ${error.message}`)
    for (const r of (data ?? []) as { id: string; status: string }[]) {
      statusJeRechnung.set(r.id, r.status)
    }
  }

  const ruecklastschriften = await ladeRuecklastschriften(admin, organizationId, invoiceIds)

  // ── Je Rechnung durch das Gate ──
  const posten: MahnDryRunPosten[] = []

  for (const invoiceId of invoiceIds) {
    let gate: MahnGateErgebnis
    try {
      gate = await pruefeMahnbarkeit(admin, { invoiceId, organizationId })
    } catch (err) {
      nichtGeprueft.push({ invoiceId, grund: (err as Error).message })
      continue
    }

    const umfeld: Umfeld = {
      status: statusJeRechnung.get(invoiceId) ?? 'unbekannt',
      ruecklastschrift: ruecklastschriften.has(invoiceId),
    }

    // Beobachtungen zählen nur, wenn nichts sperrt — sonst wäre ein
    // NEEDS_REVIEW auf einer bezahlten Rechnung reiner Lärm.
    const gateFrei = gate.status === 'MAHNBAR'
    const beobachtungen = gateFrei ? ermittleBeobachtungen(gate, umfeld) : []

    const { urteil, begruendung } = urteileUeberGate(gate, umfeld, beobachtungen)
    const naechsteGebuehrCent = gate.naechsteStufe ? DUNNING_FEES_CENTS[gate.naechsteStufe] ?? 0 : 0

    posten.push({
      invoiceId,
      invoiceNumber: gate.invoiceNumber,
      organizationId,
      urteil,
      begruendung,
      zustaende: ermittleZustaende(gate, umfeld),
      aktuelleStufe: gate.aktuelleStufe,
      naechsteStufe: gate.naechsteStufe,
      naechsteGebuehrCent,
      gesamtCent: gate.gesamtCent,
      bezahltCent: gate.bezahltCent,
      offenCent: gate.offenCent,
      tageUeberfaellig: gate.tageUeberfaellig,
      sperren: gate.sperren,
      beobachtungen,
      gate,
    })
  }

  const nachUrteil: Record<MahnUrteil, number> = {
    NOT_ELIGIBLE: 0, ELIGIBLE: 0, NEEDS_REVIEW: 0, BLOCKED: 0,
  }
  let summeGebuehrenCent = 0
  let summeMahnbarCent = 0
  for (const p of posten) {
    nachUrteil[p.urteil]++
    if (p.urteil === 'ELIGIBLE') {
      summeGebuehrenCent += p.naechsteGebuehrCent
      summeMahnbarCent += p.offenCent
    }
  }

  return {
    stichtag: heuteBerlin(),
    organizationId,
    versendet: false,
    geprueft: posten.length,
    nachUrteil,
    summeGebuehrenCent,
    summeMahnbarCent,
    posten,
    nichtGeprueft,
  }
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

const URTEIL_ZEICHEN: Record<MahnUrteil, string> = {
  ELIGIBLE: '→',
  NEEDS_REVIEW: '?',
  BLOCKED: '✖',
  NOT_ELIGIBLE: '·',
}

/** Der Trockenlauf zum Gegenlesen. */
export function mahnDryRunBerichtText(b: MahnDryRunBericht): string {
  const z: string[] = []
  const linie = '═'.repeat(74)

  z.push(linie)
  z.push('MAHNWESEN — TROCKENLAUF. ES WURDE KEINE MAHNUNG VERSCHICKT.')
  z.push(linie)
  z.push(`Stichtag : ${b.stichtag}`)
  z.push(`Mandant  : ${b.organizationId}`)
  z.push(`Geprüft  : ${b.geprueft} Rechnung(en)`)
  z.push('')
  z.push(`  würden gemahnt (ELIGIBLE)   : ${b.nachUrteil.ELIGIBLE}`)
  z.push(`  Sichtung nötig (NEEDS_REVIEW): ${b.nachUrteil.NEEDS_REVIEW}`)
  z.push(`  blockiert (BLOCKED)          : ${b.nachUrteil.BLOCKED}`)
  z.push(`  kein Vorgang (NOT_ELIGIBLE)  : ${b.nachUrteil.NOT_ELIGIBLE}`)
  z.push('')
  z.push(`Offene Forderung der mahnbaren Posten : ${euro(b.summeMahnbarCent)}`)
  z.push(`Mahngebühren, die heute gebucht würden: ${euro(b.summeGebuehrenCent)}`)

  if (b.nichtGeprueft.length > 0) {
    z.push('')
    z.push('NICHT GEPRÜFT (gilt NICHT als „nichts zu tun"):')
    for (const n of b.nichtGeprueft) z.push(`  ✖ ${n.invoiceId}: ${n.grund}`)
  }

  for (const urteil of URTEIL_RANG) {
    const gruppe = b.posten.filter(p => p.urteil === urteil)
    if (gruppe.length === 0) continue
    z.push('')
    z.push('─'.repeat(74))
    z.push(`${urteil} — ${gruppe.length} Rechnung(en)`)
    z.push('─'.repeat(74))
    for (const p of gruppe) {
      z.push(`${URTEIL_ZEICHEN[p.urteil]} ${p.invoiceNumber ?? p.invoiceId}`
        + `   offen ${euro(p.offenCent)} von ${euro(p.gesamtCent)}`
        + `   ${p.tageUeberfaellig} Tage überfällig`)
      z.push(`     Zustand : ${p.zustaende.map(x => ZUSTAND_LABEL[x]).join(', ')}`)
      z.push(`     Stufe   : ${DUNNING_LABELS[p.aktuelleStufe] ?? p.aktuelleStufe}`
        + `${p.naechsteStufe ? ` → ${DUNNING_LABELS[p.naechsteStufe]} (${euro(p.naechsteGebuehrCent)})` : ' (Ende der Leiter)'}`)
      z.push(`     ${p.begruendung}`)
      for (const s of p.sperren) z.push(`     ✖ ${s}`)
      for (const o of p.beobachtungen) z.push(`     ? ${o.meldung}`)
    }
  }

  z.push('')
  z.push(linie)
  z.push('ENDE — keine Mahnstufe erhöht, keine Gebühr gebucht, nichts versendet.')
  z.push(linie)
  return z.join('\n')
}
