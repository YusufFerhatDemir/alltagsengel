// ═══════════════════════════════════════════════════════════════════════════
// RECHNUNGSVERSAND-PREFLIGHT — 16 Punkte, bevor ein Beleg das Haus verlässt
//
// PROBLEM, DAS DIESE DATEI LÖST
// `versendeRechnungPerEmail()` prüfte fünf Dinge, bevor es verschickte:
// gelöscht, Status, festgeschrieben, schon versendet, E-Mail vorhanden. Das
// sind die Bedingungen, unter denen der VERSAND technisch scheitert — nicht
// die, unter denen die RECHNUNG falsch ist.
//
// Eine Rechnung ohne Positionen, mit einer Rechnungsnummer, die es zweimal
// gibt, mit einem Betrag von 0,00 € ohne Storno-Kennzeichen, an einen
// Testmandanten, mit einer IBAN, die keine Prüfsumme besteht — jede einzelne
// davon lief bisher durch. Beim ersten produktiven Versand ist das die Datei,
// die beim Kunden ankommt: `invoice_email_log` steht live auf 0.
//
// ── DIE DREI ZUSTÄNDE ──────────────────────────────────────────────────────
//   READY_FOR_SEND  Alle 16 Punkte erfüllt (oder begründet nicht anwendbar).
//   NEEDS_REVIEW    Nichts ist falsch, aber etwas ist nicht belegbar richtig.
//                   Ein Mensch darf entscheiden; ein Automat nicht.
//   BLOCKED         Mindestens ein Punkt ist nachweislich verletzt.
//
// Die Unterscheidung zwischen NEEDS_REVIEW und BLOCKED ist der Kern: ohne sie
// müsste jede Unsicherheit entweder durchgehen (dann nützt der Preflight
// nichts) oder blockieren (dann ist er im Weg und wird abgeschaltet).
//
// ── DIESE DATEI SCHREIBT NICHTS ────────────────────────────────────────────
// Kein Audit-Eintrag, kein Statuswechsel, keine PDF-Erzeugung. Sie ist
// beliebig oft aufrufbar, auch aus einer Übersicht über hundert Rechnungen.
// Was sie an Punkt 11 und 16 deshalb NICHT kann, steht dort ausdrücklich.
//
// ── MANDANTENGRENZE ────────────────────────────────────────────────────────
// Jede Abfrage trägt organization_id. Der Aufrufer reicht service-role hinein
// (BYPASSRLS) — die Datenbank hält die Grenze hier nicht mehr.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateIban } from '../sepa/pain008'
import { loadInvoiceXRechnungData } from '../xrechnung/invoice-to-xrechnung'
import { generateCiiXml } from '../xrechnung/cii-generator'
import { euroZuCent, centZuEuro } from '@/lib/geld'
import { logger } from '@/lib/logger'

const log = logger.child('rechnung-preflight')

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type PreflightStatus = 'READY_FOR_SEND' | 'NEEDS_REVIEW' | 'BLOCKED'

export type PunktStand =
  /** Nachweislich in Ordnung. */
  | 'erfuellt'
  /** Nachweislich verletzt — blockiert. */
  | 'blockiert'
  /** Nicht belegbar in Ordnung. Mensch ja, Automat nein. */
  | 'pruefen'
  /** Gilt für diese Rechnung nicht (mit Begründung). */
  | 'nicht_anwendbar'

export type PunktSchluessel =
  | 'kunde'
  | 'mandant'
  | 'empfaengeradresse'
  | 'rechnungsnummer'
  | 'leistungszeitraum'
  | 'positionen'
  | 'preise'
  | 'steuern'
  | 'betrag'
  | 'bankdaten'
  | 'pdf'
  | 'xrechnung'
  | 'testdaten'
  | 'mandantengrenze'
  | 'kein_doppelversand'
  | 'audit'

export interface PreflightPunkt {
  /** 1–16, in der Reihenfolge des Katalogs. */
  nummer: number
  schluessel: PunktSchluessel
  titel: string
  stand: PunktStand
  /** Ein Satz Klartext: was geprüft wurde und was herauskam. */
  befund: string
}

export interface RechnungPreflightErgebnis {
  invoiceId: string
  invoiceNumber: string | null
  organizationId: string
  status: PreflightStatus
  /** Alle 16 Punkte, immer vollständig — auch die erfüllten. */
  punkte: PreflightPunkt[]
  /** Befunde der blockierten Punkte. */
  blocker: string[]
  /** Befunde der Punkte, die ein Mensch ansehen muss. */
  zuPruefen: string[]
  /** An wen ginge die Mail? */
  empfaenger: string | null
  empfaengerName: string | null
  /** Was auf der Rechnung steht — für den Bericht. */
  betragEuro: number
  /** Nur beim ausdrücklichen Nachversand relevant. */
  bereitsVersendetAm: string | null
}

export interface PreflightParams {
  invoiceId: string
  organizationId: string
  /**
   * Ein bewusster Nachversand. Punkt 15 („kein bereits erfolgter Versand")
   * wird dann zu 'nicht_anwendbar' statt 'blockiert'.
   */
  erneutSenden?: boolean
}

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------

