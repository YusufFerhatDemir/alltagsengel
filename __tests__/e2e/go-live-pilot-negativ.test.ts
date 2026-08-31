/**
 * Go-Live-Pilot — Negativtests (Phase 2, Echtbetrieb-Pilot absichern)
 *
 * Deckt die im Auftrag geforderten Angriffs-/Fehlerszenarien ab:
 * falscher Mandant, falsche Rolle, manipulierte IDs, gelöschte Datensätze,
 * gesperrte/unverifizierte Tarife, fehlende Unterschrift, Budgetüberschreitung,
 * Doppelabrechnung, doppelte Zahlung, falscher Zahlungsstatus, stornierte/
 * korrigierte Rechnung, Sperre abgeschlossener Leistungsnachweise,
 * Audit-Trail-Integrität, Rechnungsnummern-Sequenz, due_date, Mahnstufen,
 * PDF-Pflichtfelder, Datenschutz/Mandantentrennung.
 *
 * Wo eine Regel NUR durch einen echten Postgres-Trigger durchgesetzt wird
 * (service_records-Sperre ab 'signed', wf_audit_log-Immutability), kann sie
 * mit den hier verwendeten In-Memory-Stubs nicht funktional ausgelöst werden
 * — dafür wird die aktuelle Migrationsquelle direkt geprüft (derselbe
 * Quellinspektions-Ansatz wie __tests__/security/p1-cross-tenant-api-routes.test.ts).
 * Das ist explizit benannt, nicht stillschweigend übersprungen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { makeFakeBillingDb, installBillingRpcSimulation, type FakeBillingDb } from './helpers/fake-billing-db'
import {
  createInvoiceDraft,
  freezeInvoice,
  cancelInvoice,
  correctInvoice,
  createCreditNote,
  generateInvoiceNumber,
} from '@/lib/billing/core/invoice-engine'
import { createPayment, allocatePayment } from '@/lib/billing/core/payments'
import { ensureDunningEntry, advanceDunning, checkDunningBlocks } from '@/lib/billing/core/dunning'
import { getOposListe } from '@/lib/billing/opos/opos-manager'
import { generateIdempotencyKey } from '@/lib/billing/core/idempotency'
import { computeChecksum } from '@/lib/billing/core/audit'
import { TarifNichtVerifiziertError } from '@/lib/billing/core/price-resolver'
import { ermittleKundenKette } from '@/lib/pilot/kundenkette'

const ORG_A = 'org-negativ-a-0001'
const ORG_B = 'org-negativ-b-0002'
const CLIENT = 'client-negativ-0001'
const ACTOR = 'actor-negativ-0001'
const PERIOD = '2026-08'

function seedTarif(db: FakeBillingDb, overrides: Record<string, unknown> = {}) {
  db.seed('billing_tariffs', [{
    id: 'tarif-negativ-1',
    organization_id: ORG_A,
    leistungsart: 'Alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    preis_cent: 3500,
    tarif_status: 'verified',
    gueltig_ab: '2025-01-01',
    gueltig_bis: null,
    deleted_at: null,
    verifizierungs_quelle: 'AOK Hessen Bescheid',
    ...overrides,
  }])
}

function seedRechnung(db: FakeBillingDb, overrides: Record<string, unknown> = {}) {
  db.table('invoices').push({
    id: 'invoice-negativ-1',
    client_id: CLIENT,
    organization_id: ORG_A,
    status: 'freigegeben',
    total_amount: 35,
    paid_amount: 0,
    invoice_number: 'RE-2026-00099',
    invoice_number_formatted: 'RE-2026-00099',
    period_start: `${PERIOD}-01`,
    period_end: `${PERIOD}-28`,
    created_at: `${PERIOD}-15T10:00:00Z`,
    due_date: `${PERIOD}-29`,
    payment_terms_days: 14,
    version: 1,
    deleted_at: null,
    // Festgeschrieben: eine freigegebene Rechnung hat frozen_at (freezeInvoice
    // setzt Status + frozen_at gemeinsam). getOposListe verlangt frozen_at,
    // sonst gilt die Zeile als synthetisch und fällt aus den offenen Posten.
    frozen_at: `${PERIOD}-15T10:05:00Z`,
    ...overrides,
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1) Falscher Mandant
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 1: Falscher Mandant (org_id stimmt nicht)', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedRechnung(db)
  })

  it('freezeInvoice lehnt eine Rechnung ab, die einer anderen Organisation gehört', async () => {
    db.table('invoices')[0].status = 'geprueft'
    await expect(freezeInvoice(db as any, 'invoice-negativ-1', ACTOR, ORG_B))
      .rejects.toThrow(/gehoert nicht zur angegebenen Organisation/)
  })

  it('cancelInvoice lehnt Storno unter falscher Organisation ab', async () => {
    await expect(cancelInvoice(db as any, 'invoice-negativ-1', 'Test', ACTOR, ORG_B))
      .rejects.toThrow(/gehoert nicht zur angegebenen Organisation/)
  })

  it('correctInvoice lehnt Korrektur unter falscher Organisation ab', async () => {
    seedTarif(db)
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 3500, gesamtpreisCent: 3500,
    }], 'Test', ACTOR, ORG_B)).rejects.toThrow(/gehoert nicht zur angegebenen Organisation/)
  })

  it('createCreditNote lehnt Gutschrift unter falscher Organisation ab', async () => {
    await expect(createCreditNote(db as any, 'invoice-negativ-1', 1000, 'Test', ACTOR, ORG_B))
      .rejects.toThrow(/gehoert nicht zur angegebenen Organisation/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2) Falsche Rolle (Kunde versucht Admin-Aktion)
// ═══════════════════════════════════════════════════════════════════════
const { mockGetUser, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      }),
    }),
  }),
}))

describe('Negativ 2: Falsche Rolle — requireOrgRole() als Admin-Routen-Guard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Kunde (customer-Rolle, unterhalb owner/admin/staff) wird von einer Admin-Route abgewiesen', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'kunde-user' } } })
    mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' } })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole(ORG_A, ['owner', 'admin', 'staff'])

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
  })

  it('nicht eingeloggter Zugriff wird mit 401 abgewiesen, nicht mit einer stillen Weiterleitung', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { requireOrgRole } = await import('@/lib/organizations/server')

    const result = await requireOrgRole(ORG_A)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3) Manipulierte IDs (UUID einer fremden Ressource)
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 3: Manipulierte IDs — fremde Ressource per erratener/getauschter ID', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
  })

  it('allocatePayment verbucht eine Zahlung NICHT auf eine Rechnung einer fremden Organisation (IDOR)', async () => {
    // Zahlung gehört zu ORG_A, die referenzierte Rechnung existiert wirklich — aber unter ORG_B.
    db.table('payments').push({ id: 'payment-idor', organization_id: ORG_A, amount_cents: 3500, allocated_cents: 0 })
    seedRechnung(db, { organization_id: ORG_B })

    await expect(allocatePayment(db as any, {
      paymentId: 'payment-idor',
      allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }],
      actorId: ACTOR,
    })).rejects.toThrow(/nicht gefunden oder gehoert nicht zur Organisation der Zahlung/)

    // Die fremde Rechnung darf dadurch NICHT veraendert worden sein.
    const fremd = db.table('invoices').find(i => i.id === 'invoice-negativ-1')!
    expect(fremd.status).toBe('freigegeben')
    expect(fremd.paid_amount).toBe(0)
  })

  it('correctInvoice und cancelInvoice melden eine frei erfundene Rechnungs-ID als "nicht gefunden"', async () => {
    await expect(correctInvoice(db as any, 'invoice-existiert-nicht', [{
      leistungsart: 'x', leistungsdatum: `${PERIOD}-01`, menge: 1, einheit: 'einsatz',
      einzelpreisCent: 100, gesamtpreisCent: 100,
    }], 'Test', ACTOR)).rejects.toThrow(/nicht gefunden/)

    await expect(cancelInvoice(db as any, 'invoice-existiert-nicht', 'Test', ACTOR))
      .rejects.toThrow(/nicht gefunden/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4) Gelöschte Datensätze (deleted_at gesetzt)
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 4: Gelöschte Datensätze werden aus OPOS/Mahnwesen ausgeschlossen', () => {
  it('getOposListe zeigt eine soft-gelöschte Rechnung nicht als offenen Posten', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { id: 'invoice-aktiv', deleted_at: null })
    seedRechnung(db, { id: 'invoice-geloescht', deleted_at: new Date().toISOString() })

    const opos = await getOposListe(db as any, ORG_A)

    expect(opos.gesamtAnzahl).toBe(1)
    expect(opos.offenePosten[0].invoiceId).toBe('invoice-aktiv')
  })

  it('checkIdempotency ignoriert eine gelöschte Rechnung mit demselben Idempotency-Key (neue Rechnung möglich)', async () => {
    const db = makeFakeBillingDb()
    const key = generateIdempotencyKey(CLIENT, PERIOD, 'entlastung')
    seedRechnung(db, { id: 'invoice-alt-geloescht', idempotency_key: key, deleted_at: new Date().toISOString() })

    const { checkIdempotency } = await import('@/lib/billing/core/idempotency')
    const result = await checkIdempotency(db as any, key)

    expect(result.exists).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5) Gesperrte Tarife (tarif_status = 'blocked')
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 5: Gesperrte Tarife blockieren die Abrechnung — auch bei Privatzahlern', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedRechnung(db)
  })

  it('correctInvoice lehnt eine Korrektur mit gesperrtem Tarif ab', async () => {
    seedTarif(db, { tarif_status: 'blocked' })
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 3500, gesamtpreisCent: 3500,
    }], 'Test', ACTOR)).rejects.toThrow(TarifNichtVerifiziertError)
  })

  it('createInvoiceDraft (RPC) lehnt eine Rechnung ab, wenn der einzige passende Tarif gesperrt ist', async () => {
    db.seed('clients', [{ id: CLIENT, organization_id: ORG_A, first_name: 'A', last_name: 'B' }])
    db.seed('service_records', [{
      id: 'sr-blocked', client_id: CLIENT, organization_id: ORG_A, status: 'signed',
      amount: 35, date: `${PERIOD}-01`, leistungsart: 'Alltagsbegleitung',
    }])
    seedTarif(db, { tarif_status: 'blocked' })

    await expect(createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })).rejects.toThrow(/MISSING_VALID_TARIFF/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6) Unverifizierte Tarife bei Kassenabrechnung
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 6: Unverifizierte Tarife blockieren die Kassenabrechnung, nicht aber Privatrechnungen', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedRechnung(db)
  })

  it('correctInvoice lehnt unverifizierten Kassentarif ab', async () => {
    seedTarif(db, { tarif_status: 'unverified', rechtsgrundlage: '§45b SGB XI' })
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 3500, gesamtpreisCent: 3500,
    }], 'Test', ACTOR)).rejects.toThrow(TarifNichtVerifiziertError)
  })

  it('correctInvoice akzeptiert einen unverifizierten Tarif, wenn die Rechnung privat ist', async () => {
    seedTarif(db, { tarif_status: 'unverified', rechtsgrundlage: 'privat' })
    const result = await correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 3500, gesamtpreisCent: 3500,
    }], 'Privatabweichung', ACTOR)
    expect(result.correctionInvoiceId).toBeTruthy()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7) Fehlende Unterschrift
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 7: Fehlende Unterschrift hält den Kettenschritt offen, auch bei status="signed"', () => {
  it('service_records.status="signed" OHNE Zeile in service_signatures zählt NICHT als unterschrieben', async () => {
    const db = makeFakeBillingDb()
    db.seed('clients', [{ id: CLIENT, organization_id: ORG_A, first_name: 'Erika', last_name: 'Testfall', address: 'x', zip_code: '1', phone: '1', care_level: 2 }])
    db.seed('service_records', [{ id: 'sr-unsigned', client_id: CLIENT, organization_id: ORG_A, status: 'signed', amount: 35, date: `${PERIOD}-01` }])
    // bewusst KEINE service_signatures-Zeile

    const kette = await ermittleKundenKette(db as any, ORG_A, CLIENT)
    const signatur = kette!.schritte.find(s => s.id === 'signatur')!
    expect(signatur.stand).toBe('offen')
    expect(kette!.vollstaendig).toBe(false)
  })

  it('Migrationsquelle: service_records ab Status "signed"/"invoiced" ist per Trigger unveränderlich (kann nicht per Mock ausgelöst werden)', () => {
    // Diese Regel wirkt ausschliesslich als BEFORE-UPDATE-Trigger in Postgres
    // (prevent_finalized_service_record_mutation, gebunden via
    // trg_service_records_no_finalized_edit). Die Fake-DB fuehrt keine
    // Trigger aus — hier wird deshalb die aktuelle Migrationsquelle direkt
    // geprueft statt ein funktionales Verhalten vorzutaeuschen, das der
    // Mock gar nicht durchsetzen kann.
    const migPath = path.join(process.cwd(), 'supabase/migrations/20260908020000_rls_abrechnungsdaten_und_auditschutz.sql')
    const sql = fs.readFileSync(migPath, 'utf-8')

    expect(sql).toContain('prevent_finalized_service_record_mutation')
    expect(sql).toContain("OLD.status NOT IN ('signed', 'invoiced')")
    expect(sql).toContain('ist unveraenderlich')

    const bindingPath = path.join(process.cwd(), 'supabase/migrations/20260804100000_reapply_conditional_triggers.sql')
    const bindingSql = fs.readFileSync(bindingPath, 'utf-8')
    expect(bindingSql).toContain('trg_service_records_no_finalized_edit')
    expect(bindingSql).toContain('EXECUTE FUNCTION public.prevent_finalized_service_record_mutation()')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 8) Budgetüberschreitung — BEKANNTE LÜCKE, nicht durchgesetzt
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 8: Budgetüberschreitung wird beim Rechnungsentwurf NICHT geprüft (dokumentierte Lücke)', () => {
  it('createInvoiceDraft erstellt die Rechnung trotz Überschreitung des Jahresbudgets anstandslos', async () => {
    // Budget: nur 10 € Restanspruch fuer das Jahr — die Leistung kostet 35 €.
    // Es gibt in der aktuellen Codebasis KEINEN Aufrufpfad, der
    // client_budgets.annual_amount/used_amount gegen die Rechnungssumme
    // prueft (weder in create_invoice_draft_atomic noch in createInvoiceDraft
    // selbst) — nur die Admin-Ampel in lib/admin/ops.ts liest die Werte,
    // rein zur Anzeige. Dieser Test haelt den IST-Zustand fest, nicht den
    // SOLL-Zustand: er markiert die Lücke, statt sie stillschweigend als
    // "funktioniert" durchgehen zu lassen.
    const db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    db.seed('clients', [{ id: CLIENT, organization_id: ORG_A, first_name: 'A', last_name: 'B' }])
    db.seed('client_budgets', [{
      id: 'budget-knapp', client_id: CLIENT, organization_id: ORG_A,
      year: new Date().getFullYear(), annual_amount: 10, used_amount: 0,
    }])
    db.seed('service_records', [{
      id: 'sr-ueberschreitung', client_id: CLIENT, organization_id: ORG_A, status: 'signed',
      amount: 35, date: `${PERIOD}-01`, leistungsart: 'Alltagsbegleitung',
    }])
    seedTarif(db)

    const draft = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })

    expect(draft.totalAmountCents).toBe(3500) // 35,00 € — mehr als das 10€-Restbudget
    const budget = db.table('client_budgets')[0]
    expect(draft.totalAmountCents / 100).toBeGreaterThan(budget.annual_amount as number)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 9) Doppelabrechnung (gleicher Zeitraum, gleicher budget_type)
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 9: Doppelabrechnung', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    db.seed('clients', [{ id: CLIENT, organization_id: ORG_A, first_name: 'A', last_name: 'B' }])
    db.seed('service_records', [{
      id: 'sr-doppel', client_id: CLIENT, organization_id: ORG_A, status: 'signed',
      amount: 35, date: `${PERIOD}-01`, leistungsart: 'Alltagsbegleitung',
    }])
    seedTarif(db)
  })

  it('zwei identische createInvoiceDraft-Aufrufe erzeugen NUR eine Rechnung (Idempotenz greift)', async () => {
    const erste = await createInvoiceDraft(db as any, { clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR })
    const zweite = await createInvoiceDraft(db as any, { clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR })

    expect(zweite.alreadyExists).toBe(true)
    expect(zweite.invoiceId).toBe(erste.invoiceId)
    expect(db.table('invoices').filter(i => i.client_id === CLIENT)).toHaveLength(1)
  })

  it('BEKANNTE LÜCKE: eine Alt-Rechnung mit dem "_v1"-Idempotenzschlüssel schützt NICHT vor einer neuen "_v2"-Rechnung für denselben Zeitraum', async () => {
    // lib/billing/core/idempotency.ts erzeugt Schlüssel mit Default-Version 1
    // ("_v1"), die aktuelle create_invoice_draft_atomic-RPC-Generation nutzt
    // aber "_v2" (siehe supabase/migrations/20260807110000_tariff_based_invoice_creation.sql
    // Zeile ~137 vs. die Vorgaenger-RPC in 20260807100000). Eine Rechnung, die
    // ueber den alten Weg entstand, wird vom neuen Weg nicht wiedererkannt.
    const alterSchluessel = generateIdempotencyKey(CLIENT, PERIOD, 'entlastung', 1)
    expect(alterSchluessel).toBe(`inv_${CLIENT}_${PERIOD}_entlastung_v1`)
    db.table('invoices').push({
      id: 'invoice-alt-v1', client_id: CLIENT, organization_id: ORG_A, status: 'freigegeben',
      total_amount: 35, idempotency_key: alterSchluessel, deleted_at: null,
      created_at: `${PERIOD}-01T09:00:00Z`, due_date: null, payment_terms_days: 14, version: 1,
    })

    const neue = await createInvoiceDraft(db as any, {
      clientId: CLIENT, periodMonth: PERIOD, budgetType: 'entlastung', actorId: ACTOR,
    })

    expect(neue.alreadyExists).toBe(false)
    expect(neue.invoiceId).not.toBe('invoice-alt-v1')
    // Zwei Rechnungen fuer denselben Klienten/Zeitraum/Anspruch stehen jetzt nebeneinander.
    expect(db.table('invoices').filter(i => i.client_id === CLIENT)).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 10) Doppelte Zahlung
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 10: Doppelte Zahlung', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    seedRechnung(db)
  })

  it('BEKANNTE LÜCKE: createPayment hat keinen Idempotency-Key — zwei identische Aufrufe legen zwei Zahlungen an', async () => {
    const params = {
      organizationId: ORG_A, paymentDate: `${PERIOD}-20`, amountCents: 3500,
      paymentMethod: 'ueberweisung' as const, payerType: 'kunde' as const, actorId: ACTOR, autoMatch: false,
    }
    const erste = await createPayment(db as any, params)
    const zweite = await createPayment(db as any, params)

    expect(erste.paymentId).not.toBe(zweite.paymentId)
    expect(db.table('payments')).toHaveLength(2)
  })

  it('der Über-Verbuchungsschutz von allocatePayment verhindert, dass eine zweite Zahlung dieselbe Rechnung nochmal voll bezahlt', async () => {
    const p1 = await createPayment(db as any, {
      organizationId: ORG_A, paymentDate: `${PERIOD}-20`, amountCents: 3500,
      paymentMethod: 'ueberweisung', payerType: 'kunde', actorId: ACTOR, autoMatch: false,
    })
    const p2 = await createPayment(db as any, {
      organizationId: ORG_A, paymentDate: `${PERIOD}-21`, amountCents: 3500,
      paymentMethod: 'ueberweisung', payerType: 'kunde', actorId: ACTOR, autoMatch: false,
    })

    await allocatePayment(db as any, { paymentId: p1.paymentId, allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }], actorId: ACTOR })

    await expect(allocatePayment(db as any, {
      paymentId: p2.paymentId, allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }], actorId: ACTOR,
    })).rejects.toThrow(/Endstatus/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 11) Falscher Zahlungsstatus
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 11: Falscher Zahlungsstatus — Zuordnung auf eine Rechnung im Endstatus', () => {
  it('allocatePayment lehnt eine Zuordnung auf eine bereits "akzeptierte" Rechnung ab', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { status: 'akzeptiert' })
    db.table('payments').push({ id: 'payment-1', organization_id: ORG_A, amount_cents: 3500, allocated_cents: 0 })

    await expect(allocatePayment(db as any, {
      paymentId: 'payment-1',
      allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }],
      actorId: ACTOR,
    })).rejects.toThrow(/Endstatus "akzeptiert"/)
  })

  it('allocatePayment lehnt eine Zuordnung ab, die den offenen Betrag der Rechnung übersteigt', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { total_amount: 35, paid_amount: 30 }) // nur noch 5€ offen
    db.table('payments').push({ id: 'payment-2', organization_id: ORG_A, amount_cents: 3500, allocated_cents: 0 })

    await expect(allocatePayment(db as any, {
      paymentId: 'payment-2',
      allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }],
      actorId: ACTOR,
    })).rejects.toThrow(/uebersteigt offenen Betrag/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 12) Stornierte Rechnung — nach Storno nicht mehr änderbar
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 12: Stornierte Rechnung ist unveränderlich', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedRechnung(db, { status: 'storniert' })
  })

  it('correctInvoice lehnt eine Korrektur der stornierten Rechnung ab', async () => {
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'x', leistungsdatum: `${PERIOD}-01`, menge: 1, einheit: 'einsatz',
      einzelpreisCent: 100, gesamtpreisCent: 100,
    }], 'Test', ACTOR)).rejects.toThrow(/storniert — Korrektur nicht moeglich/)
  })

  it('createCreditNote lehnt eine Gutschrift der stornierten Rechnung ab', async () => {
    await expect(createCreditNote(db as any, 'invoice-negativ-1', 1000, 'Test', ACTOR))
      .rejects.toThrow(/storniert — Gutschrift nicht moeglich/)
  })

  it('cancelInvoice kann eine bereits stornierte Rechnung nicht ein zweites Mal stornieren', async () => {
    await expect(cancelInvoice(db as any, 'invoice-negativ-1', 'Nochmal versuchen', ACTOR))
      .rejects.toThrow(/nicht mehr geändert werden/)
  })

  it('allocatePayment ordnet keine Zahlung auf eine stornierte Rechnung zu', async () => {
    db.table('payments').push({ id: 'payment-storno', organization_id: ORG_A, amount_cents: 3500, allocated_cents: 0 })
    await expect(allocatePayment(db as any, {
      paymentId: 'payment-storno',
      allocations: [{ invoiceId: 'invoice-negativ-1', amountCents: 3500 }],
      actorId: ACTOR,
    })).rejects.toThrow(/Endstatus "storniert"/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 13) Korrigierte Rechnung — correctInvoice-Validierung (P0-Fix 14.08.2026)
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 13: correctInvoice — Betragsplausibilität und Preisabweichung', () => {
  let db: FakeBillingDb
  beforeEach(() => {
    db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    seedRechnung(db)
    seedTarif(db)
  })

  it('lehnt eine Korrekturposition ab, deren Gesamtpreis nicht zu Einzelpreis × Menge passt (P0: Betragsentkopplung)', async () => {
    // einzelpreisCent = Tarifpreis (bestünde die Abweichungsprüfung alleine),
    // aber gesamtpreisCent frei erfunden — genau die Lücke, die am
    // 14.08.2026 geschlossen wurde.
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 3500, gesamtpreisCent: 99900,
    }], 'Manipulationsversuch', ACTOR)).rejects.toThrow(/passt nicht zu Einzelpreis/)
  })

  it('verlangt bei >10% Preisabweichung einen ausführlichen Korrekturgrund', async () => {
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 5000, gesamtpreisCent: 5000, // +42,9% ggue. 3500
    }], 'Nachtrag', ACTOR)).rejects.toThrow(/Korrekturgrund/)
  })

  it('akzeptiert dieselbe Abweichung mit einem ausreichend langen Korrekturgrund', async () => {
    const result = await correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Alltagsbegleitung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 5000, gesamtpreisCent: 5000,
      korrekturgrundPreis: 'Nachtraeglich vereinbarter Erschwerniszuschlag laut Aktennotiz',
    }], 'Nachtrag', ACTOR)
    expect(result.correctionInvoiceId).toBeTruthy()
  })

  it('lehnt eine Korrektur fail-closed ab, wenn zur Leistungsart überhaupt kein Tarif existiert', async () => {
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [{
      leistungsart: 'Erfundene Leistung', leistungsdatum: `${PERIOD}-01`,
      menge: 1, einheit: 'einsatz', einzelpreisCent: 100, gesamtpreisCent: 100,
    }], 'Test', ACTOR)).rejects.toThrow(/Kein Tarif fuer/)
  })

  it('lehnt eine Korrektur ohne Positionen ab', async () => {
    await expect(correctInvoice(db as any, 'invoice-negativ-1', [], 'Test', ACTOR))
      .rejects.toThrow(/Mindestens eine Korrekturposition/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 15) Audit-Trail-Integrität
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 15: Audit-Trail-Integrität', () => {
  it('computeChecksum ist deterministisch und reagiert auf jedes der sieben gehashten Felder', async () => {
    const basis = {
      entityType: 'invoice', entityId: 'inv-1', action: 'frozen',
      previousState: { status: 'geprueft' }, newState: { status: 'freigegeben' },
      actorId: ACTOR, createdAt: '2026-08-15T10:00:00.000Z',
    }
    const c1 = await computeChecksum(basis)
    const c2 = await computeChecksum({ ...basis })
    expect(c1).toBe(c2)
    expect(c1).toMatch(/^[0-9a-f]{64}$/)

    for (const [feld, wert] of Object.entries({
      entityType: 'tariff', entityId: 'anders', action: 'created',
      previousState: { status: 'anders' }, newState: { status: 'anders' },
      actorId: 'anderer-actor', createdAt: '2026-01-01T00:00:00.000Z',
    })) {
      const veraendert = await computeChecksum({ ...basis, [feld]: wert })
      expect(veraendert, `Feld "${feld}" haette den Hash aendern muessen`).not.toBe(c1)
    }
  })

  it('BEKANNTE ASYMMETRIE: billing_audit_trail hat — anders als wf_audit_log — keinen DB-Trigger gegen UPDATE/DELETE', () => {
    // wf_audit_log: zwei explizite BEFORE-Trigger verhindern jede Aenderung.
    const wfPath = path.join(process.cwd(), 'supabase/migrations/20260813010000_workflow_engine.sql')
    const wfSql = fs.readFileSync(wfPath, 'utf-8')
    expect(wfSql).toContain('prevent_wf_audit_update')
    expect(wfSql).toContain('prevent_wf_audit_delete')
    expect(wfSql).toContain('trg_wf_audit_immutable_update')
    expect(wfSql).toContain('trg_wf_audit_immutable_delete')

    // billing_audit_trail: keine der Migrationen, die die Tabelle anfassen,
    // definiert einen aequivalenten Immutability-Trigger — der Schutz ist
    // ausschliesslich RLS (siehe 20260908020000_rls_abrechnungsdaten_und_auditschutz.sql).
    const migDir = path.join(process.cwd(), 'supabase/migrations')
    const treffer = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
      .map(f => ({ f, sql: fs.readFileSync(path.join(migDir, f), 'utf-8') }))
      .filter(({ sql }) => sql.includes('billing_audit_trail')
        && /prevent_billing_audit_trail_(update|delete)/i.test(sql))

    expect(treffer).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 16) Rechnungsnummern — Sequenz, keine Duplikate
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 16: Rechnungsnummern', () => {
  it('generateInvoiceNumber (Fallback-Pfad) meldet einen Sequenz-Konflikt bei parallelem Zugriff, statt eine Nummer doppelt zu vergeben', async () => {
    const db = makeFakeBillingDb()
    // next_billing_number-RPC bewusst NICHT registriert → generateInvoiceNumber
    // faellt auf generateInvoiceNumberFallback() zurueck.
    db.setRpcHandler('next_billing_number', () => ({ error: { message: 'function does not exist' } }))
    // Tabellenstand: eine parallele Transaktion hat die Sequenz bereits auf 6
    // erhöht — die Fallback-Funktion wird das aber gleich noch nicht wissen.
    db.table('billing_number_sequences').push({ id: 'seq-1', organization_id: ORG_A, prefix: 'RE', year: new Date().getFullYear(), last_number: 6 })

    // Der erste .from('billing_number_sequences')-Aufruf ist immer der
    // lesende SELECT der Fallback-Funktion — der wird hier auf einen
    // veralteten Stand (5) zurückgesetzt, um genau das Leserfenster vor der
    // Fremdänderung zu simulieren. Der zweite Aufruf (UPDATE mit
    // .eq('last_number', 5)) trifft dann auf den echten, bereits auf 6
    // erhöhten Tabellenstand nicht mehr — das ist der OCC-Konflikt.
    const originalFrom = db.from.bind(db)
    let fromAufrufe = 0
    ;(db as any).from = (table: string) => {
      const builder = originalFrom(table)
      if (table === 'billing_number_sequences') {
        fromAufrufe++
        if (fromAufrufe === 1) {
          builder.maybeSingle = async () => ({ data: { id: 'seq-1', last_number: 5 }, error: null })
        }
      }
      return builder
    }

    await expect(generateInvoiceNumber(db as any, ORG_A, 'RE'))
      .rejects.toThrow(/Nummernsequenz-Konflikt/)
  })

  it('100 Rechnungen in derselben Organisation erhalten 100 verschiedene, streng aufsteigende Nummern', async () => {
    const db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    const nummern: string[] = []
    for (let i = 0; i < 100; i++) {
      nummern.push(await generateInvoiceNumber(db as any, ORG_A, 'RE'))
    }
    expect(new Set(nummern).size).toBe(100)
    const zahlen = nummern.map(n => parseInt(n.split('-')[2], 10))
    for (let i = 1; i < zahlen.length; i++) expect(zahlen[i]).toBe(zahlen[i - 1] + 1)
  })

  it('zwei Organisationen führen unabhängige Nummernkreise (keine Kollision)', async () => {
    const db = makeFakeBillingDb()
    installBillingRpcSimulation(db)
    const a1 = await generateInvoiceNumber(db as any, ORG_A, 'RE')
    const b1 = await generateInvoiceNumber(db as any, ORG_B, 'RE')
    const a2 = await generateInvoiceNumber(db as any, ORG_A, 'RE')
    expect(a1.endsWith('00001')).toBe(true)
    expect(b1.endsWith('00001')).toBe(true)
    expect(a2.endsWith('00002')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 17) due_date — 14 Tage, aber niemals ein bereits gesetztes Ziel überschreiben
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 17: due_date wird nicht nachträglich überschrieben', () => {
  it('setzeFaelligkeitFallsLeer lässt ein manuell abweichendes Zahlungsziel unangetastet', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { due_date: '2099-01-01', payment_terms_days: 90 })

    const { setzeFaelligkeitFallsLeer } = await import('@/lib/billing/core/invoice-engine')
    const result = await setzeFaelligkeitFallsLeer(db as any, 'invoice-negativ-1')

    expect(result).toBe('2099-01-01')
    expect(db.table('invoices')[0].due_date).toBe('2099-01-01')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 18) Mahnstufen — Blockaden
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 18: Mahnung wird bei strittiger Rechnung oder offener Gutschrift blockiert', () => {
  it('checkDunningBlocks meldet eine strittige Rechnung', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { status: 'strittig' })
    const blocks = await checkDunningBlocks(db as any, 'invoice-negativ-1')
    expect(blocks.some(b => b.reason.includes('strittig'))).toBe(true)
  })

  it('advanceDunning wirft, wenn checkDunningBlocks eine offene Korrektur meldet', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db)
    db.table('dunning_entries').push({ id: 'de-1', invoice_id: 'invoice-negativ-1', organization_id: ORG_A, dunning_level: 'offen', due_date: `${PERIOD}-01` })
    db.table('invoice_corrections').push({ id: 'ic-1', original_invoice_id: 'invoice-negativ-1', status: 'entwurf' })

    await expect(advanceDunning(db as any, 'invoice-negativ-1', ACTOR, ORG_A))
      .rejects.toThrow(/Mahnung blockiert/)
  })

  it('advanceDunning wirft, wenn manuell block_dunning gesetzt ist', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db)
    db.table('dunning_entries').push({
      id: 'de-2', invoice_id: 'invoice-negativ-1', organization_id: ORG_A,
      dunning_level: 'offen', due_date: `${PERIOD}-01`, block_dunning: true, block_reason: 'Ratenzahlung vereinbart',
    })

    await expect(advanceDunning(db as any, 'invoice-negativ-1', ACTOR, ORG_A))
      .rejects.toThrow(/Ratenzahlung vereinbart/)
  })

  it('ensureDunningEntry ist idempotent — ein zweiter Aufruf legt keinen zweiten Eintrag an', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db)
    const id1 = await ensureDunningEntry(db as any, 'invoice-negativ-1', ORG_A, ACTOR)
    const id2 = await ensureDunningEntry(db as any, 'invoice-negativ-1', ORG_A, ACTOR)
    expect(id1).toBe(id2)
    expect(db.table('dunning_entries')).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 19) PDF-Pflichtfelder — DejaVuSans, kein Helvetica-Fallback
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 19: PDF — kein stiller Helvetica-Fallback bei fehlenden Fonts', () => {
  it('loadPdfFonts wirft, statt auf Helvetica zurückzufallen, wenn die Font-Dateien fehlen', async () => {
    vi.resetModules()
    vi.doMock('fs/promises', () => ({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })),
    }))

    const { loadPdfFonts } = await import('@/lib/pdf/briefkopf')
    const { PDFDocument } = await import('pdf-lib')
    const pdfDoc = await PDFDocument.create()

    await expect(loadPdfFonts(pdfDoc)).rejects.toThrow(/ENOENT/)

    vi.doUnmock('fs/promises')
    vi.resetModules()
  })

  it('Quellcode von briefkopf.ts importiert nirgends StandardFonts (kein versteckter Fallback-Pfad)', () => {
    const quelle = fs.readFileSync(path.join(process.cwd(), 'lib/pdf/briefkopf.ts'), 'utf-8')
    // 'Helvetica' taucht im Kopfkommentar auf (erklärt, WARUM es vermieden
    // wird) — das ist beabsichtigt und kein Fallback-Pfad. Entscheidend ist,
    // dass der einzige pdf-lib-Import ausschließlich `rgb` holt, also nie
    // StandardFonts (und damit auch nie StandardFonts.Helvetica) verfügbar ist.
    expect(quelle).not.toMatch(/StandardFonts/)
    expect(quelle).toMatch(/import\s*\{\s*rgb\s*\}\s*from\s*'pdf-lib'/)
  })

  it('lib/abrechnung/leistungsnachweis-pdf.ts (HTML→PDF-Pfad) hat weiterhin "Helvetica Neue" im CSS-Font-Stack — abweichend von der Policy', () => {
    // Kein Bug-Fix hier — dieser Test haelt den abweichenden IST-Zustand
    // fest, damit er nicht unbemerkt als "einheitlich" durchgeht.
    const quelle = fs.readFileSync(path.join(process.cwd(), 'lib/abrechnung/leistungsnachweis-pdf.ts'), 'utf-8')
    expect(quelle).toContain('DejaVu Sans')
    expect(quelle).toMatch(/Helvetica Neue/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 20) Datenschutz — Mandantentrennung als Leck-Schutz
// ═══════════════════════════════════════════════════════════════════════
describe('Negativ 20: Datenschutz — keine Gesundheits-/Abrechnungsdaten über die Organisationsgrenze hinweg', () => {
  it('getOposListe(ORG_A) liefert keine Rechnungen, Beträge oder Klientennamen aus ORG_B', async () => {
    const db = makeFakeBillingDb()
    seedRechnung(db, { id: 'invoice-a', organization_id: ORG_A, total_amount: 35 })
    seedRechnung(db, { id: 'invoice-b', organization_id: ORG_B, total_amount: 999999 })

    const opos = await getOposListe(db as any, ORG_A)

    expect(opos.offenePosten).toHaveLength(1)
    expect(opos.offenePosten[0].invoiceId).toBe('invoice-a')
    expect(JSON.stringify(opos)).not.toContain('999999')
  })

  it('ermittleKundenKette liest ausschliesslich Klienten der angefragten Organisation', async () => {
    const db = makeFakeBillingDb()
    db.seed('clients', [
      { id: CLIENT, organization_id: ORG_A, first_name: 'Eigene', last_name: 'Klientin' },
      { id: 'client-fremd', organization_id: ORG_B, first_name: 'Fremde', last_name: 'Klientin' },
    ])

    const kette = await ermittleKundenKette(db as any, ORG_A, 'client-fremd')
    expect(kette).toBeNull()
  })
})
