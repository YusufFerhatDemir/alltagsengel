// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION-GATE — ein Token für GENAU EINE Zahlungszuordnung
//
// PROBLEM, DAS DIESE DATEI LÖST
// Die erste echte Zahlungszuordnung dieses Systems steht noch aus
// (`payments` = 0). Sie ist der Vorgang mit der schlechtesten
// Fehlerbilanz im ganzen Geldpfad: eine falsch zugeordnete Zahlung macht
// gleichzeitig eine fremde Rechnung „bezahlt", lässt die richtige offen und
// in die Mahnung laufen, und wandert über `payment_allocations` unbemerkt in
// den DATEV-Export. Genau diese Kette war Befund C-1 aus Phase 7.
//
// `allocatePayment()` (lib/billing/core/payments.ts) prüft beim Buchen
// bereits sauber: Mandantenzaun, Endstatus, Überzahlung, Doppelzuordnung,
// abgebrochener Vorlauf. Was fehlte, ist die Stufe DAVOR — jemand, der VOR
// dem Commit einmal vollständig aufschreibt, was gleich passieren soll, und
// das Ergebnis gegenzeichnen lässt.
//
// ── WIE DAS GATE ARBEITET ──────────────────────────────────────────────────
//   1. `oeffneAllocationGate()` prüft ZEHN Punkte. Sind alle frei, entsteht
//      ein Token (UUID) mit Verfallszeit, das genau EINE Kombination aus
//      Mandant + Zahlung + Rechnung + Betrag deckt.
//   2. Der Mensch liest den Bericht und entscheidet.
//   3. `loeseAllocationGateEin()` prüft das Token, PRÜFT ALLE ZEHN PUNKTE
//      ERNEUT (zwischen Schritt 1 und 3 können Minuten liegen) und entwertet
//      das Token.
//   4. Erst danach ruft der Aufrufer `allocatePayment()`.
//
// ── WAS DIESES MODUL NICHT TUT ─────────────────────────────────────────────
// ‼️ Es bucht NICHT. ‼️
// Es exportiert keine Funktion, die `payment_allocations`, `invoices` oder
// `payments` schreibt. Die Zuordnung selbst bleibt bei `allocatePayment()`.
// Das ist Absicht: ein Gate, das auch bucht, ist keine unabhängige zweite
// Instanz mehr, sondern nur ein längerer Weg zur selben Buchung.
//
// ── WAS ES SEHR WOHL SCHREIBT ──────────────────────────────────────────────
// Zwei Zeilen in `billing_audit_trail` (`gate_geoeffnet`, `gate_eingeloest`).
// Das ist die Token-Ablage — bewusst dort und nicht im Arbeitsspeicher:
// eine Map im Prozess ist auf Vercel instanz-lokal, ein Token daraus
// überlebt keinen zweiten Aufruf und wäre als Einmal-Sperre wertlos. Ein
// Audit-Eintrag ist mandantengezäunt, überlebt den Prozess und ist
// nachträglich lesbar — was für einen Vorgang, den man später erklären muss,
// ohnehin die richtige Ablage ist.
//
// ── EHRLICHE GRENZE ────────────────────────────────────────────────────────
// Zwei gleichzeitige Einlösungen desselben Tokens können beide durchkommen
// (Lesen und Schreiben der Audit-Zeile sind nicht atomar). Das Gate ist
// eine bewusste Schwelle, NICHT der letzte Riegel. Der letzte Riegel bleibt
// `UNIQUE(payment_id, invoice_id)` auf `payment_allocations` — dort, wo er
// hingehört. Wer diese Zeile liest und das Gate trotzdem als Ersatz für den
// Index behandelt, hat sie falsch verstanden.
//
// ── KEIN BATCH ─────────────────────────────────────────────────────────────
// Ein Token deckt EINE Rechnung. `allocatePayment()` nimmt eine Liste
// entgegen; das Gate nicht. Eine Sammelzuordnung über ein einziges Token
// wäre genau die Abkürzung, die der Pilotbetrieb ausschließen soll.
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { euroZuCent, centZuEuro } from '@/lib/geld'
import { logBillingAction } from '@/lib/billing/core/audit'
import { isTerminalStatus, isValidInvoiceStatus, type InvoiceStatus } from '@/lib/billing/core/status-machine'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type GatePruefung =
  | 'zahlung'
  | 'rechnung'
  | 'mandant'
  | 'kunde'
  | 'betrag'
  | 'zahlungsrest'
  | 'rechnungsrest'
  | 'bestehende_zuordnung'
  | 'idempotenz'
  | 'audit'

export type GateStand = 'frei' | 'gesperrt'

export interface GatePunkt {
  nummer: number
  pruefung: GatePruefung
  titel: string
  stand: GateStand
  befund: string
}