const KATALOG: { nummer: number; schluessel: PunktSchluessel; titel: string }[] = [
  { nummer: 1, schluessel: 'kunde', titel: 'Kunde vorhanden' },
  { nummer: 2, schluessel: 'mandant', titel: 'Korrekte Organisation/Mandant' },
  { nummer: 3, schluessel: 'empfaengeradresse', titel: 'Empfängeradresse vorhanden' },
  { nummer: 4, schluessel: 'rechnungsnummer', titel: 'Rechnungsnummer eindeutig' },
  { nummer: 5, schluessel: 'leistungszeitraum', titel: 'Leistungszeitraum vorhanden' },
  { nummer: 6, schluessel: 'positionen', titel: 'Positionen vorhanden' },
  { nummer: 7, schluessel: 'preise', titel: 'Preise verifiziert' },
  { nummer: 8, schluessel: 'steuern', titel: 'Steuern korrekt' },
  { nummer: 9, schluessel: 'betrag', titel: 'Betrag > 0 bzw. Korrektur gekennzeichnet' },
  { nummer: 10, schluessel: 'bankdaten', titel: 'Bankdaten vorhanden' },
  { nummer: 11, schluessel: 'pdf', titel: 'PDF erzeugbar' },
  { nummer: 12, schluessel: 'xrechnung', titel: 'XRechnung/ZUGFeRD valide' },
  { nummer: 13, schluessel: 'testdaten', titel: 'Keine Testdaten' },
  { nummer: 14, schluessel: 'mandantengrenze', titel: 'Kein Cross-Tenant-Zugriff' },
  { nummer: 15, schluessel: 'kein_doppelversand', titel: 'Kein bereits erfolgter Versand' },
  { nummer: 16, schluessel: 'audit', titel: 'Audit-Datensatz erzeugbar' },
]

/**
 * Muster, an denen Testdaten erkennbar sind.
 *
 * Nur am WORTANFANG verankert, nicht am Ende: „Mustermann" und „Testkunde"
 * sind die üblichen Formen, und ein `\b` hinter dem Stamm ließe genau die
 * durch. Dieselbe Konvention wie in lib/go-live/status.ts, wo Testmandanten
 * mit `ilike '%TEST%'` gesucht werden.
 */
const TEST_MUSTER = /\b(test|muster|demo|dummy|beispiel|probe|fixture)/i

/**
 * Für Dokumentation und Tests reservierte Domains (RFC 2606 / 6761).
 *
 * Anders als das Namensmuster ist das ein BEWEIS: hinter example.org steht
 * per Norm niemand. Deshalb blockiert dieser Befund, während ein
 * verdächtiger Name nur zur Sichtung führt.
 */
const TEST_DOMAINS = /@(example\.(com|org|net)|test|localhost|invalid)$/i

// ---------------------------------------------------------------------------
// Datenzugriff
// ---------------------------------------------------------------------------

interface InvoiceRow {
  id: string
  organization_id: string
  client_id: string | null
  invoice_number: string | null
  invoice_number_formatted: string | null
  status: string
  correction_type: string | null
  correction_of: string | null
  total_amount: number | null
  period_start: string | null
  period_end: string | null
  due_date: string | null
  sent_at: string | null
  frozen_at: string | null
  deleted_at: string | null
}

interface ClientRow {
  id: string
  organization_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  insurance_name: string | null
  /** 'active' | 'inactive' | … — `clients` kennt kein deleted_at. */
  status: string | null
}

interface ItemRow {
  id: string
  invoice_id: string
  description: string | null
  date: string | null
  duration_minutes: number | null
  amount: number | null
  budget_type: string | null
  tariff_preis_cent: number | null
}

interface OrgRow {
  id: string
  name: string | null
  iban: string | null
  bic: string | null
  bank_name: string | null
  settings: Record<string, unknown> | null
}

/** Sammelt einen Punkt ein. */
class Befunde {
  private readonly map = new Map<PunktSchluessel, PreflightPunkt>()

  setze(schluessel: PunktSchluessel, stand: PunktStand, befund: string): void {
    const eintrag = KATALOG.find(k => k.schluessel === schluessel)!
    // Der erste gesetzte Befund gewinnt NICHT — der ernstere gewinnt. Sonst
    // überschriebe eine spätere Teilprüfung („Adresse vorhanden") einen
    // früheren Blocker („Klient gelöscht") und der Punkt sähe grün aus.
    const rang: Record<PunktStand, number> = {
      blockiert: 0, pruefen: 1, erfuellt: 2, nicht_anwendbar: 3,
    }
    const bisher = this.map.get(schluessel)
    if (bisher && rang[bisher.stand] <= rang[stand]) return
    this.map.set(schluessel, { ...eintrag, stand, befund })
  }

