/**
 * CHAOS — Ausleitung und Eingabe unter Störung
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Track 8 von Phase 7, zweiter Teil. `geldweg-chaos.test.ts` prüft, was
 * passiert, wenn die Datenbank mitten in einer Buchung wegbricht. Diese
 * Datei prüft die beiden anderen Ränder:
 *
 *   · die AUSLEITUNG — der DATEV-Export, wenn Storage oder Datenbank
 *     nicht mitspielen,
 *   · die EINGABE — was passiert mit einer kaputten IBAN oder einem
 *     Cent-Betrag, der keiner ist.
 *
 * Nicht hier, weil anderswo bereits abgedeckt (und deshalb hier nur
 * benannt statt doppelt geprüft):
 *   · Resend-Zeitüberschreitung, 401, 422, 429, 5xx, Antwort ohne
 *     Nachrichten-ID, fehlender RESEND_API_KEY, Idempotenzschlüssel
 *     → `__tests__/notifications/resend-fehlerpfade.test.ts`
 *   · CAMT-Datei zweimal hochgeladen, überlappende Auszüge, zwei gleiche
 *     Beträge, fremder Mandant, unlesbare Beträge
 *     → `__tests__/e2e/camt-pipeline-pglite.test.ts`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen, baueDatevTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { mitChaos } from './helpers/chaos-client'
import { generateBuchungssaetze } from '@/lib/billing/datev/buchungssatz-generator'
import { generateDatevCsv, type DatevHeaderParams } from '@/lib/billing/datev/datev-format'
import { alleSachkonten, pruefeDebitorennummer } from '@/lib/billing/datev/kontenrahmen'
import { pruefeBuchungssaetze, pruefeDatevCsv, fasseZusammen } from '@/lib/billing/datev/datev-validator'
import { validateIban } from '@/lib/billing/sepa/pain008'
import { euroZuCent, centRunden } from '@/lib/geld'
import { parseBetragZuCent } from '@/lib/admin/betrag'

const ORG = 'aaaaaaaa-0000-4000-8000-00000000c801'
const KLIENT = 'cccccccc-0000-4000-8000-00000000c802'
const INV = 'dddddddd-0000-4000-8000-00000000c803'
const VON = '2026-05-01'
const BIS = '2026-05-31'

const SACHKONTEN = alleSachkonten('SKR03')

const KOPF: DatevHeaderParams = {
  beraternummer: '9999999', mandantennummer: '99999', wjBeginn: '20260101',
  sachkontenlaenge: 4, datumVon: '20260501', datumBis: '20260531', erzeugerKuerzel: 'AE',
}

let db: PGlite
let admin: SupabaseClient

async function sql(text: string, params: unknown[] = []): Promise<void> {
  await db.query(text, params as never[])
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
             public.payment_allocations, public.payments, public.dunning_entries,
             public.zahlungseingaenge, public.camt_imports,
             public.invoice_items, public.invoices, public.clients, public.organizations
    RESTART IDENTITY CASCADE
  `)
  await sql(`INSERT INTO public.organizations (id, name) VALUES ($1,'Mandant A')`, [ORG])
  await sql(
    `INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name)
     VALUES ($1,$2,'K-1','Anna','Beispiel')`, [KLIENT, ORG])
  await sql(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, status, created_at)
     VALUES ($1,$2,$3,'RE-2026-0501','RE-2026-0501',$4,$5,120,'sent','2026-05-12T09:00:00Z')`,
    [INV, ORG, KLIENT, VON, BIS])
})

function params() {
  return { organizationId: ORG, zeitraumVon: VON, zeitraumBis: BIS, kontenrahmen: 'SKR03' as const }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. DATEV-Export bricht mittendrin ab
// ═══════════════════════════════════════════════════════════════════════

describe('DATEV-Export unter Störung', () => {
  it('ein Lesefehler auf invoices erzeugt KEINEN leeren Stapel, sondern einen Abbruch', async () => {
    // Der teuerste denkbare Ausgang wäre eine Datei mit null
    // Rechnungsbuchungen, die aussieht wie „in diesem Monat war nichts".
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'invoices', operation: 'select', fehler: { message: 'canceling statement due to statement timeout', code: '57014' } },
    ])
    await expect(generateBuchungssaetze(chaos.client as unknown as SupabaseClient, params()))
      .rejects.toThrow(/Rechnungen für DATEV nicht lesbar/)
  })

  it('ein Lesefehler auf den Zahlungen bricht ebenfalls ab', async () => {
    // Ein Stapel mit allen Erlösen und KEINEM Zahlungseingang sieht aus
    // wie ein Monat, in dem niemand bezahlt hat. Jeder Debitorensaldo
    // wäre falsch, und auffallen könnte das erst bei der Saldenabstimmung.
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'payment_allocations', operation: 'select', fehler: { message: 'connection reset by peer', code: '08006' } },
    ])
    await expect(generateBuchungssaetze(chaos.client as unknown as SupabaseClient, params()))
      .rejects.toThrow(/Zahlungszuordnungen für DATEV nicht lesbar/)
  })

  it('bricht die Vergabe der Debitorennummer ab, entsteht keine Buchung auf ein leeres Konto', async () => {
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'datev_kontenzuordnung', operation: 'insert', fehler: { message: 'deadlock detected', code: '40P01' } },
    ])
    await expect(generateBuchungssaetze(chaos.client as unknown as SupabaseClient, params()))
      .rejects.toThrow(/Debitorennummer konnte nicht erstellt werden/)
  })

  it('ein Buchungsstapel mit unbekanntem Konto besteht die Prüfung NICHT', async () => {
    // Die Prüfung sitzt im Export-Service vor dem Storage-Upload: eine
    // Datei mit einem Konto, das DATEV nicht kennt, wird beim Import
    // stillschweigend als neues Konto angelegt.
    await sql(
      `INSERT INTO public.datev_kontenzuordnung (organization_id, client_id, debitorennummer)
       VALUES ($1,$2,'99999')`, [ORG, KLIENT])

    const { buchungen } = await generateBuchungssaetze(admin, params())
    const pruefung = pruefeBuchungssaetze({
      buchungen, kontenrahmen: 'SKR03', zeitraumVon: VON, zeitraumBis: BIS, sachkonten: SACHKONTEN,
    })
    expect(pruefung.ok).toBe(false)
    expect(pruefung.fehler.map(f => f.code)).toContain('KONTO_UNBEKANNT')
  })

  it('die Datei bleibt spaltenrein, auch wenn ein Stammdatenfeld Trennzeichen enthält', async () => {
    await sql(`UPDATE public.clients SET last_name = 'A";B;C=1' WHERE id = $1`, [KLIENT])
    const { buchungen } = await generateBuchungssaetze(admin, params())
    const csv = generateDatevCsv(KOPF, buchungen)
    const pruefung = fasseZusammen(
      pruefeBuchungssaetze({ buchungen, kontenrahmen: 'SKR03', zeitraumVon: VON, zeitraumBis: BIS, sachkonten: SACHKONTEN }),
      pruefeDatevCsv({ csv, sachkonten: SACHKONTEN, erwarteteBuchungen: buchungen.length }),
    )
    expect(pruefung.fehler.map(f => `${f.code}: ${f.meldung}`)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Ungültige IBAN
// ═══════════════════════════════════════════════════════════════════════

describe('IBAN', () => {
  it('weist eine IBAN mit falscher Prüfsumme ab', () => {
    // Eine IBAN, die nur „richtig aussieht", wird von der Bank
    // zurückgewiesen — nach der Einreichung, mit Rücklastschriftgebühr.
    expect(validateIban('DE02120300000000202051')).toBe(true)  // offizielle Testbank-IBAN
    expect(validateIban('DE02120300000000202052')).toBe(false) // eine Ziffer verdreht
  })

  it('weist zu kurze, zu lange und formatfremde Werte ab', () => {
    for (const kaputt of [
      '', 'DE', 'DE0212', 'XX02120300000000202051',
      'DE021203000000002020510000000000000000',
      '1202120300000000202051',
      'DE-02-1203-0000-0000-2020-51-XX',
    ]) {
      expect(validateIban(kaputt), `"${kaputt}" haette abgewiesen werden muessen`).toBe(false)
    }
  })

  it('akzeptiert Leerzeichen und Kleinschreibung — das ist Darstellung, kein Fehler', () => {
    expect(validateIban('de02 1203 0000 0000 2020 51')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Ungültiger Cent-Betrag
// ═══════════════════════════════════════════════════════════════════════

describe('Betragseingabe', () => {
  it('ein Euro-Zeichen mitten in der Zahl wird abgewiesen, nicht verhundertfacht', () => {
    // Befund G-1 aus Phase 6B: `12€34` ergab 1.234,00 EUR. Der Vertipper
    // ist naheliegend, der Schaden war ein Faktor 100.
    // Der Parser meldet Ungültigkeit als NaN, nicht als null — der
    // Aufrufer prüft mit Number.isNaN(). Wichtig ist nur, dass „12€34"
    // NICHT 123400 ergibt.
    expect(Number.isNaN(parseBetragZuCent('12€34'))).toBe(true)
    expect(parseBetragZuCent('12,34 €')).toBe(1234)
    expect(parseBetragZuCent('€ 12,34')).toBe(1234)
  })

  it('die englische Schreibweise wird nicht als Tausenderpunkt gelesen', () => {
    expect(parseBetragZuCent('12.50')).toBe(1250)
    expect(parseBetragZuCent('1.250,00')).toBe(125000)
  })

  it('Müll ergibt NaN — nicht 0 und nicht eine halbe Zahl', () => {
    // Der Unterschied zählt: `0` ist ein gültiger Betrag. Wer eine
    // ungültige Eingabe als 0 durchreicht, bucht eine Nullzeile, die
    // niemand als Fehler erkennt.
    for (const kaputt of ['', '   ', 'abc', '12,5x', '--12', '1,2,3', '12 34 €x']) {
      expect(Number.isNaN(parseBetragZuCent(kaputt)), `"${kaputt}"`).toBe(true)
    }
    // Gegenprobe: 0 ist gültig und darf NICHT als Müll gelten.
    expect(parseBetragZuCent('0,00')).toBe(0)
  })

  it('drei Nachkommastellen werden gerundet, nicht abgewiesen', () => {
    // Festgehaltener IST-Zustand: „12,345" ist keine Fehleingabe, sondern
    // wird kaufmännisch auf 12,35 € gerundet. Der Nutzer sieht das
    // Ergebnis im Dialog, bevor er speichert.
    expect(parseBetragZuCent('12,345')).toBe(1235)
  })

  it('die Cent-Rundung ist symmetrisch — eine Gutschrift gleicht sich auf null aus', () => {
    // Math.round(100.5) = 101, Math.round(-100.5) = -100. Auf einer
    // Gutschrift stünde damit ein Cent weniger als auf der Rechnung, die
    // sie ausgleichen soll.
    expect(centRunden(100.5)).toBe(101)
    expect(centRunden(-100.5)).toBe(-101)
    expect(centRunden(100.5) + centRunden(-100.5)).toBe(0)
  })

  it('euroZuCent verschiebt das Komma, statt zu multiplizieren', () => {
    // 0.1 + 0.2 ist in Gleitkomma nicht 0.3 — und 8.7 * 100 ist 869.9999…
    expect(euroZuCent(8.7)).toBe(870)
    expect(euroZuCent(1.005)).toBe(101)
    expect(euroZuCent('1234.56')).toBe(123456)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Manipulierte Stammdaten
// ═══════════════════════════════════════════════════════════════════════

describe('Debitorennummer', () => {
  it('nur ganzzahlige Nummern im vergebenen Bereich kommen durch', () => {
    expect(pruefeDebitorennummer('10000').ok).toBe(true)
    expect(pruefeDebitorennummer('69999').ok).toBe(true)
    expect(pruefeDebitorennummer('9999').ok).toBe(false)
    expect(pruefeDebitorennummer('70000').ok).toBe(false)
  })

  it('eine Nummer mit CSV-Trennzeichen oder Formelzeichen wird abgewiesen', () => {
    // Befund D-1 aus Phase 6B: `1";"9999` beendete das Feld mitten in der
    // Zeile und schob alles Folgende in die falsche Spalte.
    for (const kaputt of ['1";"9999', '=1+1', '12345;99', '1 2345', '', '  ', 'abc']) {
      expect(pruefeDebitorennummer(kaputt).ok, `"${kaputt}"`).toBe(false)
    }
  })

  it('die Datenbank lässt keine zweite Nummer für denselben Klienten zu', async () => {
    await sql(
      `INSERT INTO public.datev_kontenzuordnung (organization_id, client_id, debitorennummer)
       VALUES ($1,$2,'10000')`, [ORG, KLIENT])
    await expect(sql(
      `INSERT INTO public.datev_kontenzuordnung (organization_id, client_id, debitorennummer)
       VALUES ($1,$2,'10001')`, [ORG, KLIENT],
    )).rejects.toThrow(/unique|duplicate/i)
  })
})
