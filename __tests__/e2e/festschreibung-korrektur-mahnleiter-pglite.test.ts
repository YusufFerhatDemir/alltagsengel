/**
 * E2E: Festschreibung → Korrektur nach Versand → Mahnleiter,
 * gegen echtes PostgreSQL
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die drei Fragen dieser Datei kann eine Fake-Datenbank prinzipiell nicht
 * beantworten, weil ihre Antwort in der Datenbank liegt:
 *
 *   1. WETTLAUF BEI DER FESTSCHREIBUNG. freezeInvoice() liest
 *      `invoices.frozen_at`, entscheidet daran, und schreibt spaeter
 *      mit einem schlichten `.eq('id', …)` zurueck — ohne Bedingung auf
 *      den gelesenen Zustand. Ob zwei gleichzeitige Laeufe trotzdem nur
 *      EINE Festschreibung ergeben, haengt allein am UNIQUE-Constraint
 *      `unique_invoice_version` auf invoice_snapshots. Genau das wird
 *      hier nachgewiesen — und was der zweite Lauf dabei meldet.
 *
 *   2. IDEMPOTENZ. Dieselbe Rechnung ein zweites Mal festschreiben darf
 *      keine zweite Fassung, keine zweite Rechnungsnummer und keinen
 *      zweiten Pruefpfad-Eintrag erzeugen.
 *
 *   3. MAHNLEITER. Eine Stufe je Lauf, nicht zweimal am selben Tag, und
 *      nie ueber die letzte Stufe hinaus — gegen die echten Spalten,
 *      Defaults und CHECKs, nicht gegen einen Nachbau.
 *
 * Dazu die Verbindung zwischen 2 und 3: eine offene Korrektur nach dem
 * Versand muss den Mahnlauf STOPPEN. Eine Mahnung fuer einen Betrag, der
 * gerade korrigiert wird, ist die teuerste Art von Fehler in dieser Kette.
 *
 * WAS GEMOCKT IST: nur die Aussenkanten — PDF-Erzeugung und E-Mail. Der
 * Auto-Versand der Festschreibung wird nicht eingeschaltet.
 *
 * PREISE: Testwerte innerhalb der In-Memory-Instanz. Der Tarif ist ein
 * PRIVAT-Tarif; es wird kein Kassensatz behauptet.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueMahnTabellen, STAMM_ORG } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'

const halter = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => halter.client,
}))

vi.mock('@/lib/pdf/rechnung-paket', () => ({
  erzeugeRechnungsPaket: async (_c: unknown, p: { invoiceId: string }) => ({
    invoiceId: p.invoiceId, invoiceNumber: 'RE-TEST', belegart: 'rechnung',
    pdfBytes: new Uint8Array([37, 80, 68, 70]), checksum: 'a'.repeat(64),
    pageCount: 1, storagePath: null,
  }),
  RechnungsPaketError: class extends Error {},
}))

import { freezeInvoice, correctInvoice } from '@/lib/billing/core/invoice-engine'
import { runDunningRun, DUNNING_DAYS } from '@/lib/billing/core/dunning'

// ─────────────────────────────────────────────────────────────────────
const ORG    = STAMM_ORG
const ADMIN  = '00000000-0000-4000-8000-0000000000f1'
const KUNDE  = '00000000-0000-4000-8000-0000000000f2'

/** Testtarif: 30,00 EUR/Stunde, Rechtsgrundlage privat, verifiziert. */
const TARIF_PREIS_CENT = 3000

let db: PGlite
let admin: SupabaseClient

function vorTagen(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

let zaehler = 0

/** Rechnungsentwurf mit einer Position. */
async function legeEntwurf(opts: {
  betragEuro: number
  tageUeberfaellig?: number
  status?: string
}): Promise<string> {
  zaehler++
  const nummer = 7000 + zaehler
  const ueber = opts.tageUeberfaellig ?? 0
  const { data, error } = await admin.from('invoices').insert({
    organization_id: ORG,
    client_id: KUNDE,
    invoice_number: String(nummer),
    period_start: vorTagen(ueber + 44),
    period_end: vorTagen(ueber + 15),
    due_date: vorTagen(ueber),
    status: opts.status ?? 'entwurf',
    total_amount: opts.betragEuro,
    paid_amount: 0,
    dunning_level: 'offen',
    payment_terms_days: 14,
  }).select('id')
  if (error) throw new Error(`Rechnung nicht anlegbar: ${error.message}`)
  const id = String((data as Array<{ id: string }>)[0].id)

  const { error: itemErr } = await admin.from('invoice_items').insert({
    invoice_id: id,
    organization_id: ORG,
    description: 'betreuung_45a',
    date: vorTagen(ueber + 20),
    duration_minutes: 60,
    amount: opts.betragEuro,
  })
  if (itemErr) throw new Error(`Position nicht anlegbar: ${itemErr.message}`)
  return id
}

async function zeilen<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query<T>(sql, params)
  return r.rows
}

