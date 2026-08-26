// ═══════════════════════════════════════════════════════════════════════════
// MONEY-PATH-ABSTIMMUNG — geht die Kette lückenlos auf?
//
// PROBLEM, DAS DIESE DATEI LÖST
// Jede Stufe des Geldpfads hat ihre eigene Prüfung, und jede prüft sich
// selbst: der Rechnungs-Preflight sieht die Rechnung, das Mahn-Gate sieht die
// Mahnstufe, der DATEV-Validator sieht die CSV. Keine sieht die NAHT.
//
// Die schwersten Befunde dieses Repos saßen aber genau dort:
//   · C-1 (Phase 7): Zuordnungszeile vorhanden, `invoices.paid_amount` nicht
//     fortgeschrieben — die Rechnung galt weiter als offen und wurde gemahnt,
//     während DATEV die Zahlung längst buchte.
//   · M-3 (Phase 7): `dunning_entries.amount_paid_cents` lief gegen die
//     Rechnung auseinander.
//   · M-1 (Phase 6A): Monatsabschlüsse landeten in der Stamm-Organisation.
//
// Allen dreien ist dasselbe gemeinsam: JEDE einzelne Tabelle sah für sich
// genommen plausibel aus. Sichtbar wird der Fehler erst, wenn man die Stufen
// GEGENEINANDER hält.
//
// ── DIE NEUN STUFEN ────────────────────────────────────────────────────────
//   1 Leistung        service_records  → invoice_items
//   2 Rechnung        invoices
//   3 Versand         invoices.sent_at ↔ invoice_email_log
//   4 Zahlung         payments
//   5 Zuordnung       payment_allocations
//   6 Rechnungsstatus invoices.paid_amount / status  ↔ Summe der Zuordnungen
//   7 Buchhaltung     dunning_entries  ↔ Rechnung
//   8 DATEV           datev_exports    ↔ Rechnung und Zuordnung
//   9 Audit           billing_audit_trail
//
// ── DIE DREI BEFUNDE ───────────────────────────────────────────────────────
//   CONSISTENT    Die Stufe geht auf.
//   ORPHAN_FOUND  Ein Datensatz hängt an nichts: eine Zuordnung ohne Zahlung,
//                 eine Rechnungsposition ohne Rechnung, ein Zahlungseingang
//                 ohne Import. Der Datensatz existiert, sein Bezug nicht.
//   MISMATCH      Beide Seiten existieren, sagen aber Verschiedenes: die
//                 Rechnung trägt 60 €, die Summe ihrer Zuordnungen 45 €.
//
// Die Unterscheidung ist keine Kosmetik. Ein Waise ist meist ein
// abgebrochener Lauf und oft löschbar; ein Auseinanderlaufen ist ein
// Buchungsfehler und muss ausgeglichen werden. Wer beides „Fehler" nennt,
// schickt jemanden mit der falschen Erwartung in die Prüfung.
//
// ── MANDANTENZAUN ──────────────────────────────────────────────────────────
// JEDE Abfrage dieser Datei filtert auf `organization_id`. Der Dienst läuft
// mit service_role (BYPASSRLS) — ohne den Filter stimmte die Abstimmung über
// Mandantengrenzen hinweg ab und meldete fremde Zeilen als Waisen.
// `__tests__/pilot/reconciliation.test.ts` prüft jede einzelne Abfrage.
//
// ── ES SCHREIBT NICHTS ─────────────────────────────────────────────────────
// Kein insert, kein update, kein delete. Eine Abstimmung, die repariert,
// ist keine Abstimmung mehr — sie verdeckt genau das, was sie finden soll.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { euroZuCent, centZuEuro } from '@/lib/geld'
import { heuteBerlin } from '@/lib/utils/timezone'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type StufenBefund = 'CONSISTENT' | 'ORPHAN_FOUND' | 'MISMATCH' | 'UNGEPRUEFT'

export type StufeId =
  | 'leistung'
  | 'rechnung'
  | 'versand'
  | 'zahlung'
  | 'zuordnung'
  | 'rechnungsstatus'
  | 'buchhaltung'
  | 'datev'
  | 'audit'

export const STUFEN_REIHENFOLGE: StufeId[] = [
  'leistung', 'rechnung', 'versand', 'zahlung', 'zuordnung',
  'rechnungsstatus', 'buchhaltung', 'datev', 'audit',
]

export const STUFEN_TITEL: Record<StufeId, string> = {
  leistung: '1 · Leistung → Rechnungsposition',
  rechnung: '2 · Rechnung',
  versand: '3 · Versand',
  zahlung: '4 · Zahlung',
  zuordnung: '5 · Zuordnung',
  rechnungsstatus: '6 · Rechnungsstatus',
  buchhaltung: '7 · Buchhaltung (Mahnkonto)',
  datev: '8 · DATEV',
  audit: '9 · Audit',
}

/**
 * Ein einzelner Befund.
 *
 * `bezug` trägt IMMER die vollständige Rückverfolgung: Mandant, Kunde,
 * Rechnung, Zahlung — soweit ermittelbar. Ein Befund ohne Rückverfolgung
 * ist für den, der ihn abarbeiten muss, wertlos.
 */
