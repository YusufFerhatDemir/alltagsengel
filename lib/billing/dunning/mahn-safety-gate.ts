// ═══════════════════════════════════════════════════════════════════════════
// MAHN-SAFETY-GATE — eine Stelle, die entscheidet, ob gemahnt werden darf
//
// PROBLEM, DAS DIESE DATEI LÖST
// Die Mahnsperren lagen an drei Orten: `NICHT_MAHNFAEHIG` und die
// Betragsprüfung in `runDunningRun()`, `checkDunningBlocks()` in der
// Eskalation, `ermittleStoppgrund()` im Versand-Consumer. Jede Stelle prüfte
// etwas anderes, keine prüfte alles, und keine konnte sagen, WARUM eine
// bestimmte Rechnung heute nicht gemahnt wurde.
//
// Für eine Mahnung ist das die falsche Bauform. Eine Mahnung an einen Kunden,
// der bezahlt hat, ist ein Vorwurf; eine an einen, dessen Rechnung storniert
// wurde, ist eine Forderung ohne Grundlage. Beides sind Vorgänge, die man
// nachträglich erklären können muss.
//
// ── DIE ZEHN SPERREN ───────────────────────────────────────────────────────
//   1  Rechnung existiert und gehört diesem Mandanten
//   2  Rechnung ist nicht gelöscht
//   3  Status ist mahnfähig (kein Entwurf, kein Endstatus)
//   4  Es steht überhaupt noch etwas offen (Teilzahlung berücksichtigt)
//   5  Die Rechnung ist fällig
//   6  Keine offene Gutschrift/Korrektur
//   7  Keine offene Beanstandung oder Kürzung im Widerspruch
//   8  Keine manuelle Sperre (block_dunning)
//   9  Der Abstand zur nächsten Stufe ist erreicht (eine Stufe je Zeitraum)
//  10  Es steht keine Mahnung derselben Stufe schon in der Warteschlange
//
// ── WAS DIESES GATE NICHT IST ──────────────────────────────────────────────
// Es ersetzt die bestehenden Prüfungen nicht, es fasst sie zusammen und
// ergänzt die zwei, die nirgends standen (5 und 10). `advanceDunning()` ruft
// es; die Vorfilter in `runDunningRun()` bleiben, weil sie ein Massenlauf
// billig vorsortieren, bevor er je Rechnung ein Dutzend Abfragen macht.
//
// ── ES SCHREIBT NICHTS ─────────────────────────────────────────────────────
// Auch aus einer Mahnübersicht über hundert Posten aufrufbar.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { NICHT_MAHNFAEHIGE_STATUS } from '../status-vokabular'
import { euroZuCent, centZuEuro } from '@/lib/geld'
import { heuteBerlin } from '@/lib/utils/timezone'
import { MAHNBREMSE_STATUS } from '@/lib/billing/core/differenzen'
import {
  DUNNING_DAYS,
  DUNNING_LEVEL_ORDER,
  DUNNING_LABELS,
  type DunningLevel,
} from '../core/dunning'

export type MahnSperre =
  | 'rechnung'
  | 'geloescht'
  | 'status'
  | 'festgeschrieben'
  | 'offener_betrag'
  | 'faelligkeit'
  | 'gutschrift'
  | 'beanstandung'
  | 'manuelle_sperre'
  | 'stufenabstand'
  | 'doppelmahnung'

export type SperrStand = 'frei' | 'gesperrt' | 'noch_nicht'

export interface MahnPruefpunkt {
  nummer: number
  sperre: MahnSperre
  titel: string
  stand: SperrStand
  befund: string
}

export type MahnGateStatus =
  /** Darf jetzt eskaliert und gemahnt werden. */
  | 'MAHNBAR'
  /** Etwas verbietet die Mahnung. */
  | 'GESPERRT'
  /** Nichts ist falsch, die Frist ist nur noch nicht erreicht. */
  | 'NOCH_NICHT_FAELLIG'

export interface MahnGateErgebnis {
  invoiceId: string
  invoiceNumber: string | null
  organizationId: string
  status: MahnGateStatus
  darfMahnen: boolean
  punkte: MahnPruefpunkt[]
  /** Befunde der Punkte, die die Mahnung verbieten. */
  sperren: string[]
  aktuelleStufe: DunningLevel
  naechsteStufe: DunningLevel | null
  gesamtCent: number
  bezahltCent: number
  offenCent: number
  tageUeberfaellig: number
}

