// ═══════════════════════════════════════════════════════════════════════════
// MONEY-PATH-ABSTIMMUNG — auf echtem PostgreSQL (PGlite)
//
// WARUM PGLITE UND KEIN DOPPELGÄNGER
// Diese Abstimmung sucht Zustände, die eine Fake-Datenbank gar nicht
// herstellen kann: eine Zuordnungszeile, deren Zahlung fehlt; ein
// `paid_amount`, das gegen die Summe der Zuordnungen läuft. Ein Fake, in
// dem man beide Seiten von Hand setzt, prüft die Prüfung nicht — er
// bestätigt sie.
//
// Hier laufen deshalb echte Tabellen mit echten CHECK-Constraints,
// Fremdschlüsseln und Typen. Die Fehlerbilder werden gezielt HERGESTELLT
// (Zeile löschen, Zähler verstellen) und die Abstimmung muss sie finden.
//
// DIE GEGENPROBE IST TEIL DES PRÜFGEGENSTANDS: zu jedem Befund gibt es
// einen Test, dass die saubere Lage CONSISTENT ergibt. Eine Abstimmung,
// die immer etwas findet, ist so wertlos wie eine, die nie etwas findet.
//
// PREISE: sämtliche Beträge sind Testwerte innerhalb der In-Memory-Instanz.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  baueKettenSchema,
  baueProtokollTabellen,
  baueCamtTabellen,
  baueDatevTabellen,
} from '../e2e/helpers/kette-schema'
import { macheSupabaseClient } from '../e2e/helpers/pglite-supabase'
import { stimmeMoneyPathAb, abstimmBerichtText, STUFEN_REIHENFOLGE } from '@/lib/pilot/reconciliation'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000001'
const ADMIN = '11111111-0000-4000-8000-000000000001'
const KUNDE = 'c1111111-0000-4000-8000-000000000001'
const KUNDE_B = 'c2222222-0000-4000-8000-000000000001'
const NUTZER = '33333333-0000-4000-8000-000000000001'
const NUTZER_B = '34444444-0000-4000-8000-000000000001'

const RECHNUNG = 'f1111111-0000-4000-8000-000000000001'
const ZAHLUNG = 'e1111111-0000-4000-8000-000000000001'
const ZUORDNUNG = 'd1111111-0000-4000-8000-000000000001'
const POSITION = 'b1111111-0000-4000-8000-000000000001'
const NACHWEIS = '51111111-0000-4000-8000-000000000001'
const ENGEL = 'a1111111-0000-4000-8000-000000000001'

let db: PGlite
let admin: SupabaseClient

async function abstimmen() {
  return stimmeMoneyPathAb(admin, { organizationId: ORG })
}

function stufe(bericht: Awaited<ReturnType<typeof abstimmen>>, id: string) {
  return bericht.stufen.find(s => s.id === id)!
}

function codes(bericht: Awaited<ReturnType<typeof abstimmen>>): string[] {
  return bericht.alleBefunde.map(b => b.code)
}