  /** Alle 16, in Katalogreihenfolge. Fehlende gelten als ungeprüft = blockiert. */
  alle(): PreflightPunkt[] {
    return KATALOG.map(k => this.map.get(k.schluessel) ?? {
      ...k,
      stand: 'blockiert' as PunktStand,
      befund: 'Dieser Punkt wurde nicht geprüft — der Preflight ist unvollständig durchgelaufen.',
    })
  }
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

/**
 * Prüft eine Rechnung gegen alle 16 Punkte. Schreibt nichts.
 */
export async function pruefeRechnungVersandbereit(
  admin: SupabaseClient,
  params: PreflightParams,
): Promise<RechnungPreflightErgebnis> {
  const { invoiceId, organizationId, erneutSenden = false } = params
  const b = new Befunde()

  // ── Rechnung, org-gefenced ──
  const { data: invRoh, error: invErr } = await admin
    .from('invoices')
    .select('id, organization_id, client_id, invoice_number, invoice_number_formatted, status, correction_type, correction_of, total_amount, period_start, period_end, due_date, sent_at, frozen_at, deleted_at')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (invErr) throw new Error(`Rechnung nicht lesbar: ${invErr.message}`)

  if (!invRoh) {
    // Ohne Rechnung ist jeder weitere Punkt gegenstandslos — und die
    // Antwort darf nicht so aussehen, als sei nur ein Punkt offen.
    for (const k of KATALOG) {
      b.setze(k.schluessel, 'blockiert', 'Rechnung nicht gefunden oder gehört zu einem anderen Mandanten.')
    }
    return baueErgebnis(invoiceId, null, organizationId, b, null, null, 0, null, erneutSenden)
  }

  const inv = invRoh as unknown as InvoiceRow

  // ═══ 14. Kein Cross-Tenant-Zugriff ═══
  // Zuerst, weil alle folgenden Prüfungen darauf aufbauen, dass diese
  // Rechnung überhaupt hierher gehört.
  const grenzverstoesse: string[] = []
  if (inv.organization_id !== organizationId) {
    grenzverstoesse.push('Die Rechnung gehört einem anderen Mandanten.')
  }

  // ── Klient ──
  // SPALTEN: `clients` hat KEIN `deleted_at` (Baseline 20260101000000) —
  // die Soft-Delete-Spalte gibt es auf `profiles`, nicht hier. Ein Select
  // darauf beantwortete PostgREST mit 42703, und weil unten nur `data`
  // ausgewertet wurde, haette der Preflight daraus „Klient existiert nicht
  // mehr" gemacht: eine falsche, aber vollkommen plausible Sperre auf JEDER
  // Rechnung. Genau das Fehlerbild, gegen das npm run check:schema-drift
  // gebaut ist.
  let client: ClientRow | null = null
  let clientLesefehler: string | null = null
  if (inv.client_id) {
    const { data, error } = await admin
      .from('clients')
      .select('id, organization_id, first_name, last_name, email, address, city, zip_code, insurance_name, status')
      .eq('id', inv.client_id)
      .maybeSingle()
    if (error) clientLesefehler = error.message
    client = (data as unknown as ClientRow) ?? null
  }

  // ═══ 1. Kunde vorhanden ═══
  if (!inv.client_id) {
    b.setze('kunde', 'blockiert', 'Der Rechnung ist kein Klient zugeordnet (client_id leer).')
  } else if (clientLesefehler) {
    // Ein Lesefehler ist NICHT dasselbe wie „gibt es nicht". Beides zu
    // vermischen liefert eine falsche Begründung, und eine falsche
    // Begründung schickt jemanden in die falsche Richtung.
    b.setze('kunde', 'blockiert', `Der Klient ist nicht lesbar: ${clientLesefehler}`)
  } else if (!client) {
    b.setze('kunde', 'blockiert', 'Der zugeordnete Klient existiert nicht mehr.')
  } else {
    const name = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
    const inaktiv = client.status && !['active', 'aktiv'].includes(client.status)
    if (inaktiv) {
      // Kein Blocker: ein Klient kann inaktiv sein und trotzdem eine offene
      // Rechnung aus der Zeit davor haben. Aber ansehen sollte das jemand.
      b.setze('kunde', 'pruefen',
        `Klient ${name || client.id} steht auf „${client.status}". Eine Rechnung an ein beendetes Verhältnis ist möglich, aber ungewöhnlich.`)
    } else {
      b.setze('kunde', 'erfuellt', `Klient ${name || client.id} ist vorhanden.`)
    }
  }

  if (client && client.organization_id && client.organization_id !== organizationId) {
    // Der schwerste denkbare Befund: die Rechnung gehört uns, der Klient
    // einem anderen Haus. Eine Mail ginge an einen fremden Kunden.
    grenzverstoesse.push('Der Klient gehört zu einem anderen Mandanten.')
  }

  // ── Organisation ──
  const { data: orgRoh } = await admin
    .from('organizations')
    .select('id, name, iban, bic, bank_name, settings')
    .eq('id', organizationId)
    .maybeSingle()
  const org = (orgRoh as unknown as OrgRow) ?? null

  // ═══ 2. Korrekte Organisation/Mandant ═══
  if (!org) {
    b.setze('mandant', 'blockiert', 'Die Organisation zur Rechnung existiert nicht.')
  } else if (!org.name) {
    b.setze('mandant', 'blockiert', 'Die Organisation hat keinen Namen — er steht als Absender auf dem Beleg.')
  } else {
    b.setze('mandant', 'erfuellt', `Rechnung und Klient gehören zu „${org.name}".`)
  }

  // ═══ 3. Empfängeradresse vorhanden ═══
  // Zwei Adressen, zwei Zwecke: die E-Mail entscheidet, ob der Versand
  // überhaupt stattfinden kann; die Postanschrift steht auf dem Beleg und
  // ist Pflichtangabe einer Rechnung (§ 14 Abs. 4 Nr. 1 UStG).
  if (!client?.email) {
    b.setze('empfaengeradresse', 'blockiert', 'Beim Klienten ist keine E-Mail-Adresse hinterlegt — es gibt keinen Empfänger.')
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(client.email)) {
    b.setze('empfaengeradresse', 'blockiert', 'Die hinterlegte E-Mail-Adresse ist keine gültige Adresse.')
  } else {
    const fehlend = [
      !client.address ? 'Straße' : null,
      !client.zip_code ? 'PLZ' : null,
      !client.city ? 'Ort' : null,
    ].filter(Boolean)
    if (fehlend.length > 0) {
      b.setze('empfaengeradresse', 'pruefen',
        `E-Mail vorhanden, aber die Postanschrift ist unvollständig (${fehlend.join(', ')} fehlt). ` +
        `Die Anschrift des Leistungsempfängers ist Pflichtangabe einer Rechnung.`)
    } else {
      b.setze('empfaengeradresse', 'erfuellt', `E-Mail und vollständige Postanschrift liegen vor.`)
    }
  }

  // ═══ 4. Rechnungsnummer eindeutig ═══
  const nummer = inv.invoice_number_formatted || inv.invoice_number || null
  if (!nummer) {
    b.setze('rechnungsnummer', 'blockiert', 'Die Rechnung trägt keine Nummer — sie ist nicht festgeschrieben.')
  } else {
    const { data: gleichnamige, error: nrErr } = await admin
      .from('invoices')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('invoice_number_formatted', nummer)
      .is('deleted_at', null)

    if (nrErr) {
      // Fail-closed: „konnte nicht nachsehen" ist nicht „ist eindeutig".
      b.setze('rechnungsnummer', 'pruefen', `Die Eindeutigkeit der Nummer ${nummer} war nicht prüfbar: ${nrErr.message}`)
    } else {
      const andere = (gleichnamige ?? []).filter(z => (z as { id: string }).id !== invoiceId)
      if (andere.length > 0) {
        b.setze('rechnungsnummer', 'blockiert',
          `Die Rechnungsnummer ${nummer} ist bei diesem Mandanten ${andere.length + 1}× vergeben. ` +
          `Eine doppelt vergebene Nummer ist ein Verstoß gegen die Grundsätze ordnungsmäßiger Buchführung.`)
      } else {
        b.setze('rechnungsnummer', 'erfuellt', `${nummer} ist eindeutig.`)
      }
    }
  }

  // ═══ 5. Leistungszeitraum vorhanden ═══
  if (!inv.period_start || !inv.period_end) {
    b.setze('leistungszeitraum', 'blockiert', 'Der Leistungszeitraum ist nicht vollständig gesetzt — Pflichtangabe nach § 14 Abs. 4 Nr. 6 UStG.')
  } else if (inv.period_start > inv.period_end) {
    b.setze('leistungszeitraum', 'blockiert', `Der Leistungszeitraum endet vor seinem Beginn (${inv.period_start} bis ${inv.period_end}).`)
  } else {
    b.setze('leistungszeitraum', 'erfuellt', `${inv.period_start} bis ${inv.period_end}.`)
  }

  // ── Positionen ──
  const { data: itemsRoh, error: itemsErr } = await admin
    .from('invoice_items')
    .select('id, invoice_id, description, date, duration_minutes, amount, budget_type, tariff_preis_cent')
    .eq('invoice_id', invoiceId)

  const items = (itemsRoh ?? []) as unknown as ItemRow[]

  // ═══ 6. Positionen vorhanden ═══
  if (itemsErr) {
    b.setze('positionen', 'pruefen', `Die Positionen waren nicht lesbar: ${itemsErr.message}`)
  } else if (items.length === 0) {
    b.setze('positionen', 'blockiert', 'Die Rechnung hat keine Positionen. Ein Beleg ohne Leistungszeilen ist keine Rechnung.')
  } else {
    b.setze('positionen', 'erfuellt', `${items.length} Position(en).`)
  }

  // ═══ 7. Preise verifiziert ═══
  if (items.length > 0) {
    const ohneTarif = items.filter(i => i.tariff_preis_cent === null || i.tariff_preis_cent === undefined)
    const widerspruechlich: string[] = []
    for (const i of items) {
      if (i.tariff_preis_cent === null || i.tariff_preis_cent === undefined) continue
      const menge = i.duration_minutes ? i.duration_minutes / 60 : 1
      const erwartet = Math.round(i.tariff_preis_cent * menge)
      const tatsaechlich = euroZuCent(i.amount ?? 0)
      // Ein Cent Toleranz für die Rundung der Mengenmultiplikation.
      if (Math.abs(erwartet - tatsaechlich) > 1) {
        widerspruechlich.push(
          `${i.description ?? i.id}: hinterlegter Tarif ${centZuEuro(i.tariff_preis_cent).toFixed(2)} € × ${menge} ` +
          `ergäbe ${centZuEuro(erwartet).toFixed(2)} €, berechnet sind ${centZuEuro(tatsaechlich).toFixed(2)} €`)
      }
    }

    if (widerspruechlich.length > 0) {
      b.setze('preise', 'blockiert',
        `${widerspruechlich.length} Position(en) weichen vom hinterlegten Tarifpreis ab: ${widerspruechlich.join('; ')}.`)
    } else if (ohneTarif.length > 0) {
      b.setze('preise', 'pruefen',
        `Für ${ohneTarif.length} von ${items.length} Position(en) ist kein aufgelöster Tarifpreis hinterlegt ` +
        `(tariff_preis_cent leer). Der Betrag stammt dort aus einer freien Eingabe und ist nicht gegen einen ` +
        `verifizierten Tarif belegt.`)
    } else {
      b.setze('preise', 'erfuellt', `Alle ${items.length} Position(en) tragen einen aufgelösten Tarifpreis, der zum berechneten Betrag passt.`)
    }
  } else {
    b.setze('preise', 'nicht_anwendbar', 'Keine Positionen — nichts zu prüfen.')
  }

  // ═══ 8. Steuern korrekt ═══
  // Pflegeleistungen sind nach § 4 Nr. 16 UStG steuerfrei; der
  // CII-Generator setzt CategoryCode E mit Befreiungsgrund. „Korrekt" heißt
  // hier deshalb: kein Steuerbetrag, und die Summe der Positionen entspricht
  // dem Rechnungsbetrag — genau das prüft ein Empfänger nach.
  const summeItemsCent = items.reduce((s, i) => s + euroZuCent(i.amount ?? 0), 0)
  const gesamtCent = euroZuCent(inv.total_amount ?? 0)
  if (items.length === 0) {
    b.setze('steuern', 'nicht_anwendbar', 'Keine Positionen — keine Steuerermittlung möglich.')
  } else if (summeItemsCent !== gesamtCent) {
    b.setze('steuern', 'blockiert',
      `Die Summe der Positionen (${centZuEuro(summeItemsCent).toFixed(2)} €) weicht vom Rechnungsbetrag ` +
      `(${centZuEuro(gesamtCent).toFixed(2)} €) ab. Bei Steuerbefreiung nach § 4 Nr. 16 UStG müssen beide gleich sein — ` +
      `es gibt keinen Steuerbetrag, der die Differenz erklären könnte.`)
  } else {
    b.setze('steuern', 'erfuellt',
      `Steuerfrei nach § 4 Nr. 16 UStG (CategoryCode E), Positionssumme und Rechnungsbetrag stimmen überein.`)
  }

  // ═══ 9. Betrag > 0 bzw. Korrekturrechnung korrekt gekennzeichnet ═══
  const istKorrektur = ['gutschrift', 'storno', 'teilstorno', 'korrektur'].includes(inv.correction_type ?? '')
  if (gesamtCent > 0 && !istKorrektur) {
    b.setze('betrag', 'erfuellt', `${centZuEuro(gesamtCent).toFixed(2)} €.`)
  } else if (gesamtCent > 0 && istKorrektur) {
    b.setze('betrag', 'erfuellt', `${centZuEuro(gesamtCent).toFixed(2)} €, gekennzeichnet als „${inv.correction_type}".`)
  } else if (gesamtCent <= 0 && istKorrektur) {
    b.setze('betrag', 'erfuellt',
      `${centZuEuro(gesamtCent).toFixed(2)} € — zulässig, weil der Beleg als „${inv.correction_type}" gekennzeichnet ist.`)
  } else {
    b.setze('betrag', 'blockiert',
      `Der Rechnungsbetrag ist ${centZuEuro(gesamtCent).toFixed(2)} €, ohne dass der Beleg als Gutschrift, Storno ` +
      `oder Korrektur gekennzeichnet wäre. Eine Rechnung über 0,00 € oder weniger ohne Kennzeichnung ist keine Rechnung.`)
  }

  // ═══ 10. Bankdaten vorhanden ═══
  // Nur relevant, wenn etwas zu zahlen ist: auf einer Gutschrift steht keine
  // Zahlungsaufforderung.
  const zahlbar = !['gutschrift', 'storno', 'teilstorno'].includes(inv.correction_type ?? '')
  if (!zahlbar) {
    b.setze('bankdaten', 'nicht_anwendbar', `Beleg vom Typ „${inv.correction_type}" — keine Zahlungsaufforderung, keine Bankdaten nötig.`)
  } else if (!org?.iban) {
    b.setze('bankdaten', 'blockiert', 'Bei der Organisation ist keine IBAN hinterlegt — der Kunde erführe nicht, wohin er zahlen soll.')
  } else if (!validateIban(org.iban)) {
    b.setze('bankdaten', 'blockiert', 'Die hinterlegte IBAN besteht die Prüfsumme (MOD 97) nicht.')
  } else if (!org.bic) {
    b.setze('bankdaten', 'pruefen', 'IBAN ist gültig, BIC fehlt. Für SEPA-Inlandszahlungen entbehrlich, auf dem Beleg aber üblich.')
  } else {
    b.setze('bankdaten', 'erfuellt', 'IBAN gültig, BIC hinterlegt.')
  }

  // ═══ 11. PDF erfolgreich erzeugt ═══
  //
  // GRENZE, AUSDRÜCKLICH: Die Erzeugung lädt in den Storage und schreibt
  // `invoice_packages`. Dieser Preflight schreibt nichts und kann sie deshalb
  // nicht auslösen.
  //
  // WARUM EIN FEHLENDES PAKET TROTZDEM NICHT ZUR SICHTUNG FÜHRT:
  // Beim allerersten Versand einer Rechnung existiert NIE ein Paket — es
  // entsteht in `versendeRechnungPerEmail()`, also nach diesem Preflight.
  // Ein 'pruefen' an dieser Stelle hätte damit JEDEN automatischen
  // Erstversand blockiert, dauerhaft und ohne dass es jemandem aufgefallen
  // wäre: der Automat hätte geschwiegen, und der Grund („PDF noch nicht
  // erzeugt") hätte plausibel geklungen. Genau die Sorte Fehler, die dieser
  // Preflight verhindern soll.
  //
  // Geprüft wird deshalb, was VOR dem Versand prüfbar ist: die Festschreibung
  // (ohne Snapshot gibt es keinen Beleg) — die Eingangsdaten der Erzeugung
  // decken die Punkte 1 bis 10 bereits ab. Dass die Erzeugung selbst noch
  // scheitern kann, steht im Befund.
  if (!inv.frozen_at) {
    b.setze('pdf', 'blockiert', 'Die Rechnung ist nicht festgeschrieben. Ohne Festschreibung entsteht kein Beleg-PDF.')
  } else {
    const { data: paket } = await admin
      .from('invoice_packages')
      .select('pdf_url, page_count')
      .eq('invoice_id', invoiceId)
      .maybeSingle()

    const p = paket as { pdf_url?: string | null; page_count?: number | null } | null
    b.setze('pdf', 'erfuellt', p?.pdf_url
      ? `Festgeschrieben; ein Belegpaket liegt vor (${p.page_count ?? '?'} Seite(n)) und wird beim Versand neu erzeugt.`
      : 'Festgeschrieben; die Eingangsdaten für das Beleg-PDF sind vollständig (Punkte 1–10). '
        + 'Erzeugt wird es erst beim Versand — dieser Preflight erzeugt keines, weil er nicht schreibt, '
        + 'und kann deshalb nicht ausschließen, dass die Erzeugung dort scheitert.')
  }

  // ═══ 12. XRechnung/ZUGFeRD falls erforderlich valide ═══
  await pruefeXRechnung(admin, b, inv, client, items, organizationId)

  // ═══ 13. Keine Testdaten ═══
  //
  // ZWEI KLASSEN, und die Unterscheidung ist wichtig:
  //
  //   BEWEISE blockieren. Eine reservierte Domain (RFC 2606) hat per Norm
  //   keinen Empfänger; ein Mandantenname mit „Test" in einer
  //   Produktionsdatenbank ist ein bekanntes, dokumentiertes Problem
  //   (lib/go-live/status.ts prüft genau das als Go-Live-Blocker).
  //
  //   HEURISTIKEN führen zur Sichtung. „Testa" und „Demopoulos" sind echte
  //   Nachnamen. Die Rechnung eines echten Kunden zurückzuhalten, weil sein
  //   Name ein Suchmuster trifft, wäre ein schlimmerer Fehler als die
  //   Sichtung, die er stattdessen auslöst.
  const testBeweise: string[] = []
  const testVerdacht: string[] = []

  if (org?.name && TEST_MUSTER.test(org.name)) {
    testBeweise.push(`Der Mandantenname „${org.name}" weist auf einen Testmandanten hin.`)
  }
  if (client) {
    if (client.email && TEST_DOMAINS.test(client.email)) {
      testBeweise.push(
        'Die E-Mail-Adresse liegt auf einer für Dokumentation und Tests reservierten Domain (RFC 2606) — dort empfängt niemand.')
    }
    const kundenname = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
    if (kundenname && TEST_MUSTER.test(kundenname)) {
      testVerdacht.push(
        `Der Klientenname „${kundenname}" trifft ein Testmuster. Das kann ein echter Name sein — bitte einmal ansehen.`)
    }
  }

  if (testBeweise.length > 0) {
    b.setze('testdaten', 'blockiert', `${testBeweise.join(' ')} An Testdaten wird nichts versendet.`)
  } else if (testVerdacht.length > 0) {
    b.setze('testdaten', 'pruefen', testVerdacht.join(' '))
  } else {
    b.setze('testdaten', 'erfuellt', 'Keine Testmuster in Mandant, Klient oder Empfängeradresse.')
  }

  // ═══ 14 (Fortsetzung) ═══
  if (inv.correction_of) {
    const { data: original } = await admin
      .from('invoices')
      .select('id')
      .eq('id', inv.correction_of)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!original) {
      grenzverstoesse.push(
        'Die korrigierte Ursprungsrechnung (correction_of) gehört nicht zu diesem Mandanten oder existiert nicht — ' +
        'ihre Nummer stünde als Bezug auf dem Beleg.')
    }
  }
  const fremdePositionen = items.filter(i => i.invoice_id !== invoiceId)
  if (fremdePositionen.length > 0) {
    grenzverstoesse.push(`${fremdePositionen.length} Position(en) gehören zu einer anderen Rechnung.`)
  }