/**
 * Die Pruefpunkte des Tors — EXPORTIERT, damit Pruefwerkzeuge ihre Anzahl
 * nicht abschreiben muessen.
 *
 * Der Grund steht in der Geschichte dieser Liste: mit Punkt 11
 * (festgeschrieben, Commit ccf5bb75) wuchs sie von zehn auf elf, und
 * scripts/verify-opos-mahnwesen-kette.mjs pruefte weiter gegen die fest
 * eingetragene Zahl 10. Der Lauf meldete daraufhin bei JEDER Rechnung
 * „unvollstaendige Begruendung" — obwohl das Tor vollstaendiger geworden
 * war als vorher. Eine Pruefung, die nach einer Verbesserung dauerhaft
 * rot steht, wird nach kurzer Zeit nicht mehr gelesen; dann verdeckt sie
 * genau die echten Befunde, fuer die sie da ist.
 */
export const MAHN_PRUEFPUNKTE: readonly { nummer: number; sperre: MahnSperre; titel: string }[] = [
  { nummer: 1, sperre: 'rechnung', titel: 'Rechnung vorhanden und eigener Mandant' },
  { nummer: 2, sperre: 'geloescht', titel: 'Rechnung nicht gelöscht' },
  { nummer: 3, sperre: 'status', titel: 'Status ist mahnfähig' },
  { nummer: 4, sperre: 'offener_betrag', titel: 'Es steht noch etwas offen' },
  { nummer: 5, sperre: 'faelligkeit', titel: 'Rechnung ist fällig' },
  { nummer: 6, sperre: 'gutschrift', titel: 'Keine offene Gutschrift/Korrektur' },
  { nummer: 7, sperre: 'beanstandung', titel: 'Keine offene Beanstandung' },
  { nummer: 8, sperre: 'manuelle_sperre', titel: 'Keine manuelle Sperre' },
  { nummer: 9, sperre: 'stufenabstand', titel: 'Abstand zur nächsten Stufe erreicht' },
  { nummer: 10, sperre: 'doppelmahnung', titel: 'Keine gleiche Mahnung in der Warteschlange' },
  { nummer: 11, sperre: 'festgeschrieben', titel: 'Rechnung ist festgeschrieben (frozen_at)' },
]

/** Interner Kurzname — der Rest der Datei nutzt ihn unveraendert weiter. */
const KATALOG = MAHN_PRUEFPUNKTE

/**
 * Status, in denen NICHT gemahnt werden darf.
 *
 * Seit dem 31.08.2026 KEINE eigene Liste mehr, sondern die gemeinsame aus
 * lib/billing/status-vokabular.ts. Vorher stand dieselbe Aufzaehlung hier
 * und in lib/billing/core/dunning.ts, gehalten von einem Test, der den
 * Quelltext der anderen Datei durchsuchte — das hielt die beiden
 * zusammen, aber nicht mit den drei weiteren Stellen, die dieselbe Frage
 * anders beantworteten.
 *
 * ── BEFUND 31.08.2026: DIE LISTE WAR HALB ─────────────────────────────
 *
 * `invoices_status_check` laesst live ZWEI Vokabulare zu — ein deutsches
 * (entwurf, geprueft, freigegeben, uebermittelt, quittiert, bezahlt,
 * storniert, strittig, …) und ein aelteres englisches (draft, sent, paid,
 * partial, rejected, disputed). Beide kommen im Bestand vor: die drei
 * Rechnungen in der Produktionsdatenbank stehen auf `sent`, `disputed`
 * und `paid`.
 *
 * Diese Liste kannte nur die deutsche Haelfte. Pruefpunkt 3 meldete
 * deshalb woertlich „Status ‚paid' ist mahnfaehig" und „Status
 * ‚disputed' ist mahnfaehig" — der Punkt hat live NIE etwas gesperrt.
 *
 * Aufgefallen ist es nicht, weil andere Punkte einsprangen: die bezahlte
 * Rechnung fiel ueber Punkt 4 (nichts offen), die bestrittene ueber
 * Punkt 7 (Beanstandung erfasst). Der gefaehrliche Fall lag daneben und
 * war offen: eine Rechnung auf `draft` oder `rejected` mit offenem Betrag
 * und ueberschrittener Faelligkeit haette alle zehn Punkte passiert. Ein
 * ENTWURF waere gemahnt worden.
 *
 * Deshalb stehen jetzt beide Vokabulare hier. `partial` /
 * `teilweise_bezahlt` fehlen mit Absicht: eine Teilzahlung ist mahnfaehig,
 * der Rest steht ja offen.
 */