export interface AbstimmBefund {
  /** Stabiler Schlüssel — Tests und Oberfläche prüfen darauf. */
  code: string
  art: 'ORPHAN_FOUND' | 'MISMATCH'
  stufe: StufeId
  meldung: string
  bezug: {
    organizationId: string
    customerId?: string | null
    invoiceId?: string | null
    invoiceNumber?: string | null
    paymentId?: string | null
    paymentReference?: string | null
    datensatzId?: string | null
  }
  /** Bei MISMATCH: was steht auf beiden Seiten? */
  differenz?: { erwartetCent: number; gefundenCent: number }
}

export interface AbstimmStufe {
  id: StufeId
  titel: string
  befund: StufenBefund
  /** Klartext: was geprüft wurde und was herauskam. */
  zusammenfassung: string
  /** Zahlen, die auch ins Protokoll gehören. */
  kennzahlen: Record<string, number>
  befunde: AbstimmBefund[]
}

export interface AbstimmBericht {
  stichtag: string
  organizationId: string
  /** Immer false — dieses Modul verändert nichts. */
  repariert: false
  /** Gesamtbefund: der ernsteste der neun Stufen. */
  gesamt: StufenBefund
  stufen: AbstimmStufe[]
  /** Alle Befunde über alle Stufen, in Reihenfolge der Kette. */
  alleBefunde: AbstimmBefund[]
  /** Abfragen, die nicht ausgeführt werden konnten. */
  hinweise: string[]
}

export interface AbstimmParams {
  organizationId: string
  /** Obergrenze je Tabelle. Wird sie erreicht, steht das in `hinweise`. */
  limit?: number
}

export const ABSTIMM_STANDARD_LIMIT = 2000

/** Rangfolge: vorne = ernster. */
const RANG: StufenBefund[] = ['MISMATCH', 'ORPHAN_FOUND', 'UNGEPRUEFT', 'CONSISTENT']

function ernster(a: StufenBefund, b: StufenBefund): StufenBefund {
  return RANG.indexOf(a) <= RANG.indexOf(b) ? a : b
}

function euro(cent: number): string {
  return `${centZuEuro(cent).toFixed(2).replace('.', ',')} €`
}

// ---------------------------------------------------------------------------
// Ladehilfe
// ---------------------------------------------------------------------------

interface Lader {
  hinweise: string[]
  limit: number
}

/**
 * Liest eine Tabelle mandantengezäunt. Ein Lesefehler wirft NICHT — er
 * landet in `hinweise`, und die betroffene Stufe wird UNGEPRUEFT.
 *
 * Der Unterschied ist der Kern: „keine Waisen gefunden" und „konnte nicht
 * nachsehen" dürfen nicht dieselbe Ausgabe erzeugen. Genau daran scheitern
 * Abstimmungen, die einen Fehler als leere Liste behandeln.
 */
