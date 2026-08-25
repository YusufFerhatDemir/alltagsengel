/**
 * DATEV-Finanzexport — Reality Check
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Track 5 von Phase 7. Die bestehende Suite
 * (`datev-export-pglite.test.ts`) prueft jede Buchungsart EINZELN. Diese
 * hier prueft, was der Steuerberater tatsaechlich bekommt: einen
 * vollstaendigen Monat, in dem alle Vorfaelle NEBENEINANDER vorkommen —
 * und danach die Datei als Ganzes.
 *
 * ── DIE ZEHN VORFAELLE IN EINEM STAPEL ──────────────────────────────────
 *   1. normale Rechnung
 *   2. Korrekturrechnung (eigene Nummer, eigener Erloes)
 *   3. Gutschrift
 *   4. Storno / Teilstorno
 *   5. Ruecklastschrift (mit zuordenbarer Rechnung)
 *   6. Teilzahlung (zwei Raten auf eine Rechnung)
 *   7. Ueberzahlung (Zahlung > Rechnungsbetrag)
 *   8. Mahngebuehr
 *   9. zwei betragsgleiche Zahlungen am selben Tag
 *  10. ein zweiter Mandant, der in KEINER Zeile auftauchen darf
 *
 * ── WAS „AUTOMATISCH VALIDIERT" HIER HEISST ─────────────────────────────
 * Nicht: „der Test vergleicht mit einer erwarteten Datei". Eine solche
 * Golden-File-Pruefung faellt bei jeder harmlosen Formatierungsaenderung
 * um und sagt nichts ueber Richtigkeit. Stattdessen laeuft der echte
 * Validator (`lib/billing/datev/datev-validator.ts`) ueber den erzeugten
 * Stapel und ueber die erzeugte CSV — derselbe Code, der im
 * Export-Service fail-closed davorsteht.
 *
 * ── KEINE ERFUNDENEN KONTEN ─────────────────────────────────────────────
 * Alle Kontonummern stammen aus `lib/billing/datev/kontenrahmen.ts`
 * (SKR03/SKR04-Standard). Beraternummer, Mandantennummer und die
 * verbindliche Kontenzuordnung sind Vorgaben der Kanzlei und stehen
 * NICHT im Code — siehe `BERATER_VORGABE_ERFORDERLICH` im Validator und
 * den BUSINESS_INPUT_REQUIRED-Abschnitt im Phase-7-Bericht.
 *
 * ── KEINE PRODUKTIVDATEN ────────────────────────────────────────────────
 * Alles laeuft in einer In-Memory-Postgres-Instanz (PGlite). Es wird
 * nichts verbucht, nichts versendet, nichts in einen Storage geschrieben.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen, baueDatevTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { generateBuchungssaetze } from '@/lib/billing/datev/buchungssatz-generator'
import { generateDatevCsv, type DatevHeaderParams, type DatevBuchungssatz } from '@/lib/billing/datev/datev-format'
import { getKonto, alleSachkonten } from '@/lib/billing/datev/kontenrahmen'
import {
  pruefeBuchungssaetze,
  pruefeDatevCsv,
  fasseZusammen,
  zerlegeCsvZeile,
  datevBetragZuCent,
  formatierePruefbericht,
  DATEV_FELDER,
  BERATER_VORGABE_ERFORDERLICH,
} from '@/lib/billing/datev/datev-validator'

const ORG_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const ORG_B = 'bbbbbbbb-0000-4000-8000-0000000000b1'
const K1 = 'c0000001-0000-4000-8000-0000000000c1'
const K2 = 'c0000002-0000-4000-8000-0000000000c2'
const K_FREMD = 'c0000003-0000-4000-8000-0000000000c3'

const VON = '2026-04-01'
const BIS = '2026-04-30'

const SACHKONTEN_SKR03 = alleSachkonten('SKR03')
const ERLOES = getKonto('SKR03', 'erloesePflege').konto
const BANK = getKonto('SKR03', 'bank').konto
const MAHN = getKonto('SKR03', 'mahngebuehren').konto

let db: PGlite
let admin: SupabaseClient

async function sql(text: string, params: unknown[] = []): Promise<void> {
  await db.query(text, params as never[])
}

function generatorParams(org = ORG_A) {
  return { organizationId: org, zeitraumVon: VON, zeitraumBis: BIS, kontenrahmen: 'SKR03' as const }
}

/**
 * Kopfdaten des Buchungsstapels.
 *
 * Beraternummer/Mandantennummer sind ausdrueckliche TEST-Platzhalter. Die
 * echten Werte kommen von der Kanzlei und duerfen im Repository nicht
 * stehen — weder als Beispiel noch als Default.
 */