export type GateStatus =
  /** Alle zehn Punkte frei — ein Token liegt bei. */
  | 'FREIGEGEBEN'
  /** Mindestens ein Punkt sperrt. Kein Token. */
  | 'GESPERRT'

/** Wie die Zahlung die Rechnung träfe. */
export type ZuordnungsArt = 'vollzahlung' | 'teilzahlung'

export interface AllocationGateErgebnis {
  status: GateStatus
  /** Nur bei FREIGEGEBEN gesetzt. */
  token: string | null
  /** ISO-Zeitpunkt, bis zu dem das Token gilt. Nur bei FREIGEGEBEN. */
  gueltigBis: string | null

  organizationId: string
  paymentId: string
  invoiceId: string
  betragCent: number

  /** Alle zehn Punkte, immer vollständig — auch die freien. */
  punkte: GatePunkt[]
  /** Befunde der sperrenden Punkte. */
  sperren: string[]

  // ── Was zur Gegenzeichnung auf dem Bericht steht ──
  invoiceNumber: string | null
  kundeName: string | null
  kundeId: string | null
  zahlerName: string | null
  zahlungsdatum: string | null
  rechnungGesamtCent: number
  rechnungBezahltCent: number
  rechnungOffenCent: number
  zahlungBetragCent: number
  zahlungZugeordnetCent: number
  zahlungRestCent: number
  /** Wie die Zuordnung die Rechnung träfe — `null`, wenn gesperrt. */
  zuordnungsArt: ZuordnungsArt | null
  /** Deterministischer Schlüssel dieser einen Zuordnung. */
  idempotencyKey: string
}

export interface OeffneGateParams {
  organizationId: string
  paymentId: string
  invoiceId: string
  /** Der Betrag, der zugeordnet werden soll. Positiv, in Cent. */
  betragCent: number
  /**
   * Kunde, der erwartet wird. Optional — ist er gesetzt, muss die Rechnung
   * ihm gehören. Ohne ihn bleibt Punkt 4 eine Anzeige statt einer Sperre,
   * und der Bericht sagt das auch.
   */
  erwarteterClientId?: string
  actorId: string
}

export interface EinloeseGateParams extends OeffneGateParams {
  token: string
}

export type EinloeseBefund =
  /** Token gültig, Prüfung erneut bestanden, Token entwertet. */
  | 'EINGELOEST'
  /** Kein solches Token für diese Zahlung. */
  | 'UNBEKANNT'
  /** Token existiert, wurde aber schon benutzt. */
  | 'BEREITS_EINGELOEST'
  /** Token abgelaufen. */
  | 'ABGELAUFEN'
  /** Token deckt eine andere Kombination als die angefragte. */
  | 'PASST_NICHT'
  /** Zwischen Öffnen und Einlösen hat sich der Zustand geändert. */
  | 'ZUSTAND_GEAENDERT'