async function lade<T>(
  l: Lader,
  label: string,
  bauen: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[] | null> {
  try {
    const { data, error } = await bauen()
    if (error) {
      l.hinweise.push(`${label}: ${(error as { message?: string })?.message ?? 'unbekannter Fehler'}`)
      return null
    }
    const zeilen = (data ?? []) as T[]
    if (zeilen.length >= l.limit) {
      l.hinweise.push(
        `${label}: die Obergrenze von ${l.limit} Zeilen wurde erreicht — `
        + `die Abstimmung ist damit UNVOLLSTÄNDIG, nicht sauber.`,
      )
    }
    return zeilen
  } catch (err) {
    l.hinweise.push(`${label}: ${(err as Error).message}`)
    return null
  }
}

function stufe(
  id: StufeId,
  befunde: AbstimmBefund[] | null,
  kennzahlen: Record<string, number>,
  zusammenfassungOk: string,
): AbstimmStufe {
  if (befunde === null) {
    return {
      id, titel: STUFEN_TITEL[id], befund: 'UNGEPRUEFT',
      zusammenfassung: 'Mindestens eine Abfrage dieser Stufe war nicht ausführbar — siehe Hinweise.',
      kennzahlen, befunde: [],
    }
  }
  const hatMismatch = befunde.some(b => b.art === 'MISMATCH')
  const hatWaise = befunde.some(b => b.art === 'ORPHAN_FOUND')
  const befund: StufenBefund = hatMismatch ? 'MISMATCH' : hatWaise ? 'ORPHAN_FOUND' : 'CONSISTENT'
  return {
    id,
    titel: STUFEN_TITEL[id],
    befund,
    zusammenfassung: befund === 'CONSISTENT'
      ? zusammenfassungOk
      : `${befunde.length} Befund(e): `
        + `${befunde.filter(b => b.art === 'MISMATCH').length} Auseinanderlaufen, `
        + `${befunde.filter(b => b.art === 'ORPHAN_FOUND').length} Waise(n).`,
    kennzahlen,
    befunde,
  }
}

// ---------------------------------------------------------------------------
// Datensätze
// ---------------------------------------------------------------------------

interface RechnungZeile {
  id: string
  invoice_number_formatted: string | null
  invoice_number: string | null
  client_id: string | null
  status: string
  total_amount: number | null
  paid_amount: number | null
  sent_at: string | null
  frozen_at: string | null
  created_at: string | null
  deleted_at: string | null
}

interface PositionZeile {
  id: string
  invoice_id: string | null
  service_record_id: string | null
  amount: number | null
}

interface ZahlungZeile {
  id: string
  amount_cents: number | null
  allocated_cents: number | null
  payment_date: string | null
  bank_reference: string | null
  payer_reference: string | null
  deleted_at: string | null
}

interface ZuordnungZeile {
  id: string
  payment_id: string | null
  invoice_id: string | null
  amount_cents: number | null
  created_at: string | null
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Stimmt die gesamte Kette für einen Mandanten ab. Schreibt NICHTS.
 */
export async function stimmeMoneyPathAb(
  admin: SupabaseClient,
  params: AbstimmParams,
): Promise<AbstimmBericht> {
  const orgId = params.organizationId
  const l: Lader = { hinweise: [], limit: params.limit ?? ABSTIMM_STANDARD_LIMIT }

  const bezugsRahmen = (zusatz: Partial<AbstimmBefund['bezug']> = {}) => ({
    organizationId: orgId,
    ...zusatz,
  })

  // ── Rohdaten, alle mandantengezäunt ──
  const rechnungen = await lade<RechnungZeile>(l, 'invoices', () => admin
    .from('invoices')
    .select('id, invoice_number_formatted, invoice_number, client_id, status, total_amount, paid_amount, sent_at, frozen_at, created_at, deleted_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(l.limit))

  const positionen = await lade<PositionZeile>(l, 'invoice_items', () => admin
    .from('invoice_items')
    .select('id, invoice_id, service_record_id, amount')
    .eq('organization_id', orgId)
    .limit(l.limit))

  const nachweise = await lade<{ id: string; client_id: string | null; status: string; amount: number | null }>(
    l, 'service_records', () => admin
      .from('service_records')
      .select('id, client_id, status, amount')
      .eq('organization_id', orgId)
      .limit(l.limit))

  const zahlungen = await lade<ZahlungZeile>(l, 'payments', () => admin
    .from('payments')
    .select('id, amount_cents, allocated_cents, payment_date, bank_reference, payer_reference, deleted_at')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .limit(l.limit))

  const zuordnungen = await lade<ZuordnungZeile>(l, 'payment_allocations', () => admin
    .from('payment_allocations')
    .select('id, payment_id, invoice_id, amount_cents, created_at')
    .eq('organization_id', orgId)
    .limit(l.limit))

  const versandzeilen = await lade<{ id: string; invoice_id: string | null; status: string; versendet_am: string | null }>(
    l, 'invoice_email_log', () => admin
      .from('invoice_email_log')
      .select('id, invoice_id, status, versendet_am')
      .eq('organization_id', orgId)
      .limit(l.limit))

  const mahnkonten = await lade<{ id: string; invoice_id: string | null; amount_due_cents: number | null; amount_paid_cents: number | null; dunning_level: string }>(
    l, 'dunning_entries', () => admin
      .from('dunning_entries')
      .select('id, invoice_id, amount_due_cents, amount_paid_cents, dunning_level')
      .eq('organization_id', orgId)
      .limit(l.limit))

  const datevLaeufe = await lade<{ id: string; zeitraum_von: string | null; zeitraum_bis: string | null; status: string }>(
    l, 'datev_exports', () => admin
      .from('datev_exports')
      .select('id, zeitraum_von, zeitraum_bis, status')
      .eq('organization_id', orgId)
      .limit(l.limit))

  const auditZeilen = await lade<{ id: string; entity_type: string; entity_id: string; action: string }>(
    l, 'billing_audit_trail', () => admin
      .from('billing_audit_trail')
      .select('id, entity_type, entity_id, action')
      .eq('organization_id', orgId)
      .limit(l.limit))

  // ── Nachschlagewerke ──
  const rechnungNach = new Map<string, RechnungZeile>()
  for (const r of rechnungen ?? []) rechnungNach.set(r.id, r)
  const zahlungNach = new Map<string, ZahlungZeile>()
  for (const z of zahlungen ?? []) zahlungNach.set(z.id, z)
  const nachweisIds = new Set((nachweise ?? []).map(n => n.id))

  const nummer = (r: RechnungZeile | undefined) =>
    r ? (r.invoice_number_formatted || r.invoice_number || null) : null

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 1 — Leistung → Rechnungsposition
  // ═══════════════════════════════════════════════════════════════════
  let s1: AbstimmBefund[] | null = null
  if (positionen !== null && nachweise !== null && rechnungen !== null) {
    s1 = []
    for (const p of positionen) {
      if (!p.invoice_id || !rechnungNach.has(p.invoice_id)) {
        s1.push({
          code: 'position_ohne_rechnung',
          art: 'ORPHAN_FOUND',
          stufe: 'leistung',
          meldung:
            `Rechnungsposition ${p.id} verweist auf Rechnung ${p.invoice_id ?? '(leer)'}, `
            + `die es bei diesem Mandanten nicht (mehr) gibt. Der Betrag ${euro(euroZuCent(p.amount ?? 0))} `
            + `hängt an keiner Forderung.`,
          bezug: bezugsRahmen({ invoiceId: p.invoice_id, datensatzId: p.id }),
        })
        continue
      }
      if (p.service_record_id && !nachweisIds.has(p.service_record_id)) {
        const r = rechnungNach.get(p.invoice_id)
        s1.push({
          code: 'position_ohne_nachweis',
          art: 'ORPHAN_FOUND',
          stufe: 'leistung',
          meldung:
            `Rechnungsposition ${p.id} beruft sich auf den Leistungsnachweis `
            + `${p.service_record_id}, den es bei diesem Mandanten nicht gibt. `
            + `Die Position ist damit nicht belegt.`,
          bezug: bezugsRahmen({
            invoiceId: p.invoice_id,
            invoiceNumber: nummer(r),
            customerId: r?.client_id ?? null,
            datensatzId: p.id,
          }),
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 2 — Rechnung
  // ═══════════════════════════════════════════════════════════════════
  let s2: AbstimmBefund[] | null = null
  if (rechnungen !== null && positionen !== null) {
    s2 = []
    const summeJeRechnung = new Map<string, number>()
    const anzahlJeRechnung = new Map<string, number>()
    for (const p of positionen) {
      if (!p.invoice_id) continue
      summeJeRechnung.set(p.invoice_id, (summeJeRechnung.get(p.invoice_id) ?? 0) + euroZuCent(p.amount ?? 0))
      anzahlJeRechnung.set(p.invoice_id, (anzahlJeRechnung.get(p.invoice_id) ?? 0) + 1)
    }

    for (const r of rechnungen) {
      if (!r.client_id) {
        s2.push({
          code: 'rechnung_ohne_kunde',
          art: 'ORPHAN_FOUND',
          stufe: 'rechnung',
          meldung: `Rechnung ${nummer(r) ?? r.id} trägt keinen Kunden — sie ist keinem Debitor zuzuordnen.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r) }),
        })
      }
      // Entwürfe ohne Positionen sind normal — sie entstehen leer.
      if (r.status !== 'entwurf' && (anzahlJeRechnung.get(r.id) ?? 0) === 0) {
        s2.push({
          code: 'rechnung_ohne_positionen',
          art: 'ORPHAN_FOUND',
          stufe: 'rechnung',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} (Status „${r.status}") hat keine einzige Position, `
            + `trägt aber ${euro(euroZuCent(r.total_amount ?? 0))}. Der Betrag ist nicht hergeleitet.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 3 — Versand
  // ═══════════════════════════════════════════════════════════════════
  let s3: AbstimmBefund[] | null = null
  if (rechnungen !== null && versandzeilen !== null) {
    s3 = []
    const protokollJeRechnung = new Map<string, { erfolg: number; gesamt: number }>()
    for (const v of versandzeilen) {
      if (!v.invoice_id) {
        s3.push({
          code: 'protokoll_ohne_rechnung',
          art: 'ORPHAN_FOUND',
          stufe: 'versand',
          meldung: `Versandprotokoll ${v.id} trägt keine Rechnung — der Eintrag ist keinem Vorgang zuzuordnen.`,
          bezug: bezugsRahmen({ datensatzId: v.id }),
        })
        continue
      }
      if (!rechnungNach.has(v.invoice_id)) {
        s3.push({
          code: 'protokoll_ohne_rechnung',
          art: 'ORPHAN_FOUND',
          stufe: 'versand',
          meldung:
            `Versandprotokoll ${v.id} verweist auf Rechnung ${v.invoice_id}, `
            + `die es bei diesem Mandanten nicht (mehr) gibt.`,
          bezug: bezugsRahmen({ invoiceId: v.invoice_id, datensatzId: v.id }),
        })
        continue
      }
      const stand = protokollJeRechnung.get(v.invoice_id) ?? { erfolg: 0, gesamt: 0 }
      stand.gesamt++
      if (v.status === 'versendet') stand.erfolg++
      protokollJeRechnung.set(v.invoice_id, stand)
    }

    for (const r of rechnungen) {
      const stand = protokollJeRechnung.get(r.id)
      // `sent_at` ist die Behauptung „ist raus". Ohne Protokollzeile lässt
      // sie sich nicht belegen — genau die Lücke, die niemand bemerkt,
      // solange man nur eine der beiden Seiten ansieht.
      if (r.sent_at && (stand?.erfolg ?? 0) === 0) {
        s3.push({
          code: 'versendet_ohne_protokoll',
          art: 'MISMATCH',
          stufe: 'versand',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} trägt sent_at = ${r.sent_at}, aber in `
            + `invoice_email_log steht keine erfolgreiche Zustellung. Der Versand ist behauptet, nicht belegt.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
        })
      }
      if (!r.sent_at && (stand?.erfolg ?? 0) > 0) {
        s3.push({
          code: 'protokoll_ohne_versanddatum',
          art: 'MISMATCH',
          stufe: 'versand',
          meldung:
            `Für Rechnung ${nummer(r) ?? r.id} gibt es ${stand!.erfolg} erfolgreiche Zustellung(en) `
            + `im Protokoll, aber sent_at ist leer. Ein Wiederholungslauf verschickte sie erneut.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 4 — Zahlung
  // ═══════════════════════════════════════════════════════════════════
  let s4: AbstimmBefund[] | null = null
  if (zahlungen !== null && zuordnungen !== null) {
    s4 = []
    const summeJeZahlung = new Map<string, number>()
    for (const z of zuordnungen) {
      if (!z.payment_id) continue
      summeJeZahlung.set(z.payment_id, (summeJeZahlung.get(z.payment_id) ?? 0) + (z.amount_cents ?? 0))
    }
    for (const z of zahlungen) {
      const gebucht = z.allocated_cents ?? 0
      const tatsaechlich = summeJeZahlung.get(z.id) ?? 0
      if (gebucht !== tatsaechlich) {
        s4.push({
          code: 'zahlung_allocated_abweichung',
          art: 'MISMATCH',
          stufe: 'zahlung',
          meldung:
            `Zahlung ${z.id} führt allocated_cents = ${euro(gebucht)}, die Summe ihrer `
            + `Zuordnungszeilen ergibt aber ${euro(tatsaechlich)}. Genau dieses Auseinanderlaufen `
            + `war Befund C-1: die Zuordnungszeile steht, der Zähler nicht.`,
          bezug: bezugsRahmen({
            paymentId: z.id,
            paymentReference: z.bank_reference ?? z.payer_reference ?? null,
          }),
          differenz: { erwartetCent: tatsaechlich, gefundenCent: gebucht },
        })
      }
      if (gebucht > (z.amount_cents ?? 0)) {
        s4.push({
          code: 'zahlung_ueberzugeordnet',
          art: 'MISMATCH',
          stufe: 'zahlung',
          meldung:
            `Zahlung ${z.id} ist mit ${euro(gebucht)} höher zugeordnet als sie beträgt `
            + `(${euro(z.amount_cents ?? 0)}).`,
          bezug: bezugsRahmen({
            paymentId: z.id,
            paymentReference: z.bank_reference ?? z.payer_reference ?? null,
          }),
          differenz: { erwartetCent: z.amount_cents ?? 0, gefundenCent: gebucht },
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 5 — Zuordnung
  // ═══════════════════════════════════════════════════════════════════
  let s5: AbstimmBefund[] | null = null
  if (zuordnungen !== null && zahlungen !== null && rechnungen !== null) {
    s5 = []
    const gesehen = new Set<string>()
    for (const z of zuordnungen) {
      if (!z.payment_id || !zahlungNach.has(z.payment_id)) {
        s5.push({
          code: 'zuordnung_ohne_zahlung',
          art: 'ORPHAN_FOUND',
          stufe: 'zuordnung',
          meldung:
            `Zuordnung ${z.id} über ${euro(z.amount_cents ?? 0)} verweist auf Zahlung `
            + `${z.payment_id ?? '(leer)'}, die es bei diesem Mandanten nicht (mehr) gibt. `
            + `DATEV liest diese Tabelle — der Betrag würde gebucht.`,
          bezug: bezugsRahmen({ paymentId: z.payment_id, invoiceId: z.invoice_id, datensatzId: z.id }),
        })
      }
      if (!z.invoice_id || !rechnungNach.has(z.invoice_id)) {
        s5.push({
          code: 'zuordnung_ohne_rechnung',
          art: 'ORPHAN_FOUND',
          stufe: 'zuordnung',
          meldung:
            `Zuordnung ${z.id} über ${euro(z.amount_cents ?? 0)} verweist auf Rechnung `
            + `${z.invoice_id ?? '(leer)'}, die es bei diesem Mandanten nicht (mehr) gibt.`,
          bezug: bezugsRahmen({ paymentId: z.payment_id, invoiceId: z.invoice_id, datensatzId: z.id }),
        })
      }
      if (z.payment_id && z.invoice_id) {
        const schluessel = `${z.payment_id}|${z.invoice_id}`
        if (gesehen.has(schluessel)) {
          s5.push({
            code: 'zuordnung_doppelt',
            art: 'MISMATCH',
            stufe: 'zuordnung',
            meldung:
              `Zahlung ${z.payment_id} ist MEHRFACH auf Rechnung ${z.invoice_id} zugeordnet. `
              + `UNIQUE(payment_id, invoice_id) müsste das verhindern — findet sich das hier, `
              + `fehlt der Index oder er wurde umgangen.`,
            bezug: bezugsRahmen({ paymentId: z.payment_id, invoiceId: z.invoice_id, datensatzId: z.id }),
          })
        }
        gesehen.add(schluessel)
      }
      if ((z.amount_cents ?? 0) <= 0) {
        s5.push({
          code: 'zuordnung_ohne_betrag',
          art: 'MISMATCH',
          stufe: 'zuordnung',
          meldung: `Zuordnung ${z.id} trägt ${euro(z.amount_cents ?? 0)} — eine Zuordnung ohne Betrag bewegt nichts.`,
          bezug: bezugsRahmen({ paymentId: z.payment_id, invoiceId: z.invoice_id, datensatzId: z.id }),
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 6 — Rechnungsstatus
  // ═══════════════════════════════════════════════════════════════════
  let s6: AbstimmBefund[] | null = null
  if (rechnungen !== null && zuordnungen !== null) {
    s6 = []
    const summeJeRechnung = new Map<string, number>()
    for (const z of zuordnungen) {
      if (!z.invoice_id) continue
      summeJeRechnung.set(z.invoice_id, (summeJeRechnung.get(z.invoice_id) ?? 0) + (z.amount_cents ?? 0))
    }

    for (const r of rechnungen) {
      const gesamtCent = euroZuCent(r.total_amount ?? 0)
      const gebuchtCent = euroZuCent(r.paid_amount ?? 0)
      const zugeordnetCent = summeJeRechnung.get(r.id) ?? 0

      if (gebuchtCent !== zugeordnetCent) {
        s6.push({
          code: 'paid_amount_abweichung',
          art: 'MISMATCH',
          stufe: 'rechnungsstatus',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} führt paid_amount = ${euro(gebuchtCent)}, die Summe ihrer `
            + `Zuordnungen ergibt ${euro(zugeordnetCent)}. Ist paid_amount zu niedrig, gilt eine `
            + `bezahlte Forderung als offen und wird GEMAHNT (Befund C-1).`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
          differenz: { erwartetCent: zugeordnetCent, gefundenCent: gebuchtCent },
        })
      }

      const istBezahlt = r.status === 'bezahlt'
      const sollteBezahltSein = gesamtCent > 0 && zugeordnetCent >= gesamtCent
      if (istBezahlt && !sollteBezahltSein) {
        s6.push({
          code: 'status_bezahlt_ohne_deckung',
          art: 'MISMATCH',
          stufe: 'rechnungsstatus',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} steht auf „bezahlt", zugeordnet sind aber nur `
            + `${euro(zugeordnetCent)} von ${euro(gesamtCent)}. Die Differenz fällt aus dem `
            + `Forderungsbestand heraus, ohne dass Geld geflossen ist.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
          differenz: { erwartetCent: gesamtCent, gefundenCent: zugeordnetCent },
        })
      }
      if (!istBezahlt && sollteBezahltSein && r.status !== 'storniert' && r.status !== 'abgeschrieben') {
        s6.push({
          code: 'status_offen_trotz_deckung',
          art: 'MISMATCH',
          stufe: 'rechnungsstatus',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} ist vollständig zugeordnet (${euro(zugeordnetCent)} von `
            + `${euro(gesamtCent)}), steht aber auf „${r.status}". Sie läuft weiter im Mahnwesen.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
          differenz: { erwartetCent: gesamtCent, gefundenCent: zugeordnetCent },
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 7 — Buchhaltung (Mahnkonto)
  // ═══════════════════════════════════════════════════════════════════
  let s7: AbstimmBefund[] | null = null
  if (mahnkonten !== null && rechnungen !== null) {
    s7 = []
    for (const m of mahnkonten) {
      if (!m.invoice_id || !rechnungNach.has(m.invoice_id)) {
        s7.push({
          code: 'mahnkonto_ohne_rechnung',
          art: 'ORPHAN_FOUND',
          stufe: 'buchhaltung',
          meldung:
            `Mahneintrag ${m.id} verweist auf Rechnung ${m.invoice_id ?? '(leer)'}, `
            + `die es bei diesem Mandanten nicht (mehr) gibt.`,
          bezug: bezugsRahmen({ invoiceId: m.invoice_id, datensatzId: m.id }),
        })
        continue
      }
      const r = rechnungNach.get(m.invoice_id)!
      const gebuchtCent = euroZuCent(r.paid_amount ?? 0)
      if ((m.amount_paid_cents ?? 0) !== gebuchtCent) {
        s7.push({
          code: 'mahnkonto_bezahlt_abweichung',
          art: 'MISMATCH',
          stufe: 'buchhaltung',
          meldung:
            `Mahneintrag zu ${nummer(r) ?? r.id} führt ${euro(m.amount_paid_cents ?? 0)} als bezahlt, `
            + `die Rechnung ${euro(gebuchtCent)}. Die Mahnübersicht weist den Forderungsbestand `
            + `damit falsch aus (Befund M-3).`,
          bezug: bezugsRahmen({
            invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id, datensatzId: m.id,
          }),
          differenz: { erwartetCent: gebuchtCent, gefundenCent: m.amount_paid_cents ?? 0 },
        })
      }
      if (m.dunning_level !== 'bezahlt' && r.status === 'bezahlt') {
        s7.push({
          code: 'mahnkonto_offen_trotz_bezahlt',
          art: 'MISMATCH',
          stufe: 'buchhaltung',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} ist bezahlt, ihr Mahneintrag steht aber auf `
            + `„${m.dunning_level}". Ein Mahnlauf greift zwar auf die Rechnung zu — die `
            + `Mahnübersicht zeigt den Posten trotzdem als offen.`,
          bezug: bezugsRahmen({
            invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id, datensatzId: m.id,
          }),
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 8 — DATEV
  // ═══════════════════════════════════════════════════════════════════
  //
  // GRENZE, die hier ausdrücklich benannt gehört: es gibt keine Tabelle
  // `datev_buchungen`. Der Export erzeugt eine CSV in Storage und EINE
  // Zeile in `datev_exports` mit Zeitraum und Status. Abstimmbar ist
  // deshalb nur die ABDECKUNG — ob ein erfolgreicher Lauf existiert, der
  // den Zeitpunkt eines Geschäftsvorfalls überhaupt umfasst —, nicht der
  // Inhalt der Datei. Der Inhalt ist Gegenstand des DATEV-Validators
  // (`lib/billing/datev/datev-validator.ts`).
  let s8: AbstimmBefund[] | null = null
  if (datevLaeufe !== null && zuordnungen !== null && rechnungen !== null) {
    s8 = []
    const erfolgreich = datevLaeufe.filter(d => d.status !== 'fehler' && d.zeitraum_von && d.zeitraum_bis)
    const abgedeckt = (datum: string | null): boolean => {
      if (!datum) return false
      const tag = datum.slice(0, 10)
      return erfolgreich.some(d => tag >= d.zeitraum_von!.slice(0, 10) && tag <= d.zeitraum_bis!.slice(0, 10))
    }

    // Nur prüfen, wenn überhaupt schon exportiert wurde. Vor dem ersten
    // Export ist „nicht abgedeckt" der Normalzustand und keine Meldung wert.
    if (erfolgreich.length > 0) {
      const spaetestesEnde = erfolgreich
        .map(d => d.zeitraum_bis!.slice(0, 10))
        .sort()
        .at(-1)!

      for (const z of zuordnungen) {
        const tag = z.created_at?.slice(0, 10)
        if (!tag || tag > spaetestesEnde) continue
        if (!abgedeckt(z.created_at)) {
          const r = z.invoice_id ? rechnungNach.get(z.invoice_id) : undefined
          s8.push({
            code: 'zuordnung_nicht_exportiert',
            art: 'MISMATCH',
            stufe: 'datev',
            meldung:
              `Zuordnung ${z.id} vom ${tag} über ${euro(z.amount_cents ?? 0)} liegt in keinem `
              + `erfolgreichen DATEV-Zeitraum, obwohl bis ${spaetestesEnde} exportiert wurde. `
              + `Der Zahlungseingang fehlt in der Buchhaltung — der Debitorensaldo ist zu hoch.`,
            bezug: bezugsRahmen({
              paymentId: z.payment_id, invoiceId: z.invoice_id,
              invoiceNumber: nummer(r), customerId: r?.client_id ?? null, datensatzId: z.id,
            }),
          })
        }
      }

      for (const r of rechnungen) {
        const tag = r.created_at?.slice(0, 10)
        if (!tag || tag > spaetestesEnde) continue
        if (r.status === 'entwurf') continue
        if (!abgedeckt(r.created_at)) {
          s8.push({
            code: 'rechnung_nicht_exportiert',
            art: 'MISMATCH',
            stufe: 'datev',
            meldung:
              `Rechnung ${nummer(r) ?? r.id} vom ${tag} liegt in keinem erfolgreichen `
              + `DATEV-Zeitraum, obwohl bis ${spaetestesEnde} exportiert wurde. `
              + `Der Erlös fehlt in der Buchhaltung.`,
            bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
          })
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stufe 9 — Audit
  // ═══════════════════════════════════════════════════════════════════
  let s9: AbstimmBefund[] | null = null
  if (auditZeilen !== null && rechnungen !== null && zuordnungen !== null) {
    s9 = []
    const auditIds = new Set(auditZeilen.map(a => a.entity_id))

    for (const r of rechnungen) {
      // Der Entwurf entsteht über die RPC und schreibt seinen Audit-Eintrag
      // auf die client_id (entity_type 'invoice_draft'). Erst ab
      // Festschreibung ist ein Eintrag auf die Rechnung selbst zu erwarten.
      if (!r.frozen_at) continue
      if (!auditIds.has(r.id)) {
        s9.push({
          code: 'rechnung_ohne_audit',
          art: 'ORPHAN_FOUND',
          stufe: 'audit',
          meldung:
            `Rechnung ${nummer(r) ?? r.id} ist seit ${r.frozen_at} festgeschrieben, hat aber keinen `
            + `einzigen Eintrag in billing_audit_trail. Die Festschreibung ist nicht nachweisbar.`,
          bezug: bezugsRahmen({ invoiceId: r.id, invoiceNumber: nummer(r), customerId: r.client_id }),
        })
      }
    }

    for (const z of zuordnungen) {
      if (!z.payment_id) continue
      if (!auditIds.has(z.payment_id)) {
        s9.push({
          code: 'zuordnung_ohne_audit',
          art: 'ORPHAN_FOUND',
          stufe: 'audit',
          meldung:
            `Zuordnung ${z.id} über ${euro(z.amount_cents ?? 0)} hat keinen Audit-Eintrag zu `
            + `Zahlung ${z.payment_id}. Eine Geldbuchung ohne Protokollzeile ist nachträglich `
            + `nicht zu erklären.`,
          bezug: bezugsRahmen({ paymentId: z.payment_id, invoiceId: z.invoice_id, datensatzId: z.id }),
        })
      }
    }
  }

  // ── Zusammensetzen ──
  const stufen: AbstimmStufe[] = [
    stufe('leistung', s1, { positionen: positionen?.length ?? 0, nachweise: nachweise?.length ?? 0 },
      `${positionen?.length ?? 0} Position(en) hängen an einer bestehenden Rechnung und, wo angegeben, an einem bestehenden Nachweis.`),
    stufe('rechnung', s2, { rechnungen: rechnungen?.length ?? 0 },
      `${rechnungen?.length ?? 0} Rechnung(en) tragen einen Kunden und, sofern nicht Entwurf, mindestens eine Position.`),
    stufe('versand', s3, { protokollzeilen: versandzeilen?.length ?? 0, versendet: (rechnungen ?? []).filter(r => r.sent_at).length },
      'Jede als versendet markierte Rechnung hat eine erfolgreiche Protokollzeile — und umgekehrt.'),
    stufe('zahlung', s4, { zahlungen: zahlungen?.length ?? 0 },
      `${zahlungen?.length ?? 0} Zahlung(en): allocated_cents deckt sich mit der Summe der Zuordnungszeilen.`),
    stufe('zuordnung', s5, { zuordnungen: zuordnungen?.length ?? 0 },
      `${zuordnungen?.length ?? 0} Zuordnung(en) verweisen auf bestehende Zahlungen und Rechnungen, keine doppelt.`),
    stufe('rechnungsstatus', s6, { rechnungen: rechnungen?.length ?? 0 },
      'paid_amount und Status jeder Rechnung decken sich mit der Summe ihrer Zuordnungen.'),
    stufe('buchhaltung', s7, { mahnkonten: mahnkonten?.length ?? 0 },
      `${mahnkonten?.length ?? 0} Mahnkonto/-konten stimmen mit ihrer Rechnung überein.`),
    stufe('datev', s8, { exporte: datevLaeufe?.length ?? 0 },
      (datevLaeufe ?? []).length === 0
        ? 'Noch kein DATEV-Export erzeugt — es gibt nichts abzustimmen.'
        : 'Jeder Geschäftsvorfall vor dem letzten Exportende liegt in einem erfolgreichen Exportzeitraum.'),
    stufe('audit', s9, { auditzeilen: auditZeilen?.length ?? 0 },
      'Jede festgeschriebene Rechnung und jede Zuordnung hat einen Audit-Eintrag.'),
  ]

  const alleBefunde = stufen.flatMap(s => s.befunde)
  const gesamt = stufen.map(s => s.befund).reduce(ernster, 'CONSISTENT' as StufenBefund)

  return {
    stichtag: heuteBerlin(),
    organizationId: orgId,
    repariert: false,
    gesamt,
    stufen,
    alleBefunde,
    hinweise: l.hinweise,
  }
}

// ---------------------------------------------------------------------------
// Bericht
// ---------------------------------------------------------------------------

const BEFUND_ZEICHEN: Record<StufenBefund, string> = {
  CONSISTENT: '✔',
  ORPHAN_FOUND: '⚠',
  MISMATCH: '✖',
  UNGEPRUEFT: '?',
}

/** Die Abstimmung zum Gegenlesen. */
export function abstimmBerichtText(b: AbstimmBericht): string {
  const z: string[] = []
  const linie = '═'.repeat(74)

  z.push(linie)
  z.push('MONEY-PATH-ABSTIMMUNG — NUR GELESEN, NICHTS VERÄNDERT')
  z.push(linie)
  z.push(`Stichtag : ${b.stichtag}`)
  z.push(`Mandant  : ${b.organizationId}`)
  z.push(`GESAMT   : ${b.gesamt}`)
  z.push('')

  if (b.hinweise.length > 0) {
    z.push('NICHT AUSFÜHRBARE ABFRAGEN (die Stufe gilt als UNGEPRUEFT, nicht als sauber):')
    for (const h of b.hinweise) z.push(`  ? ${h}`)
    z.push('')
  }

  for (const s of b.stufen) {
    z.push(`${BEFUND_ZEICHEN[s.befund]} ${s.titel} — ${s.befund}`)
    z.push(`    ${s.zusammenfassung}`)
    const k = Object.entries(s.kennzahlen).map(([n, w]) => `${n}=${w}`).join('  ')
    if (k) z.push(`    ${k}`)
    for (const f of s.befunde) {
      z.push(`    ${f.art === 'MISMATCH' ? '✖' : '⚠'} [${f.code}] ${f.meldung}`)
      const bez = [
        `Mandant ${f.bezug.organizationId}`,
        f.bezug.customerId ? `Kunde ${f.bezug.customerId}` : null,
        f.bezug.invoiceNumber ? `Rechnung ${f.bezug.invoiceNumber}` : f.bezug.invoiceId ? `Rechnung ${f.bezug.invoiceId}` : null,
        f.bezug.paymentId ? `Zahlung ${f.bezug.paymentId}` : null,
        f.bezug.paymentReference ? `Referenz ${f.bezug.paymentReference}` : null,
      ].filter(Boolean).join(' · ')
      z.push(`        ${bez}`)
      if (f.differenz) {
        z.push(`        erwartet ${euro(f.differenz.erwartetCent)} · gefunden ${euro(f.differenz.gefundenCent)}`)
      }
    }
    z.push('')
  }

  z.push(linie)
  z.push(`ENDE — ${b.alleBefunde.length} Befund(e). Diese Abstimmung hat nichts repariert.`)
  z.push(linie)
  return z.join('\n')
}