export const GESPERRTE_STATUS: ReadonlySet<string> = new Set(NICHT_MAHNFAEHIGE_STATUS)

/** Warteschlangen-Status, die einen weiteren Versand derselben Stufe verbieten. */
const QUEUE_OFFEN: ReadonlySet<string> = new Set(['wartend', 'fehlgeschlagen'])

interface Sammler {
  setze(sperre: MahnSperre, stand: SperrStand, befund: string): void
}

function sammler(): Sammler & { alle(): MahnPruefpunkt[] } {
  const map = new Map<MahnSperre, MahnPruefpunkt>()
  return {
    setze(sperre, stand, befund) {
      const k = KATALOG.find(x => x.sperre === sperre)!
      map.set(sperre, { ...k, stand, befund })
    },
    alle() {
      return KATALOG.map(k => map.get(k.sperre) ?? {
        ...k,
        stand: 'gesperrt' as SperrStand,
        befund: 'Nicht geprüft — das Gate ist unvollständig durchgelaufen.',
      })
    },
  }
}

function euro(cent: number): string {
  return `${centZuEuro(cent).toFixed(2).replace('.', ',')} €`
}

/**
 * Prüft, ob eine Rechnung jetzt gemahnt werden darf. Schreibt nichts.
 */
export async function pruefeMahnbarkeit(
  admin: SupabaseClient,
  params: { invoiceId: string; organizationId: string },
): Promise<MahnGateErgebnis> {
  const { invoiceId, organizationId } = params
  const s = sammler()
  const heute = heuteBerlin()

  const leer = (status: MahnGateStatus): MahnGateErgebnis => ({
    invoiceId, invoiceNumber: null, organizationId, status,
    darfMahnen: false,
    punkte: s.alle(),
    sperren: s.alle().filter(p => p.stand === 'gesperrt').map(p => `${p.nummer}. ${p.titel}: ${p.befund}`),
    aktuelleStufe: 'offen', naechsteStufe: null,
    gesamtCent: 0, bezahltCent: 0, offenCent: 0, tageUeberfaellig: 0,
  })

  // ═══ 1 ═══
  const { data: invRoh, error: invErr } = await admin
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, status, total_amount, paid_amount, due_date, deleted_at, frozen_at, organization_id')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (invErr) {
    // Fail-closed: „nicht lesbar" ist nicht „mahnbar".
    for (const k of KATALOG) s.setze(k.sperre, 'gesperrt', `Rechnung nicht lesbar: ${invErr.message}`)
    return leer('GESPERRT')
  }
  if (!invRoh) {
    for (const k of KATALOG) {
      s.setze(k.sperre, 'gesperrt', 'Rechnung nicht gefunden oder gehört zu einem anderen Mandanten.')
    }
    return leer('GESPERRT')
  }

  const inv = invRoh as unknown as {
    id: string
    invoice_number: string | null
    invoice_number_formatted: string | null
    status: string
    total_amount: number | null
    paid_amount: number | null
    due_date: string | null
    deleted_at: string | null
    frozen_at: string | null
    organization_id: string
  }
  const nummer = inv.invoice_number_formatted || inv.invoice_number || null
  s.setze('rechnung', 'frei', `Rechnung ${nummer ?? invoiceId} gehört zu diesem Mandanten.`)

  // ═══ 2 ═══
  if (inv.deleted_at) {
    s.setze('geloescht', 'gesperrt', 'Die Rechnung ist gelöscht — eine gelöschte Forderung wird nicht gemahnt.')
  } else {
    s.setze('geloescht', 'frei', 'Nicht gelöscht.')
  }

  // ═══ 3 ═══
  if (GESPERRTE_STATUS.has(inv.status)) {
    const grund =
      inv.status === 'bezahlt' ? 'Die Rechnung ist als bezahlt gebucht.'
      : inv.status === 'storniert' ? 'Die Rechnung ist storniert — es gibt keine Forderung mehr.'
      : inv.status === 'strittig' ? 'Die Rechnung ist strittig und gehört in die Klärung von Hand.'
      : inv.status === 'abgeschrieben' ? 'Die Forderung ist abgeschrieben.'
      : ['entwurf', 'geprueft'].includes(inv.status) ? 'Die Rechnung war nie beim Kunden.'
      : `Status „${inv.status}" ist nicht mahnfähig.`
    s.setze('status', 'gesperrt', grund)
  } else {
    s.setze('status', 'frei', `Status „${inv.status}" ist mahnfähig.`)
  }

  // ═══ 11 — Festgeschrieben (frozen_at) ═══
  //
  // Eine Mahnung setzt eine RECHTSWIRKSAM AUSGESTELLTE Rechnung voraus.
  // Eine Rechnung wird im echten Lebenslauf beim Freigeben festgeschrieben
  // (`freezeInvoice` setzt Status → 'freigegeben' und `frozen_at`), und der
  // Versand verweigert jede Rechnung ohne `frozen_at`
  // (rechnung-versand.ts: „Rechnung ist nicht festgeschrieben").
  //
  // Eine Zeile, die einen Versand-Status behauptet, aber nie festgeschrieben
  // wurde, kann diesen Weg nicht gegangen sein — sie ist synthetisch
  // (Demo-/Testbestand). Genau so entstanden die drei Rechnungen im
  // Produktionsbestand (RE-2026-0001..0003, Kunde AE-TEST-0001, alle
  // `frozen_at` NULL, `sent_at` VOR `created_at`). Sie liefen bisher durch
  // alle zehn Punkte und wären mahnbar gewesen. Der Versandweg und der
  // SEPA-Einzug prüfen `frozen_at` bereits; das Mahnwesen war die letzte
  // Lücke. Fail-closed: keine Festschreibung, keine Mahnung.
  if (!inv.frozen_at) {
    s.setze('festgeschrieben', 'gesperrt',
      'Die Rechnung wurde nie festgeschrieben (frozen_at ist leer). Ohne Festschreibung wurde sie ' +
      'nie rechtswirksam ausgestellt und kann nicht gemahnt werden — eine solche Zeile ist synthetisch.')
  } else {
    s.setze('festgeschrieben', 'frei', `Festgeschrieben am ${inv.frozen_at}.`)
  }

  // ═══ 4 — Teilzahlung ═══
  const gesamtCent = euroZuCent(inv.total_amount ?? 0)
  const bezahltCent = euroZuCent(inv.paid_amount ?? 0)
  const offenCent = gesamtCent - bezahltCent

  if (offenCent <= 0) {
    s.setze('offener_betrag', 'gesperrt',
      bezahltCent > gesamtCent
        ? `Es wurde mehr gezahlt als gefordert (${euro(bezahltCent)} auf ${euro(gesamtCent)}) — hier ist eine Rückzahlung fällig, keine Mahnung.`
        : `Die Forderung ist ausgeglichen (${euro(bezahltCent)} von ${euro(gesamtCent)}).`)
  } else if (bezahltCent > 0) {
    // Teilzahlung mahnt weiter — aber nur über den Rest, und das muss im
    // Befund stehen, damit niemand den vollen Betrag anmahnt.
    s.setze('offener_betrag', 'frei',
      `Teilzahlung: ${euro(bezahltCent)} von ${euro(gesamtCent)} beglichen, offen bleiben ${euro(offenCent)}.`)
  } else {
    s.setze('offener_betrag', 'frei', `${euro(offenCent)} offen, keine Zahlung eingegangen.`)
  }

  // ═══ 5 — Fälligkeit ═══
  let tageUeberfaellig = 0
  if (!inv.due_date) {
    // Ohne Fälligkeitsdatum gibt es keinen Verzug — und ohne Verzug keine
    // Mahnung. `due_date` war live durchgängig NULL; ohne diese Prüfung
    // hinge die Mahnfähigkeit an einem Feld, das niemand gesetzt hat.
    s.setze('faelligkeit', 'gesperrt',
      'Die Rechnung hat kein Fälligkeitsdatum. Ohne Fälligkeit tritt kein Verzug ein, und ohne Verzug darf nicht gemahnt werden.')
  } else {
    const dueMs = new Date(inv.due_date + 'T00:00:00+01:00').getTime()
    const heuteMs = new Date(heute + 'T00:00:00+01:00').getTime()
    tageUeberfaellig = Math.max(0, Math.floor((heuteMs - dueMs) / 86400000))
    if (inv.due_date >= heute) {
      s.setze('faelligkeit', 'noch_nicht', `Fällig am ${inv.due_date} — noch nicht überschritten.`)
    } else {
      s.setze('faelligkeit', 'frei', `Seit ${tageUeberfaellig} Tag(en) überfällig (fällig war ${inv.due_date}).`)
    }
  }

  // ═══ 6 — Gutschrift/Korrektur ═══
  const { data: korrekturen, error: korrErr } = await admin
    .from('invoice_corrections')
    .select('id, status')
    .eq('original_invoice_id', invoiceId)
    .in('status', ['entwurf', 'freigegeben'])
    .is('deleted_at', null)

  if (korrErr) {
    s.setze('gutschrift', 'gesperrt', `Gutschriften nicht prüfbar: ${korrErr.message}`)
  } else if ((korrekturen ?? []).length > 0) {
    s.setze('gutschrift', 'gesperrt',
      `${korrekturen!.length} offene Gutschrift/Korrektur. Solange der Betrag der Forderung nicht feststeht, ` +
      `darf nicht gemahnt werden.`)
  } else {
    s.setze('gutschrift', 'frei', 'Keine offene Gutschrift oder Korrektur.')
  }

  // ═══ 7 — Beanstandung / Widerspruch ═══
  const { data: beanstandungen } = await admin
    .from('invoice_disputes')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'open')

  const { data: differenzen } = await admin
    .from('payment_differences')
    .select('id')
    .eq('invoice_id', invoiceId)
    .in('widerspruch_status', [...MAHNBREMSE_STATUS])

  const beanstandungenAnzahl = (beanstandungen ?? []).length
  const differenzenAnzahl = (differenzen ?? []).length
  if (beanstandungenAnzahl + differenzenAnzahl > 0) {
    s.setze('beanstandung', 'gesperrt',
      [
        beanstandungenAnzahl > 0 ? `${beanstandungenAnzahl} offene Beanstandung(en)` : null,
        differenzenAnzahl > 0 ? 'ein offener Widerspruch gegen eine Kürzung' : null,
      ].filter(Boolean).join(' und ') + '. Eine bestrittene Forderung wird nicht gemahnt.')
  } else {
    s.setze('beanstandung', 'frei', 'Keine Beanstandung, kein offener Widerspruch.')
  }

  // ═══ 8/9 — Mahneintrag ═══
  const { data: eintragRoh } = await admin
    .from('dunning_entries')
    .select('id, dunning_level, block_dunning, block_reason, next_dunning_at')
    .eq('invoice_id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  const eintrag = eintragRoh as unknown as {
    id: string
    dunning_level: string
    block_dunning: boolean | null
    block_reason: string | null
    next_dunning_at: string | null
  } | null

  const aktuelleStufe = (eintrag?.dunning_level as DunningLevel) ?? 'offen'

  if (eintrag?.block_dunning) {
    s.setze('manuelle_sperre', 'gesperrt',
      `Manuell gesperrt: ${eintrag.block_reason || 'kein Grund hinterlegt'}.`)
  } else {
    s.setze('manuelle_sperre', 'frei', 'Keine manuelle Sperre gesetzt.')
  }

  // ═══ 9 — genau eine Stufe je Zeitraum ═══
  const idx = DUNNING_LEVEL_ORDER.indexOf(aktuelleStufe)
  // length - 2 = 'inkasso_vorbereitung': höchste automatisch erreichbare Stufe.
  const naechsteStufe: DunningLevel | null =
    idx >= 0 && idx < DUNNING_LEVEL_ORDER.length - 2 ? DUNNING_LEVEL_ORDER[idx + 1] : null

  if (!naechsteStufe) {
    s.setze('stufenabstand', 'gesperrt',
      `Stufe „${DUNNING_LABELS[aktuelleStufe] ?? aktuelleStufe}" ist die höchste automatisch erreichbare — ` +
      `weiter geht es nur von Hand (Inkasso).`)
  } else if (tageUeberfaellig < DUNNING_DAYS[naechsteStufe]) {
    s.setze('stufenabstand', 'noch_nicht',
      `„${DUNNING_LABELS[naechsteStufe]}" ist ab ${DUNNING_DAYS[naechsteStufe]} Tagen Verzug vorgesehen, ` +
      `erreicht sind ${tageUeberfaellig}.`)
  } else if (eintrag?.next_dunning_at && eintrag.next_dunning_at > heute) {
    // Die Wiedervorlage ist die eigentliche Sperre gegen zwei Stufen im
    // selben Zeitraum: eine Mahnung muss beim Kunden gewesen sein, bevor
    // die nächste fällig wird.
    s.setze('stufenabstand', 'noch_nicht',
      `Die vorige Stufe ist noch in der Wiedervorlage bis ${eintrag.next_dunning_at}.`)
  } else {
    s.setze('stufenabstand', 'frei',
      `${tageUeberfaellig} Tage Verzug — „${DUNNING_LABELS[naechsteStufe]}" ist erreicht.`)
  }

  // ═══ 10 — keine Doppelmahnung ═══
  //
  // Der Consumer sperrt bereits gegen zwei parallele Versender derselben
  // Zeile (Statusfilter im UPDATE). Was er NICHT sieht: eine zweite Zeile
  // für dieselbe Rechnung, die ein früherer Lauf angelegt hat und die noch
  // nicht verschickt ist. Beide gingen raus.
  const { data: queue, error: queueErr } = await admin
    .from('dunning_email_queue')
    .select('id, status')
    .eq('invoice_id', invoiceId)
    .eq('organization_id', organizationId)

  if (queueErr) {
    s.setze('doppelmahnung', 'frei',
      `Die Mahn-Warteschlange war nicht prüfbar (${queueErr.message}) — der Consumer prüft vor jedem Versand erneut.`)
  } else {
    const offeneZeilen = (queue ?? []).filter(z => QUEUE_OFFEN.has((z as { status: string }).status))
    if (offeneZeilen.length > 0) {
      s.setze('doppelmahnung', 'gesperrt',
        `${offeneZeilen.length} Mahnschreiben für diese Rechnung warten bereits auf den Versand. ` +
        `Eine weitere Stufe jetzt hieße zwei Mahnungen in einer Zustellung.`)
    } else {
      s.setze('doppelmahnung', 'frei', 'Keine unverschickte Mahnung zu dieser Rechnung in der Warteschlange.')
    }
  }

  // ── Auswertung ──
  const punkte = s.alle()
  const gesperrt = punkte.filter(p => p.stand === 'gesperrt')
  const nochNicht = punkte.filter(p => p.stand === 'noch_nicht')

  const status: MahnGateStatus =
    gesperrt.length > 0 ? 'GESPERRT'
    : nochNicht.length > 0 ? 'NOCH_NICHT_FAELLIG'
    : 'MAHNBAR'

  return {
    invoiceId,
    invoiceNumber: nummer,
    organizationId,
    status,
    darfMahnen: status === 'MAHNBAR',
    punkte,
    sperren: gesperrt.map(p => `${p.nummer}. ${p.titel}: ${p.befund}`),
    aktuelleStufe,
    naechsteStufe,
    gesamtCent,
    bezahltCent,
    offenCent,
    tageUeberfaellig,
  }
}

/**
 * Fehler, den `advanceDunning()` wirft, wenn das Gate schließt.
 *
 * Eigener Typ, damit ein Aufrufer „gesperrt" von „kaputt" unterscheiden kann:
 * Ersteres ist das Gate bei der Arbeit und gehört in `blockiert`, Letzteres
 * ist ein Fehler.
 */
export class MahnungGesperrtError extends Error {
  readonly ergebnis: MahnGateErgebnis

  constructor(ergebnis: MahnGateErgebnis) {
    const gruende = ergebnis.status === 'NOCH_NICHT_FAELLIG'
      ? ergebnis.punkte.filter(p => p.stand === 'noch_nicht').map(p => p.befund)
      : ergebnis.sperren
    super(`Mahnung blockiert: ${gruende.join('; ')}`)
    this.name = 'MahnungGesperrtError'
    this.ergebnis = ergebnis
  }
}