export interface EinloeseErgebnis {
  befund: EinloeseBefund
  /** Nur bei 'EINGELOEST' true. Der Aufrufer darf DANN buchen — sonst nie. */
  darfBuchen: boolean
  begruendung: string
  /** Die erneute Prüfung. `null`, wenn es gar nicht erst dazu kam. */
  erneutePruefung: AllocationGateErgebnis | null
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/**
 * Gültigkeitsdauer eines Tokens.
 *
 * Kurz genug, dass sich der Rechnungszustand nicht unbemerkt ändert; lang
 * genug, dass ein Mensch den Bericht lesen und jemanden fragen kann. Die
 * eigentliche Sicherheit liegt nicht in der Frist, sondern darin, dass beim
 * Einlösen ALLE Punkte erneut geprüft werden — die Frist verhindert nur,
 * dass ein vergessenes Token Monate später auftaucht.
 */
export const TOKEN_GUELTIG_MINUTEN = 15

/** Audit-Aktionen, unter denen die Tokens abgelegt sind. */
export const AKTION_GEOEFFNET = 'gate_geoeffnet'
export const AKTION_EINGELOEST = 'gate_eingeloest'

const KATALOG: { nummer: number; pruefung: GatePruefung; titel: string }[] = [
  { nummer: 1,  pruefung: 'zahlung',              titel: 'Zahlung vorhanden und eigener Mandant' },
  { nummer: 2,  pruefung: 'rechnung',             titel: 'Rechnung vorhanden und nicht gelöscht' },
  { nummer: 3,  pruefung: 'mandant',              titel: 'Zahlung und Rechnung gehören demselben Mandanten' },
  { nummer: 4,  pruefung: 'kunde',                titel: 'Rechnung gehört dem erwarteten Kunden' },
  { nummer: 5,  pruefung: 'betrag',               titel: 'Betrag ist positiv und plausibel' },
  { nummer: 6,  pruefung: 'zahlungsrest',         titel: 'Zahlung hat noch genug nicht zugeordneten Rest' },
  { nummer: 7,  pruefung: 'rechnungsrest',        titel: 'Rechnung ist offen und nicht im Endstatus' },
  { nummer: 8,  pruefung: 'bestehende_zuordnung', titel: 'Keine bestehende Zuordnung dieser Zahlung auf diese Rechnung' },
  { nummer: 9,  pruefung: 'idempotenz',           titel: 'Idempotenzschlüssel frei' },
  { nummer: 10, pruefung: 'audit',                titel: 'Audit-Trail lesbar und beschreibbar' },
]

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function euro(cent: number): string {
  return `${centZuEuro(cent).toFixed(2).replace('.', ',')} €`
}

/**
 * Deterministischer Schlüssel EINER Zuordnung.
 *
 * Bewusst ohne Betrag: zwei Zuordnungen derselben Zahlung auf dieselbe
 * Rechnung sind auch dann eine Doppelbuchung, wenn die Beträge sich
 * unterscheiden. Der Schlüssel bildet genau das ab, was
 * `UNIQUE(payment_id, invoice_id)` auf `payment_allocations` durchsetzt —
 * eine dritte, abweichende Definition hier wäre eine Fehlerquelle.
 */
export function allocationIdempotencyKey(paymentId: string, invoiceId: string): string {
  return `alloc_${paymentId}_${invoiceId}`
}

function sammler() {
  const map = new Map<GatePruefung, GatePunkt>()
  return {
    setze(pruefung: GatePruefung, stand: GateStand, befund: string) {
      const k = KATALOG.find(x => x.pruefung === pruefung)!
      map.set(pruefung, { ...k, stand, befund })
    },
    alle(): GatePunkt[] {
      // Fail-closed: ein Punkt, der nie gesetzt wurde, gilt als gesperrt.
      // Ein vorzeitig abgebrochenes Gate darf nicht wie ein bestandenes
      // aussehen.
      return KATALOG.map(k => map.get(k.pruefung) ?? {
        ...k,
        stand: 'gesperrt' as GateStand,
        befund: 'Nicht geprüft — das Gate ist unvollständig durchgelaufen.',
      })
    },
  }
}

interface TokenNutzlast {
  token: string
  organization_id: string
  payment_id: string
  invoice_id: string
  betrag_cent: number
  gueltig_bis: string
  idempotency_key: string
}

// ---------------------------------------------------------------------------
// Prüfung
// ---------------------------------------------------------------------------

/**
 * Prüft eine geplante Zuordnung, ohne etwas zu verändern.
 *
 * Herausgelöst aus `oeffneAllocationGate()`, weil sie an zwei Stellen
 * gebraucht wird: beim Öffnen und beim Einlösen. Genau darin liegt der
 * Wert des Gates — die Prüfung beim Einlösen ist dieselbe, nicht eine
 * abgespeckte.
 */
export async function pruefeZuordnung(
  admin: SupabaseClient,
  params: OeffneGateParams,
): Promise<AllocationGateErgebnis> {
  const { organizationId, paymentId, invoiceId, betragCent, erwarteterClientId } = params
  const s = sammler()
  const idempotencyKey = allocationIdempotencyKey(paymentId, invoiceId)

  const bauen = (
    zusatz: Partial<AllocationGateErgebnis> = {},
  ): AllocationGateErgebnis => {
    const punkte = s.alle()
    const gesperrt = punkte.filter(p => p.stand === 'gesperrt')
    return {
      status: gesperrt.length > 0 ? 'GESPERRT' : 'FREIGEGEBEN',
      token: null,
      gueltigBis: null,
      organizationId, paymentId, invoiceId, betragCent,
      punkte,
      sperren: gesperrt.map(p => `${p.nummer}. ${p.titel}: ${p.befund}`),
      invoiceNumber: null,
      kundeName: null,
      kundeId: null,
      zahlerName: null,
      zahlungsdatum: null,
      rechnungGesamtCent: 0,
      rechnungBezahltCent: 0,
      rechnungOffenCent: 0,
      zahlungBetragCent: 0,
      zahlungZugeordnetCent: 0,
      zahlungRestCent: 0,
      zuordnungsArt: null,
      idempotencyKey,
      ...zusatz,
    }
  }

  // ═══ 1 — Zahlung ═══
  const { data: zahlungRoh, error: zahlungErr } = await admin
    .from('payments')
    .select('id, organization_id, amount_cents, allocated_cents, payment_date, payer_name, deleted_at')
    .eq('id', paymentId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (zahlungErr) {
    for (const k of KATALOG) s.setze(k.pruefung, 'gesperrt', `Zahlung nicht lesbar: ${zahlungErr.message}`)
    return bauen()
  }
  if (!zahlungRoh) {
    for (const k of KATALOG) {
      s.setze(k.pruefung, 'gesperrt', 'Zahlung nicht gefunden oder gehört zu einem anderen Mandanten.')
    }
    return bauen()
  }

  const zahlung = zahlungRoh as unknown as {
    id: string
    organization_id: string
    amount_cents: number | null
    allocated_cents: number | null
    payment_date: string | null
    payer_name: string | null
    deleted_at: string | null
  }

  if (zahlung.deleted_at) {
    s.setze('zahlung', 'gesperrt', 'Die Zahlung ist gelöscht — eine gelöschte Zahlung wird nicht zugeordnet.')
  } else {
    s.setze('zahlung', 'frei',
      `Zahlung über ${euro(zahlung.amount_cents ?? 0)} vom ${zahlung.payment_date ?? '—'} gehört diesem Mandanten.`)
  }

  const zahlungBetragCent = zahlung.amount_cents ?? 0
  const zahlungZugeordnetCent = zahlung.allocated_cents ?? 0
  const zahlungRestCent = zahlungBetragCent - zahlungZugeordnetCent

  // ═══ 2 — Rechnung ═══
  //
  // Bewusst OHNE organization_id-Filter gelesen, aber MIT Auswertung der
  // Spalte: nur so lässt sich „gehört einem anderen Mandanten" (Punkt 3)
  // von „existiert nicht" (Punkt 2) unterscheiden. Ein Filter machte aus
  // beidem dieselbe Meldung — und die falsche Meldung schickt jemanden an
  // die falsche Stelle suchen. Gelesen wird ausschließlich die
  // Mandantenkennung, kein fremder Inhalt.
  const { data: rechnungRoh, error: rechnungErr } = await admin
    .from('invoices')
    .select('id, organization_id, invoice_number, invoice_number_formatted, status, total_amount, paid_amount, client_id, deleted_at, client:clients(first_name, last_name)')
    .eq('id', invoiceId)
    .maybeSingle()

  if (rechnungErr) {
    s.setze('rechnung', 'gesperrt', `Rechnung nicht lesbar: ${rechnungErr.message}`)
    return bauen({ zahlungBetragCent, zahlungZugeordnetCent, zahlungRestCent, zahlerName: zahlung.payer_name, zahlungsdatum: zahlung.payment_date })
  }
  if (!rechnungRoh) {
    s.setze('rechnung', 'gesperrt', 'Rechnung nicht gefunden.')
    s.setze('mandant', 'gesperrt', 'Ohne Rechnung ist der Mandantenabgleich nicht möglich.')
    return bauen({ zahlungBetragCent, zahlungZugeordnetCent, zahlungRestCent, zahlerName: zahlung.payer_name, zahlungsdatum: zahlung.payment_date })
  }

  const rohClient = (rechnungRoh as { client?: unknown }).client
  const kunde = (Array.isArray(rohClient) ? rohClient[0] : rohClient) as
    { first_name?: string | null; last_name?: string | null } | null

  const rechnung = rechnungRoh as unknown as {
    id: string
    organization_id: string
    invoice_number: string | null
    invoice_number_formatted: string | null
    status: string
    total_amount: number | null
    paid_amount: number | null
    client_id: string | null
    deleted_at: string | null
  }

  const invoiceNumber = rechnung.invoice_number_formatted || rechnung.invoice_number || null
  const kundeName = kunde ? `${kunde.first_name ?? ''} ${kunde.last_name ?? ''}`.trim() || null : null

  if (rechnung.deleted_at) {
    s.setze('rechnung', 'gesperrt', 'Die Rechnung ist gelöscht.')
  } else {
    s.setze('rechnung', 'frei', `Rechnung ${invoiceNumber ?? invoiceId} existiert und ist nicht gelöscht.`)
  }

  // ═══ 3 — Mandant ═══
  if (rechnung.organization_id !== organizationId) {
    s.setze('mandant', 'gesperrt',
      'Die Rechnung gehört zu einem ANDEREN Mandanten als die Zahlung. Eine Zuordnung über die '
      + 'Mandantengrenze hinweg würde einen fremden Forderungsbestand verändern.')
  } else {
    s.setze('mandant', 'frei', 'Zahlung und Rechnung gehören demselben Mandanten.')
  }

  // ═══ 4 — Kunde ═══
  if (!erwarteterClientId) {
    // Kein Sperrpunkt, aber der Bericht muss sagen, dass hier nichts
    // geprüft wurde — sonst liest sich „frei" wie ein bestandener Abgleich.
    s.setze('kunde', 'frei',
      `Rechnung gehört zu ${kundeName ?? 'einem Kunden ohne Namen'} (${rechnung.client_id ?? '—'}). `
      + `Kein erwarteter Kunde übergeben — dieser Punkt wurde NICHT gegengeprüft.`)
  } else if (rechnung.client_id !== erwarteterClientId) {
    s.setze('kunde', 'gesperrt',
      `Die Rechnung gehört zu Kunde ${rechnung.client_id ?? '—'}, erwartet war ${erwarteterClientId}.`)
  } else {
    s.setze('kunde', 'frei', `Rechnung gehört zum erwarteten Kunden ${kundeName ?? erwarteterClientId}.`)
  }

  // ═══ 5 — Betrag ═══
  if (!Number.isInteger(betragCent)) {
    s.setze('betrag', 'gesperrt', `Betrag ${betragCent} ist keine ganze Zahl in Cent.`)
  } else if (betragCent <= 0) {
    s.setze('betrag', 'gesperrt', `Betrag ${euro(betragCent)} ist nicht positiv — eine Zuordnung braucht einen Betrag.`)
  } else {
    s.setze('betrag', 'frei', `${euro(betragCent)} sollen zugeordnet werden.`)
  }

  // ═══ 6 — Rest der Zahlung ═══
  if (zahlungRestCent <= 0) {
    s.setze('zahlungsrest', 'gesperrt',
      `Die Zahlung ist bereits vollständig zugeordnet (${euro(zahlungZugeordnetCent)} von ${euro(zahlungBetragCent)}).`)
  } else if (betragCent > zahlungRestCent) {
    s.setze('zahlungsrest', 'gesperrt',
      `Es sollen ${euro(betragCent)} zugeordnet werden, nicht zugeordnet sind aber nur noch `
      + `${euro(zahlungRestCent)} (von ${euro(zahlungBetragCent)}).`)
  } else {
    s.setze('zahlungsrest', 'frei',
      `${euro(zahlungRestCent)} der Zahlung sind noch nicht zugeordnet, ${euro(betragCent)} werden gebraucht.`)
  }

  // ═══ 7 — Rest der Rechnung ═══
  const rechnungGesamtCent = euroZuCent(rechnung.total_amount ?? 0)
  const rechnungBezahltCent = euroZuCent(rechnung.paid_amount ?? 0)
  const rechnungOffenCent = rechnungGesamtCent - rechnungBezahltCent
  let zuordnungsArt: ZuordnungsArt | null = null

  if (isValidInvoiceStatus(rechnung.status) && isTerminalStatus(rechnung.status as InvoiceStatus)) {
    s.setze('rechnungsrest', 'gesperrt',
      `Die Rechnung steht im Endstatus „${rechnung.status}" — `
      + `allocatePayment() weist eine Zuordnung darauf ab.`)
  } else if (rechnungOffenCent <= 0) {
    s.setze('rechnungsrest', 'gesperrt',
      `Auf der Rechnung ist nichts mehr offen (${euro(rechnungBezahltCent)} von ${euro(rechnungGesamtCent)} bezahlt).`)
  } else if (betragCent > rechnungOffenCent) {
    s.setze('rechnungsrest', 'gesperrt',
      `Es sollen ${euro(betragCent)} zugeordnet werden, offen sind aber nur ${euro(rechnungOffenCent)}. `
      + `Eine Überzahlung gehört über den Überzahlungsweg gebucht, nicht über das Pilot-Gate.`)
  } else {
    zuordnungsArt = rechnungBezahltCent + betragCent >= rechnungGesamtCent ? 'vollzahlung' : 'teilzahlung'
    s.setze('rechnungsrest', 'frei',
      `${euro(rechnungOffenCent)} von ${euro(rechnungGesamtCent)} offen, Status „${rechnung.status}". `
      + `Die Zuordnung wäre eine ${zuordnungsArt === 'vollzahlung' ? 'VOLLzahlung' : 'TEILzahlung'} `
      + `(danach ${euro(rechnungGesamtCent - rechnungBezahltCent - betragCent)} offen).`)
  }

  // ═══ 8 — bestehende Zuordnung ═══
  const { data: bestehend, error: bestehendErr } = await admin
    .from('payment_allocations')
    .select('id, amount_cents, allocation_type, allocated_at')
    .eq('organization_id', organizationId)
    .eq('payment_id', paymentId)
    .eq('invoice_id', invoiceId)

  if (bestehendErr) {
    s.setze('bestehende_zuordnung', 'gesperrt', `Bestehende Zuordnungen nicht prüfbar: ${bestehendErr.message}`)
  } else if ((bestehend ?? []).length > 0) {
    const z = bestehend![0] as unknown as { amount_cents: number | null; allocated_at: string | null }
    s.setze('bestehende_zuordnung', 'gesperrt',
      `Für diese Zahlung und diese Rechnung existiert BEREITS eine Zuordnung über `
      + `${euro(z.amount_cents ?? 0)} (angelegt ${z.allocated_at ?? 'unbekannt'}). `
      + `UNIQUE(payment_id, invoice_id) würde eine zweite mit 23505 abweisen.`)
  } else {
    s.setze('bestehende_zuordnung', 'frei', 'Keine bestehende Zuordnung dieser Zahlung auf diese Rechnung.')
  }

  // ═══ 9 — Idempotenz ═══
  //
  // Der Schlüssel ist die Kombination aus Zahlung und Rechnung. Ein
  // früherer Lauf hat ihn im Audit-Trail hinterlassen, sobald ein Token
  // eingelöst wurde. Findet sich dort eine Einlösung, war der Vorgang
  // bereits freigegeben — dann darf kein zweites Token entstehen.
  const { data: eingeloest, error: eingeloestErr } = await admin
    .from('billing_audit_trail')
    .select('id, new_state, created_at')
    .eq('organization_id', organizationId)
    .eq('entity_type', 'payment_allocation')
    .eq('entity_id', paymentId)
    .eq('action', AKTION_EINGELOEST)

  if (eingeloestErr) {
    s.setze('idempotenz', 'gesperrt', `Audit-Trail nicht lesbar: ${eingeloestErr.message}`)
    s.setze('audit', 'gesperrt', `Audit-Trail nicht lesbar: ${eingeloestErr.message}`)
  } else {
    const treffer = (eingeloest ?? []).filter(z => {
      const n = (z as { new_state?: Record<string, unknown> | null }).new_state
      return n?.idempotency_key === idempotencyKey
    })
    if (treffer.length > 0) {
      s.setze('idempotenz', 'gesperrt',
        `Der Schlüssel ${idempotencyKey} wurde bereits eingelöst `
        + `(${(treffer[0] as { created_at?: string }).created_at ?? 'unbekannt'}). `
        + `Diese Zuordnung ist schon einmal freigegeben worden.`)
    } else {
      s.setze('idempotenz', 'frei', `Schlüssel ${idempotencyKey} ist noch nicht eingelöst.`)
    }
    s.setze('audit', 'frei',
      `Audit-Trail lesbar (${(eingeloest ?? []).length} Gate-Einlösung(en) zu dieser Zahlung).`)
  }

  return bauen({
    invoiceNumber,
    kundeName,
    kundeId: rechnung.client_id,
    zahlerName: zahlung.payer_name,
    zahlungsdatum: zahlung.payment_date,
    rechnungGesamtCent,
    rechnungBezahltCent,
    rechnungOffenCent,
    zahlungBetragCent,
    zahlungZugeordnetCent,
    zahlungRestCent,
    zuordnungsArt,
  })
}

// ---------------------------------------------------------------------------
// Öffnen
// ---------------------------------------------------------------------------

/**
 * Prüft die geplante Zuordnung und stellt bei Erfolg ein Einmal-Token aus.
 *
 * Schreibt bei Erfolg EINE Zeile in `billing_audit_trail`. Bucht nichts.
 */
export async function oeffneAllocationGate(
  admin: SupabaseClient,
  params: OeffneGateParams,
): Promise<AllocationGateErgebnis> {
  const ergebnis = await pruefeZuordnung(admin, params)
  if (ergebnis.status !== 'FREIGEGEBEN') return ergebnis

  const token = randomUUID()
  const gueltigBis = new Date(Date.now() + TOKEN_GUELTIG_MINUTEN * 60_000).toISOString()

  const nutzlast: TokenNutzlast = {
    token,
    organization_id: params.organizationId,
    payment_id: params.paymentId,
    invoice_id: params.invoiceId,
    betrag_cent: params.betragCent,
    gueltig_bis: gueltigBis,
    idempotency_key: ergebnis.idempotencyKey,
  }

  // Fail-closed: lässt sich das Token nicht ablegen, gibt es kein Token.
  // Ein Token ohne Ablage wäre beim Einlösen unbekannt — der Aufrufer
  // liefe in einen unerklärlichen 'UNBEKANNT'-Befund.
  try {
    await logBillingAction(admin, {
      entityType: 'payment_allocation',
      organizationId: params.organizationId,
      entityId: params.paymentId,
      action: AKTION_GEOEFFNET,
      newState: nutzlast as unknown as Record<string, unknown>,
      reason: `Pilot-Gate geöffnet für Rechnung ${ergebnis.invoiceNumber ?? params.invoiceId}`,
      actorId: params.actorId,
    })
  } catch (err) {
    return {
      ...ergebnis,
      status: 'GESPERRT',
      token: null,
      gueltigBis: null,
      punkte: ergebnis.punkte.map(p => p.pruefung === 'audit'
        ? { ...p, stand: 'gesperrt' as GateStand, befund: `Token nicht ablegbar: ${(err as Error).message}` }
        : p),
      sperren: [
        `10. Audit-Trail lesbar und beschreibbar: Token nicht ablegbar: ${(err as Error).message}`,
      ],
    }
  }

  return { ...ergebnis, token, gueltigBis }
}

// ---------------------------------------------------------------------------
// Einlösen
// ---------------------------------------------------------------------------

/**
 * Prüft ein Token, wiederholt die vollständige Prüfung und entwertet es.
 *
 * Gibt `darfBuchen: true` NUR zurück, wenn beides gilt: das Token ist
 * gültig UND die zehn Punkte sind erneut alle frei.
 *
 * Der Aufrufer bucht danach selbst. Bricht er zwischen Einlösung und
 * Buchung ab, ist das Token verbraucht und der Vorgang muss neu
 * freigegeben werden. Das ist die gewollte Richtung: lieber ein
 * verlorenes Token als eine Buchung, für die niemand mehr sagen kann, ob
 * sie freigegeben war.
 */
export async function loeseAllocationGateEin(
  admin: SupabaseClient,
  params: EinloeseGateParams,
): Promise<EinloeseErgebnis> {
  const { token, organizationId, paymentId, invoiceId, betragCent } = params

  const { data: zeilen, error } = await admin
    .from('billing_audit_trail')
    .select('id, action, new_state, created_at')
    .eq('organization_id', organizationId)
    .eq('entity_type', 'payment_allocation')
    .eq('entity_id', paymentId)
    .in('action', [AKTION_GEOEFFNET, AKTION_EINGELOEST])

  if (error) {
    return {
      befund: 'UNBEKANNT',
      darfBuchen: false,
      begruendung: `Token nicht prüfbar — Audit-Trail nicht lesbar: ${error.message}`,
      erneutePruefung: null,
    }
  }

  const alle = (zeilen ?? []) as unknown as {
    action: string
    new_state: Record<string, unknown> | null
    created_at: string | null
  }[]

  const geoeffnet = alle.find(z => z.action === AKTION_GEOEFFNET && z.new_state?.token === token)
  if (!geoeffnet) {
    return {
      befund: 'UNBEKANNT',
      darfBuchen: false,
      begruendung: 'Für diese Zahlung existiert kein offenes Gate mit diesem Token.',
      erneutePruefung: null,
    }
  }

  if (alle.some(z => z.action === AKTION_EINGELOEST && z.new_state?.token === token)) {
    return {
      befund: 'BEREITS_EINGELOEST',
      darfBuchen: false,
      begruendung:
        'Dieses Token wurde bereits eingelöst. Ein Token deckt genau eine Zuordnung — '
        + 'für einen weiteren Vorgang ein neues Gate öffnen.',
      erneutePruefung: null,
    }
  }

  const nutzlast = geoeffnet.new_state as unknown as TokenNutzlast
  if (
    nutzlast.organization_id !== organizationId
    || nutzlast.payment_id !== paymentId
    || nutzlast.invoice_id !== invoiceId
    || nutzlast.betrag_cent !== betragCent
  ) {
    return {
      befund: 'PASST_NICHT',
      darfBuchen: false,
      begruendung:
        `Das Token deckt Rechnung ${nutzlast.invoice_id} über ${euro(nutzlast.betrag_cent)}, `
        + `angefragt wurde Rechnung ${invoiceId} über ${euro(betragCent)}. `
        + `Ein Token gilt für genau eine Kombination.`,
      erneutePruefung: null,
    }
  }

  if (new Date(nutzlast.gueltig_bis).getTime() < Date.now()) {
    return {
      befund: 'ABGELAUFEN',
      darfBuchen: false,
      begruendung:
        `Das Token war bis ${nutzlast.gueltig_bis} gültig. `
        + `Nach Ablauf gilt der geprüfte Zustand nicht mehr — neu öffnen.`,
      erneutePruefung: null,
    }
  }

  // ── Die zweite, vollständige Prüfung ──
  const erneut = await pruefeZuordnung(admin, params)

  // Punkt 9 sperrt jetzt zu Recht nicht: es gibt noch keine Einlösung
  // für diesen Schlüssel. Sperrt irgendetwas anderes, hat sich zwischen
  // Öffnen und Einlösen der Zustand geändert.
  if (erneut.status !== 'FREIGEGEBEN') {
    return {
      befund: 'ZUSTAND_GEAENDERT',
      darfBuchen: false,
      begruendung:
        `Zwischen Freigabe und Einlösung hat sich der Zustand geändert: ${erneut.sperren.join(' | ')}`,
      erneutePruefung: erneut,
    }
  }

  // ── Entwerten ──
  //
  // Fail-closed: gelingt die Entwertung nicht, wird NICHT gebucht. Ein
  // Token, das als benutzt gilt, ohne dass das irgendwo steht, ist kein
  // Einmal-Token mehr.
  try {
    await logBillingAction(admin, {
      entityType: 'payment_allocation',
      organizationId,
      entityId: paymentId,
      action: AKTION_EINGELOEST,
      previousState: nutzlast as unknown as Record<string, unknown>,
      newState: {
        token,
        invoice_id: invoiceId,
        betrag_cent: betragCent,
        idempotency_key: erneut.idempotencyKey,
        zuordnungs_art: erneut.zuordnungsArt,
      },
      reason: `Pilot-Gate eingelöst für Rechnung ${erneut.invoiceNumber ?? invoiceId}`,
      actorId: params.actorId,
    })
  } catch (err) {
    return {
      befund: 'ZUSTAND_GEAENDERT',
      darfBuchen: false,
      begruendung:
        `Das Token konnte nicht entwertet werden (${(err as Error).message}). `
        + `Ohne Entwertung wird nicht gebucht — sonst wäre es kein Einmal-Token.`,
      erneutePruefung: erneut,
    }
  }

  return {
    befund: 'EINGELOEST',
    darfBuchen: true,
    begruendung:
      `Token entwertet. Freigegeben ist GENAU EINE Zuordnung: ${euro(betragCent)} `
      + `von Zahlung ${paymentId} auf Rechnung ${erneut.invoiceNumber ?? invoiceId} `
      + `(${erneut.zuordnungsArt}).`,
    erneutePruefung: erneut,
  }
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

/** Der Bericht zur Gegenzeichnung — ein Vorgang, eine Seite. */
export function gateBerichtText(e: AllocationGateErgebnis): string {
  const z: string[] = []
  const linie = '─'.repeat(70)

  z.push('═'.repeat(70))
  z.push('ZAHLUNGSZUORDNUNG — FREIGABEPRÜFUNG (es wurde NICHTS gebucht)')
  z.push('═'.repeat(70))
  z.push(`Status : ${e.status}`)
  z.push(`Token  : ${e.token ?? '— kein Token, die Zuordnung ist gesperrt'}`)
  if (e.gueltigBis) z.push(`gültig bis: ${e.gueltigBis}`)
  z.push(linie)
  z.push(`Rechnung  : ${e.invoiceNumber ?? e.invoiceId}`)
  z.push(`Kunde     : ${e.kundeName ?? '—'} (${e.kundeId ?? '—'})`)
  z.push(`Zahler    : ${e.zahlerName ?? '—'}   Zahlungsdatum ${e.zahlungsdatum ?? '—'}`)
  z.push(`Mandant   : ${e.organizationId}`)
  z.push(linie)
  z.push(`Rechnung gesamt : ${euro(e.rechnungGesamtCent)}`)
  z.push(`davon bezahlt   : ${euro(e.rechnungBezahltCent)}`)
  z.push(`offen           : ${euro(e.rechnungOffenCent)}`)
  z.push('')
  z.push(`Zahlung gesamt  : ${euro(e.zahlungBetragCent)}`)
  z.push(`davon zugeordnet: ${euro(e.zahlungZugeordnetCent)}`)
  z.push(`Rest            : ${euro(e.zahlungRestCent)}`)
  z.push('')
  z.push(`ZUZUORDNEN      : ${euro(e.betragCent)}   → ${e.zuordnungsArt ?? '—'}`)
  z.push(`Idempotenz      : ${e.idempotencyKey}`)
  z.push(linie)
  for (const p of e.punkte) {
    z.push(`${p.stand === 'frei' ? '✔' : '✖'} ${String(p.nummer).padStart(2)}. ${p.titel}`)
    z.push(`      ${p.befund}`)
  }
  z.push(linie)
  if (e.status === 'FREIGEGEBEN') {
    z.push('Alle zehn Punkte frei. Das Token deckt GENAU DIESE eine Zuordnung und')
    z.push(`verfällt nach ${TOKEN_GUELTIG_MINUTEN} Minuten. Beim Einlösen wird erneut vollständig geprüft.`)
  } else {
    z.push('Gesperrt — kein Token ausgestellt:')
    for (const sp of e.sperren) z.push(`  ✖ ${sp}`)
  }
  z.push('═'.repeat(70))
  return z.join('\n')
}