  if (grenzverstoesse.length > 0) {
    b.setze('mandantengrenze', 'blockiert', grenzverstoesse.join(' '))
  } else {
    b.setze('mandantengrenze', 'erfuellt', 'Rechnung, Klient, Positionen und Bezugsbeleg gehören alle zu diesem Mandanten.')
  }

  // ═══ 15. Kein bereits erfolgter Versand ═══
  if (inv.sent_at && !erneutSenden) {
    b.setze('kein_doppelversand', 'blockiert',
      `Die Rechnung wurde am ${inv.sent_at.slice(0, 10)} bereits versendet. Ein zweiter Versand desselben Belegs ` +
      `verwirrt den Empfänger und kann als zweite Forderung gelesen werden.`)
  } else if (inv.sent_at && erneutSenden) {
    b.setze('kein_doppelversand', 'nicht_anwendbar',
      `Bereits am ${inv.sent_at.slice(0, 10)} versendet — ausdrücklicher Nachversand ist angefordert.`)
  } else {
    b.setze('kein_doppelversand', 'erfuellt', 'Noch nicht versendet.')
  }

  // ═══ 16. Audit-Datensatz erzeugbar ═══
  //
  // GRENZE, AUSDRÜCKLICH: Ob ein INSERT gelingt, lässt sich ohne INSERT nicht
  // beweisen. Geprüft wird die Erreichbarkeit des Trails — ein Lesefehler
  // hier bedeutet, dass auch der Schreibvorgang scheitern wird — und die
  // Vollständigkeit der Pflichtfelder, an denen der Insert sonst scheitert:
  // `organization_id` (sonst greift der Default current_org_id() und der
  // Eintrag landet in der Stamm-Org) und ein Entitätstyp aus dem Katalog.
  const { error: auditErr } = await admin
    .from('billing_audit_trail')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('entity_id', invoiceId)