async function zaehle(tabelle: string, bedingung = 'TRUE'): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public."${tabelle}" WHERE ${bedingung}`
  )
  return r.rows[0]?.n ?? 0
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueMahnTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
  halter.client = admin

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'verwaltung@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status)
    VALUES ('${ORG}', 'Mandant Alpha', 'hessen', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, role)
    VALUES ('${ADMIN}', 'verwaltung@example.org', 'admin');

    INSERT INTO public.clients
      (id, organization_id, customer_number, first_name, last_name, email, zip_code)
    VALUES ('${KUNDE}', '${ORG}', 'A-0001', 'Erika', 'Musterfrau', 'erika@example.org', '60311');

    INSERT INTO public.billing_tariffs
      (organization_id, leistungsart, rechtsgrundlage, verguetungsart,
       preis_cent, einheit, gueltig_ab, tarif_status, tarifquelle)
    VALUES ('${ORG}', 'betreuung_45a', 'privat', 'zeit_stunde',
            ${TARIF_PREIS_CENT}, 'stunde', '2020-01-01', 'verified', 'Testfixture');
  `)
}, 120_000)

afterAll(async () => {
  await db?.close()
})

// ═════════════════════════════════════════════════════════════════════
describe('Idempotenz: dieselbe Rechnung zweimal festschreiben', () => {
  let rechnung: string

  beforeAll(async () => {
    rechnung = await legeEntwurf({ betragEuro: 30 })
    await admin.from('invoices').update({ status: 'geprueft' }).eq('id', rechnung)
  })

  it('der erste Lauf schreibt fest', async () => {
    const r = await freezeInvoice(admin, rechnung, ADMIN, ORG)
    expect(r.version).toBe(1)
    const [inv] = await zeilen<{ status: string; frozen_at: string | null }>(
      'SELECT * FROM public.invoices WHERE id = $1', [rechnung]
    )
    expect(inv.status).toBe('freigegeben')
    expect(inv.frozen_at).not.toBeNull()
  })

  it('der zweite Lauf wird abgewiesen, nicht durchgewinkt', async () => {
    // Abgewiesen wird schon der Statusuebergang „Freigegeben →
    // Freigegeben"; die spaetere `frozen_at`-Pruefung greift erst bei
    // einem Alt-Status ausserhalb der Zustandsmaschine. Beide Wege sind
    // Ablehnungen — die Zusicherung ist, dass KEIN zweiter Durchlauf
    // stattfindet, nicht welcher der beiden Riegel zuerst greift.
    await expect(freezeInvoice(admin, rechnung, ADMIN, ORG))
      .rejects.toThrow(/bereits festgeschrieben|Statusübergang/)
  })

  it('es gibt genau EINE Fassung und EINEN Pruefpfad-Eintrag', async () => {
    expect(await zaehle('invoice_snapshots', `invoice_id = '${rechnung}'`)).toBe(1)
    expect(await zaehle(
      'billing_audit_trail',
      `entity_id = '${rechnung}' AND action = 'frozen'`
    )).toBe(1)
  })

  it('die Rechnungsnummer bleibt dieselbe — der abgewiesene Lauf verbraucht keine', async () => {
    const [inv] = await zeilen<{ invoice_number: string; invoice_number_formatted: string }>(
      'SELECT * FROM public.invoices WHERE id = $1', [rechnung]
    )
    expect(inv.invoice_number_formatted).toBe(inv.invoice_number)
    // Eine Luecke im Nummernkreis waere ein Verstoss gegen die
    // Fortlaufigkeit — der Zaehler darf gar nicht angefasst worden sein.
    const seq = await zeilen(
      'SELECT * FROM public.billing_number_sequences WHERE organization_id = $1', [ORG]
    )
    expect(seq).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Wettlauf: zwei gleichzeitige Festschreibungen', () => {
  let rechnung: string
  let ergebnisse: PromiseSettledResult<unknown>[]

  beforeAll(async () => {
    rechnung = await legeEntwurf({ betragEuro: 45 })
    await admin.from('invoices').update({ status: 'geprueft' }).eq('id', rechnung)
    ergebnisse = await Promise.allSettled([
      freezeInvoice(admin, rechnung, ADMIN, ORG),
      freezeInvoice(admin, rechnung, ADMIN, ORG),
    ])
  })

  it('genau einer der beiden Laeufe kommt durch', () => {
    const erfolge = ergebnisse.filter(e => e.status === 'fulfilled')
    expect(erfolge).toHaveLength(1)
  })

  it('der unterlegene Lauf scheitert — er meldet keinen Erfolg', () => {
    const fehler = ergebnisse.find(e => e.status === 'rejected') as PromiseRejectedResult
    expect(fehler).toBeTruthy()
    // Zwei Riegel liegen hintereinander: der UNIQUE-Constraint auf
    // (invoice_id, version) faengt den Zweiten meist schon am Snapshot ab,
    // und seit dem CAS-Guard schreibt auch die Festschreibung selbst nur
    // noch `WHERE frozen_at IS NULL`. Frueher war NUR der Constraint da —
    // ein fremder Nebeneffekt, kein Vorsatz. Der Test unten
    // ('Festschreibung schreibt nur, solange frozen_at leer ist') haelt
    // den zweiten Riegel einzeln fest.
    expect(String(fehler.reason)).toMatch(
      /Snapshot konnte nicht erstellt werden|unique_invoice_version|bereits festgeschrieben|zwischenzeitlich festgeschrieben/
    )
  })

  it('es entsteht nur EINE Fassung', async () => {
    expect(await zaehle('invoice_snapshots', `invoice_id = '${rechnung}'`)).toBe(1)
  })

  it('und nur EIN Pruefpfad-Eintrag', async () => {
    expect(await zaehle(
      'billing_audit_trail',
      `entity_id = '${rechnung}' AND action = 'frozen'`
    )).toBe(1)
  })

  it('die Rechnung steht danach auf freigegeben mit Version 1', async () => {
    const [inv] = await zeilen<{ status: string; version: number }>(
      'SELECT * FROM public.invoices WHERE id = $1', [rechnung]
    )
    expect(inv.status).toBe('freigegeben')
    expect(Number(inv.version)).toBe(1)
  })

  it('der Constraint, an dem das haengt, existiert wirklich', async () => {
    const treffer = await zeilen<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.invoice_snapshots'::regclass
          AND conname = 'unique_invoice_version'`
    )
    expect(treffer).toHaveLength(1)
  })

  /**
   * Der zweite Riegel, einzeln geprueft.
   *
   * Der Wettlauf oben laeuft in der Praxis in den Snapshot-Constraint.
   * Das ist ein Nebeneffekt einer fremden Bedingung: wer sie entfernt
   * oder die Versionszaehlung aendert, oeffnet die Doppelfestschreibung
   * wieder, ohne dass hier ein Test rot wird.
   *
   * Deshalb wird das Fenster hier direkt aufgemacht: die Rechnung wird
   * NACH dem Lesen und NACH dem Snapshot von aussen festgeschrieben —
   * genau der Zustand, den ein paralleler Lauf hinterlaesst. Das
   * abschliessende UPDATE darf dann nichts mehr anfassen.
   */
  it('Festschreibung schreibt nur, solange frozen_at leer ist', async () => {
    const zweite = await legeEntwurf({ betragEuro: 77 })
    await admin.from('invoices').update({ status: 'geprueft' }).eq('id', zweite)

    const FREMD = '2020-01-01T00:00:00.000Z'
    const original = (admin as unknown as { from: (t: string) => unknown }).from
    let geschoben = false
    ;(admin as unknown as { from: (t: string) => unknown }).from = function (tabelle: string) {
      const b = original.call(this, tabelle) as Record<string, unknown>
      if (tabelle === 'invoice_snapshots' && !geschoben) {
        const echt = (b.insert as (v: unknown) => unknown).bind(b)
        b.insert = (werte: unknown) => {
          const kette = echt(werte) as Record<string, unknown>
          const echtesSelect = (kette.select as (s?: string) => unknown).bind(kette)
          kette.select = (spalten?: string) => {
            const s2 = echtesSelect(spalten) as Record<string, unknown>
            const echtesSingle = (s2.single as () => Promise<unknown>).bind(s2)
            s2.single = async () => {
              const r = await echtesSingle()
              if (!geschoben) {
                geschoben = true
                // Der parallele Lauf war schneller.
                await db.query(
                  `UPDATE public.invoices SET frozen_at = $2, status = 'freigegeben' WHERE id = $1`,
                  [zweite, FREMD] as never[],
                )
              }
              return r
            }
            return s2
          }
          return kette
        }
      }
      return b
    } as never

    try {
      await expect(freezeInvoice(admin, zweite, ADMIN, ORG))
        .rejects.toThrow(/zwischenzeitlich festgeschrieben/)
    } finally {
      ;(admin as unknown as { from: unknown }).from = original as never
    }

    // Der fremde Zeitpunkt steht unveraendert — nichts ueberschrieben.
    const [inv] = await zeilen<{ frozen_at: string; invoice_number_formatted: string | null }>(
      'SELECT * FROM public.invoices WHERE id = $1', [zweite]
    )
    expect(new Date(inv.frozen_at).toISOString()).toBe(FREMD)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Korrekturlauf nach dem Versand', () => {
  let original: string
  let korrektur: { correctionInvoiceId: string } | null = null

  beforeAll(async () => {
    original = await legeEntwurf({ betragEuro: 30, tageUeberfaellig: 45 })
    await admin.from('invoices').update({ status: 'geprueft' }).eq('id', original)
    await freezeInvoice(admin, original, ADMIN, ORG)
    // Versendet: die Rechnung ist beim Kunden.
    await admin.from('invoices')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', original)
  })

  it('eine versendete Rechnung laesst sich korrigieren', async () => {
    const r = await correctInvoice(
      admin, original,
      [{
        leistungsart: 'betreuung_45a',
        leistungsdatum: vorTagen(60),
        menge: 1,
        einzelpreisCent: TARIF_PREIS_CENT,
        gesamtpreisCent: TARIF_PREIS_CENT,
      }],
      'Position doppelt berechnet',
      ADMIN, ORG,
    )
    korrektur = r as unknown as { correctionInvoiceId: string }
    expect(korrektur.correctionInvoiceId).toBeTruthy()
  })

  it('die Korrekturrechnung zeigt auf das Original', async () => {
    const [inv] = await zeilen<{ correction_of: string; correction_type: string; status: string }>(
      'SELECT * FROM public.invoices WHERE id = $1', [korrektur!.correctionInvoiceId]
    )
    expect(inv.correction_of).toBe(original)
    expect(inv.correction_type).toBe('korrektur')
  })

  it('der Korrektur-Eintrag steht in invoice_corrections', async () => {
    const [k] = await zeilen<{ original_invoice_id: string; status: string }>(
      'SELECT * FROM public.invoice_corrections WHERE original_invoice_id = $1', [original]
    )
    expect(k.original_invoice_id).toBe(original)
  })

  it('BEFUND-SICHERUNG: die offene Korrektur STOPPT den Mahnlauf', async () => {
    // Eine Mahnung ueber einen Betrag, der gerade korrigiert wird, geht an
    // einen echten Kunden — und ist danach nicht mehr einzufangen.
    const lauf = await runDunningRun(admin, ORG, ADMIN, { dryRun: true })
    const eintrag = lauf.blockiert.find(b => b.invoiceId === original)
    expect(eintrag, 'die Rechnung mit offener Korrektur muss als blockiert erscheinen').toBeTruthy()
  })

  it('und sie wird auch nicht still eskaliert', async () => {
    await runDunningRun(admin, ORG, ADMIN)
    const [inv] = await zeilen<{ dunning_level: string }>(
      'SELECT * FROM public.invoices WHERE id = $1', [original]
    )
    expect(inv.dunning_level).toBe('offen')
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('Mahnleiter gegen echte Spalten', () => {
  let rechnung: string

  beforeAll(async () => {
    // 200 Tage ueberfaellig: jede Stufe waere rein nach Frist sofort
    // erreichbar. Genau deshalb ist das der richtige Fall, um „eine Stufe
    // je Lauf" zu pruefen.
    rechnung = await legeEntwurf({ betragEuro: 60, tageUeberfaellig: 200 })
    await admin.from('invoices').update({ status: 'geprueft' }).eq('id', rechnung)
    await freezeInvoice(admin, rechnung, ADMIN, ORG)
  })

  /** Wiedervorlage vordatieren, damit der naechste Lauf greifen darf. */
  async function wiedervorlageFaellig(): Promise<void> {
    await db.query(
      `UPDATE public.dunning_entries
          SET next_dunning_at = now() - interval '1 day'
        WHERE invoice_id = $1`, [rechnung]
    )
  }

  async function stufe(): Promise<string> {
    const [e] = await zeilen<{ dunning_level: string }>(
      'SELECT * FROM public.dunning_entries WHERE invoice_id = $1', [rechnung]
    )
    return e.dunning_level
  }

  it('die Festschreibung legt den Mahneintrag auf "offen" an', async () => {
    expect(await stufe()).toBe('offen')
  })

  it('ein Lauf hebt genau EINE Stufe — nicht direkt bis Inkasso', async () => {
    await runDunningRun(admin, ORG, ADMIN)
    expect(await stufe()).toBe('erinnerung')
  })

  it('ein zweiter Lauf am selben Tag hebt NICHT noch einmal', async () => {
    // Die Sperre ist die Wiedervorlage `next_dunning_at`. Ohne sie
    // bekaeme der Kunde in einer Cron-Stunde mehrere Mahnstufen.
    await runDunningRun(admin, ORG, ADMIN)
    await runDunningRun(admin, ORG, ADMIN)
    expect(await stufe()).toBe('erinnerung')
  })

  it('die Wiedervorlage steht dafuer in der Zukunft', async () => {
    const [e] = await zeilen<{ next_dunning_at: Date | null }>(
      'SELECT * FROM public.dunning_entries WHERE invoice_id = $1', [rechnung]
    )
    expect(e.next_dunning_at).not.toBeNull()
    expect(new Date(e.next_dunning_at as unknown as string).getTime())
      .toBeGreaterThan(Date.now())
  })

  it('erst nach der Wiedervorlage geht es weiter — Stufe fuer Stufe', async () => {
    const erwartet = ['mahnung_1', 'mahnung_2', 'letzte_mahnung', 'inkasso_vorbereitung']
    for (const ziel of erwartet) {
      await wiedervorlageFaellig()
      await runDunningRun(admin, ORG, ADMIN)
      expect(await stufe()).toBe(ziel)
    }
  })

  it('ueber die letzte Stufe hinaus wird NICHT eskaliert', async () => {
    await wiedervorlageFaellig()
    const lauf = await runDunningRun(admin, ORG, ADMIN)
    expect(await stufe()).toBe('inkasso_vorbereitung')
    expect(lauf.eskaliert.map(e => e.invoiceId)).not.toContain(rechnung)
  })

  it('auch mehrere Laeufe hintereinander aendern daran nichts', async () => {
    for (let i = 0; i < 3; i++) {
      await wiedervorlageFaellig()
      await runDunningRun(admin, ORG, ADMIN)
    }
    expect(await stufe()).toBe('inkasso_vorbereitung')
  })

  it('die Fristen der Leiter stehen fest', () => {
    expect(DUNNING_DAYS.erinnerung).toBe(14)
    expect(DUNNING_DAYS.mahnung_1).toBe(28)
    expect(DUNNING_DAYS.mahnung_2).toBe(42)
  })

  it('jede Eskalation steht im Pruefpfad — und keine ueberzaehlige', async () => {
    // Der Eintrag haengt an der dunning_entries-Zeile, nicht an der
    // Rechnung: entity_id ist dort die Mahn-ID.
    const [e] = await zeilen<{ id: string }>(
      'SELECT id FROM public.dunning_entries WHERE invoice_id = $1', [rechnung]
    )
    const stufen = await zeilen<{ new_state: { level: string } }>(
      `SELECT new_state FROM public.billing_audit_trail
        WHERE entity_type = 'dunning' AND action = 'escalated' AND entity_id = $1
        ORDER BY created_at`, [e.id]
    )
    // Fuenf Stufen, jede genau einmal — trotz der zusaetzlichen Laeufe am
    // selben Tag und der drei Laeufe nach Erreichen der letzten Stufe.
    expect(stufen.map(z => z.new_state.level)).toEqual([
      'erinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung', 'inkasso_vorbereitung',
    ])
  })
})
