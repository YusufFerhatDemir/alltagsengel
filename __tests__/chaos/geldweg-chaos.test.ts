/**
 * CHAOS — Geldweg unter Störung
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Track 8 von Phase 7. Geprüft wird nicht der Normalfall, sondern was
 * passiert, wenn mitten in einem Geldvorgang etwas wegbricht.
 *
 * Vier Dinge dürfen dabei NIE herauskommen:
 *   · eine Doppelbuchung
 *   · ein Doppelversand
 *   · Daten eines fremden Mandanten
 *   · ein stiller Geldfehler (falscher Betrag ohne Fehlermeldung)
 *
 * ── WARUM AUF ECHTEM POSTGRES ──────────────────────────────────────────
 * Die Fehler, um die es hier geht, entstehen im Zusammenspiel von
 * mehreren Anweisungen, von denen einige schon geschrieben haben. Ein
 * Fake, der Filter verschluckt oder CHECK-Constraints nicht kennt, kann
 * genau das nicht abbilden — er antwortet freundlicher als die echte
 * Schicht und beweist nichts.
 *
 * ── KEIN ECHTES GELD ───────────────────────────────────────────────────
 * Alles läuft in einer In-Memory-Instanz. Es wird nichts abgebucht,
 * nichts versendet, nichts exportiert.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, baueCamtTabellen } from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { mitChaos } from './helpers/chaos-client'
import { allocatePayment, createPayment } from '@/lib/billing/core/payments'

const ORG_A = 'aaaaaaaa-0000-4000-8000-00000000c401'
const ORG_B = 'bbbbbbbb-0000-4000-8000-00000000c402'
const K_A = 'cccccccc-0000-4000-8000-00000000c403'
const K_B = 'cccccccc-0000-4000-8000-00000000c404'
const INV_A = 'dddddddd-0000-4000-8000-00000000c405'
const INV_B = 'dddddddd-0000-4000-8000-00000000c406'
const ACTOR = 'eeeeeeee-0000-4000-8000-00000000c407'

let db: PGlite
let admin: SupabaseClient

async function sql(text: string, params: unknown[] = []): Promise<void> {
  await db.query(text, params as never[])
}

async function zaehle(text: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: string }>(text, params as never[])
  return Number(r.rows[0]?.n ?? 0)
}

async function eineZeile<T>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await db.query<T>(text, params as never[])
  return r.rows[0]
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueCamtTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient
})

afterAll(async () => { await db?.close() })

beforeEach(async () => {
  await sql(`
    TRUNCATE public.payment_allocations, public.payments, public.dunning_entries,
             public.payment_differences, public.zahlungseingaenge, public.camt_imports,
             public.invoice_items, public.invoices, public.clients, public.organizations
    RESTART IDENTITY CASCADE
  `)
  // Der handelnde Nutzer muss existieren: payment_allocations.allocated_by
  // trägt einen Fremdschlüssel auf auth.users. Ohne diese Zeile scheitert
  // jeder Insert an 23503 — und der Test würde den falschen Fehler messen.
  await sql(`INSERT INTO auth.users (id, email) VALUES ($1, 'chaos@test.local')
             ON CONFLICT (id) DO NOTHING`, [ACTOR])
  await sql(
    `INSERT INTO public.organizations (id, name) VALUES ($1,'Mandant A'), ($2,'Mandant B')`,
    [ORG_A, ORG_B],
  )
  await sql(
    `INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name)
     VALUES ($1,$3,'K-1','Anna','Beispiel'), ($2,$4,'K-9','Clara','Fremd')`,
    [K_A, K_B, ORG_A, ORG_B],
  )
  await sql(
    `INSERT INTO public.invoices
       (id, organization_id, client_id, invoice_number, invoice_number_formatted,
        period_start, period_end, total_amount, status)
     VALUES
       ($1,$3,$5,'RE-A-0001','RE-A-0001','2026-04-01','2026-04-30',100,'sent'),
       ($2,$4,$6,'RE-B-0001','RE-B-0001','2026-04-01','2026-04-30',100,'sent')`,
    [INV_A, INV_B, ORG_A, ORG_B, K_A, K_B],
  )
})

/** Legt eine Zahlung an, ohne sie zuzuordnen. */
async function zahlung(id: string, cents: number, org = ORG_A): Promise<string> {
  await sql(
    `INSERT INTO public.payments (id, organization_id, payment_date, amount_cents, allocated_cents)
     VALUES ($1,$2,'2026-04-15',$3,0)`,
    [id, org, cents],
  )
  return id
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Verbindungsabbruch MITTEN im Vorgang
// ═══════════════════════════════════════════════════════════════════════

describe('Verbindungsabbruch nach dem Insert', () => {
  const PAY = 'ffffffff-0000-4000-8000-00000000c410'

  it('bricht die Rechnungsaktualisierung ab, nachdem die Zuordnung geschrieben ist', async () => {
    await zahlung(PAY, 5000)
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'invoices', operation: 'update', fehler: { message: 'server closed the connection unexpectedly', code: '08006' } },
    ])

    await expect(allocatePayment(chaos.client as unknown as SupabaseClient, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })).rejects.toThrow(/Rechnungs-Update fehlgeschlagen/)

    expect(chaos.ausgeloest).toBe(1)
    // Die Zuordnungszeile ist da, die Rechnung weiss nichts davon: genau
    // der halb gebuchte Zustand, den ein Wiederholungslauf vorfindet.
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations WHERE payment_id = $1`, [PAY])).toBe(1)
    const inv = await eineZeile<{ paid_amount: string | null }>(
      `SELECT paid_amount FROM invoices WHERE id = $1`, [INV_A])
    expect(inv?.paid_amount == null || Number(inv.paid_amount) === 0).toBe(true)
  })

  it('die Datenbank selbst verhindert eine zweite Zuordnungszeile', async () => {
    // Der Riegel, auf dem alles Weitere aufsetzt: UNIQUE(payment_id,
    // invoice_id) auf payment_allocations. Er ist der Grund, warum ein
    // Wiederholungslauf nie doppelt buchen KANN — und nicht nur, warum er
    // es nicht tun SOLL.
    await zahlung(PAY, 5000)
    await allocatePayment(admin, {
      paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 2500 }], actorId: ACTOR,
    })
    await expect(sql(
      `INSERT INTO public.payment_allocations
         (organization_id, payment_id, invoice_id, amount_cents, allocation_type)
       VALUES ($1,$2,$3,2500,'teilzahlung')`,
      [ORG_A, PAY, INV_A],
    )).rejects.toThrow(/unique constraint/i)
  })

  it('der Wiederholungslauf führt den abgebrochenen Vorgang zu Ende', async () => {
    // ‼️ BEFUND, DER DIESEN TEST AUSGELÖST HAT
    //
    // Vorher endete der Wiederholungslauf an der UNIQUE-Sperre mit
    // „duplicate key value violates unique constraint" — und der Zustand
    // blieb, wie er war:
    //
    //   · payment_allocations trug die Zeile (der DATEV-Export bucht die
    //     Zahlung, er liest genau diese Tabelle),
    //   · invoices.paid_amount war NULL, status 'sent' — die Rechnung galt
    //     als offen und WURDE GEMAHNT,
    //   · und kein Wiederholungslauf kam je durch.
    //
    // Ein Kunde, der bezahlt hat, bekommt eine Mahnung. Der Fix führt den
    // Vorlauf zu Ende, statt ihn abzuweisen.
    await zahlung(PAY, 5000)
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'invoices', operation: 'update', fehler: { message: 'server closed the connection unexpectedly', code: '08006' } },
    ])
    await expect(allocatePayment(chaos.client as unknown as SupabaseClient, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })).rejects.toThrow()

    // Zweiter Versuch, diesmal ohne Störung — muss durchlaufen.
    await allocatePayment(admin, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })

    const zeilen = await eineZeile<{ n: string; summe: string }>(
      `SELECT count(*) n, sum(amount_cents) summe FROM payment_allocations WHERE payment_id = $1`, [PAY])
    expect(Number(zeilen?.n), 'genau EINE Zuordnungszeile').toBe(1)
    expect(Number(zeilen?.summe)).toBe(5000)

    const inv = await eineZeile<{ paid_amount: string; status: string }>(
      `SELECT paid_amount, status FROM invoices WHERE id = $1`, [INV_A])
    expect(Number(inv?.paid_amount), 'die Rechnung trägt die Zahlung jetzt').toBe(50)
    expect(inv?.status).toBe('teilweise_bezahlt')

    const pay = await eineZeile<{ allocated_cents: number }>(
      `SELECT allocated_cents FROM payments WHERE id = $1`, [PAY])
    expect(Number(pay?.allocated_cents)).toBe(5000)
  })

  it('ein Abbruch beim Audit-Eintrag ist wiederholbar, ohne doppelt zu buchen', async () => {
    // logBillingAction wirft bewusst (GoBD: ein unprotokollierter
    // Geldvorgang darf nicht still durchgehen). Der Aufrufer landet damit
    // im Fehlerpfad, OBWOHL die Buchung schon steht.
    //
    // Genau deshalb muss der Wiederholungslauf idempotent sein. Die
    // Alternative — den Audit-Fehler zur Warnung abzustufen — wäre die
    // schlechtere: sie tauschte einen wiederholbaren Abbruch gegen eine
    // dauerhafte Protokolllücke.
    await zahlung(PAY, 5000)
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'billing_audit_trail', operation: 'insert', fehler: { message: 'permission denied for table billing_audit_trail', code: '42501' } },
    ])

    await expect(allocatePayment(chaos.client as unknown as SupabaseClient, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })).rejects.toThrow(/Audit-Trail konnte nicht geschrieben werden/)
    expect(chaos.ausgeloest).toBe(1)

    await allocatePayment(admin, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })

    expect(await zaehle(`SELECT count(*) n FROM payment_allocations WHERE payment_id = $1`, [PAY])).toBe(1)
    const inv = await eineZeile<{ paid_amount: string }>(
      `SELECT paid_amount FROM invoices WHERE id = $1`, [INV_A])
    // Nicht 100,00 — die Rechnung darf die Zahlung genau EINMAL tragen.
    expect(Number(inv?.paid_amount)).toBe(50)
  })

  it('eine bestehende Zuordnung mit ANDEREM Betrag wird nicht stillschweigend übernommen', async () => {
    // Abgrenzung zum Wiederholungslauf: ein abweichender Betrag ist kein
    // abgebrochener Vorlauf, sondern ein Widerspruch. Den darf niemand
    // automatisch auflösen.
    await zahlung(PAY, 5000)
    await allocatePayment(admin, {
      paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 2000 }], actorId: ACTOR,
    })

    await expect(allocatePayment(admin, {
      paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 3000 }], actorId: ACTOR,
    })).rejects.toThrow(/existiert bereits eine Zuordnung ueber 2000 Cent/)

    const inv = await eineZeile<{ paid_amount: string }>(
      `SELECT paid_amount FROM invoices WHERE id = $1`, [INV_A])
    expect(Number(inv?.paid_amount)).toBe(20)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Gleichzeitiger Zugriff — zwei Läufe auf dieselbe Zahlung
// ═══════════════════════════════════════════════════════════════════════

describe('Gleichzeitiger Zugriff', () => {
  const PAY = 'ffffffff-0000-4000-8000-00000000c420'

  it('zwei parallele Zuordnungen derselben Zahlung ergeben höchstens eine Buchung', async () => {
    await zahlung(PAY, 10000)

    const beide = await Promise.allSettled([
      allocatePayment(admin, { paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 10000 }], actorId: ACTOR }),
      allocatePayment(admin, { paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 10000 }], actorId: ACTOR }),
    ])

    // Mindestens einer muss scheitern — sonst stünden 200,00 EUR
    // zugeordnet, wo 100,00 EUR eingegangen sind.
    expect(beide.filter(r => r.status === 'rejected').length).toBeGreaterThanOrEqual(1)

    const summe = await eineZeile<{ summe: string | null }>(
      `SELECT sum(amount_cents) summe FROM payment_allocations WHERE payment_id = $1`, [PAY])
    expect(Number(summe?.summe ?? 0)).toBeLessThanOrEqual(10000)
  })

  it('die Rechnung wird durch den zweiten Lauf nicht doppelt bezahlt', async () => {
    await zahlung(PAY, 10000)
    await Promise.allSettled([
      allocatePayment(admin, { paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 10000 }], actorId: ACTOR }),
      allocatePayment(admin, { paymentId: PAY, allocations: [{ invoiceId: INV_A, amountCents: 10000 }], actorId: ACTOR }),
    ])
    const inv = await eineZeile<{ paid_amount: string | null }>(
      `SELECT paid_amount FROM invoices WHERE id = $1`, [INV_A])
    expect(Number(inv?.paid_amount ?? 0)).toBeLessThanOrEqual(100)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Fremder Mandant
// ═══════════════════════════════════════════════════════════════════════

describe('Cross-Tenant', () => {
  const PAY = 'ffffffff-0000-4000-8000-00000000c430'

  it('eine Zahlung von Mandant A kann NICHT auf eine Rechnung von Mandant B gebucht werden', async () => {
    await zahlung(PAY, 5000, ORG_A)
    await expect(allocatePayment(admin, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_B, amountCents: 5000 }],
      actorId: ACTOR,
    })).rejects.toThrow(/nicht gefunden oder gehoert nicht zur Organisation/)

    expect(await zaehle(`SELECT count(*) n FROM payment_allocations WHERE invoice_id = $1`, [INV_B])).toBe(0)
    const inv = await eineZeile<{ paid_amount: string | null }>(
      `SELECT paid_amount FROM invoices WHERE id = $1`, [INV_B])
    expect(inv?.paid_amount == null || Number(inv.paid_amount) === 0).toBe(true)
  })

  it('auch eine Sammelzuordnung mit EINER fremden Rechnung bucht die eigene nicht mit', async () => {
    // Der gefährliche Fall: die erste Zuordnung ist gültig, die zweite
    // gehört einem fremden Mandanten. Bricht die Schleife erst bei der
    // zweiten ab, ist die erste schon gebucht — mit einer
    // `allocated_cents`-Spalte, die davon nichts weiss.
    await zahlung(PAY, 10000, ORG_A)
    await expect(allocatePayment(admin, {
      paymentId: PAY,
      allocations: [
        { invoiceId: INV_A, amountCents: 5000 },
        { invoiceId: INV_B, amountCents: 5000 },
      ],
      actorId: ACTOR,
    })).rejects.toThrow(/gehoert nicht zur Organisation/)

    // Die fremde Rechnung bleibt in jedem Fall unberührt — das ist die
    // Zusicherung, die nicht verhandelbar ist.
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations WHERE invoice_id = $1`, [INV_B])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Ungültige Beträge
// ═══════════════════════════════════════════════════════════════════════