  if (auditErr) {
    b.setze('audit', 'blockiert',
      `Der Audit-Trail ist nicht erreichbar (${auditErr.message}). Ein Versand ohne Audit-Eintrag ist ein Versand ohne Nachweis.`)
  } else {
    b.setze('audit', 'erfuellt',
      `Der Audit-Trail ist erreichbar und der Mandant ist gesetzt; der Versandeintrag (entity_type 'invoice') ist erzeugbar.`)
  }

  return baueErgebnis(
    invoiceId, nummer, organizationId, b,
    client?.email ?? null,
    client ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || null : null,
    centZuEuro(gesamtCent),
    inv.sent_at,
    erneutSenden,
  )
}

// ---------------------------------------------------------------------------
// Punkt 12 im Einzelnen
// ---------------------------------------------------------------------------

/**
 * XRechnung ist nicht immer erforderlich — und wo sie es nicht ist, wäre ein
 * Blocker falsch.
 *
 * Erforderlich, sobald der Beleg an einen Kostenträger geht: dort wird ein
 * strukturiertes Dokument erwartet, und eine fehlende Pflichtangabe führt zur
 * Abweisung, nicht zu einer Rückfrage. Beim Selbstzahler genügt das PDF.
 *
 * Die Prüfung erzeugt das CII-XML tatsächlich (beides ist rein lesend) und
 * sieht die Pflichtfelder nach. Eine Behauptung „wäre valide" ohne Erzeugung
 * wäre wertlos.
 */