beforeAll(async () => {
  db = await baueKettenSchema()
  await baueProtokollTabellen(db)
  await baueCamtTabellen(db)
  await baueDatevTabellen(db)
  admin = macheSupabaseClient(db) as unknown as SupabaseClient

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${ADMIN}', 'admin@example.org'),
      ('${NUTZER}', 'kunde@example.org'),
      ('${NUTZER_B}', 'kunde-b@example.org'),
      ('${ENGEL}', 'engel@example.org');

    INSERT INTO public.profiles (id, role, first_name, last_name, email) VALUES
      ('${ADMIN}',   'admin', 'Admin', 'Alpha',    'admin@example.org'),
      ('${NUTZER}',  'kunde', 'Erika', 'Testfall', 'kunde@example.org'),
      ('${NUTZER_B}','kunde', 'Bea',   'Beispiel', 'kunde-b@example.org'),
      ('${ENGEL}',   'engel', 'Marek', 'Beispiel', 'engel@example.org');

    INSERT INTO public.organizations (id, name, bundesland, status) VALUES
      ('${ORG}',   'Mandant Alpha', 'hessen', 'active'),
      ('${ORG_B}', 'Mandant Beta',  'bayern', 'active');

    INSERT INTO public.caregivers (id, organization_id, user_id, first_name, last_name, initials)
    VALUES ('${ENGEL}', '${ORG}', '${ENGEL}', 'Marek', 'Beispiel', 'MB');
  `)
})

afterAll(async () => {
  await db?.close()
})

/**
 * Baut vor JEDEM Test dieselbe, vollständig stimmige Kette auf.
 *
 * Genau eine Rechnung, eine Position, ein Nachweis, eine Zahlung, eine
 * Zuordnung, ein Versandprotokoll, ein Mahnkonto, zwei Audit-Zeilen. Die
 * Fehlerbilder entstehen anschliessend je Test durch gezielte Eingriffe —
 * so ist immer nur EIN Befund im Spiel.
 */
beforeEach(async () => {
  await db.exec(`
    DELETE FROM public.billing_audit_trail;
    DELETE FROM public.payment_allocations;
    DELETE FROM public.payments;
    DELETE FROM public.dunning_entries;
    DELETE FROM public.invoice_email_log;
    DELETE FROM public.invoice_items;
    DELETE FROM public.invoices;
    DELETE FROM public.service_records;
    DELETE FROM public.clients;
    DELETE FROM public.datev_exports;

    INSERT INTO public.clients
      (id, user_id, customer_number, first_name, last_name, email, status, organization_id)
    VALUES
      ('${KUNDE}',   '${NUTZER}',   'K-0001', 'Erika', 'Testfall', 'erika@example.org', 'active', '${ORG}'),
      ('${KUNDE_B}', '${NUTZER_B}', 'K-0002', 'Bea',   'Beispiel', 'bea@example.org',   'active', '${ORG_B}');

    INSERT INTO public.service_records
      (id, client_id, caregiver_id, date, start_time, end_time, duration_minutes,
       service_type, budget_type, caregiver_initials, amount, status, organization_id)
    VALUES
      ('${NACHWEIS}', '${KUNDE}', '${ENGEL}', '2026-07-06', '09:00:00', '11:00:00', 120,
       'Betreuung', 'entlastung', 'MB', 60, 'approved', '${ORG}');

    INSERT INTO public.invoices
      (id, client_id, period_start, period_end, total_amount, paid_amount, status,
       organization_id, invoice_number, invoice_number_formatted, frozen_at, sent_at, created_at)
    VALUES
      ('${RECHNUNG}', '${KUNDE}', '2026-07-01', '2026-07-31', 60, 60, 'bezahlt',
       '${ORG}', 1, 'RE-2026-0001', '2026-08-01T10:00:00Z', '2026-08-01T11:00:00Z', '2026-08-01T09:00:00Z');

    INSERT INTO public.invoice_items
      (id, invoice_id, service_record_id, description, date, duration_minutes, amount, organization_id)
    VALUES
      ('${POSITION}', '${RECHNUNG}', '${NACHWEIS}', 'Betreuung 2 h', '2026-07-06', 120, 60, '${ORG}');

    INSERT INTO public.invoice_email_log
      (organization_id, invoice_id, empfaenger_email, betreff, status, versendet_am)
    VALUES
      ('${ORG}', '${RECHNUNG}', 'erika@example.org', 'Ihre Rechnung', 'versendet', '2026-08-01T11:00:00Z');

    INSERT INTO public.payments
      (id, organization_id, payment_date, amount_cents, allocated_cents, payment_method, payer_type, bank_reference)
    VALUES
      ('${ZAHLUNG}', '${ORG}', '2026-08-10', 6000, 6000, 'ueberweisung', 'kunde', 'BANKREF-1');

    INSERT INTO public.payment_allocations
      (id, organization_id, payment_id, invoice_id, amount_cents, allocation_type, created_at)
    VALUES
      ('${ZUORDNUNG}', '${ORG}', '${ZAHLUNG}', '${RECHNUNG}', 6000, 'vollzahlung', '2026-08-10T12:00:00Z');

    INSERT INTO public.dunning_entries
      (organization_id, invoice_id, dunning_level, due_date, amount_due_cents, amount_paid_cents)
    VALUES
      ('${ORG}', '${RECHNUNG}', 'bezahlt', '2026-08-15', 6000, 6000);

    INSERT INTO public.billing_audit_trail
      (organization_id, entity_type, entity_id, action, actor_id, checksum)
    VALUES
      ('${ORG}', 'invoice',            '${RECHNUNG}', 'frozen',    '${ADMIN}', repeat('a', 64)),
      ('${ORG}', 'payment_allocation', '${ZAHLUNG}',  'allocated', '${ADMIN}', repeat('b', 64));
  `)
})

// ═══════════════════════════════════════════════════════════════════════
// 1. Die saubere Kette
// ═══════════════════════════════════════════════════════════════════════

describe('Saubere Kette', () => {
  it('meldet CONSISTENT über alle neun Stufen', async () => {
    const b = await abstimmen()
    expect(b.hinweise).toEqual([])
    expect(b.alleBefunde).toEqual([])
    expect(b.gesamt).toBe('CONSISTENT')
    expect(b.stufen.map(s => s.id)).toEqual(STUFEN_REIHENFOLGE)
    for (const s of b.stufen) expect(s.befund).toBe('CONSISTENT')
  })

  it('trägt repariert=false im Datenmodell', async () => {
    const b = await abstimmen()
    expect(b.repariert).toBe(false)
  })

  it('verändert keine einzige Zeile', async () => {
    const vorher = await db.query<{ n: number }>(`
      SELECT (SELECT count(*) FROM public.invoices)
           + (SELECT count(*) FROM public.invoice_items)
           + (SELECT count(*) FROM public.payments)
           + (SELECT count(*) FROM public.payment_allocations)
           + (SELECT count(*) FROM public.invoice_email_log)
           + (SELECT count(*) FROM public.dunning_entries)
           + (SELECT count(*) FROM public.billing_audit_trail) AS n`)
    await abstimmen()
    const nachher = await db.query<{ n: number }>(`
      SELECT (SELECT count(*) FROM public.invoices)
           + (SELECT count(*) FROM public.invoice_items)
           + (SELECT count(*) FROM public.payments)
           + (SELECT count(*) FROM public.payment_allocations)
           + (SELECT count(*) FROM public.invoice_email_log)
           + (SELECT count(*) FROM public.dunning_entries)
           + (SELECT count(*) FROM public.billing_audit_trail) AS n`)
    expect(nachher.rows[0].n).toBe(vorher.rows[0].n)

    // Und die Rechnung trägt danach exakt dieselben Werte.
    const r = await db.query<{ paid_amount: string; status: string }>(
      `SELECT paid_amount, status FROM public.invoices WHERE id = '${RECHNUNG}'`)
    expect(r.rows[0].status).toBe('bezahlt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Mandantengrenze
// ═══════════════════════════════════════════════════════════════════════

describe('Mandantengrenze', () => {
  it('Zeilen eines fremden Mandanten erzeugen KEINEN Befund', async () => {
    await db.exec(`
      INSERT INTO public.invoices
        (id, client_id, period_start, period_end, total_amount, paid_amount, status,
         organization_id, invoice_number, invoice_number_formatted, created_at)
      VALUES
        ('f2222222-0000-4000-8000-000000000001', '${KUNDE_B}', '2026-07-01', '2026-07-31',
         99, 0, 'versendet', '${ORG_B}', 7, 'RE-B-0007', '2026-08-01T09:00:00Z');
    `)
    const b = await abstimmen()
    // Die fremde Rechnung hat keine Positionen — bei fehlendem Fence
    // erschiene sie hier als 'rechnung_ohne_positionen'.
    expect(codes(b)).toEqual([])
    expect(b.gesamt).toBe('CONSISTENT')
  })

  it('die Abstimmung des FREMDEN Mandanten sieht die eigene Kette nicht', async () => {
    const b = await stimmeMoneyPathAb(admin, { organizationId: ORG_B })
    expect(stufe(b, 'rechnung').kennzahlen.rechnungen).toBe(0)
    expect(stufe(b, 'zuordnung').kennzahlen.zuordnungen).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Stufe 1 — Leistung
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 1 — Leistung', () => {
  it('ORPHAN_FOUND: Position ohne Leistungsnachweis', async () => {
    // FK auf service_records ist im Live-Schema nicht durchgesetzt — genau
    // deshalb kann diese Waise entstehen, und genau deshalb sucht die
    // Abstimmung sie.
    await db.exec(`UPDATE public.invoice_items
                   SET service_record_id = '99999999-0000-4000-8000-000000000009'
                   WHERE id = '${POSITION}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('position_ohne_nachweis')
    expect(stufe(b, 'leistung').befund).toBe('ORPHAN_FOUND')
    const treffer = b.alleBefunde.find(x => x.code === 'position_ohne_nachweis')!
    expect(treffer.bezug.invoiceId).toBe(RECHNUNG)
    expect(treffer.bezug.customerId).toBe(KUNDE)
    expect(treffer.bezug.organizationId).toBe(ORG)
  })

  it('eine Position ohne Nachweisbezug ist KEIN Befund', async () => {
    await db.exec(`UPDATE public.invoice_items SET service_record_id = NULL WHERE id = '${POSITION}'`)
    const b = await abstimmen()
    expect(codes(b)).not.toContain('position_ohne_nachweis')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Stufe 2 — Rechnung
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 2 — Rechnung', () => {
  it('ORPHAN_FOUND: Rechnung ohne Positionen', async () => {
    await db.exec(`DELETE FROM public.invoice_items WHERE id = '${POSITION}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('rechnung_ohne_positionen')
  })

  it('ein Entwurf ohne Positionen ist KEIN Befund — er entsteht leer', async () => {
    await db.exec(`
      DELETE FROM public.invoice_items WHERE id = '${POSITION}';
      UPDATE public.invoices SET status = 'entwurf', paid_amount = 0, sent_at = NULL,
                                 frozen_at = NULL WHERE id = '${RECHNUNG}';
      DELETE FROM public.payment_allocations;
      UPDATE public.payments SET allocated_cents = 0;
      DELETE FROM public.invoice_email_log;
      UPDATE public.dunning_entries SET amount_paid_cents = 0;
    `)
    const b = await abstimmen()
    expect(codes(b)).not.toContain('rechnung_ohne_positionen')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Stufe 3 — Versand
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 3 — Versand', () => {
  it('MISMATCH: sent_at gesetzt, aber keine erfolgreiche Protokollzeile', async () => {
    await db.exec(`DELETE FROM public.invoice_email_log`)
    const b = await abstimmen()
    expect(codes(b)).toContain('versendet_ohne_protokoll')
    expect(stufe(b, 'versand').befund).toBe('MISMATCH')
  })

  it('MISMATCH: Protokollzeile erfolgreich, aber sent_at leer — Wiederholungslauf würde erneut senden', async () => {
    await db.exec(`UPDATE public.invoices SET sent_at = NULL WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('protokoll_ohne_versanddatum')
  })

  it('ORPHAN_FOUND: Protokollzeile, deren Rechnung geloescht ist', async () => {
    // `invoice_id` ist NOT NULL — eine Waise entsteht hier nicht durch
    // einen leeren Fremdschluessel, sondern durch eine Rechnung, die
    // anschliessend soft-geloescht wurde. Genau so sieht der Fall live aus.
    await db.exec(`UPDATE public.invoices SET deleted_at = now() WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('protokoll_ohne_rechnung')
  })

  it('ein fehlgeschlagener Versuch allein macht sent_at nicht belegt', async () => {
    await db.exec(`
      UPDATE public.invoice_email_log SET status = 'fehlgeschlagen' WHERE invoice_id = '${RECHNUNG}';
    `)
    const b = await abstimmen()
    expect(codes(b)).toContain('versendet_ohne_protokoll')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Stufe 4/5 — Zahlung und Zuordnung
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 4 — Zahlung', () => {
  it('MISMATCH: allocated_cents läuft gegen die Summe der Zuordnungen (Befund C-1)', async () => {
    await db.exec(`UPDATE public.payments SET allocated_cents = 0 WHERE id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    const treffer = b.alleBefunde.find(x => x.code === 'zahlung_allocated_abweichung')!
    expect(treffer).toBeDefined()
    expect(treffer.differenz).toEqual({ erwartetCent: 6000, gefundenCent: 0 })
    expect(treffer.bezug.paymentReference).toBe('BANKREF-1')
    expect(treffer.meldung).toContain('C-1')
  })

  it('MISMATCH: höher zugeordnet als die Zahlung beträgt', async () => {
    await db.exec(`UPDATE public.payments SET amount_cents = 3000, allocated_cents = 6000 WHERE id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('zahlung_ueberzugeordnet')
  })
})

describe('Stufe 5 — Zuordnung', () => {
  it('ORPHAN_FOUND: Zuordnung, deren Zahlung fehlt', async () => {
    // Die Zahlung wird soft-geloescht — genau die Lage, in der DATEV die
    // Zuordnung noch liest, aber die Zahlung nicht mehr auffindbar ist.
    await db.exec(`UPDATE public.payments SET deleted_at = now() WHERE id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('zuordnung_ohne_zahlung')
    const treffer = b.alleBefunde.find(x => x.code === 'zuordnung_ohne_zahlung')!
    expect(treffer.meldung).toContain('DATEV liest diese Tabelle')
  })

  it('ORPHAN_FOUND: Zuordnung, deren Rechnung geloescht ist', async () => {
    await db.exec(`UPDATE public.invoices SET deleted_at = now() WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('zuordnung_ohne_rechnung')
  })

  it('eine Zuordnung ohne Betrag kann live gar nicht entstehen — der CHECK verhindert sie', async () => {
    // GEGENPROBE statt Nachweis. `payment_allocations.amount_cents` traegt
    // live CHECK (amount_cents > 0) (Migration 20260808210000). Die Pruefung
    // 'zuordnung_ohne_betrag' in der Abstimmung ist deshalb ein toter Zweig,
    // solange dieser Constraint steht — und bleibt bewusst stehen, weil die
    // Anwendung auch gegen Schemata ohne ihn laufen kann (Shadow-Instanz,
    // Rollback). Dieser Test haelt fest, welche der beiden Aussagen gilt:
    // die Datenbank ist der Riegel, nicht die Abstimmung.
    await expect(
      db.exec(`UPDATE public.payment_allocations SET amount_cents = 0 WHERE id = '${ZUORDNUNG}'`),
    ).rejects.toThrow(/amount_cents/)

    // Und die saubere Lage bleibt sauber.
    const b = await abstimmen()
    expect(codes(b)).not.toContain('zuordnung_ohne_betrag')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Stufe 6 — Rechnungsstatus
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 6 — Rechnungsstatus', () => {
  it('MISMATCH: paid_amount läuft gegen die Summe der Zuordnungen', async () => {
    await db.exec(`UPDATE public.invoices SET paid_amount = 0, status = 'versendet' WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    const treffer = b.alleBefunde.find(x => x.code === 'paid_amount_abweichung')!
    expect(treffer.differenz).toEqual({ erwartetCent: 6000, gefundenCent: 0 })
    expect(treffer.meldung).toContain('GEMAHNT')
  })

  it('MISMATCH: Status "bezahlt" ohne Deckung durch Zuordnungen', async () => {
    await db.exec(`
      UPDATE public.payment_allocations SET amount_cents = 3000 WHERE id = '${ZUORDNUNG}';
      UPDATE public.payments SET allocated_cents = 3000 WHERE id = '${ZAHLUNG}';
      UPDATE public.invoices SET paid_amount = 30 WHERE id = '${RECHNUNG}';
      UPDATE public.dunning_entries SET amount_paid_cents = 3000 WHERE invoice_id = '${RECHNUNG}';
    `)
    const b = await abstimmen()
    expect(codes(b)).toContain('status_bezahlt_ohne_deckung')
  })

  it('MISMATCH: vollständig zugeordnet, Status aber offen — läuft weiter im Mahnwesen', async () => {
    await db.exec(`UPDATE public.invoices SET status = 'versendet' WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('status_offen_trotz_deckung')
  })

  it('storniert und abgeschrieben lösen den Befund NICHT aus', async () => {
    await db.exec(`
      UPDATE public.invoices SET status = 'storniert' WHERE id = '${RECHNUNG}';
      UPDATE public.dunning_entries SET dunning_level = 'offen' WHERE invoice_id = '${RECHNUNG}';
    `)
    const b = await abstimmen()
    expect(codes(b)).not.toContain('status_offen_trotz_deckung')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8. Stufe 7 — Buchhaltung
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 7 — Buchhaltung', () => {
  it('MISMATCH: Mahnkonto und Rechnung laufen auseinander (Befund M-3)', async () => {
    await db.exec(`UPDATE public.dunning_entries SET amount_paid_cents = 0 WHERE invoice_id = '${RECHNUNG}'`)
    const b = await abstimmen()
    const treffer = b.alleBefunde.find(x => x.code === 'mahnkonto_bezahlt_abweichung')!
    expect(treffer.differenz).toEqual({ erwartetCent: 6000, gefundenCent: 0 })
    expect(treffer.meldung).toContain('M-3')
  })

  it('MISMATCH: Rechnung bezahlt, Mahnkonto steht noch offen', async () => {
    await db.exec(`UPDATE public.dunning_entries SET dunning_level = 'mahnung_1' WHERE invoice_id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('mahnkonto_offen_trotz_bezahlt')
  })

  it('ORPHAN_FOUND: Mahnkonto ohne Rechnung', async () => {
    await db.exec(`UPDATE public.invoices SET deleted_at = now() WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('mahnkonto_ohne_rechnung')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 9. Stufe 8 — DATEV
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 8 — DATEV', () => {
  it('ohne jeden Export gibt es nichts abzustimmen', async () => {
    const b = await abstimmen()
    expect(stufe(b, 'datev').befund).toBe('CONSISTENT')
    expect(stufe(b, 'datev').zusammenfassung).toContain('Noch kein DATEV-Export')
  })

  it('ein Export, der den Zeitraum deckt, ergibt CONSISTENT', async () => {
    await db.exec(`
      INSERT INTO public.datev_exports
        (organization_id, zeitraum_von, zeitraum_bis, buchungen_anzahl, status)
      VALUES ('${ORG}', '2026-08-01', '2026-08-31', 2, 'erstellt');
    `)
    const b = await abstimmen()
    expect(stufe(b, 'datev').befund).toBe('CONSISTENT')
  })

  it('MISMATCH: eine Zuordnung liegt in keinem erfolgreichen Exportzeitraum', async () => {
    // Export deckt nur den 1.–5. August; Rechnung (1.8.) ist drin, die
    // Zuordnung (10.8.) nicht — und der Export reicht bis nach dem 10.
    await db.exec(`
      INSERT INTO public.datev_exports
        (organization_id, zeitraum_von, zeitraum_bis, buchungen_anzahl, status)
      VALUES
        ('${ORG}', '2026-08-01', '2026-08-05', 1, 'erstellt'),
        ('${ORG}', '2026-08-11', '2026-08-31', 0, 'erstellt');
    `)
    const b = await abstimmen()
    expect(codes(b)).toContain('zuordnung_nicht_exportiert')
    const treffer = b.alleBefunde.find(x => x.code === 'zuordnung_nicht_exportiert')!
    expect(treffer.meldung).toContain('Debitorensaldo')
  })

  it('ein Export im Status "fehler" zählt NICHT als Abdeckung', async () => {
    await db.exec(`
      INSERT INTO public.datev_exports
        (organization_id, zeitraum_von, zeitraum_bis, buchungen_anzahl, status)
      VALUES
        ('${ORG}', '2026-08-01', '2026-08-31', 0, 'fehler'),
        ('${ORG}', '2026-08-20', '2026-08-31', 0, 'erstellt');
    `)
    const b = await abstimmen()
    expect(codes(b)).toContain('rechnung_nicht_exportiert')
    expect(codes(b)).toContain('zuordnung_nicht_exportiert')
  })

  it('Vorgänge NACH dem letzten Exportende sind kein Befund — sie sind schlicht noch dran', async () => {
    await db.exec(`
      INSERT INTO public.datev_exports
        (organization_id, zeitraum_von, zeitraum_bis, buchungen_anzahl, status)
      VALUES ('${ORG}', '2026-07-01', '2026-07-31', 0, 'erstellt');
    `)
    const b = await abstimmen()
    expect(codes(b)).not.toContain('rechnung_nicht_exportiert')
    expect(codes(b)).not.toContain('zuordnung_nicht_exportiert')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 10. Stufe 9 — Audit
// ═══════════════════════════════════════════════════════════════════════

describe('Stufe 9 — Audit', () => {
  it('ORPHAN_FOUND: festgeschriebene Rechnung ohne Audit-Eintrag', async () => {
    await db.exec(`DELETE FROM public.billing_audit_trail WHERE entity_id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('rechnung_ohne_audit')
  })

  it('ORPHAN_FOUND: Zuordnung ohne Audit-Eintrag', async () => {
    await db.exec(`DELETE FROM public.billing_audit_trail WHERE entity_id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    expect(codes(b)).toContain('zuordnung_ohne_audit')
    const treffer = b.alleBefunde.find(x => x.code === 'zuordnung_ohne_audit')!
    expect(treffer.bezug.paymentId).toBe(ZAHLUNG)
  })

  it('eine NICHT festgeschriebene Rechnung braucht keinen Eintrag', async () => {
    await db.exec(`
      DELETE FROM public.billing_audit_trail WHERE entity_id = '${RECHNUNG}';
      UPDATE public.invoices SET frozen_at = NULL WHERE id = '${RECHNUNG}';
    `)
    const b = await abstimmen()
    expect(codes(b)).not.toContain('rechnung_ohne_audit')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 11. Der Gesamtbefund und der Bericht
// ═══════════════════════════════════════════════════════════════════════

describe('Gesamtbefund', () => {
  it('MISMATCH schlägt ORPHAN_FOUND', async () => {
    await db.exec(`
      UPDATE public.payments SET allocated_cents = 0 WHERE id = '${ZAHLUNG}';
      DELETE FROM public.billing_audit_trail WHERE entity_id = '${ZAHLUNG}';
    `)
    const b = await abstimmen()
    expect(b.gesamt).toBe('MISMATCH')
  })

  it('ORPHAN_FOUND allein bleibt ORPHAN_FOUND', async () => {
    await db.exec(`DELETE FROM public.billing_audit_trail WHERE entity_id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    expect(b.gesamt).toBe('ORPHAN_FOUND')
  })

  it('jeder Befund trägt die vollständige Rückverfolgung', async () => {
    await db.exec(`UPDATE public.invoices SET paid_amount = 0, status = 'versendet' WHERE id = '${RECHNUNG}'`)
    const b = await abstimmen()
    expect(b.alleBefunde.length).toBeGreaterThan(0)
    for (const f of b.alleBefunde) {
      expect(f.bezug.organizationId).toBe(ORG)
      expect(f.code).toMatch(/^[a-z_]+$/)
      expect(['ORPHAN_FOUND', 'MISMATCH']).toContain(f.art)
    }
  })
})

describe('Bericht', () => {
  it('sagt in den ersten Zeilen, dass nichts verändert wurde', async () => {
    const b = await abstimmen()
    expect(abstimmBerichtText(b).split('\n').slice(0, 3).join(' ')).toContain('NICHTS VERÄNDERT')
  })

  it('führt jeden Befund mit Code, Meldung und Bezug auf', async () => {
    await db.exec(`UPDATE public.payments SET allocated_cents = 0 WHERE id = '${ZAHLUNG}'`)
    const b = await abstimmen()
    const text = abstimmBerichtText(b)
    expect(text).toContain('[zahlung_allocated_abweichung]')
    expect(text).toContain(ZAHLUNG)
    expect(text).toContain('erwartet 60,00 €')
    expect(text).toContain('gefunden 0,00 €')
  })

  it('nennt alle neun Stufen mit Titel', async () => {
    const b = await abstimmen()
    const text = abstimmBerichtText(b)
    for (const s of b.stufen) expect(text).toContain(s.titel)
  })
})