const KOPF: DatevHeaderParams = {
  beraternummer: '9999999',
  mandantennummer: '99999',
  wjBeginn: '20260101',
  sachkontenlaenge: 4,
  datumVon: VON.replace(/-/g, ''),
  datumBis: BIS.replace(/-/g, ''),
  erzeugerKuerzel: 'AE',
}

// ───────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────

async function stammdaten(): Promise<void> {
  await sql(
    `INSERT INTO public.organizations (id, name) VALUES ($1,'Mandant A'), ($2,'Mandant B')`,
    [ORG_A, ORG_B],
  )
  await sql(
    `INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name) VALUES
       ($1,$4,'K-1','Anna','Beispiel'),
       ($2,$4,'K-2','Bernd','Beispiel'),
       ($3,$5,'K-9','Clara','Fremdmandant')`,
    [K1, K2, K_FREMD, ORG_A, ORG_B],
  )
}

interface ReOpts {
  id: string; nummer: string; betrag: number
  org?: string; klient?: string; status?: string
  correctionType?: string | null; datum?: string
}

async function rechnung(o: ReOpts): Promise<void> {
  await sql(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, status, correction_type, created_at)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10)`,
    [o.id, o.org ?? ORG_A, o.klient ?? K1, o.nummer, VON, BIS, o.betrag,
     o.status ?? 'sent', o.correctionType ?? null, `${o.datum ?? '2026-04-10'}T09:00:00Z`],
  )
}

async function zahlung(opts: {
  id: string; invoiceId: string; cents: number; datum: string; org?: string
}): Promise<void> {
  await sql(
    `INSERT INTO public.payments (id, organization_id, payment_date, amount_cents)
     VALUES ($1,$2,$3,$4)`,
    [opts.id, opts.org ?? ORG_A, opts.datum, opts.cents],
  )
  await sql(
    `INSERT INTO public.payment_allocations
       (organization_id, payment_id, invoice_id, amount_cents, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [opts.org ?? ORG_A, opts.id, opts.invoiceId, opts.cents, `${opts.datum}T09:00:00Z`],
  )
}