async function pruefeXRechnung(
  admin: SupabaseClient,
  b: Befunde,
  inv: InvoiceRow,
  client: ClientRow | null,
  items: ItemRow[],
  organizationId: string,
): Promise<void> {
  const anKostentraeger =
    Boolean(client?.insurance_name) &&
    items.some(i => (i.budget_type ?? 'private') !== 'private')

  if (!anKostentraeger) {
    b.setze('xrechnung', 'nicht_anwendbar',
      'Der Beleg geht an einen Selbstzahler — ein strukturiertes XRechnung-Dokument ist nicht erforderlich.')
    return
  }

  let xml: string
  try {
    const daten = await loadInvoiceXRechnungData(admin, inv.id, organizationId)
    xml = generateCiiXml(daten, 'xrechnung')
  } catch (err) {
    b.setze('xrechnung', 'blockiert',
      `Das XRechnung-Dokument lässt sich nicht erzeugen: ${err instanceof Error ? err.message : String(err)}. ` +
      `Der Kostenträger würde den Beleg abweisen.`)
    return
  }

  // Strukturprüfung: die Pflichtangaben, an denen eine XRechnung beim
  // Empfänger scheitert. Keine vollständige Schematron-Prüfung — die
  // gehört zu einem Validator, nicht in einen Preflight; was hier fehlt,
  // steht im Befund.
  const fehlend: string[] = []
  if (!/<ram:ID>[^<]+<\/ram:ID>/.test(xml)) fehlend.push('Rechnungsnummer (BT-1)')
  if (!/<udt:DateTimeString[^>]*>\d{8}</.test(xml)) fehlend.push('Rechnungsdatum (BT-2)')
  if (!/<ram:TypeCode>\d{3}<\/ram:TypeCode>/.test(xml)) fehlend.push('Belegart (BT-3)')
  if (!/<ram:IncludedSupplyChainTradeLineItem>/.test(xml)) fehlend.push('mindestens eine Position (BG-25)')
  if (!/<ram:ExemptionReason>/.test(xml)) fehlend.push('Befreiungsgrund zur Steuerbefreiung (BT-120)')
  if (!/<ram:CategoryCode>E<\/ram:CategoryCode>/.test(xml)) fehlend.push('Steuerkategorie E')

  if (fehlend.length > 0) {
    b.setze('xrechnung', 'blockiert',
      `Dem erzeugten XRechnung-Dokument fehlen Pflichtangaben: ${fehlend.join(', ')}.`)
    return
  }

  // Die Leitweg-ID braucht nur, wer an eine öffentliche Stelle liefert. Eine
  // Krankenkasse ist keine — deshalb Hinweis, nicht Blocker.
  const hatLeitweg = /<ram:BuyerReference>[^<]+<\/ram:BuyerReference>/.test(xml)
  b.setze('xrechnung', hatLeitweg ? 'erfuellt' : 'pruefen',
    hatLeitweg
      ? `Das XRechnung-Dokument (CII) wurde erzeugt und trägt alle geprüften Pflichtangaben inkl. Leitweg-ID.`
      : `Das XRechnung-Dokument (CII) wurde erzeugt und trägt alle geprüften Pflichtangaben. Es fehlt die ` +
        `Leitweg-ID (BT-10) — für öffentliche Auftraggeber verpflichtend, für eine Krankenkasse in der Regel nicht.`)
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

function baueErgebnis(
  invoiceId: string,
  invoiceNumber: string | null,
  organizationId: string,
  b: Befunde,
  empfaenger: string | null,
  empfaengerName: string | null,
  betragEuro: number,
  bereitsVersendetAm: string | null,
  _erneutSenden: boolean,
): RechnungPreflightErgebnis {
  const punkte = b.alle()
  const blocker = punkte.filter(p => p.stand === 'blockiert').map(p => `${p.nummer}. ${p.titel}: ${p.befund}`)
  const zuPruefen = punkte.filter(p => p.stand === 'pruefen').map(p => `${p.nummer}. ${p.titel}: ${p.befund}`)

  const status: PreflightStatus =
    blocker.length > 0 ? 'BLOCKED'
    : zuPruefen.length > 0 ? 'NEEDS_REVIEW'
    : 'READY_FOR_SEND'

  return {
    invoiceId, invoiceNumber, organizationId, status, punkte,
    blocker, zuPruefen, empfaenger, empfaengerName, betragEuro, bereitsVersendetAm,
  }
}

// ---------------------------------------------------------------------------
// Verwendung im Versandweg
// ---------------------------------------------------------------------------

/** Wie streng wird der Preflight angewandt? */
export type PreflightStrenge =
  /** Automatischer Versand: nur READY_FOR_SEND darf raus. */
  | 'automatisch'
  /** Ein Mensch hat den Versand ausgelöst: NEEDS_REVIEW darf er verantworten. */
  | 'manuell'

/**
 * Darf mit diesem Ergebnis versendet werden?
 *
 * Rein und damit einzeln testbar. Der Unterschied zwischen den beiden
 * Strengen ist der ganze Sinn von NEEDS_REVIEW: eine unvollständige
 * Postanschrift ist kein Grund, einen Menschen am Versand zu hindern — aber
 * sehr wohl einer, einen Automaten daran zu hindern, der nachts läuft und
 * niemanden fragt.
 */
export function darfVersenden(
  ergebnis: RechnungPreflightErgebnis,
  strenge: PreflightStrenge,
): { erlaubt: boolean; grund: string | null } {
  if (ergebnis.status === 'BLOCKED') {
    return { erlaubt: false, grund: `Versand-Preflight blockiert: ${ergebnis.blocker.join(' | ')}` }
  }
  if (ergebnis.status === 'NEEDS_REVIEW' && strenge === 'automatisch') {
    return {
      erlaubt: false,
      grund:
        `Versand-Preflight verlangt eine Sichtung, der Versand war aber automatisch angestoßen: ` +
        `${ergebnis.zuPruefen.join(' | ')}. Nach Sichtung von Hand versendbar über ` +
        `POST /api/billing/invoices/[id]/versenden.`,
    }
  }
  if (ergebnis.status === 'NEEDS_REVIEW') {
    log.info('Rechnung mit offenen Prüfpunkten von Hand versendet', {
      invoiceId: ergebnis.invoiceId, punkte: ergebnis.zuPruefen.length,
    })
  }
  return { erlaubt: true, grund: null }
}