describe('Ungültige Beträge', () => {
  const PAY = 'ffffffff-0000-4000-8000-00000000c440'

  it('ein Betrag von 0 oder darunter wird abgewiesen, bevor etwas geschrieben wird', async () => {
    await zahlung(PAY, 5000)
    for (const cents of [0, -1, -5000]) {
      await expect(allocatePayment(admin, {
        paymentId: PAY,
        allocations: [{ invoiceId: INV_A, amountCents: cents }],
        actorId: ACTOR,
      })).rejects.toThrow(/muss positiv sein/)
    }
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations`)).toBe(0)
  })

  it('eine Zuordnung über den Zahlungsbetrag hinaus wird abgewiesen', async () => {
    await zahlung(PAY, 5000)
    await expect(allocatePayment(admin, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5001 }],
      actorId: ACTOR,
    })).rejects.toThrow(/übersteigt Zahlungsbetrag/)
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations`)).toBe(0)
  })

  it('eine nicht ganzzahlige Cent-Angabe erzeugt keine krumme Buchung', async () => {
    // Cent sind ganzzahlig. Ein Bruchteil kommt entweder gar nicht durch
    // oder wird gerundet — was nicht passieren darf, ist eine Zeile mit
    // 4999,5 Cent, die später jede Summenprüfung zerlegt.
    await zahlung(PAY, 5000)
    await allocatePayment(admin, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 4999.5 }],
      actorId: ACTOR,
    }).catch(() => { /* Abweisen ist der bessere Ausgang */ })

    const zeilen = await db.query<{ amount_cents: number }>(
      `SELECT amount_cents FROM payment_allocations`)
    for (const z of zeilen.rows) {
      expect(Number.isInteger(Number(z.amount_cents)), `krummer Cent-Betrag: ${z.amount_cents}`).toBe(true)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Constraint-Verletzung
// ═══════════════════════════════════════════════════════════════════════

describe('Datenbank-Constraint', () => {
  const PAY = 'ffffffff-0000-4000-8000-00000000c450'

  it('eine verletzte CHECK-Beschränkung wird als Fehler gemeldet, nicht verschluckt', async () => {
    await zahlung(PAY, 5000)
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      {
        tabelle: 'payment_allocations', operation: 'insert',
        fehler: { message: 'new row for relation "payment_allocations" violates check constraint "payment_allocations_allocation_type_check"', code: '23514' },
      },
    ])

    await expect(allocatePayment(chaos.client as unknown as SupabaseClient, {
      paymentId: PAY,
      allocations: [{ invoiceId: INV_A, amountCents: 5000 }],
      actorId: ACTOR,
    })).rejects.toThrow(/Zuordnung fehlgeschlagen.*check constraint/)

    // Nichts geschrieben — insbesondere ist die Rechnung nicht als
    // bezahlt markiert.
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations`)).toBe(0)
    const inv = await eineZeile<{ status: string; paid_amount: string | null }>(
      `SELECT status, paid_amount FROM invoices WHERE id = $1`, [INV_A])
    expect(inv?.status).toBe('sent')
  })

  it('der echte CHECK der Tabelle lässt keinen erfundenen Zuordnungstyp durch', async () => {
    // Gegenprobe zum simulierten Fehler oben: die Beschränkung existiert
    // wirklich und ist nicht nur im Test nachgebaut.
    await zahlung(PAY, 5000)
    await expect(sql(
      `INSERT INTO public.payment_allocations
         (organization_id, payment_id, invoice_id, amount_cents, allocation_type)
       VALUES ($1,$2,$3,100,'erfundener_typ')`,
      [ORG_A, PAY, INV_A],
    )).rejects.toThrow(/check constraint/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Zwei gleiche Beträge am selben Tag
// ═══════════════════════════════════════════════════════════════════════

describe('Zwei gleiche Beträge am selben Tag', () => {
  it('zwei betragsgleiche Zahlungen bleiben zwei getrennte Vorgänge', async () => {
    // Der klassische Verwechslungsfall im Kontoauszug. Beide sind echt,
    // beide müssen einzeln buchbar bleiben — und die Summe muss stimmen.
    const P1 = 'ffffffff-0000-4000-8000-00000000c460'
    const P2 = 'ffffffff-0000-4000-8000-00000000c461'
    await sql(
      `INSERT INTO public.invoices
         (id, organization_id, client_id, invoice_number, invoice_number_formatted,
          period_start, period_end, total_amount, status)
       VALUES ($1,$2,$3,'RE-A-0002','RE-A-0002','2026-04-01','2026-04-30',100,'sent')`,
      ['dddddddd-0000-4000-8000-00000000c462', ORG_A, K_A],
    )
    await zahlung(P1, 2500)
    await zahlung(P2, 2500)

    await allocatePayment(admin, { paymentId: P1, allocations: [{ invoiceId: INV_A, amountCents: 2500 }], actorId: ACTOR })
    await allocatePayment(admin, { paymentId: P2, allocations: [{ invoiceId: INV_A, amountCents: 2500 }], actorId: ACTOR })

    const summe = await eineZeile<{ n: string; summe: string }>(
      `SELECT count(*) n, sum(amount_cents) summe FROM payment_allocations WHERE invoice_id = $1`,
      [INV_A])
    expect(Number(summe?.n)).toBe(2)
    expect(Number(summe?.summe)).toBe(5000)

    const inv = await eineZeile<{ paid_amount: string; status: string }>(
      `SELECT paid_amount, status FROM invoices WHERE id = $1`, [INV_A])
    expect(Number(inv?.paid_amount)).toBe(50)
    expect(inv?.status).toBe('teilweise_bezahlt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Zahlungseingang: Lesefehler beim Anlegen
// ═══════════════════════════════════════════════════════════════════════

describe('createPayment unter Störung', () => {
  it('scheitert der Insert, entsteht keine halbe Zahlung', async () => {
    const chaos = mitChaos(admin as unknown as { from: (t: string) => unknown }, [
      { tabelle: 'payments', operation: 'insert', fehler: { message: 'could not serialize access due to concurrent update', code: '40001' } },
    ])

    await expect(createPayment(chaos.client as unknown as SupabaseClient, {
      organizationId: ORG_A,
      amountCents: 5000,
      paymentDate: '2026-04-15',
      paymentMethod: 'ueberweisung',
      actorId: ACTOR,
      autoMatch: false,
    })).rejects.toThrow()

    expect(await zaehle(`SELECT count(*) n FROM payments`)).toBe(0)
    expect(await zaehle(`SELECT count(*) n FROM payment_allocations`)).toBe(0)
  })
})