async function mahngebuehr(opts: {
  invoiceId: string; cents: number; stufe: string; datum: string
  org?: string; offenCents?: number
}): Promise<void> {
  await sql(
    `INSERT INTO public.dunning_entries
       (organization_id, invoice_id, dunning_level, dunning_fee_cents,
        amount_due_cents, due_date, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [opts.org ?? ORG_A, opts.invoiceId, opts.stufe, opts.cents,
     opts.offenCents ?? 10000, opts.datum, `${opts.datum}T09:00:00Z`],
  )
}

async function ruecklastschrift(opts: {
  camtId: string; paymentId: string | null; cents: number; datum: string; org?: string; hash: string
}): Promise<void> {
  await sql(
    `INSERT INTO public.camt_imports (id, organization_id, dateiname, quelldatei_hash)
     VALUES ($1,$2,'auszug-april.xml',$3)`,
    [opts.camtId, opts.org ?? ORG_A, `datei-${opts.hash}`],
  )
  await sql(
    `INSERT INTO public.zahlungseingaenge
       (organization_id, camt_import_id, buchungsdatum, betrag_cent, debitor_name,
        ist_ruecklastschrift, payment_id, quelldatei_hash)
     VALUES ($1,$2,$3,$4,'Beispiel',true,$5,$6)`,
    [opts.org ?? ORG_A, opts.camtId, opts.datum, -Math.abs(opts.cents), opts.paymentId, opts.hash],
  )
}

/**
 * Der vollstaendige Monat. Bewusst EINE Funktion: die Vorfaelle wirken
 * aufeinander (Teilzahlung auf Rechnung 1, Ruecklastschrift auf die
 * Ueberzahlung), und getrennt aufgebaut waere das nicht mehr derselbe
 * Stapel, den der Steuerberater sieht.
 */
async function baueRepraesentativenMonat(): Promise<void> {
  // 1. Normale Rechnung — 240,00 EUR
  await rechnung({ id: 'e0000001-0000-4000-8000-0000000000e1', nummer: 'RE-2026-0101', betrag: 240, datum: '2026-04-02' })
  // 2. Korrekturrechnung — eigene Nummer, eigener Erloes
  await rechnung({ id: 'e0000002-0000-4000-8000-0000000000e2', nummer: 'RE-2026-0102-K', betrag: 35.5, correctionType: 'korrektur', datum: '2026-04-06' })
  // 3. Gutschrift — negativ gespeichert, ohne Vorzeichen gebucht
  await rechnung({ id: 'e0000003-0000-4000-8000-0000000000e3', nummer: 'GS-2026-0007', betrag: -45.9, correctionType: 'gutschrift', datum: '2026-04-08' })
  // 4. Teilstorno
  await rechnung({ id: 'e0000004-0000-4000-8000-0000000000e4', nummer: 'ST-2026-0002', betrag: -12.35, correctionType: 'teilstorno', datum: '2026-04-09', klient: K2 })
  // 5. Rechnung fuer den zweiten Klienten — Grundlage der Ueberzahlung
  await rechnung({ id: 'e0000005-0000-4000-8000-0000000000e5', nummer: 'RE-2026-0103', betrag: 100, klient: K2, datum: '2026-04-03' })

  // 6. Teilzahlung: zwei Raten auf RE-0101
  await zahlung({ id: 'f0000001-0000-4000-8000-0000000000f1', invoiceId: 'e0000001-0000-4000-8000-0000000000e1', cents: 14000, datum: '2026-04-12' })
  await zahlung({ id: 'f0000002-0000-4000-8000-0000000000f2', invoiceId: 'e0000001-0000-4000-8000-0000000000e1', cents: 10000, datum: '2026-04-19' })

  // 7. Ueberzahlung: 120,00 auf eine Rechnung ueber 100,00
  await zahlung({ id: 'f0000003-0000-4000-8000-0000000000f3', invoiceId: 'e0000005-0000-4000-8000-0000000000e5', cents: 12000, datum: '2026-04-14' })

  // 8. Mahngebuehr auf RE-0103
  await mahngebuehr({ invoiceId: 'e0000005-0000-4000-8000-0000000000e5', cents: 500, stufe: 'mahnung_1', datum: '2026-04-22' })

  // 9. Zwei betragsgleiche Zahlungen am SELBEN Tag auf dieselbe Rechnung
  await zahlung({ id: 'f0000004-0000-4000-8000-0000000000f4', invoiceId: 'e0000002-0000-4000-8000-0000000000e2', cents: 1775, datum: '2026-04-25' })
  await zahlung({ id: 'f0000005-0000-4000-8000-0000000000f5', invoiceId: 'e0000002-0000-4000-8000-0000000000e2', cents: 1775, datum: '2026-04-25' })

  // 10. Ruecklastschrift auf die Ueberzahlung
  await ruecklastschrift({
    camtId: 'a0000001-0000-4000-8000-0000000000a9',
    paymentId: 'f0000003-0000-4000-8000-0000000000f3',
    cents: 12000, datum: '2026-04-27', hash: 'rl-april-1',
  })

  // 11. Fremdmandant — darf in KEINER Zeile auftauchen
  await rechnung({ id: 'e0000009-0000-4000-8000-0000000000e9', nummer: 'FREMD-0001', betrag: 999, org: ORG_B, klient: K_FREMD, datum: '2026-04-15' })
  await zahlung({ id: 'f0000009-0000-4000-8000-0000000000f9', invoiceId: 'e0000009-0000-4000-8000-0000000000e9', cents: 99900, datum: '2026-04-16', org: ORG_B })
}

/** Erzeugt Stapel + CSV + Pruefergebnis in einem Zug. */
async function exportiere(org = ORG_A) {
  const { buchungen, statistik } = await generateBuchungssaetze(admin, generatorParams(org))
  const csv = generateDatevCsv(KOPF, buchungen)
  const pruefung = fasseZusammen(
    pruefeBuchungssaetze({
      buchungen, kontenrahmen: 'SKR03', zeitraumVon: VON, zeitraumBis: BIS,
      sachkonten: SACHKONTEN_SKR03,
    }),
    pruefeDatevCsv({ csv, sachkonten: SACHKONTEN_SKR03, erwarteteBuchungen: buchungen.length }),
  )
  return { buchungen, statistik, csv, pruefung }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueCamtTabellen(db)
  await baueDatevTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
})

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await sql(`
    TRUNCATE public.datev_kontenzuordnung, public.datev_exports,
             public.payment_allocations, public.payments,
             public.dunning_entries, public.zahlungseingaenge,
             public.camt_imports, public.invoice_items, public.invoices,
             public.clients, public.organizations
    RESTART IDENTITY CASCADE
  `)
  await stammdaten()
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Der vollstaendige Monat
// ═══════════════════════════════════════════════════════════════════════

describe('Repräsentativer Monat: alle Vorfälle in einem Stapel', () => {
  beforeEach(baueRepraesentativenMonat)

  it('jede Buchungsart ist im Stapel vertreten', async () => {
    const { statistik } = await exportiere()
    // 2 Ausgangsrechnungen + 1 Korrekturrechnung
    expect(statistik.rechnungen).toBe(3)
    // 2 Teilzahlungen + 1 Überzahlung + 2 betragsgleiche
    expect(statistik.zahlungen).toBe(5)
    // Gutschrift + Teilstorno
    expect(statistik.gutschriften).toBe(2)
    expect(statistik.mahngebuehren).toBe(1)
    expect(statistik.ruecklastschriften).toBe(1)
    expect(statistik.gesamt).toBe(12)
  })

  it('der erzeugte Stapel besteht die automatische Prüfung', async () => {
    const { pruefung } = await exportiere()
    // Der Bericht steht in der Meldung, damit ein roter Lauf sagt WAS
    // falsch ist — nicht nur, DASS etwas falsch ist.
    expect(pruefung.fehler.map(f => `${f.code}: ${f.meldung}`), formatierePruefbericht(pruefung)).toEqual([])
    expect(pruefung.ok).toBe(true)
  })

  it('jede Zeile der CSV hat exakt 12 Felder — keine Spaltenverschiebung', async () => {
    const { csv, buchungen } = await exportiere()
    const zeilen = csv.split('\r\n').filter(Boolean)
    expect(zeilen).toHaveLength(2 + buchungen.length)
    for (const zeile of zeilen.slice(1)) {
      expect(zerlegeCsvZeile(zeile)).toHaveLength(DATEV_FELDER)
    }
  })

  it('Soll und Haben der Datei stimmen mit den Buchungssätzen überein', async () => {
    const { buchungen, pruefung } = await exportiere()
    const erwartetSoll = buchungen
      .filter(b => b.sollHaben === 'S')
      .reduce((s, b) => s + Math.round(b.umsatz * 100), 0)
    expect(pruefung.kennzahlen.summeSollCent).toBe(erwartetSoll)
    // Der Generator bucht ausschliesslich in Soll (die Gegenseite steht im
    // Gegenkonto). Waere das nicht so, verschoebe eine H-Buchung die
    // Richtung — deshalb hier festgehalten statt vorausgesetzt.
    expect(pruefung.kennzahlen.summeHabenCent).toBe(0)
  })

  it('nur Konten aus dem Kontenrahmen und dem Debitorenbereich werden bebucht', async () => {
    const { pruefung } = await exportiere()
    for (const konto of pruefung.kennzahlen.konten) {
      const istSachkonto = SACHKONTEN_SKR03.includes(konto)
      const istDebitor = /^\d{5}$/.test(konto) && Number(konto) >= 10000 && Number(konto) <= 69999
      expect(istSachkonto || istDebitor, `Konto ${konto} gehört in keinen der beiden Bereiche`).toBe(true)
    }
  })

  it('kein Beleg des zweiten Mandanten steht in der Datei', async () => {
    const { csv, buchungen } = await exportiere()
    expect(csv).not.toContain('FREMD-0001')
    expect(csv).not.toContain('Fremdmandant')
    expect(buchungen.some(b => b.umsatz === 999)).toBe(false)
  })

  it('der zweite Mandant exportiert seinen eigenen Beleg — und nur den', async () => {
    const { buchungen, csv } = await exportiere(ORG_B)
    expect(buchungen).toHaveLength(2) // Rechnung + Zahlung
    expect(csv).toContain('FREMD-0001')
    expect(csv).not.toContain('RE-2026-0101')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Die einzelnen Geschäftsvorfälle im Zusammenspiel
// ═══════════════════════════════════════════════════════════════════════

describe('Geschäftsvorfälle', () => {
  beforeEach(baueRepraesentativenMonat)

  it('Teilzahlung: zwei Raten stehen als zwei Buchungen, Summe = eingegangen', async () => {
    const { buchungen } = await exportiere()
    const raten = buchungen.filter(b => b.belegnummer === 'RE-2026-0101' && b.buchungstext.startsWith('Zahlung'))
    expect(raten).toHaveLength(2)
    expect(raten.reduce((s, b) => s + Math.round(b.umsatz * 100), 0)).toBe(24000)
    // Beide gegen dasselbe Debitorenkonto — sonst laufen die Raten auf
    // verschiedene Debitoren und der Saldo stimmt nie.
    expect(new Set(raten.map(b => b.gegenkonto)).size).toBe(1)
    expect(raten.every(b => b.konto === BANK)).toBe(true)
  })

  it('Überzahlung wird in voller Höhe gebucht, nicht auf den Rechnungsbetrag gekürzt', async () => {
    const { buchungen } = await exportiere()
    const ueber = buchungen.find(b => b.belegnummer === 'RE-2026-0103' && b.buchungstext.startsWith('Zahlung'))
    // Rechnung: 100,00 — Zahlung: 120,00. Wer hier 100,00 buchte, liesse
    // 20,00 EUR eingegangenes Geld aus der Buchhaltung verschwinden.
    expect(ueber?.umsatz).toBe(120)
  })

  it('Korrekturrechnung ist eine Ausgangsrechnung (Debitor an Erlös), keine Gutschrift', async () => {
    const { buchungen } = await exportiere()
    const korr = buchungen.find(b => b.belegnummer === 'RE-2026-0102-K' && b.buchungstext.startsWith('Rechnung'))
    expect(korr).toBeDefined()
    expect(korr!.gegenkonto).toBe(ERLOES)
    expect(korr!.storno).toBeUndefined()
    expect(korr!.umsatz).toBe(35.5)
  })

  it('Gutschrift und Teilstorno tragen die Generalumkehr und einen Betrag ohne Vorzeichen', async () => {
    const { buchungen } = await exportiere()
    const stornos = buchungen.filter(b => b.storno === true)
    expect(stornos).toHaveLength(2)
    expect(stornos.every(b => b.umsatz > 0)).toBe(true)
    expect(stornos.every(b => b.konto === ERLOES)).toBe(true)
    expect(stornos.map(b => b.umsatz).sort((a, b) => a - b)).toEqual([12.35, 45.9])
  })

  it('Mahngebühr bucht Debitor an Mahnerlöse — nicht gegen die Bank', async () => {
    const { buchungen } = await exportiere()
    const mahn = buchungen.find(b => b.buchungstext.startsWith('Mahngebuehr'))
    expect(mahn?.umsatz).toBe(5)
    expect(mahn?.gegenkonto).toBe(MAHN)
    expect(mahn?.konto).toMatch(/^\d{5}$/)
  })

  it('Rücklastschrift dreht die Zahlung zurück: Debitor (S) an Bank', async () => {
    const { buchungen } = await exportiere()
    const rl = buchungen.filter(b => b.buchungstext.startsWith('Ruecklastschrift'))
    expect(rl).toHaveLength(1)
    expect(rl[0].umsatz).toBe(120)
    expect(rl[0].gegenkonto).toBe(BANK)
    // Und keine erfundene Bankgebühr daneben.
    const aufwand = getKonto('SKR03', 'nebenkostenGeldverkehr').konto
    expect(buchungen.some(b => b.konto === aufwand || b.gegenkonto === aufwand)).toBe(false)
  })

  it('zwei betragsgleiche Zahlungen am selben Tag werden gemeldet, aber nicht blockiert', async () => {
    const { pruefung } = await exportiere()
    const codes = pruefung.warnungen.map(w => w.code)
    expect(codes).toContain('ZEILEN_UNUNTERSCHEIDBAR')
    // Ausdrücklich KEIN Fehler: der Vorgang ist zulässig (zwei Raten
    // gleicher Höhe am selben Tag), von einer Doppelbuchung in der Datei
    // aber nicht unterscheidbar. Ein Fehler blockierte hier einen
    // korrekten Export.
    expect(pruefung.ok).toBe(true)
  })

  it('das Debitorenkonto ist je Klient stabil über alle Buchungsarten', async () => {
    const { buchungen } = await exportiere()
    // K2 hat: Rechnung RE-0103, Zahlung darauf, Mahngebühr darauf,
    // Teilstorno ST-0002. Alle vier müssen dasselbe Debitorenkonto tragen.
    const k2Belege = ['RE-2026-0103', 'ST-2026-0002']
    const debitoren = new Set<string>()
    for (const b of buchungen.filter(x => k2Belege.includes(x.belegnummer))) {
      const debitor = /^\d{5}$/.test(b.konto) ? b.konto : b.gegenkonto
      if (/^\d{5}$/.test(debitor)) debitoren.add(debitor)
    }
    expect(debitoren.size).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Der Validator findet, was er finden soll
// ═══════════════════════════════════════════════════════════════════════

describe('Validator — Negativfälle', () => {
  const basis: DatevBuchungssatz = {
    umsatz: 10, sollHaben: 'S', konto: '10000', gegenkonto: ERLOES,
    belegdatum: '1504', belegnummer: 'RE-1', buchungstext: 'Rechnung RE-1',
  }

  function pruefe(...b: DatevBuchungssatz[]) {
    return pruefeBuchungssaetze({
      buchungen: b, kontenrahmen: 'SKR03', zeitraumVon: VON, zeitraumBis: BIS,
      sachkonten: SACHKONTEN_SKR03,
    })
  }

  it('ein unbekanntes Konto ist ein Fehler — DATEV legt es sonst still an', () => {
    const e = pruefe({ ...basis, gegenkonto: '7777' })
    expect(e.ok).toBe(false)
    expect(e.fehler.map(f => f.code)).toContain('KONTO_UNBEKANNT')
  })

  it('eine Debitorennummer außerhalb 10000–69999 wird abgewiesen', () => {
    expect(pruefe({ ...basis, konto: '9999' }).fehler.map(f => f.code)).toContain('KONTO_UNBEKANNT')
    expect(pruefe({ ...basis, konto: '70000' }).fehler.map(f => f.code)).toContain('KONTO_UNBEKANNT')
    expect(pruefe({ ...basis, konto: '10000' }).ok).toBe(true)
    expect(pruefe({ ...basis, konto: '69999' }).ok).toBe(true)
  })

  it('ein negativer oder nuller Umsatz ist ein Fehler — das Vorzeichen gehört ins S/H-Feld', () => {
    expect(pruefe({ ...basis, umsatz: -10 }).fehler.map(f => f.code)).toContain('BETRAG_NICHT_POSITIV')
    expect(pruefe({ ...basis, umsatz: 0 }).fehler.map(f => f.code)).toContain('BETRAG_NICHT_POSITIV')
  })

  it('mehr als zwei Nachkommastellen werden als Rundung gemeldet', () => {
    const e = pruefe({ ...basis, umsatz: 10.005 })
    expect(e.ok).toBe(true)
    expect(e.warnungen.map(w => w.code)).toContain('BETRAG_GERUNDET')
  })

  it('Konto gleich Gegenkonto ist eine wirkungslose Buchung', () => {
    const e = pruefe({ ...basis, konto: ERLOES, gegenkonto: ERLOES })
    expect(e.fehler.map(f => f.code)).toContain('KONTO_GLEICH_GEGENKONTO')
  })

  it('ein Belegdatum außerhalb des Exportzeitraums ist ein Fehler', () => {
    // Zeitraum ist April (04). 1503 = 15. März.
    const e = pruefe({ ...basis, belegdatum: '1503' })
    expect(e.fehler.map(f => f.code)).toContain('DATUM_AUSSERHALB_ZEITRAUM')
  })

  it('ein unmögliches Belegdatum wird als Formatfehler erkannt', () => {
    expect(pruefe({ ...basis, belegdatum: '1513' }).fehler.map(f => f.code)).toContain('DATUM_UNGUELTIG')
    expect(pruefe({ ...basis, belegdatum: '154' }).fehler.map(f => f.code)).toContain('DATUM_UNGUELTIG')
  })

  it('eine Zeile mit falscher Feldanzahl fällt in der CSV-Prüfung auf', () => {
    const kaputt = [
      '"EXTF";510;21;"Buchungsstapel";12;20260401000000000;;"9999999";"99999";"AE";"9999999";20260101;4;20260401;20260430;"";"";"";""',
      '"a";"b";"c";"d";"e";"f";"g";"h";"i";"j";"k";"l"',
      '10,00;"S";"10000";"8120";0;1504', // nur 6 Felder
    ].join('\r\n') + '\r\n'
    const e = pruefeDatevCsv({ csv: kaputt, sachkonten: SACHKONTEN_SKR03, erwarteteBuchungen: 1 })
    expect(e.fehler.map(f => f.code)).toContain('FELDANZAHL')
  })

  it('ein Semikolon im Klientennamen verschiebt keine Spalte', async () => {
    await sql(`UPDATE public.clients SET last_name = 'Meier;Schulz' WHERE id = $1`, [K1])
    await rechnung({ id: 'e000000a-0000-4000-8000-0000000000ea', nummer: 'RE-SEMI', betrag: 10 })
    const { csv, pruefung } = await exportiere()
    expect(pruefung.ok).toBe(true)
    const buchungsZeile = csv.split('\r\n')[2]
    expect(zerlegeCsvZeile(buchungsZeile)).toHaveLength(DATEV_FELDER)
    expect(zerlegeCsvZeile(buchungsZeile)[7]).toContain('Meier;Schulz')
  })

  it('ein Anführungszeichen im Klientennamen beendet das Feld nicht', async () => {
    await sql(`UPDATE public.clients SET last_name = 'O"Brien' WHERE id = $1`, [K1])
    await rechnung({ id: 'e000000b-0000-4000-8000-0000000000eb', nummer: 'RE-QUOTE', betrag: 10 })
    const { csv, pruefung } = await exportiere()
    expect(pruefung.ok).toBe(true)
    expect(zerlegeCsvZeile(csv.split('\r\n')[2])).toHaveLength(DATEV_FELDER)
  })

  it('eine manipulierte Debitorennummer bricht den Export ab statt Spalten zu verschieben', async () => {
    // Der Weg, auf dem so ein Wert live entstehen konnte (Befund D-1 aus
    // Phase 6B): POST /api/billing/datev/kontenzuordnung. Die Eingangs-
    // prüfung fängt ihn heute ab — hier steht der zweite Riegel: selbst
    // wenn der Wert schon in der Tabelle steht, kommt keine Datei heraus.
    await rechnung({ id: 'e000000c-0000-4000-8000-0000000000ec', nummer: 'RE-INJ', betrag: 10 })
    await sql(
      `INSERT INTO public.datev_kontenzuordnung (organization_id, client_id, debitorennummer)
       VALUES ($1,$2,$3)`,
      [ORG_A, K1, '1";"9999'],
    )
    const { pruefung, csv } = await exportiere()
    expect(pruefung.ok).toBe(false)
    expect(pruefung.fehler.map(f => f.code)).toContain('KONTO_UNBEKANNT')
    // Und selbst diese Datei bliebe spaltenrein — der Formatierer
    // entschärft, der Validator weist trotzdem ab.
    expect(zerlegeCsvZeile(csv.split('\r\n')[2])).toHaveLength(DATEV_FELDER)
  })

  it('ein leerer Zeitraum ergibt einen leeren, gültigen Stapel', async () => {
    const { buchungen, pruefung } = await exportiere()
    expect(buchungen).toHaveLength(0)
    expect(pruefung.ok).toBe(true)
    expect(pruefung.kennzahlen.zeilen).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Betragsformat
// ═══════════════════════════════════════════════════════════════════════

describe('Betragsformat', () => {
  it('datevBetragZuCent akzeptiert nur das DATEV-Format', () => {
    expect(datevBetragZuCent('1234,56')).toBe(123456)
    expect(datevBetragZuCent('0,00')).toBe(0)
    expect(datevBetragZuCent('1234.56')).toBeNull()   // Punkt statt Komma
    expect(datevBetragZuCent('1234,5')).toBeNull()    // eine Nachkommastelle
    expect(datevBetragZuCent('-12,00')).toBeNull()    // Vorzeichen gehört ins S/H
    expect(datevBetragZuCent('1.234,56')).toBeNull()  // Tausenderpunkt
  })

  it('jeder Betrag der erzeugten Datei ist zurücklesbar', async () => {
    await baueRepraesentativenMonat()
    const { csv } = await exportiere()
    for (const zeile of csv.split('\r\n').filter(Boolean).slice(2)) {
      expect(datevBetragZuCent(zerlegeCsvZeile(zeile)[0])).not.toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Was der Code NICHT wissen kann
// ═══════════════════════════════════════════════════════════════════════

describe('BUSINESS_INPUT_REQUIRED', () => {
  it('der Validator benennt die Vorgaben, die von der Kanzlei kommen müssen', () => {
    // Dieser Test hält fest, dass die Liste existiert und nicht leer ist.
    // Sie ist die Antwort auf „welche Konten nehmen wir?" — nämlich: das
    // entscheidet der Steuerberater, nicht dieses Repository.
    expect(BERATER_VORGABE_ERFORDERLICH.length).toBeGreaterThan(0)
    expect(BERATER_VORGABE_ERFORDERLICH).toContain('Beraternummer (DATEV-Kanzlei)')
  })

  it('ohne Berater- und Mandantennummer ist die Konfiguration unvollständig', async () => {
    const { isDatevConfigComplete } = await import('@/lib/billing/datev/datev-config')
    expect(isDatevConfigComplete({
      beraternummer: '', mandantennummer: '', kontenrahmen: 'SKR03',
      wjBeginn: '01-01', sachkontenlaenge: 4, naechsteDebitorennummer: 10000,
      erzeugerKuerzel: 'AE',
    })).toEqual({ ok: false, fehlend: ['Beraternummer', 'Mandantennummer'] })
  })
})
